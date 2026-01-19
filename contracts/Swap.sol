// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title Swap
 * @notice 通过 OKX DEX Aggregator 进行代币兑换的智能合约
 * @dev 支持 Ethereum、Arbitrum、Optimism、Polygon 等 EVM 兼容链
 */
contract Swap {
    address public owner;
    address public okxDexRouter;
    
    // OKX DEX Router 地址 (官方部署地址)
    // Ethereum Mainnet: 0x5E1f62Dac767b0491e3CE72469C217365D5B48cC
    // Arbitrum One: 0x368E01160C2244B0363a35B3fF0A971E44a89284
    // Base: 0x4409921ae43a39a11d90f7b7f96cfd0b8093d9fc
    // BNB Chain: 0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0
    // Polygon: 0xf332761c673b59B21fF6dfa8adA44d78c12dEF09
    // Optimism: 0x68D6B739D2020067D1e2F713b999dA97E4d54812
    
    event SwapExecuted(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event TokensRecovered(address indexed token, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _okxDexRouter) {
        require(_okxDexRouter != address(0), "Invalid router address");
        owner = msg.sender;
        okxDexRouter = _okxDexRouter;
    }
    
    /**
     * @notice 执行代币兑换
     * @param tokenIn 输入代币地址 (使用 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE 表示原生代币)
     * @param tokenOut 输出代币地址
     * @param amountIn 输入代币数量
     * @param minAmountOut 最小输出数量 (滑点保护)
     * @param swapCallData 从 OKX DEX API 获取的 callData
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapCallData
    ) external payable returns (uint256 amountOut) {
        require(amountIn > 0, "Amount must be greater than 0");
        
        bool isNativeIn = tokenIn == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
        
        // 如果输入是 ERC20 代币
        if (!isNativeIn) {
            require(msg.value == 0, "ETH not required for ERC20 swap");
            
            // 从用户转入代币
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            
            // 授权 OKX Router 使用代币
            IERC20(tokenIn).approve(okxDexRouter, amountIn);
        } else {
            // 如果输入是原生代币 (ETH/MATIC 等)
            require(msg.value == amountIn, "Incorrect ETH amount");
        }
        
        // 记录兑换前的余额
        uint256 balanceBefore = _getBalance(tokenOut);
        
        // 调用 OKX DEX Router
        (bool success, ) = okxDexRouter.call{value: msg.value}(swapCallData);
        require(success, "Swap failed");
        
        // 计算实际获得的代币数量
        uint256 balanceAfter = _getBalance(tokenOut);
        amountOut = balanceAfter - balanceBefore;
        
        // 滑点检查
        require(amountOut >= minAmountOut, "Insufficient output amount");
        
        // 将输出代币转给用户
        _transferToken(tokenOut, msg.sender, amountOut);
        
        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
        
        return amountOut;
    }
    
    /**
     * @notice 获取代币余额
     */
    function _getBalance(address token) internal view returns (uint256) {
        if (token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }
    
    /**
     * @notice 转移代币
     */
    function _transferToken(address token, address to, uint256 amount) internal {
        if (token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).transfer(to, amount);
        }
    }
    
    /**
     * @notice 更新 OKX Router 地址 (仅限 owner)
     */
    function updateRouter(address newRouter) external onlyOwner {
        require(newRouter != address(0), "Invalid router address");
        address oldRouter = okxDexRouter;
        okxDexRouter = newRouter;
        emit RouterUpdated(oldRouter, newRouter);
    }
    
    /**
     * @notice 恢复误转入合约的代币 (仅限 owner)
     */
    // function recoverTokens(address token, uint256 amount) external onlyOwner {
    //     _transferToken(token, owner, amount);
    //     emit TokensRecovered(token, amount);
    // }
    
    /**
     * @notice 转移合约所有权
     */
    // function transferOwnership(address newOwner) external onlyOwner {
    //     require(newOwner != address(0), "Invalid owner address");
    //     owner = newOwner;
    // }
    
    // 接收 ETH
    receive() external payable {}
}