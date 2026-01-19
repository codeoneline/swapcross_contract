// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.24;

// ==================== Interfaces ====================
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBridge {
    function userLock(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        bytes memory userAccount
    ) external payable;

    function userBurn(
        bytes32 smgID,
        uint tokenPairID,
        uint value,
        uint fee,
        address tokenAddress,
        bytes memory userAccount
    ) external payable;
}

// ==================== Enums ====================
enum CrossType {
    UserLock,  // 锁定模式：锁定源链资产，目标链铸造映射资产
    UserBurn   // 销毁模式：销毁源链映射资产，目标链解锁原生资产
}

// ==================== Structs ====================
struct BridgeParams {
    address token;           // 跨链资产地址 (address(0) 表示原生币)
    uint256 amount;          // 跨链数量
    bytes32 smgID;           // Storeman Group ID
    uint256 tokenPairID;     // 代币对ID
    CrossType crossType;     // 跨链类型
    bytes recipient;         // 目标链接收地址
    uint256 networkFee;      // 跨链网络费
}

// ==================== Events ====================

event BridgeInitiated(
    bytes32 indexed txHash,
    address indexed user,
    address indexed token,
    uint256 amount,
    bytes recipient,
    uint256 networkFee
);

// ==================== State Variables ====================
contract Cross {
    using SafeERC20 for IERC20;

    address public immutable wanBridge;  // Wanchain Bridge 地址
    constructor(address _wanBridge) {
        require(_wanBridge != address(0), "SimpleBridge: invalid bridge address");
        wanBridge = _wanBridge;
    }
    function cross(
        BridgeParams calldata params
    ) external payable returns (bytes32 txHash) {
        require(params.amount > 0, "SimpleBridge: amount must be greater than 0");
        require(msg.value >= params.networkFee, "SimpleBridge: insufficient network fee");
        require(params.recipient.length > 0, "SimpleBridge: invalid recipient");

        if (params.token != address(0)) {
          // 从用户转入代币
          IERC20(params.token).safeTransferFrom(
              msg.sender,
              address(this),
              params.amount
          );

          // 执行跨链
          if (params.crossType == CrossType.UserLock) {
              // Lock模式：需要授权给bridge
              IERC20(params.token).forceApprove(wanBridge, params.amount);
              
              IBridge(wanBridge).userLock{value: params.networkFee}(
                  params.smgID,
                  params.tokenPairID,
                  params.amount,
                  params.recipient
              );
          } else {
              // Burn模式：直接销毁
              IBridge(wanBridge).userBurn{value: params.networkFee}(
                  params.smgID,
                  params.tokenPairID,
                  params.amount,
                  0,  // fee参数设为0
                  params.token,
                  params.recipient
              );
          }
          // 生成交易哈希
          txHash = keccak256(
              abi.encodePacked(
                  msg.sender,
                  params.token,
                  params.amount,
                  block.timestamp,
                  block.number
              )
          );
          emit BridgeInitiated(
              txHash,
              msg.sender,
              params.token,
              params.amount,
              params.recipient,
              params.networkFee
          );

        } else {
          // 原生币只支持Lock模式
          IBridge(wanBridge).userLock{value: params.networkFee + params.amount}(
              params.smgID,
              params.tokenPairID,
              params.amount,
              params.recipient
          );
          // 生成交易哈希
          txHash = keccak256(
              abi.encodePacked(
                  msg.sender,
                  address(0),
                  params.amount,
                  block.timestamp,
                  block.number
              )
          );
          emit BridgeInitiated(
              txHash,
              msg.sender,
              address(0),
              params.amount,
              params.recipient,
              params.networkFee
          );
        }
    }
}