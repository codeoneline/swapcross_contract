// contracts/mocks/AttackerContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../SwapAndCrossV1.sol";

contract AttackerContract {
    SwapAndCrossV1 public target;
    bool public attacked;
    
    constructor(address _target) {
        target = SwapAndCrossV1(payable(_target));
    }
    
    function attack(SwapParams calldata swapParams, BridgeParams calldata bridgeParams) external payable {
        attacked = false;
        target.swapAndCross{value: msg.value}(swapParams, bridgeParams);
    }
    
    // 接收代币或ETH时触发重入攻击
    receive() external payable {
        if (!attacked) {
            attacked = true;
            // 尝试重入调用 - 使用无效参数，仅用于测试重入保护
            // 构造空的参数
            SwapParams memory emptySwapParams = SwapParams({
                tokenIn: address(0),
                tokenOut: address(0),
                amountIn: 0,
                minAmountOut: 0,
                swapCallData: ""
            });
            
            BridgeParams memory emptyBridgeParams = BridgeParams({
                smgID: bytes32(0),
                tokenPairID: 0,
                crossType: CrossType.UserLock,
                recipient: "",
                networkFee: 0
            });
            
            try target.swapAndCross{value: 0}(emptySwapParams, emptyBridgeParams) {} catch {}
        }
    }
}