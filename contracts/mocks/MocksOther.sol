// contracts/mocks/MocksOther.sol - 修复 ReentrantRouterMock
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../SwapAndCrossV1.sol";

interface ISwapAndCrossV1 {
    struct SwapParams {
        address okxDexRouter;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes   swapCallData;
    }
    struct BridgeParams {
        bytes32 smgID;
        uint256 tokenPairID;
        uint8   crossType;
        bytes   recipient;
        uint256 networkFee;
    }
    function swapAndCross(
        SwapParams calldata swapParams,
        BridgeParams calldata bridgeParams
    ) external payable returns (uint256);
}

contract ReentrantRouterMock {
    ISwapAndCrossV1 public immutable target;
    bool public reentrantCalled;
    
    address public tokenIn;
    address public tokenOut;
    address public approveProxy;  // 添加 approveProxy
    uint256 public outputAmount;
    uint256 public consumeAmount;
    bool public shouldFail;

    constructor(address _target) {
        target = ISwapAndCrossV1(_target);
    }
    
    function init(address _tokenIn, address _tokenOut, address _approveProxy) external {
        tokenIn = _tokenIn;
        tokenOut = _tokenOut;
        approveProxy = _approveProxy;
    }
    
    function setOutputAmount(uint256 amount) external { outputAmount = amount; }
    function setConsumeAmount(uint256 amount) external { consumeAmount = amount; }
    function setShouldFail(bool fail) external { shouldFail = fail; }

    function buildSwapCallData(address receiver, uint256 out, uint256 totalIn) external pure returns (bytes memory) {
        return abi.encodeWithSignature("swap(address,uint256,uint256)", receiver, out, totalIn);
    }

    function swap(address receiver, uint256 out, uint256 totalIn) external payable {
        require(!shouldFail, "Router: intentional failure");
        
        // 先尝试重入（在状态改变之前）
        if (!reentrantCalled) {
            reentrantCalled = true;
            
            // 构造最小的参数来尝试重入
            ISwapAndCrossV1.SwapParams memory sp;
            ISwapAndCrossV1.BridgeParams memory bp;
            
            // 设置必要参数避免额外的校验
            sp.amountIn = 1;
            sp.minAmountOut = 0;
            sp.tokenIn = tokenIn;
            sp.tokenOut = tokenOut;
            sp.okxDexRouter = address(this);
            bp.recipient = abi.encodePacked(address(0));
            bp.networkFee = 0;
            
            // 尝试重入 - 低级别调用，应该被 ReentrancyGuard 阻止
            (bool success, ) = address(target).call{value: 0}(
                abi.encodeWithSignature(
                    "swapAndCross((address,address,address,uint256,uint256,bytes),(bytes32,uint256,uint8,bytes,uint256))",
                    sp, bp
                )
            );
            // 重入应该失败，我们忽略结果
        }
        
        // 正常执行 swap 逻辑
        uint256 actualOut = (outputAmount > 0) ? outputAmount : out;
        
        // 1. 转账 tokenOut 给 receiver
        if (actualOut > 0 && tokenOut != address(0)) {
            IERC20(tokenOut).transfer(receiver, actualOut);
        }
        
        // 2. 通过 ApproveProxy 拉取 tokenIn（模拟真实 OKX DEX 行为）
        uint256 toConsume = (consumeAmount > 0) ? consumeAmount : totalIn;
        if (toConsume > 0 && tokenIn != address(0) && approveProxy != address(0)) {
            // 通过 ApproveProxy 拉取代币
            IApproveProxy(approveProxy).claimTokens(
                tokenIn,
                msg.sender,      // from: SwapAndCrossV1 合约
                address(this),   // to: router 自己
                toConsume
            );
        }
    }
    
    receive() external payable {}
}

// ForceSendMock 保持不变
contract ForceSendMock {
    constructor() payable {}

    function send(address target) external {
        selfdestruct(payable(target));
    }
}

contract SwapAndCrossV2Mock is SwapAndCrossV1 {
    function version() public pure override returns (string memory) {
        return "2.0.0";
    }
}