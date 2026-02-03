// contracts/SwapAndCrossV3.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./SwapAndCrossV2.sol";

contract SwapAndCrossV3 is SwapAndCrossV2 {
    // 添加更多新功能
    uint256 public anotherFeatureValue;
    mapping(address => uint256) public userFeatures;
    
    event AnotherFeatureUsed(address indexed user, uint256 value);
    event UserFeatureSet(address indexed user, uint256 value);
    
    /**
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }
    
    // V3新功能
    function useAnotherFeature(uint256 value) external {
        anotherFeatureValue = value;
        emit AnotherFeatureUsed(msg.sender, value);
    }
    
    function setUserFeature(uint256 value) external {
        userFeatures[msg.sender] = value;
        emit UserFeatureSet(msg.sender, value);
    }
    
    // 覆盖版本号
    function version() public pure virtual override returns (string memory) {
        return "3.0.0";
    }
}