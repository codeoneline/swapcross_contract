// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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

// ==================== Main Contract ====================

/**
 * @title SwapAndCross
 * @notice 整合 OKX DEX Swap 和 Wanchain Bridge 的智能合约
 * @dev 先通过 OKX 进行代币兑换，再通过 Wanchain Bridge 跨链
 */
contract SwapAndCross {
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
     */
    function swapAndCross(
        SwapParams calldata swapParams,
        BridgeParams calldata bridgeParams
    ) external payable returns (bytes32 txHash, uint256 amountOut) {
        require(swapParams.amountIn > 0, "Amount must be greater than 0");
        require(bridgeParams.recipient.length > 0, "Invalid recipient");
        
        // Step 1: 执行 Swap
        amountOut = _executeSwap(swapParams);
        
        // Step 2: 执行跨链
        txHash = _executeCross(swapParams.tokenOut, amountOut, bridgeParams);
        
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
            
            // 授权 OKX Router
            IERC20(params.tokenIn).forceApprove(okxDexRouter, params.amountIn);
        } else {
            // 原生代币
            swapValue = params.amountIn;
            require(msg.value >= swapValue, "Insufficient ETH for swap");
        }
        
        // 记录兑换前的余额
        uint256 balanceBefore = _getBalance(params.tokenOut);
        
        // 调用 OKX DEX Router
        (bool success, ) = okxDexRouter.call{value: swapValue}(params.swapCallData);
        require(success, "Swap failed");
        
        // 计算实际获得的代币数量
        uint256 balanceAfter = _getBalance(params.tokenOut);
        amountOut = balanceAfter - balanceBefore;
        
        // 滑点检查
        require(amountOut >= params.minAmountOut, "Insufficient output amount");
        
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
     * @notice 获取代币余额
     */
    function _getBalance(address token) internal view returns (uint256) {
        if (token == NATIVE_TOKEN) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
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
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == NATIVE_TOKEN) {
            (bool success, ) = owner.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(owner, amount);
        }
    }
    
    // ==================== Receive Function ====================
    
    receive() external payable {}
}