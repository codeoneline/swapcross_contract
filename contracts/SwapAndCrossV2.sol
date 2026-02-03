// contracts/SwapAndCrossV2.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./SwapAndCrossV1.sol";

contract SwapAndCrossV2 is SwapAndCrossV1 {
    // 添加新状态变量
    uint256 public newFeatureValue;
    
    // 添加新事件
    event NewFeatureUsed(address indexed user, uint256 value);
    
    // 注意：不要在这里定义constructor，UUPS合约应该使用initializer
    // 使用自定义的initializer，或者不定义让它使用父类的
    
    /**
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }
    
    // 可选：如果需要额外的初始化
    function initializeV2(uint256 initialValue) public reinitializer(2) {
        newFeatureValue = initialValue;
    }
    
    // 添加新函数（仅V2）
    function useNewFeature(uint256 value) external {
        newFeatureValue = value;
        emit NewFeatureUsed(msg.sender, value);
    }
    
    // 覆盖版本号
    function version() public pure virtual override returns (string memory) {
        return "2.0.0";
    }
}