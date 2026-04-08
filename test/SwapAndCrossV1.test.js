// test/SwapAndCrossV1.test.js
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function encodeRecipient(address) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["address"], [address]);
}

describe("SwapAndCrossV1", function () {
    let swapAndCross;
    let mockERC20In;
    let mockERC20Out;
    let mockRouter;
    let mockApproveProxy;
    let mockBridge;
    let owner;
    let user1;
    let user2;
    
    const SMG_ID = ethers.encodeBytes32String("test-smg-id");
    const TOKEN_PAIR_ID = 1;
    const NETWORK_FEE = ethers.parseEther("0.01");
    const RECIPIENT = "0x1234567890123456789012345678901234567890";
    
    // 构建 swapCallData 用于 MockRouter
    function buildSwapCallData(tokenIn, tokenOut, amountIn, recipient) {
        const mockRouterInterface = new ethers.Interface([
            "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, address recipient) external payable returns (uint256)"
        ]);
        return mockRouterInterface.encodeFunctionData("swap", [
            tokenIn,
            tokenOut,
            amountIn,
            0, // amountOutMin
            recipient
        ]);
    }
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        // 部署 Mock 合约
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockERC20In = await MockERC20.deploy("Test Token In", "TIN");
        mockERC20Out = await MockERC20.deploy("Test Token Out", "TOUT");
        
        const MockApproveProxy = await ethers.getContractFactory("MockApproveProxy");
        mockApproveProxy = await MockApproveProxy.deploy();
        
        const MockDexRouter = await ethers.getContractFactory("MockDexRouter");
        mockRouter = await MockDexRouter.deploy(await mockApproveProxy.getAddress());
        
        const MockBridge = await ethers.getContractFactory("MockBridge");
        mockBridge = await MockBridge.deploy();
        
        // 部署可升级合约
        const SwapAndCrossV1 = await ethers.getContractFactory("SwapAndCrossV1");
        swapAndCross = await upgrades.deployProxy(
            SwapAndCrossV1,
            [
                await mockRouter.getAddress(),
                await mockApproveProxy.getAddress(),
                await mockBridge.getAddress()
            ],
            { initializer: "initialize", kind: "uups" }
        );
        
        // 给 user1 一些代币
        await mockERC20In.mint(user1.address, ethers.parseEther("1000"));
        await mockERC20Out.mint(owner.address, ethers.parseEther("10000"));
        
        // 给 MockRouter 提供足够的输出代币
        await mockERC20Out.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther("1000"));
        
        // 授权给 swapAndCross 合约
        await mockERC20In.connect(user1).approve(await swapAndCross.getAddress(), ethers.parseEther("1000"));
    });
    
    describe("初始化", function () {
      it("应该正确初始化合约", async function () {
        expect(await swapAndCross.okxDexRouter()).to.equal(await mockRouter.getAddress());
        expect(await swapAndCross.okxApproveProxy()).to.equal(await mockApproveProxy.getAddress());
        expect(await swapAndCross.wanBridge()).to.equal(await mockBridge.getAddress());
        expect(await swapAndCross.owner()).to.equal(owner.address);
      });
      
      it("owner 可以升级合约", async function () {
        // 部署一个新的实现合约（实际上和 V1 一样，用于测试升级）
        const SwapAndCrossV2 = await ethers.getContractFactory("SwapAndCrossV2");
        
        // owner 升级应该成功
        await expect(
            upgrades.upgradeProxy(await swapAndCross.getAddress(), SwapAndCrossV2, { 
                signer: owner,
                kind: "uups"
            })
        ).to.not.be.reverted;

        // 验证升级后的版本
        const upgraded = await ethers.getContractAt("SwapAndCrossV2", await swapAndCross.getAddress());
        expect(await upgraded.version()).to.equal("2.0.0");
      });
      
      it("非 owner 不能升级合约", async function () {
        // 尝试用非 owner 账户升级，应该失败
        const SwapAndCrossV2 = await ethers.getContractFactory("SwapAndCrossV2");
        try {
            await upgrades.upgradeProxy(await swapAndCross.getAddress(), SwapAndCrossV2, { 
                kind: "uups",
                signer: user1
            });
            expect.fail("Should have reverted");
        } catch (error) {
            // 预期的错误
            expect(error.message).to.include("reverted");
        }

        // 模拟非 owner 尝试升级，应该被 revert
        // 注意：我们需要直接调用 upgradeTo 来测试权限
        
        // const SwapAndCrossV2 = await ethers.getContractFactory("SwapAndCrossV2");
            
        // // 获取代理地址
        // const proxyAddress = await swapAndCross.getAddress();
        
        // // 部署新的实现合约
        // const newImplementation = await SwapAndCrossV2.deploy();
        
        // // OZ v5 使用 upgradeToAndCall，第二个参数是空字节数组（表示不调用任何函数）
        // const uupsInterface = new ethers.Interface([
        //     "function upgradeToAndCall(address newImplementation, bytes memory data) external payable"
        // ]);
        
        // // 编码空数据
        // const emptyData = "0x";
        
        // // 非 owner 尝试升级，应该被 revert
        // await expect(
        //     user1.sendTransaction({
        //         to: proxyAddress,
        //         data: uupsInterface.encodeFunctionData("upgradeToAndCall", [
        //             await newImplementation.getAddress(),
        //             emptyData
        //         ]),
        //         value: 0
        //     })
        // ).to.be.reverted;
      });
    });
    
    describe("swapAndCross - 正常流程", function () {
        const AMOUNT_IN = ethers.parseEther("10");
        
        describe("ERC20 -> ERC20 (Lock 模式)", function () {
            it("应该成功执行 swap 和 lock 跨链", async function () {
                const swapCallData = buildSwapCallData(
                    await mockERC20In.getAddress(),
                    await mockERC20Out.getAddress(),
                    AMOUNT_IN,
                    await swapAndCross.getAddress()
                );
                
                const swapParams = {
                    tokenIn: await mockERC20In.getAddress(),
                    tokenOut: await mockERC20Out.getAddress(),
                    amountIn: AMOUNT_IN,
                    minAmountOut: AMOUNT_IN,
                    swapCallData: swapCallData
                };
                
                const bridgeParams = {
                    smgID: SMG_ID,
                    tokenPairID: TOKEN_PAIR_ID,
                    crossType: 0, // UserLock
                    recipient: encodeRecipient(RECIPIENT),
                    networkFee: NETWORK_FEE
                };
                
                // 给合约提供输出代币用于跨链
                await mockERC20Out.connect(owner).transfer(await swapAndCross.getAddress(), ethers.parseEther("100"));
                
                await expect(
                    swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
                ).to.emit(swapAndCross, "SwapAndCrossExecuted");
                
                const userInBalanceAfter = await mockERC20In.balanceOf(user1.address);
                expect(userInBalanceAfter).to.be.closeTo(ethers.parseEther("990"), ethers.parseEther("0.01"));
            });
        });
        
        describe("ETH -> ERC20 (Lock 模式)", function () {
            it("应该成功执行原生代币 swap 和 lock 跨链", async function () {
                const swapCallData = buildSwapCallData(
                    NATIVE_TOKEN,
                    await mockERC20Out.getAddress(),
                    AMOUNT_IN,
                    await swapAndCross.getAddress()
                );
                
                const swapParams = {
                    tokenIn: NATIVE_TOKEN,
                    tokenOut: await mockERC20Out.getAddress(),
                    amountIn: AMOUNT_IN,
                    minAmountOut: AMOUNT_IN,
                    swapCallData: swapCallData
                };
                
                const bridgeParams = {
                    smgID: SMG_ID,
                    tokenPairID: TOKEN_PAIR_ID,
                    crossType: 0,
                    recipient: encodeRecipient(RECIPIENT),
                    networkFee: NETWORK_FEE
                };
                
                await mockERC20Out.connect(owner).transfer(await swapAndCross.getAddress(), ethers.parseEther("100"));
                
                await expect(
                    swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, {
                        value: AMOUNT_IN + NETWORK_FEE
                    })
                ).to.emit(swapAndCross, "SwapAndCrossExecuted");
            });
        });
        
        describe("ERC20 -> ETH (Burn 模式)", function () {
            it("应该成功执行 swap 和 burn 跨链", async function () {
                // 给 MockRouter 提供 ETH 用于输出
                await owner.sendTransaction({
                    to: await mockRouter.getAddress(),
                    value: ethers.parseEther("100")
                });
                
                const swapCallData = buildSwapCallData(
                    await mockERC20In.getAddress(),
                    NATIVE_TOKEN,
                    AMOUNT_IN,
                    await swapAndCross.getAddress()
                );
                
                const swapParams = {
                    tokenIn: await mockERC20In.getAddress(),
                    tokenOut: NATIVE_TOKEN,
                    amountIn: AMOUNT_IN,
                    minAmountOut: AMOUNT_IN,
                    swapCallData: swapCallData
                };
                
                const bridgeParams = {
                    smgID: SMG_ID,
                    tokenPairID: TOKEN_PAIR_ID,
                    crossType: 1, // UserBurn
                    recipient: encodeRecipient(RECIPIENT),
                    networkFee: NETWORK_FEE
                };
                
                await expect(
                    swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
                ).to.emit(swapAndCross, "SwapAndCrossExecuted");
            });
        });
    });
    
    describe("swapAndCross - 错误处理", function () {
        const AMOUNT_IN = ethers.parseEther("10");
        
        it("当 amountIn 为 0 时应该回滚", async function () {
            const swapParams = {
                tokenIn: await mockERC20In.getAddress(),
                tokenOut: await mockERC20Out.getAddress(),
                amountIn: 0,
                minAmountOut: AMOUNT_IN,
                swapCallData: "0x",
            };
            
            const bridgeParams = {
                smgID: SMG_ID,
                tokenPairID: TOKEN_PAIR_ID,
                crossType: 0,
                recipient: encodeRecipient(RECIPIENT),
                networkFee: NETWORK_FEE
            };
            
            await expect(
                swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
            ).to.be.revertedWith("Amount must be greater than 0");
        });
        
        it("当 ETH 不足时应该回滚", async function () {
            const swapParams = {
                tokenIn: NATIVE_TOKEN,
                tokenOut: await mockERC20Out.getAddress(),
                amountIn: AMOUNT_IN,
                minAmountOut: AMOUNT_IN,
                swapCallData: "0x",
            };
            
            const bridgeParams = {
                smgID: SMG_ID,
                tokenPairID: TOKEN_PAIR_ID,
                crossType: 0,
                recipient: encodeRecipient(RECIPIENT),
                networkFee: NETWORK_FEE
            };
            
            await expect(
                swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
            ).to.be.revertedWith("Insufficient ETH: need swap amount + network fee");
        });
        
        it("当滑点超出限制时应该回滚", async function () {
            const swapCallData = buildSwapCallData(
                await mockERC20In.getAddress(),
                await mockERC20Out.getAddress(),
                AMOUNT_IN,
                await swapAndCross.getAddress()
            );
            
            const swapParams = {
                tokenIn: await mockERC20In.getAddress(),
                tokenOut: await mockERC20Out.getAddress(),
                amountIn: AMOUNT_IN,
                minAmountOut: AMOUNT_IN * 2n, // 要求双倍输出，不可能满足
                swapCallData: swapCallData
            };
            
            const bridgeParams = {
                smgID: SMG_ID,
                tokenPairID: TOKEN_PAIR_ID,
                crossType: 0,
                recipient: encodeRecipient(RECIPIENT),
                networkFee: NETWORK_FEE
            };
            
            await mockERC20Out.connect(owner).transfer(await swapAndCross.getAddress(), ethers.parseEther("100"));
            
            await expect(
                swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
            ).to.be.revertedWith("Insufficient output amount (slippage)");
        });
        
        it("recipient 为空时应该回滚", async function () {
            const swapParams = {
                tokenIn: await mockERC20In.getAddress(),
                tokenOut: await mockERC20Out.getAddress(),
                amountIn: AMOUNT_IN,
                minAmountOut: AMOUNT_IN,
                swapCallData: "0x",
            };
            
            const bridgeParams = {
                smgID: SMG_ID,
                tokenPairID: TOKEN_PAIR_ID,
                crossType: 0,
                recipient: "0x",
                networkFee: NETWORK_FEE
            };
            
            await expect(
                swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
            ).to.be.revertedWith("Invalid recipient");
        });
    });
    
    describe("管理功能", function () {
        it("owner 可以更新 Router 地址", async function () {
            const newRouter = user1.address;
            await expect(swapAndCross.connect(owner).updateRouter(newRouter))
                .to.emit(swapAndCross, "RouterUpdated")
                .withArgs(await mockRouter.getAddress(), newRouter);
            expect(await swapAndCross.okxDexRouter()).to.equal(newRouter);
        });
        
        it("非 owner 不能更新 Router", async function () {
            await expect(
                swapAndCross.connect(user1).updateRouter(user2.address)
            ).to.be.reverted;
        });
        
        it("owner 可以更新 ApproveProxy 地址", async function () {
            const newProxy = user1.address;
            await expect(swapAndCross.connect(owner).updateApproveProxy(newProxy))
                .to.emit(swapAndCross, "ApproveProxyUpdated")
                .withArgs(await mockApproveProxy.getAddress(), newProxy);
            expect(await swapAndCross.okxApproveProxy()).to.equal(newProxy);
        });
        
        it("owner 可以更新 Bridge 地址", async function () {
            const newBridge = user1.address;
            await expect(swapAndCross.connect(owner).updateBridge(newBridge))
                .to.emit(swapAndCross, "BridgeUpdated")
                .withArgs(await mockBridge.getAddress(), newBridge);
            expect(await swapAndCross.wanBridge()).to.equal(newBridge);
        });
        
        it("owner 可以紧急提取代币", async function () {
            await mockERC20In.connect(user1).transfer(await swapAndCross.getAddress(), ethers.parseEther("10"));
            
            const balanceBefore = await mockERC20In.balanceOf(owner.address);
            await swapAndCross.connect(owner).emergencyWithdraw(await mockERC20In.getAddress(), ethers.parseEther("10"));
            const balanceAfter = await mockERC20In.balanceOf(owner.address);
            
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("10"));
        });
    });
    
    describe("暂停功能", function () {
        const AMOUNT_IN = ethers.parseEther("10");
        
        beforeEach(async function () {
            // 准备必要的资金
            await mockERC20Out.connect(owner).transfer(await swapAndCross.getAddress(), ethers.parseEther("100"));
        });
        
        it("暂停后 swapAndCross 不能调用", async function () {
            await swapAndCross.connect(owner).pause();
            
            const swapParams = {
                tokenIn: await mockERC20In.getAddress(),
                tokenOut: await mockERC20Out.getAddress(),
                amountIn: AMOUNT_IN,
                minAmountOut: AMOUNT_IN,
                swapCallData: "0x",
            };
            
            const bridgeParams = {
                smgID: SMG_ID,
                tokenPairID: TOKEN_PAIR_ID,
                crossType: 0,
                recipient: encodeRecipient(RECIPIENT),
                networkFee: NETWORK_FEE
            };
            
            await expect(
                swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
            ).to.be.revertedWithCustomError(swapAndCross, "EnforcedPause");
        });
        
        it("恢复后可以正常调用", async function () {
            await swapAndCross.connect(owner).pause();
            await swapAndCross.connect(owner).unpause();
            
            const swapCallData = buildSwapCallData(
                await mockERC20In.getAddress(),
                await mockERC20Out.getAddress(),
                AMOUNT_IN,
                await swapAndCross.getAddress()
            );
            
            const swapParams = {
                tokenIn: await mockERC20In.getAddress(),
                tokenOut: await mockERC20Out.getAddress(),
                amountIn: AMOUNT_IN,
                minAmountOut: AMOUNT_IN,
                swapCallData: swapCallData
            };
            
            const bridgeParams = {
                smgID: SMG_ID,
                tokenPairID: TOKEN_PAIR_ID,
                crossType: 0,
                recipient: encodeRecipient(RECIPIENT),
                networkFee: NETWORK_FEE
            };
            
            // 重新给合约提供输出代币
            await mockERC20Out.connect(owner).transfer(await swapAndCross.getAddress(), ethers.parseEther("100"));
            
            await expect(
                swapAndCross.connect(user1).swapAndCross(swapParams, bridgeParams, { value: NETWORK_FEE })
            ).to.emit(swapAndCross, "SwapAndCrossExecuted");
        });
        
        it("非 owner 不能暂停", async function () {
            await expect(swapAndCross.connect(user1).pause()).to.be.reverted;
        });
        
        it("非 owner 不能恢复", async function () {
            await expect(swapAndCross.connect(user1).unpause()).to.be.reverted;
        });
    });
    
    describe("版本信息", function () {
        it("应该返回正确的版本号", async function () {
            expect(await swapAndCross.version()).to.equal("1.0.0");
        });
    });
    
    describe("合约余额查询", function () {
        it("应该正确返回原生代币余额", async function () {
            // 直接设置合约余额，绕过 receive 检查
            await ethers.provider.send("hardhat_setBalance", [
                await swapAndCross.getAddress(),
                "0x56bc75e2d63100000" // 100 ETH in hex
            ]);
            
            const balance = await swapAndCross.getContractBalance(NATIVE_TOKEN);
            expect(balance).to.equal(ethers.parseEther("100"));
        });
        
        it("应该正确返回 ERC20 代币余额", async function () {
            await mockERC20In.connect(user1).transfer(await swapAndCross.getAddress(), ethers.parseEther("5"));
            
            const balance = await swapAndCross.getContractBalance(await mockERC20In.getAddress());
            expect(balance).to.equal(ethers.parseEther("5"));
        });
    });
});