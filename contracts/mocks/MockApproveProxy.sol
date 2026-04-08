// contracts/mocks/MockApproveProxy.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockApproveProxy {
    using SafeERC20 for IERC20;
    
    function claimTokens(
        address token,
        address from,
        address to,
        uint256 amount
    ) external {
        IERC20(token).safeTransferFrom(from, to, amount);
    }
}