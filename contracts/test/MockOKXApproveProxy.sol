// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockOKXApproveProxy {
    event TokensClaimed(address token, address from, address to, uint256 amount);
    
    function claimTokens(
        address token,
        address from,
        address to,
        uint256 amount
    ) external {
        // 在测试环境中，我们直接返回成功
        emit TokensClaimed(token, from, to, amount);
    }
}