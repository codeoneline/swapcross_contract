// scripts/deploy-upgradeable.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("开始部署可升级合约 SwapAndCrossV1...");
  
  const [deployer] = await ethers.getSigners();
  console.log("部署者地址:", deployer.address);
  
  // 从环境变量或直接设置获取参数
  const OKX_DEX_ROUTER = process.env.OKX_DEX_ROUTER || "0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91";
  const OKX_APPROVE_PROXY = process.env.OKX_APPROVE_PROXY || "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f";
  const WAN_BRIDGE = process.env.WAN_BRIDGE || "0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a";
  
  console.log("使用参数:");
  console.log("- OKX DEX Router:", OKX_DEX_ROUTER);
  console.log("- OKX Approve Proxy:", OKX_APPROVE_PROXY);
  console.log("- Wanchain Bridge:", WAN_BRIDGE);
  
  // 1. 获取合约工厂
  const SwapAndCrossV1 = await ethers.getContractFactory("SwapAndCrossV1");
  
  // 2. 使用 upgrades.deployProxy 部署可升级代理合约
  console.log("\n正在部署代理合约（UUPS）...");
  const swapAndCross = await upgrades.deployProxy(
    SwapAndCrossV1,
    [OKX_DEX_ROUTER, OKX_APPROVE_PROXY, WAN_BRIDGE], // 初始化参数，对应 initialize 函数
    {
      initializer: "initialize", // 你的初始化函数名
      kind: "uups",             // 使用 UUPS 升级模式
      timeout: 0,
      pollingInterval: 1000,
    }
  );
  
  // 等待部署完成
  await swapAndCross.waitForDeployment();
  
  // 3. 获取各关键地址
  const proxyAddress = await swapAndCross.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  
  console.log("\n✅ 部署成功！");
  console.log("========================================");
  console.log("代理合约地址 (用户交互的地址):", proxyAddress);
  console.log("逻辑合约地址 (实现代码地址):", implementationAddress);
  console.log("========================================\n");
  
  // 4. 验证合约状态
  console.log("合约初始化状态验证:");
  console.log("- 合约所有者:", await swapAndCross.owner());
  console.log("- OKX DEX Router:", await swapAndCross.okxDexRouter());
  console.log("- OKX Approve Proxy:", await swapAndCross.okxApproveProxy());
  console.log("- Wanchain Bridge:", await swapAndCross.wanBridge());
  
  return {
    proxyAddress,
    implementationAddress,
  };
}

// 执行并处理错误
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });