// OKX DEX Router 地址 (官方部署地址)
// Ethereum Mainnet: 0x5E1f62Dac767b0491e3CE72469C217365D5B48cC
// Arbitrum One: 0x368E01160C2244B0363a35B3fF0A971E44a89284
// Base: 0x4409921ae43a39a11d90f7b7f96cfd0b8093d9fc
// BNB Chain: 0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0
// Polygon: 0xf332761c673b59B21fF6dfa8adA44d78c12dEF09
// Optimism: 0x68D6B739D2020067D1e2F713b999dA97E4d54812

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const path = require('path')
const networksConfig = require(path.resolve(__dirname, "../../config/networks"))

module.exports = buildModule("SwapAndCrossUUPSModule", (m) => {
  const network = hre.network.name;
  const config = hre.network.config;
  const myConfig = networksConfig[network]
  console.log(`Deploying to network: ${network}`);
  console.log(`config is network: ${JSON.stringify(config)}`);
  console.log(`my network is: ${JSON.stringify(myConfig)}`);
  const okxDexRouter = myConfig.okxDexRouter;
  const approveProxy = myConfig.approveProxy;
  const wanBridge = myConfig.wanBridge;
  console.log(`okxDexRouter is ${okxDexRouter}`)
  console.log(`approveProxy is ${approveProxy}`)
  console.log(`wanBridge is ${wanBridge}`)
  if (!okxDexRouter || !wanBridge) {
    console.log(`bad okxDexRouter or wanBridge`)
    return 
  }

  // 1. 部署实现合约
  const swapAndCrossV1Impl = m.contract("SwapAndCrossV1", [], {
    id: "SwapAndCrossV1_Implementation"
  });

  // 2. 部署代理 - 改用 Proxy 而不是 ERC1967Proxy
  const proxy = m.contract("Proxy", [
    swapAndCrossV1Impl,
    m.encodeFunctionCall(swapAndCrossV1Impl, "initialize", [okxDexRouter, approveProxy, wanBridge])
  ], {
    id: "SwapAndCrossProxy"
  });

  // 3. 返回代理地址（用户通过代理交互）
  const swapAndCrossV1Proxy = m.contractAt("SwapAndCrossV1", proxy, {
    id: "SwapAndCrossV1_Proxy"
  });
  
  return {
    implementation: swapAndCrossV1Impl,
    proxy, 
    swapAndCrossV1: swapAndCrossV1Proxy,
  };
});

// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV1Deploy.js --network avalanche
// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV1Deploy.js --network ethereum --reset
// npx hardhat verify --network ethereum 0x0E0fC3Fa527C03A43EfC8493C5de876ED3A80d3A "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC" "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f" "0xfceaaaeb8d564a9d0e71ef36f027b9d162bc334e"
// npx hardhat verify --network avalanche 0xC730d08f10CC76D372a1f5b8026732A0355c616B "0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91" "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f" "0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a"

// npx hardhat ignition verify
// npx hardhat verify