/// wanBridge Address 地址 (官方部署地址)
/// testnet
// Wanchain: 0x62de27e16f6f31d9aa5b02f4599fc6e21b339e79

/// mainnet
// Ethereum Mainnet: 0x5E1f62Dac767b0491e3CE72469C217365D5B48cC
// Arbitrum One: 0x368E01160C2244B0363a35B3fF0A971E44a89284
// Base: 0x4409921ae43a39a11d90f7b7f96cfd0b8093d9fc
// BNB Chain: 0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0
// Polygon: 0xf332761c673b59B21fF6dfa8adA44d78c12dEF09
// Optimism: 0x68D6B739D2020067D1e2F713b999dA97E4d54812

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "./.env") });
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const networksConfig = require(path.resolve(__dirname, "../../config/networks"))

// deployed on wanchain testnet and avalanche testnet (fuji)
module.exports = buildModule("CrossModule", (m) => {
  const network = hre.network.name;
  const config = hre.network.config;
  const myConfig = networksConfig[network]
  console.log(`Deploying to network: ${network}`);
  console.log(`hh network is: ${JSON.stringify(config)}`);
  console.log(`my network is: ${JSON.stringify(myConfig)}`);
  console.log(`bridge address on ${network} is ${myConfig.wanBridge}`)

  const bridgeAddress = myConfig.wanBridge
  if (!bridgeAddress) {
    console(`bad wanBridge`)
    return
  } 

  const cross = m.contract("Cross", [bridgeAddress], {});

  return { cross };
});



// npx hardhat ignition deploy ./ignition/modules/Swap.js --network ethereum --parameters '{"SwapModule":{"network":"ethereum"}}'
// npx hardhat ignition deploy ./ignition/modules/Cross.js --network wanchainTestnet
// npx hardhat ignition deploy ./ignition/modules/Cross.js --network fuji