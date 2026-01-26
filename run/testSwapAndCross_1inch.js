const { ethers } = require('ethers');
const BigNumber = require('bignumber.js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const { get1inchSwapData, ONEINCH_ROUTER_V6 } = require(path.resolve(__dirname, "../lib/oneInchHelper"));
const { reqQuotaAndFee, tryLoadJsonObj, getNetworkByChainType } = require(path.resolve(__dirname, "../lib/utils"));
const { sendContractAndWait, diagnoseWallet } = require(path.resolve(__dirname, "../lib/chainManager"));

const gTokenPairsInfo = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-mainnet.json"), {total: 0, tokenPairs: {}});

const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];

const swapAndCrossAbi = [
  'function swapAndCross(tuple(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes swapCallData) swapParams, tuple(bytes32 smgID, uint256 tokenPairID, uint8 crossType, bytes recipient, uint256 networkFee) bridgeParams) external payable returns (bytes32 txHash, uint256 amountOut)',
];

// // 调用你现有合约的 setRouterWhitelist 函数
// await swapAndCross.setRouterWhitelist(
//   "0x111111125421cA6dc452d289314280a0f8842A65", // 1inch Router V6
//   true
// );

async function sendSwapAndCross(fromTokenSymbol, toTokenSymbol, fromChainSymbol, toChainSymbol, tokenPairId) {
    const tokenPair = gTokenPairsInfo.tokenPairs[tokenPairId];
    const myFromConfig = getNetworkByChainType(fromChainSymbol, false);
    const myToConfig = getNetworkByChainType(toChainSymbol, false);
    
    const fromChainID = parseInt(tokenPair.fromChainID);
    const toChainID = parseInt(tokenPair.toChainID);
    
    if (myFromConfig.bip44 !== fromChainID && myFromConfig.bip44 !== toChainID) {
      console.log('❌ Bad from chain');
      return;
    }
    if (myToConfig.bip44 !== fromChainID && myToConfig.bip44 !== toChainID) {
      console.log('❌ Bad to chain');
      return;
    }

    const crossFromTokenAddress = myFromConfig.bip44 === fromChainID ? tokenPair.fromAccount : tokenPair.toAccount;

    const networkName = myFromConfig.networkName;
    const chainId = myFromConfig.chainId;
    const walletAddress = process.env.EVM_WALLET_ADDRESS;
    const privateKey = process.env.EVM_PRIVATE_KEY;

    console.log('\n=== Wallet Diagnosis ===');
    const diagResult = await diagnoseWallet(networkName, privateKey);
    if (!diagResult) {
      throw new Error('Wallet diagnosis failed');
    }

    // 代币地址
    const tokenIn = fromTokenSymbol === 'ETH' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : null;
    const tokenOut = crossFromTokenAddress; // USDT 等
    const amountIn = '1000000000000000'; // 0.001000000000000000 ETH
    const slippage = 1; // 1%

    const swapChainId = myFromConfig.chainId;
    const SwapAndCrossAddress = require(path.resolve(__dirname, `../ignition/deployments/chain-${swapChainId}/deployed_addresses.json`))["SwapAndCrossModule#SwapAndCross"];

    console.log('\n=== Getting 1inch Swap Data ===');
    console.log('Chain ID:', chainId);
    console.log('From Token:', fromTokenSymbol, '→', tokenIn);
    console.log('To Token:', toTokenSymbol, '→', tokenOut);
    console.log('Amount:', ethers.formatEther(amountIn), 'ETH');
    console.log('From (caller):', SwapAndCrossAddress);
    console.log('Receiver:', SwapAndCrossAddress);
    console.log('================================\n');

    let swapData;
    try {
      swapData = await get1inchSwapData(
        chainId,
        tokenIn,
        tokenOut,
        amountIn,
        SwapAndCrossAddress,  // ✅ 调用者 = 合约
        SwapAndCrossAddress,  // ✅ 接收者 = 合约
        slippage
      );
    } catch (error) {
      console.error('❌ Failed to get 1inch swap data:', error.message);
      return;
    }

    console.log('✅ Got 1inch swap data!');
    console.log('  Router:', swapData.router);
    console.log('  Expected output:', ethers.formatUnits(swapData.toAmount, 6), 'USDT');
    console.log('  Estimated gas:', swapData.estimatedGas);

    // 验证路由是否在白名单
    if (swapData.router.toLowerCase() !== ONEINCH_ROUTER_V6.toLowerCase()) {
      console.log('⚠️  Warning: Router mismatch!');
      console.log('  Expected:', ONEINCH_ROUTER_V6);
      console.log('  Got:', swapData.router);
    }

    // 计算最小输出（带滑点保护）
    const minAmountOut = BigNumber(swapData.toAmount)
      .multipliedBy(100 - slippage)
      .dividedBy(100)
      .toFixed(0);

    console.log('  Min output (with slippage):', ethers.formatUnits(minAmountOut, 6), 'USDT\n');

    // 获取跨链费用
    const feeInfo = await reqQuotaAndFee(fromChainSymbol, toChainSymbol, tokenPairId, toTokenSymbol);
    
    if (feeInfo.networkFee.isPercent) {
      console.log('❌ Bad networkFee, isPercent = true!');
      return;
    }

    const networkFee = BigNumber(feeInfo.networkFee.value);
    const isNativeSwap = tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    let totalValue = BigNumber(0);
    if (isNativeSwap) {
      totalValue = totalValue.plus(amountIn);
    }
    if (!networkFee.isZero()) {
      totalValue = totalValue.plus(networkFee);
    }

    const options = totalValue.isGreaterThan(0) ? { value: totalValue.toFixed(0) } : {};

    console.log('=== Transaction Value ===');
    console.log('Swap input:', ethers.formatEther(amountIn), 'ETH');
    console.log('Bridge fee:', ethers.formatEther(networkFee.toFixed(0)), 'ETH');
    console.log('Total value:', ethers.formatEther(totalValue.toFixed(0)), 'ETH');
    console.log('=========================\n');

    // ERC20 授权（如果需要）
    if (!isNativeSwap) {
      console.log('Approving ERC20 token...');
      const { txResponse } = await sendContractAndWait(
        networkName,
        privateKey,
        tokenIn,
        erc20Abi,
        'approve',
        [SwapAndCrossAddress, amountIn],
        {},
        1
      );
      console.log('✅ Approval done:', txResponse.hash, '\n');
    }

    // 构建参数
    const swapParams = {
      router: swapData.router,     // ✅ 1inch Router
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      swapCallData: swapData.callData
    };

    const crossParams = {
      smgID: "0x000000000000000000000000000000000000000000000041726965735f303632",
      tokenPairID: tokenPairId,
      crossType: 0, // UserLock
      recipient: ethers.getBytes(walletAddress),
      networkFee: networkFee.toFixed(0)
    };

    // 静态调用验证
    console.log('=== Static Call Validation ===');
    try {
      const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com');
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(SwapAndCrossAddress, swapAndCrossAbi, wallet);

      const staticResult = await contract.swapAndCross.staticCall(
        swapParams,
        crossParams,
        { ...options, gasLimit: 1000000 }
      );

      console.log('✅ Static call SUCCESS!');
      console.log('  TX Hash:', staticResult.txHash);
      console.log('  Amount Out:', ethers.formatUnits(staticResult.amountOut, 6), 'USDT');
      console.log('===============================\n');

    } catch (staticError) {
      console.error('❌ Static call FAILED!');
      console.error('Error:', staticError.message);
      console.log('\n⚠️  Aborting.\n');
      return;
    }

    // 发送真实交易
    console.log('🚀 Sending real transaction...\n');
    const result = await sendContractAndWait(
      networkName,
      privateKey,
      SwapAndCrossAddress,
      swapAndCrossAbi,
      'swapAndCross',
      [swapParams, crossParams],
      { ...options, gasLimit: 1000000 },
      1
    );

    console.log('\n✅ ✅ ✅ SUCCESS! ✅ ✅ ✅');
    console.log('═══════════════════════════════════');
    console.log('TX Hash:', result.txResponse.hash);
    console.log('Block:', result.receipt.blockNumber);
    console.log('Gas Used:', result.receipt.gasUsed.toString());
    console.log('═══════════════════════════════════');
    console.log(`\nView: https://etherscan.io/tx/${result.txResponse.hash}\n`);
}

setTimeout(async () => {
    await sendSwapAndCross('ETH', 'USDT', 'ETH', 'AVAX', 232);
}, 0);