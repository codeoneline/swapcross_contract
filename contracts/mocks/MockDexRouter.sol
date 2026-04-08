// contracts/mocks/MockDexRouter.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IApproveProxy {
    function claimTokens(address token, address from, address to, uint256 amount) external;
}

contract MockDexRouter {
    using SafeERC20 for IERC20;
    
    address public approveProxy;
    
    constructor(address _approveProxy) {
        approveProxy = _approveProxy;
    }
    
    // 模拟swap: tokenIn -> tokenOut
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) external payable returns (uint256) {
        uint256 amountOut = amountIn; // 1:1 兑换用于测试
        
        // 处理输入代币
        if (tokenIn != address(0) && tokenIn != 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            // ERC20: 从approveProxy拉取代币
            IApproveProxy(approveProxy).claimTokens(
                tokenIn,
                msg.sender,
                address(this),
                amountIn
            );
        }
        // 如果是原生代币，value已经通过msg.value传入，不需要额外处理
        
        // 转出代币给recipient
        if (tokenOut != address(0) && tokenOut != 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            // ERC20: 需要先有代币才能转账
            // 在测试中，需要提前给MockDexRouter发送足够的代币
            IERC20(tokenOut).safeTransfer(recipient, amountOut);
        } else if (tokenOut == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            // 原生代币
            payable(recipient).transfer(amountOut);
        }
        
        return amountOut;
    }
    
    // 用于测试的辅助函数，给合约充值
    function depositTokens(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
    
    receive() external payable {}
}