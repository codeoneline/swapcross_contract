const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("01. 基本功能测试", function () {
  let swapAndCrossV1;
  let tokenA;
  let owner, user1;
  
  before(async function () {
    [owner, user1] = await ethers.getSigners();
    
    console.log("\n=== 准备测试环境 ===");
    
    // 部署测试代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Token A", "TKA", ethers.parseEther("10000"));
    await tokenA.waitForDeployment();
    
    // 部署模拟合约
    const SimpleRouter = await ethers.getContractFactory("SimpleMockRouter");
    const router = await SimpleRouter.deploy();
    await router.waitForDeployment();
    
    const MockProxy = await ethers.getContractFactory("MockOKXApproveProxy");
    const proxy = await MockProxy.deploy();
    await proxy.waitForDeployment();
    
    const MockBridge = await ethers.getContractFactory("MockWanBridge");
    const bridge = await MockBridge.deploy();
    await bridge.waitForDeployment();
    
    // 部署主合约
    const SwapAndCrossV1 = await ethers.getContractFactory("SwapAndCrossV1");
    
    swapAndCrossV1 = await upgrades.deployProxy(
      SwapAndCrossV1,
      [
        await router.getAddress(),
        await proxy.getAddress(),
        await bridge.getAddress()
      ],
      { kind: 'uups', initializer: 'initialize' }
    );
    await swapAndCrossV1.waitForDeployment();
    
    console.log("测试环境准备完成");
  });

  describe("管理员功能", function () {
    it("只有owner可以更新配置", async function () {
      console.log("\n测试管理员权限...");
      
      const newRouter = user1.address;
      
      // 非owner不能更新
      await expect(
        swapAndCrossV1.connect(user1).updateRouter(newRouter)
      ).to.be.reverted;
      console.log("✅ 非owner更新被拒绝");
      
      // owner可以更新
      await swapAndCrossV1.connect(owner).updateRouter(newRouter);
      expect(await swapAndCrossV1.okxDexRouter()).to.equal(newRouter);
      console.log("✅ owner成功更新配置");
    });

    it("可以更新所有配置地址", async function () {
      console.log("\n测试更新所有配置...");
      
      const newProxy = user1.address;
      const newBridge = owner.address;
      
      await swapAndCrossV1.connect(owner).updateApproveProxy(newProxy);
      await swapAndCrossV1.connect(owner).updateBridge(newBridge);
      
      expect(await swapAndCrossV1.okxApproveProxy()).to.equal(newProxy);
      expect(await swapAndCrossV1.wanBridge()).to.equal(newBridge);
      console.log("✅ 所有配置更新成功");
    });


    it("应该验证零地址检查", async function () {
      console.log("\n测试零地址检查...");
      
      await expect(
        swapAndCrossV1.connect(owner).updateRouter(ethers.ZeroAddress)
      ).to.be.reverted;
      
      console.log("✅ 零地址检查生效");
    });
  });

  describe("紧急功能", function () {
    it("应该可以紧急提取代币", async function () {
      console.log("\n测试紧急提取...");
      
      const amount = ethers.parseEther("5");
      const contractAddress = await swapAndCrossV1.getAddress();
      
      // 转账到合约
      await tokenA.transfer(contractAddress, amount);
      const beforeBalance = await tokenA.balanceOf(contractAddress);
      expect(beforeBalance).to.equal(amount);
      
      // 提取
      await swapAndCrossV1.connect(owner).emergencyWithdraw(await tokenA.getAddress(), amount);
      
      const afterBalance = await tokenA.balanceOf(contractAddress);
      expect(afterBalance).to.equal(0);
      console.log("✅ 紧急提取成功");
    });

    it("只有owner可以紧急提取", async function () {
      console.log("\n测试紧急提取权限...");
      
      const amount = ethers.parseEther("1");
      const contractAddress = await swapAndCrossV1.getAddress();
      
      // 转账到合约
      await tokenA.transfer(contractAddress, amount);
      
      // 非owner不能提取
      await expect(
        swapAndCrossV1.connect(user1).emergencyWithdraw(await tokenA.getAddress(), amount)
      ).to.be.reverted;
      console.log("✅ 非owner提取被拒绝");
      
      // owner提取（清理）
      await swapAndCrossV1.connect(owner).emergencyWithdraw(await tokenA.getAddress(), amount);
    });
  });

  describe("查询功能", function () {
    it("应该可以查询合约余额", async function () {
      console.log("\n测试余额查询...");
      
      const tokenAddress = await tokenA.getAddress();
      const contractAddress = await swapAndCrossV1.getAddress();
      
      // 转账一些代币
      const amount = ethers.parseEther("2");
      await tokenA.transfer(contractAddress, amount);
      
      // 查询余额
      const balance = await swapAndCrossV1.getContractBalance(tokenAddress);
      expect(balance).to.equal(amount);
      console.log("✅ 余额查询正确:", balance.toString());
      
      // 清理
      await swapAndCrossV1.connect(owner).emergencyWithdraw(tokenAddress, amount);
    });

    it("应该可以查询配置信息", async function () {
      console.log("\n测试配置查询...");
      
      const router = await swapAndCrossV1.okxDexRouter();
      const proxy = await swapAndCrossV1.okxApproveProxy();
      const bridge = await swapAndCrossV1.wanBridge();
      
      expect(router).to.not.equal(ethers.ZeroAddress);
      expect(proxy).to.not.equal(ethers.ZeroAddress);
      expect(bridge).to.not.equal(ethers.ZeroAddress);
      console.log("✅ 配置查询成功");
    });

  });
});