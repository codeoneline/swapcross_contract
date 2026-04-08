// contracts/mocks/MockBridge.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockBridge {
    event UserLockExecuted(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        bytes userAccount,
        uint fee
    );
    
    event UserBurnExecuted(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        uint fee,
        address tokenAddress,
        bytes userAccount
    );
    
    function userLock(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        bytes memory userAccount
    ) external payable {
        emit UserLockExecuted(smgID, tokenPairID, value, userAccount, msg.value);
    }
    
    function userBurn(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        uint fee,
        address tokenAddress,
        bytes memory userAccount
    ) external payable {
        emit UserBurnExecuted(smgID, tokenPairID, value, fee, tokenAddress, userAccount);
    }
    
    receive() external payable {}
}