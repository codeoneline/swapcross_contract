
const hre = require("hardhat");

async function main() {
  // 获取当前网络配置
  const network = hre.network.name;
  const okxDexRouter = hre.config.networks[network].okxDexRouter;

  console.log(`Deploying to ${network}`);
  console.log(`Using OKX DEX Router: ${okxDexRouter}`);

  const SwapCross = await hre.ethers.getContractFactory("SwapCross");
  const swap = await SwapCross.deploy(okxDexRouter);

  await swap.waitForDeployment();

  console.log(`SwapCross deployed to: ${await swap.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


// npx hardhat run scripts/deploy.js --network ethereum