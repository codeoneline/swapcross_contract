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

module.exports = buildModule("SwapAndCrossModule", (m) => {
  const network = hre.network.name;
  const config = hre.network.config;
  const myConfig = networksConfig[network]
  console.log(`Deploying to network: ${network}`);
  console.log(`config is network: ${JSON.stringify(config)}`);
  console.log(`my network is: ${JSON.stringify(myConfig)}`);
  const okxDexRouter = myConfig.okxDexRouter;
  const wanBridge = myConfig.wanBridge;
  console.log(`okxDexRouter is ${okxDexRouter}`)
  console.log(`wanBridge is ${wanBridge}`)
  if (!okxDexRouter || !wanBridge) {
    console(`bad okxDexRouter or wanBridge`)
    return 
  } 

  const swapAndCross = m.contract("SwapAndCross", [okxDexRouter, wanBridge], {});

  return { swapAndCross };
});



// npx hardhat ignition deploy ./ignition/modules/SwapAndCross.js --network ethereum --parameters '{"SwapModule":{"network":"ethereum"}}'
// npx hardhat ignition deploy ./ignition/modules/SwapAndCross.js --network ethereum
// npx hardhat ignition deploy ./ignition/modules/SwapAndCross.js --network avalanche