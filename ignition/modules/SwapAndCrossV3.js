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

module.exports = buildModule("SwapAndCrossV31Module", (m) => {
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
    console(`bad okxDexRouter or wanBridge`)
    return 
  } 

  const swapAndCrossV3 = m.contract("SwapAndCrossV3", [okxDexRouter, approveProxy, wanBridge], {});

  return { swapAndCrossV3 };
});



// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV1.js --network ethereum
// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV2.js --network avalanche
// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV1.js --network ethereum --reset
// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV3.js --network ethereum
// npx hardhat ignition deploy ./ignition/modules/SwapAndCrossV3.js --network avalanche

// npx hardhat verify --network ethereum 0x7ADB5dB6830A726C89f953cfE26a3bCacA815010 "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC" "0xfceaaaeb8d564a9d0e71ef36f027b9d162bc334e"
// npx hardhat verify --network avalanche 0xc529101eef9D1859Ee756ffF030e760f4e0a1461 "0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91" "0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a"
// npx hardhat verify --network avalanche 0x98FDFC27aA24e3c9cFeF47274d24253147755BF1 "0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91" "0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a"
// npx hardhat verify --network ethereum 0x142B0B5EbFF5CfEf68A6375c31d14D55c7c0C05B "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC" "0x70cBb871E8f30Fc8Ce23609E9E0Ea87B6b222F58" "0xfceaaaeb8d564a9d0e71ef36f027b9d162bc334e"
// npx hardhat verify --network ethereum 0x0E0fC3Fa527C03A43EfC8493C5de876ED3A80d3A "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC" "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f" "0xfceaaaeb8d564a9d0e71ef36f027b9d162bc334e"
// npx hardhat verify --network avalanche 0xC730d08f10CC76D372a1f5b8026732A0355c616B "0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91" "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f" "0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a"


