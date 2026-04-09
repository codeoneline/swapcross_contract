// scripts/deploy.js
// npx hardhat run scripts/deployV1.js --network avalanche
const { ethers, upgrades } = require("hardhat");
const path = require('path');
const networksConfig = require(path.resolve(__dirname, "../config/networks"));

const { getSwapData } = require(path.resolve(__dirname, "../lib/okxDexHelper"));

// 设置PK
// process.env.PK = ""

async function main() {
  const network = hre.network.name;
  const myConfig = networksConfig[network];
  
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Deploying SwapAndCrossV1 to ${network}`);
  console.log(`${"=".repeat(50)}\n`);
  
  const approveProxy = myConfig.approveProxy;
  const wanBridge = myConfig.wanBridge;
  
  console.log(`Configuration:`);
  console.log(`- approveProxy: ${approveProxy}`);
  console.log(`- wanBridge: ${wanBridge}`);
  
  if (!wanBridge) {
    throw new Error("❌ Missing wanBridge");
  }

  // 获取部署账户
  const [deployer] = await ethers.getSigners();
  console.log(`\n📍 Deploying from: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

  // 部署可升级合约
  const SwapAndCrossV1 = await ethers.getContractFactory("SwapAndCrossV1");
  
  console.log("📦 Deploying SwapAndCrossV1 proxy...");
  const proxy = await upgrades.deployProxy(
    SwapAndCrossV1,
    [approveProxy, wanBridge],
    {
      initializer: "initialize",
      kind: "uups"
    }
  );
  
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  
  console.log("✅ Proxy deployed to:", proxyAddress);
  
  // 获取实现合约地址
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("✅ Implementation deployed to:", implementationAddress);
  
  // 保存部署信息
  const fs = require('fs');
  const deploymentsDir = './deployments';
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  const deploymentInfo = {
    network: network,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    proxy: proxyAddress,
    implementation: implementationAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    config: {
      approveProxy,
      wanBridge
    }
  };
  
  fs.writeFileSync(
    `${deploymentsDir}/${network}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`\n✅ Deployment info saved to ${deploymentsDir}/${network}.json`);
  
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Deployment Complete! 🎉`);
  console.log(`${"=".repeat(50)}\n`);
  
  console.log(`Next steps:`);
  console.log(`1. Wait a few minutes for blockchain indexing`);
  console.log(`2. Verify contracts:`);
  console.log(`   npx hardhat verify --network ${network} ${implementationAddress}`);
  console.log(`3. Check on block explorer:`);
  
  // 根据网络显示区块浏览器链接
  const explorers = {
    ethereum: `https://etherscan.io/address/${proxyAddress}`,
    avalanche: `https://snowtrace.io/address/${proxyAddress}`,
    arbitrumOne: `https://arbiscan.io/address/${proxyAddress}`,
    base: `https://basescan.org/address/${proxyAddress}`,
    bsc: `https://bscscan.com/address/${proxyAddress}`,
    polygon: `https://polygonscan.com/address/${proxyAddress}`,
    optimism: `https://optimistic.etherscan.io/address/${proxyAddress}`,
  };
  
  if (explorers[network]) {
    console.log(`   ${explorers[network]}`);
  }
  
  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });

// 运行命令：
// npx hardhat run scripts/deployV1.js --network avalanche
// npx hardhat run scripts/deployV1.js --network ethereum