// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleMockRouter {
    bool public shouldSucceed = true;
    uint256 public returnAmount = 0;
    address public tokenToTransfer; // 要转账的代币地址
    address public recipient; // 收款地址
    
    event SwapCalled(address caller, uint256 value);
    
    function setConfig(bool succeed, uint256 amount, address token, address _recipient) external {
        shouldSucceed = succeed;
        returnAmount = amount;
        tokenToTransfer = token;
        recipient = _recipient;
    }
    
    // 总是返回成功
    fallback(bytes calldata) external payable returns (bytes memory) {
        emit SwapCalled(msg.sender, msg.value);
        
        if (!shouldSucceed) {
            revert("SimpleMockRouter: swap failed");
        }
        
        // 如果指定了代币和收款地址，实际转账
        if (tokenToTransfer != address(0) && recipient != address(0)) {
            // 模拟实际转账：将代币从路由器转到收款地址
            // 注意：这里需要路由器有足够的代币余额
            IERC20(tokenToTransfer).transfer(recipient, returnAmount);
        }
        
        return abi.encode(returnAmount);
    }
    
    receive() external payable {
        emit SwapCalled(msg.sender, msg.value);
    }
    
    // 给路由器充值代币（用于测试）
    function depositToken(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}