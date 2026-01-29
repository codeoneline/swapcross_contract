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

// ==================== Enums ====================

enum CrossType {
    UserLock,  // 锁定模式：锁定源链资产，目标链铸造映射资产
    UserBurn   // 销毁模式：销毁源链映射资产，目标链解锁原生资产
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

event RefundProcessed(
    address indexed user,
    address indexed token,
    uint256 amount,
    string reason
);

event EthReceived(address indexed sender, uint256 amount);

// ==================== Main Contract ====================

/**
 * @title SwapAndCrossV2
 * @notice 整合 OKX DEX Swap 和 Wanchain Bridge 的智能合约
 * @dev 先通过 OKX 进行代币兑换，再通过 Wanchain Bridge 跨链
 * 
 * 改进点：
 * 1. add fallback
 */
contract SwapAndCrossV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== State Variables ====================
    
    address public owner;
    address public okxDexRouter;
    address public immutable wanBridge;
    
    // 原生代币地址标识
    address private constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    // ==================== Modifiers ====================
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // ==================== Constructor ====================
    
    constructor(address _okxDexRouter, address _wanBridge) {
        require(_okxDexRouter != address(0), "Invalid router address");
        require(_wanBridge != address(0), "Invalid bridge address");
        
        owner = msg.sender;
        okxDexRouter = _okxDexRouter;
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
     * @dev 重要：调用 OKX API 时，必须设置 swapReceiverAddress = address(this)
     *      否则代币会发送到其他地址，导致跨链失败
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
        
        // Step 4: 退还剩余的代币（如果有）
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
     * @dev 改进点：
     *      1. 更精确的余额追踪
     *      2. 支持部分成功的 swap
     *      3. 详细的错误信息
     */
    function _executeSwap(
        SwapParams calldata params
    ) internal returns (uint256 amountOut) {
        bool isNativeIn = params.tokenIn == NATIVE_TOKEN;
        uint256 swapValue = 0;
        
        // 处理输入代币
        if (!isNativeIn) {
            // ERC20 代币
            IERC20(params.tokenIn).safeTransferFrom(
                msg.sender,
                address(this),
                params.amountIn
            );
            
            // 授权 OKX Router（使用 forceApprove 避免授权问题）
            IERC20(params.tokenIn).forceApprove(okxDexRouter, params.amountIn);
        } else {
            // 原生代币
            swapValue = params.amountIn;
            require(msg.value >= swapValue, "Insufficient ETH for swap");
        }
        
        // 记录兑换前的余额（同时处理 Native 和 ERC20）
        uint256 balanceBefore = _getBalance(params.tokenOut);
        
        // 调用 OKX DEX Router
        // 注意：swapCallData 中的 receiver 必须是 address(this)
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
        
        // 重置授权（安全措施）
        if (!isNativeIn) {
            IERC20(params.tokenIn).forceApprove(okxDexRouter, 0);
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
                // Lock 模式：授权给 bridge
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
                // Burn 模式：直接销毁
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
            // 原生币跨链（只支持 Lock 模式）
            require(msg.value >= bridgeFee + amount, "Insufficient value for native cross");
            
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
     * @dev 处理以下情况：
     *      1. Swap 未使用完的输入代币（部分成交）
     *      2. Swap 产生的额外代币（超过跨链所需）
     *      3. 合约中残留的代币
     */
    function _refundRemainingTokens(
        address user,
        address tokenIn,
        address tokenOut
    ) internal {
        // 退还输入代币（如果有剩余）
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
        
        // 退还输出代币（如果跨链后还有剩余）
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
        // 如果 returnData 长度小于 68，则无法解码
        if (returnData.length < 68) return "Transaction reverted silently";
        
        assembly {
            // 跳过前 68 字节（4 字节 selector + 32 字节 offset + 32 字节 length）
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
     * @notice 转移合约所有权
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        owner = newOwner;
    }
    
    /**
     * @notice 紧急恢复代币（仅用于误转入的资产）
     * @dev 只能在没有进行中的交易时调用
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
    * @notice 接收原生代币（无数据的纯转账）
    * @dev 处理场景：
    *      1. OKX Router 退回的 ETH（Uni V3 流动性不足时）
    *      2. 用户直接转入的 ETH（用于 swap）
    *      3. Bridge 退款
    */
    receive() external payable {
        // 记录接收事件（可选，用于调试）
        emit EthReceived(msg.sender, msg.value);
    }

    /**
    * @notice 处理带数据的调用或作为 receive() 的备份
    * @dev 处理场景：
    *      1. 调用了不存在的函数
    *      2. 其他合约通过 call() 发送带数据的 ETH
    *      
    * 注意：为了安全，我们限制 fallback 只接收 ETH，不执行任何逻辑
    */
    fallback() external payable {
        // 只接受 ETH，拒绝执行任何逻辑
        require(msg.value > 0, "Fallback: no ETH sent");
        emit EthReceived(msg.sender, msg.value);
    }
}