// scripts/verify.js
const { run } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  const network = hre.network.name;
  
  // 读取部署信息
  const deploymentPath = `./deployments/${network}.json`;
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`❌ No deployment found for network ${network}`);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const implementationAddress = deployment.implementation;
  
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Verifying contracts on ${network}`);
  console.log(`${"=".repeat(50)}\n`);
  console.log(`Implementation: ${implementationAddress}`);
  
  // 验证实现合约
  console.log("\n🔍 Verifying implementation contract...");
  try {
    await run("verify:verify", {
      address: implementationAddress,
      constructorArguments: [],
    });
    console.log("✅ Implementation verified!");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Implementation already verified!");
    } else {
      console.error("❌ Verification failed:", error.message);
      console.log("\nTry again later or verify manually:");
      console.log(`npx hardhat verify --network ${network} ${implementationAddress}`);
    }
  }
  
  console.log(`\n${"=".repeat(50)}`);
  console.log("Verification Complete!");
  console.log(`${"=".repeat(50)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// 运行命令：
// npx hardhat run scripts/verify.js --network avalanche

// # 1. 部署合约
// npx hardhat run scripts/deploy.js --network avalanche
// # 输出：Proxy: 0xABCD..., Implementation: 0x1234...

// # 2. 验证（Hardhat 自动做以下事情）
// npx hardhat verify --network avalanche 0x1234...

// # Hardhat 内部流程：
// # a. 读取链上 0x1234 的字节码
// # b. 在 artifacts/ 中找到匹配的 SwapAndCrossV1.json
// # c. 收集 SwapAndCrossV1.sol 和所有导入的文件
// # d. 打包成 JSON：
// #    {
// #      "language": "Solidity",
// #      "sources": {
// #        "contracts/SwapAndCrossV1.sol": { content: "..." },
// #        "@openzeppelin/...": { content: "..." }
// #      },
// #      "settings": { optimizer: { enabled: true, runs: 200 } }
// #    }
// # e. POST 到 https://api.snowtrace.io/api
// # f. 等待 Snowtrace 编译并对比
// # g. 返回结果：✅ 成功 或 ❌ 失败