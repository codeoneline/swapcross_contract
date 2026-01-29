// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ==================== Interfaces ====================

interface IBridge {
    function userLock(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        bytes memory userAccount
    ) external payable;

    function userBurn(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        uint fee,
        address tokenAddress,
        bytes memory userAccount
    ) external payable;
}

interface IApproveProxy {
    function claimTokens(
        address token,
        address from,
        address to,
        uint256 amount
    ) external;
}

// ==================== Enums ====================

enum CrossType {
    UserLock,  // 锁定模式:锁定源链资产,目标链铸造映射资产
    UserBurn   // 销毁模式:销毁源链映射资产,目标链解锁原生资产
}

// ==================== Structs ====================

struct SwapParams {
    address tokenIn;         // 输入代币地址 (0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE 表示原生代币)
    address tokenOut;        // 输出代币地址
    uint256 amountIn;        // 输入代币数量
    uint256 minAmountOut;    // 最小输出数量 (滑点保护)
    bytes swapCallData;      // OKX DEX API 获取的 callData
}

struct BridgeParams {
    bytes32 smgID;           // Storeman Group ID
    uint256 tokenPairID;     // 代币对ID
    CrossType crossType;     // 跨链类型
    bytes recipient;         // 目标链接收地址
    uint256 networkFee;      // 跨链网络费
}

// ==================== Events ====================

event SwapAndCrossExecuted(
    bytes32 indexed txHash,
    address indexed user,
    address indexed tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    bytes recipient,
    uint256 networkFee
);

event RouterUpdated(address indexed oldRouter, address indexed newRouter);
event ApproveProxyUpdated(address indexed oldProxy, address indexed newProxy);

event RefundProcessed(
    address indexed user,
    address indexed token,
    uint256 amount,
    string reason
);

event EthReceived(address indexed sender, uint256 amount);

// ==================== Main Contract ====================

/**
 * @title SwapAndCrossV3
 * @notice 整合 OKX DEX Swap 和 Wanchain Bridge 的智能合约
 * @dev 先通过 OKX 进行代币兑换,再通过 Wanchain Bridge 跨链
 * 
 * 改进点:
 * 1. 支持 OKX DEX 的 ApproveProxy 模式
 * 2. 修复授权逻辑,授权给 ApproveProxy 而不是 DexRouter
 * 3. 添加 fallback 接收 ETH
 */
