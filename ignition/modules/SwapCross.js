// OKX DEX Router 地址 (官方部署地址)
// Ethereum Mainnet: 0x5E1f62Dac767b0491e3CE72469C217365D5B48cC
// Arbitrum One: 0x368E01160C2244B0363a35B3fF0A971E44a89284
// Base: 0x4409921ae43a39a11d90f7b7f96cfd0b8093d9fc
// BNB Chain: 0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0
// Polygon: 0xf332761c673b59B21fF6dfa8adA44d78c12dEF09
// Optimism: 0x68D6B739D2020067D1e2F713b999dA97E4d54812

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const addresses = require("../../config/addresses");

module.exports = buildModule("SwapCrossModule", (m) => {
  // const unlockTime = m.getParameter("unlockTime", "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC");
  // const network = m.getParameter("network", "");
  const networkName = hre.network.name;
  const config = hre.network.config;
  console.log(`Deploying to network: ${networkName}`);
  console.log(`config is network: ${JSON.stringify(config)}`);
  const okxDexRouter = addresses[networkName].okxDexRouter;
  console.log(`okxDexRouter is ${okxDexRouter}`)
  if (network === "" || !okxDexRouter) {
    return 
  } 

  const swap = m.contract("SwapCross", [okxDexRouter], {});

  return { swap };
});



// npx hardhat ignition deploy ./ignition/modules/SwapCross.js --network ethereum --parameters '{"SwapCrossModule":{"network":"ethereum"}}'
// npx hardhat ignition deploy ./ignition/modules/SwapCross.js --network wanchainTestnet