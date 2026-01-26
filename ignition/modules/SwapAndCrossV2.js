const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("SwapAndCrossV2Module", (m) => {
  // Wanchain Bridge 地址（主网）
  const wanBridge = "0x8a0ab0e98c5fad1970222cc0919f787d3f267db2";
  
  // 白名单路由地址
  const initialRouters = [
    "0x111111125421cA6dc452d289314280a0f8842A65",  // 1inch Router V6
    "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC",  // OKX Router (备用)
  ];

  const swapAndCross = m.contract("SwapAndCross", [wanBridge, initialRouters]);

  return { swapAndCross };
});