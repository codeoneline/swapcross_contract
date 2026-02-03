const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("00. 部署验证测试", function () {
  let swapAndCrossV1;
  let owner, user1;
  
  before(async function () {
    [owner, user1] = await ethers.getSigners();
    console.log("Owner:", owner.address);
    console.log("User1:", user1.address);
  });

  it("应该成功部署和初始化合约", async function () {
    console.log("\n=== 部署合约 ===");
    
    // 部署模拟合约 - 注意：合约名要和在contracts/test/目录下的文件名一致
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000"));
    await token.waitForDeployment();
    console.log("MockERC20:", await token.getAddress());
    
    // 注意：这里使用 SimpleMockRouter，不是 MockOKXDexRouter
    const SimpleMockRouter = await ethers.getContractFactory("SimpleMockRouter");
    const router = await SimpleMockRouter.deploy();
    await router.waitForDeployment();
    console.log("SimpleMockRouter:", await router.getAddress());
    
    const MockOKXApproveProxy = await ethers.getContractFactory("MockOKXApproveProxy");
    const proxy = await MockOKXApproveProxy.deploy();
    await proxy.waitForDeployment();
    console.log("MockOKXApproveProxy:", await proxy.getAddress());
    
    const MockWanBridge = await ethers.getContractFactory("MockWanBridge");
    const bridge = await MockWanBridge.deploy();
    await bridge.waitForDeployment();
    console.log("MockWanBridge:", await bridge.getAddress());
    
    // 部署主合约
    const SwapAndCrossV1 = await ethers.getContractFactory("SwapAndCrossV1");
    
    const initParams = [
      await router.getAddress(),
      await proxy.getAddress(),
      await bridge.getAddress()
    ];
    
    console.log("\n部署主合约...");
    swapAndCrossV1 = await upgrades.deployProxy(
      SwapAndCrossV1,
      initParams,
      { kind: 'uups', initializer: 'initialize' }
    );
    await swapAndCrossV1.waitForDeployment();
    
    const proxyAddress = await swapAndCrossV1.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    
    console.log("✅ 部署成功!");
    console.log("Proxy地址:", proxyAddress);
    console.log("Implementation地址:", implAddress);
    
    // 验证部署
    expect(proxyAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(implAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
  });

  it("应该正确初始化状态变量", async function () {
    console.log("\n=== 验证初始化 ===");
    
    // 验证版本号
    const version = await swapAndCrossV1.version();
    expect(version).to.equal("1.0.0");
    console.log("✅ 版本号:", version);
    
    // 验证owner
    const contractOwner = await swapAndCrossV1.owner();
    expect(contractOwner).to.equal(owner.address);
    console.log("✅ Owner:", contractOwner);
    
    // 验证配置地址
    const routerAddr = await swapAndCrossV1.okxDexRouter();
    const proxyAddr = await swapAndCrossV1.okxApproveProxy();
    const bridgeAddr = await swapAndCrossV1.wanBridge();
    
    expect(routerAddr).to.not.equal(ethers.ZeroAddress);
    expect(proxyAddr).to.not.equal(ethers.ZeroAddress);
    expect(bridgeAddr).to.not.equal(ethers.ZeroAddress);
    console.log("✅ 配置地址已设置");
  });
});