// contracts/mocks/DexRouterMock.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IApproveProxy {
    function claimTokens(address token, address from, address to, uint256 amount) external;
}

contract DexRouterMock {
    address public tokenIn;
    address public tokenOut;
    address public approveProxy;  // 添加 approveProxy 地址

    uint256 public outputAmount;   
    uint256 public consumeAmount;  // 0 = 消耗全部 totalIn
    bool    public shouldFail;

    constructor(address _tokenIn, address _tokenOut) {
        tokenIn  = _tokenIn;
        tokenOut = _tokenOut;
    }
    
    // 设置 approveProxy 地址（模拟真实流程）
    function setApproveProxy(address _approveProxy) external {
        approveProxy = _approveProxy;
    }

    function setOutputAmount(uint256 amount) external { outputAmount = amount; }
    function setConsumeAmount(uint256 amount) external { consumeAmount = amount; }
    function setShouldFail(bool fail) external { shouldFail = fail; }

    function buildSwapCallData(
        address receiver,
        uint256 out,
        uint256 totalIn
    ) external pure returns (bytes memory) {
        return abi.encodeWithSignature(
            "swap(address,uint256,uint256)",
            receiver, out, totalIn
        );
    }

    function swap(address receiver, uint256 out, uint256 totalIn) external payable {
        require(!shouldFail, "DexRouter: intentional failure");
        
        // 实际输出数量
        uint256 actualOut = (outputAmount > 0) ? outputAmount : out;
        
        // 1. 转账 tokenOut 给 receiver
        if (actualOut > 0 && tokenOut != address(0)) {
            IERC20(tokenOut).transfer(receiver, actualOut);
        }
        
        // 2. 通过 ApproveProxy 拉取 tokenIn（模拟真实 OKX DEX 行为）
        uint256 toConsume = (consumeAmount > 0) ? consumeAmount : totalIn;
        if (toConsume > 0 && tokenIn != address(0) && approveProxy != address(0)) {
            // 真实的 OKX DEX Router 会调用 ApproveProxy.claimTokens
            IApproveProxy(approveProxy).claimTokens(
                tokenIn,
                msg.sender,      // from: SwapAndCrossV1 合约
                address(this),   // to: router 自己
                toConsume
            );
        } else if (toConsume > 0 && tokenIn != address(0) && approveProxy == address(0)) {
            // 如果没有设置 approveProxy，直接 transferFrom（兼容旧测试）
            IERC20(tokenIn).transferFrom(msg.sender, address(this), toConsume);
        }
    }

    receive() external payable {}
}