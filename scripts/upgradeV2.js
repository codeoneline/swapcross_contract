// scripts/upgrade-swap-and-cross.js
const { ethers, upgrades } = require("hardhat");
const path = require('path');
const fs = require('fs');

async function main() {
  const network = hre.network.name;
  
  // 读取之前的部署信息
  const deploymentPath = `./deployments/${network}.json`;
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found for network ${network}`);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const proxyAddress = deployment.proxy;
  
  console.log(`Upgrading SwapAndCross on ${network}`);
  console.log(`Proxy address: ${proxyAddress}`);
  
  // 部署新的实现合约
  const SwapAndCrossV2 = await ethers.getContractFactory("SwapAndCrossV2");
  
  console.log("Upgrading to SwapAndCrossV2...");
  // openzeppelin 5 -> upgradeToAndCall
  // openzeppelin 4 -> upgradeToAndCall 或 upgradeTo
  const upgraded = await upgrades.upgradeProxy(proxyAddress, SwapAndCrossV2);
  
  await upgraded.waitForDeployment();
  
  // 获取新的实现合约地址
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation deployed to:", newImplementationAddress);
  
  // 如果 V2 有新的初始化函数，调用它
  // const swapAndCrossV2 = await ethers.getContractAt("SwapAndCrossV2", proxyAddress);
  // await swapAndCrossV2.initializeV2(params);
  
  // 更新部署信息
  deployment.implementation = newImplementationAddress;
  deployment.version = "V2";
  deployment.upgradedAt = new Date().toISOString();
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  
  console.log("\nUpgrade complete!");
  console.log(JSON.stringify(deployment, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// 运行命令：
// npx hardhat run scripts/upgrade-swap-and-cross.js --network avalanche