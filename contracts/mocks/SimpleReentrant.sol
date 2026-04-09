// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISwapAndCrossV1 {
    struct SwapParams {
        address okxDexRouter;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes swapCallData;
    }
    struct BridgeParams {
        bytes32 smgID;
        uint256 tokenPairID;
        uint8 crossType;
        bytes recipient;
        uint256 networkFee;
    }
    function swapAndCross(SwapParams calldata, BridgeParams calldata) external payable returns (uint256);
}

contract SimpleReentrant {
    address public target;
    bool public attacked;
    address public tokenOut;
    uint256 public outputAmount;
    
    constructor(address _target) {
        target = _target;
    }
    
    function setTokenOut(address _tokenOut, uint256 _outputAmount) external {
        tokenOut = _tokenOut;
        outputAmount = _outputAmount;
    }
    
    function swap(address receiver, uint256 out, uint256 totalIn) external payable {
        if (!attacked) {
            attacked = true;
            
            // 构造重入调用
            ISwapAndCrossV1.SwapParams memory sp;
            ISwapAndCrossV1.BridgeParams memory bp;
            
            // 设置最小参数
            sp.amountIn = 1;
            sp.minAmountOut = 0;
            sp.tokenIn = address(0);
            sp.tokenOut = address(0);
            sp.okxDexRouter = address(this);
            
            bp.recipient = abi.encodePacked(address(0));
            bp.networkFee = 0;
            
            // 尝试重入
            (bool success, ) = target.call{value: 0}(
                abi.encodeWithSignature(
                    "swapAndCross((address,address,address,uint256,uint256,bytes),(bytes32,uint256,uint8,bytes,uint256))",
                    sp, bp
                )
            );
            // 重入应该失败，忽略结果
        }
        
        // 正常执行：返回一些 tokenOut 避免 "No tokens received" 错误
        if (outputAmount > 0 && tokenOut != address(0)) {
            IERC20(tokenOut).transfer(receiver, outputAmount);
        }
    }
    
    function buildSwapCallData(address receiver, uint256 out, uint256 totalIn) external pure returns (bytes memory) {
        return abi.encodeWithSignature("swap(address,uint256,uint256)", receiver, out, totalIn);
    }
    
    receive() external payable {}
}