contract SwapAndCrossV3 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== State Variables ====================
    
    address public owner;
    address public okxDexRouter;
    address public okxApproveProxy;  // 新增:OKX 的 ApproveProxy 地址
    address public immutable wanBridge;
    
    // 原生代币地址标识
    address private constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    // ==================== Modifiers ====================
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // ==================== Constructor ====================
    
    /**
     * @param _okxDexRouter OKX DexRouter 地址
     * @param _okxApproveProxy OKX ApproveProxy 地址 (关键!)
     * @param _wanBridge Wanchain Bridge 地址
     */
    constructor(
        address _okxDexRouter,
        address _okxApproveProxy,
        address _wanBridge
    ) {
        require(_okxDexRouter != address(0), "Invalid router address");
        require(_okxApproveProxy != address(0), "Invalid approve proxy address");
        require(_wanBridge != address(0), "Invalid bridge address");
        
        owner = msg.sender;
        okxDexRouter = _okxDexRouter;
        okxApproveProxy = _okxApproveProxy;
        wanBridge = _wanBridge;
    }
    
    // ==================== Main Function ====================
    
    /**
     * @notice 执行 Swap + Cross 操作
     * @param swapParams Swap 参数
     * @param bridgeParams Bridge 参数
     * @return txHash 跨链交易哈希
     * @return amountOut Swap 后得到的代币数量
     * 
     * @dev 重要:
     *      1. 调用 OKX API 时,必须设置 swapReceiverAddress = address(this)
     *      2. ERC20 代币必须授权给 ApproveProxy,而不是 DexRouter
     *      3. 用户需要先授权本合约使用其代币
     */
    function swapAndCross(
        SwapParams calldata swapParams,
        BridgeParams calldata bridgeParams
    ) external payable nonReentrant returns (bytes32 txHash, uint256 amountOut) {
        require(swapParams.amountIn > 0, "Amount must be greater than 0");
        require(bridgeParams.recipient.length > 0, "Invalid recipient");
        
        // Step 1: 执行 Swap
        amountOut = _executeSwap(swapParams);
        
        // Step 2: 验证实际收到的代币数量
        require(amountOut > 0, "No tokens received from swap");
        
        // Step 3: 执行跨链
        txHash = _executeCross(swapParams.tokenOut, amountOut, bridgeParams);
        
        // Step 4: 退还剩余的代币(如果有)
        _refundRemainingTokens(msg.sender, swapParams.tokenIn, swapParams.tokenOut);
        
        // 发出事件
        emit SwapAndCrossExecuted(
            txHash,
            msg.sender,
            swapParams.tokenIn,
            swapParams.tokenOut,
            swapParams.amountIn,
            amountOut,
            bridgeParams.recipient,
            bridgeParams.networkFee
        );
        
        return (txHash, amountOut);
    }
    
    // ==================== Internal Functions ====================
    
    /**
     * @notice 执行代币兑换
     * @dev 关键改进:
     *      1. ERC20 代币授权给 ApproveProxy 而不是 DexRouter
     *      2. 这样 DexRouter 可以通过 ApproveProxy.claimTokens() 拉取代币
     */
    function _executeSwap(
        SwapParams calldata params
    ) internal returns (uint256 amountOut) {
        bool isNativeIn = params.tokenIn == NATIVE_TOKEN;
        uint256 swapValue = 0;
        
        // 处理输入代币
        if (!isNativeIn) {
            // ERC20 代币
            // Step 1: 从用户接收代币到本合约
            IERC20(params.tokenIn).safeTransferFrom(
                msg.sender,
                address(this),
                params.amountIn
            );
            
            // Step 2: 授权给 ApproveProxy (而不是 DexRouter!)
            // 这是关键修复点!
            IERC20(params.tokenIn).forceApprove(okxApproveProxy, params.amountIn);
        } else {
            // 原生代币
            swapValue = params.amountIn;
            require(msg.value >= swapValue, "Insufficient ETH for swap");
        }
        
        // 记录兑换前的余额
        uint256 balanceBefore = _getBalance(params.tokenOut);
        
        // 调用 OKX DEX Router
        // DexRouter 会通过 ApproveProxy.claimTokens(tokenIn, address(this), adapter, amount) 拉取代币
        (bool success, bytes memory returnData) = okxDexRouter.call{value: swapValue}(
            params.swapCallData
        );
        
        if (!success) {
            // 解析错误信息
            string memory errorMsg = _getRevertMsg(returnData);
            revert(string(abi.encodePacked("Swap failed: ", errorMsg)));
        }
        
        // 计算实际获得的代币数量
        uint256 balanceAfter = _getBalance(params.tokenOut);
        amountOut = balanceAfter - balanceBefore;
        
        // 滑点检查
        require(amountOut >= params.minAmountOut, "Insufficient output amount (slippage)");
        
        // 重置授权(安全措施)
        if (!isNativeIn) {
            IERC20(params.tokenIn).forceApprove(okxApproveProxy, 0);
        }
        
        return amountOut;
    }
    
    /**
     * @notice 执行跨链操作
     */
    function _executeCross(
        address token,
        uint256 amount,
        BridgeParams calldata params
    ) internal returns (bytes32 txHash) {
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 bridgeFee = params.networkFee;
        
        if (token != NATIVE_TOKEN) {
            // ERC20 代币跨链
            require(msg.value >= bridgeFee, "Insufficient network fee");
            
            if (params.crossType == CrossType.UserLock) {
                // Lock 模式:授权给 bridge
                IERC20(token).forceApprove(wanBridge, amount);
                
                IBridge(wanBridge).userLock{value: bridgeFee}(
                    params.smgID,
                    params.tokenPairID,
                    amount,
                    params.recipient
                );
                
                // 重置授权
                IERC20(token).forceApprove(wanBridge, 0);
            } else {
                // Burn 模式:直接销毁
                IBridge(wanBridge).userBurn{value: bridgeFee}(
                    params.smgID,
                    params.tokenPairID,
                    amount,
                    0,  // fee 参数设为 0
                    token,
                    params.recipient
                );
            }
        } else {
            // 原生币跨链(只支持 Lock 模式)
            require(address(this).balance >= amount, "Contract insufficient ETH balance");
            require(msg.value >= bridgeFee, "Insufficient network fee");
            
            IBridge(wanBridge).userLock{value: bridgeFee + amount}(
                params.smgID,
                params.tokenPairID,
                amount,
                params.recipient
            );
        }
        
        // 生成交易哈希
        txHash = keccak256(
            abi.encodePacked(
                msg.sender,
                token,
                amount,
                block.timestamp,
                block.number
            )
        );
        
        return txHash;
    }
    
    /**
     * @notice 退还剩余代币给用户
     */
    function _refundRemainingTokens(
        address user,
        address tokenIn,
        address tokenOut
    ) internal {
        // 退还输入代币(如果有剩余)
        uint256 remainingIn = _getBalance(tokenIn);
        if (remainingIn > 0) {
            if (tokenIn == NATIVE_TOKEN) {
                (bool success, ) = payable(user).call{value: remainingIn}("");
                require(success, "Refund native token failed");
            } else {
                IERC20(tokenIn).safeTransfer(user, remainingIn);
            }
            emit RefundProcessed(user, tokenIn, remainingIn, "Remaining input tokens");
        }
        
        // 退还输出代币(如果跨链后还有剩余)
        uint256 remainingOut = _getBalance(tokenOut);
        if (remainingOut > 0) {
            if (tokenOut == NATIVE_TOKEN) {
                (bool success, ) = payable(user).call{value: remainingOut}("");
                require(success, "Refund native token failed");
            } else {
                IERC20(tokenOut).safeTransfer(user, remainingOut);
            }
            emit RefundProcessed(user, tokenOut, remainingOut, "Remaining output tokens");
        }
    }
    
    /**
     * @notice 获取代币余额
     */
    function _getBalance(address token) internal view returns (uint256) {
        if (token == NATIVE_TOKEN) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }
    
    /**
     * @notice 从 returnData 中提取错误信息
     */
    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "Transaction reverted silently";
        
        assembly {
            returnData := add(returnData, 0x04)
        }
        
        return abi.decode(returnData, (string));
    }
    
    // ==================== Admin Functions ====================
    
    /**
     * @notice 更新 OKX Router 地址
     */
    function updateRouter(address newRouter) external onlyOwner {
        require(newRouter != address(0), "Invalid router address");
        address oldRouter = okxDexRouter;
        okxDexRouter = newRouter;
        emit RouterUpdated(oldRouter, newRouter);
    }
    
    /**
     * @notice 更新 OKX ApproveProxy 地址
     */
    function updateApproveProxy(address newProxy) external onlyOwner {
        require(newProxy != address(0), "Invalid proxy address");
        address oldProxy = okxApproveProxy;
        okxApproveProxy = newProxy;
        emit ApproveProxyUpdated(oldProxy, newProxy);
    }
    
    /**
     * @notice 转移合约所有权
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        owner = newOwner;
    }
    
    /**
     * @notice 紧急恢复代币(仅用于误转入的资产)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == NATIVE_TOKEN) {
            (bool success, ) = owner.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(owner, amount);
        }
    }
    
    // ==================== View Functions ====================
    
    /**
     * @notice 查询合约中指定代币的余额
     */
    function getContractBalance(address token) external view returns (uint256) {
        return _getBalance(token);
    }
    
    // ==================== Receive Functions ====================

    /**
     * @notice 接收原生代币(无数据的纯转账)
     */
    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    /**
     * @notice 处理带数据的调用
     */
    fallback() external payable {
        require(msg.value > 0, "Fallback: no ETH sent");
        emit EthReceived(msg.sender, msg.value);
    }
}