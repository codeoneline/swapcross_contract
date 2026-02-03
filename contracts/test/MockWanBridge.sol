// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockWanBridge {
    bool public crossShouldSucceed = true;
    
    event UserLockCalled(bytes32 smgID, uint256 tokenPairID, uint256 value, bytes recipient);
    event UserBurnCalled(bytes32 smgID, uint256 tokenPairID, uint256 value, uint256 fee, address tokenAddress, bytes recipient);
    
    function setCrossResult(bool succeed) external {
        crossShouldSucceed = succeed;
    }
    
    function userLock(
        bytes32 smgID,
        uint256 tokenPairID,
        uint256 value,
        bytes memory userAccount
    ) external payable {
        emit UserLockCalled(smgID, tokenPairID, value, userAccount);
        
        if (!crossShouldSucceed) {
            revert("Mock userLock failed");
        }
    }
    
    function userBurn(
        bytes32 smgID,
        uint256 tokenPairID,
        uint256 value,
        uint256 fee,
        address tokenAddress,
        bytes memory userAccount
    ) external payable {
        emit UserBurnCalled(smgID, tokenPairID, value, fee, tokenAddress, userAccount);
        
        if (!crossShouldSucceed) {
            revert("Mock userBurn failed");
        }
    }
}