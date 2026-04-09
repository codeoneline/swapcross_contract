// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice 模拟 Wanchain Bridge
///
/// userLock（ERC20）：
///   SwapAndCrossV1 已 forceApprove(bridge, amount)，Mock 通过 transferFrom 拉走代币。
///   consumeAmount == 0 → 消耗全部 value（正常场景）
///   consumeAmount  > 0 → 只消耗 consumeAmount，剩余留在 SwapAndCrossV1 → 触发退款
///
/// userLock（原生 ETH）：ETH 通过 msg.value 传入，无需 transferFrom。
///
/// userBurn：
///   SwapAndCrossV1 _executeCross 中 UserBurn 路径没有 approve bridge，
///   真实合约直接销毁映射代币，Mock 只记录参数，不拉取代币。
contract BridgeMock {
    struct LockCall {
        bytes32 smgID;
        uint256 tokenPairID;
        uint256 value;
        bytes   userAccount;
    }
    struct BurnCall {
        bytes32 smgID;
        uint256 tokenPairID;
        uint256 value;
        uint256 fee;
        address tokenAddress;
        bytes   userAccount;
    }

    LockCall public lastLockCall;
    BurnCall public lastBurnCall;

    address public lastLockToken;  // 记录被 lock 的 ERC20（由测试设置）
    uint256 public consumeAmount;  // 0 = 全额消耗

    function setConsumeAmount(uint256 amount) external { consumeAmount = amount; }
    function setLastLockToken(address token)  external { lastLockToken = token; }

    function userLock(
        bytes32 smgID,
        uint256 tokenPairID,
        uint256 value,
        bytes memory userAccount
    ) external payable {
        lastLockCall = LockCall(smgID, tokenPairID, value, userAccount);

        // 只有设置了 lastLockToken 才做 ERC20 拉取（原生 ETH 跨链不需要）
        if (lastLockToken != address(0)) {
            uint256 toConsume = (consumeAmount > 0) ? consumeAmount : value;
            IERC20(lastLockToken).transferFrom(msg.sender, address(this), toConsume);
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
        lastBurnCall = BurnCall(smgID, tokenPairID, value, fee, tokenAddress, userAccount);
        // UserBurn 路径：SwapAndCrossV1 未对 bridge approve，Mock 不拉取代币
    }

    receive() external payable {}
}
