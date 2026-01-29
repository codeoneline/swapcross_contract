const { ethers } = require('ethers');
const BigNumber = require('bignumber.js')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const networksConfig = require(path.resolve(__dirname, "../config/networks"))
const { getValidAmount, getNetworkfee, reqQuotaAndFee, tryLoadJsonObj, getNetworkByChainType, parseOkxCallData} = require(path.resolve(__dirname, "../lib/utils"))
const gTokenPairsInfo = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-mainnet.json"), {total: 0, tokenPairs: {}});
const gTokenPairsInfoTestnet = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-testnet.json"), {total: 0, tokenPairs: {}});
const gTokensInfo = require(path.resolve(__dirname, "../data/tokens-mainnet.json"))
const gTokensInfoTestnet = require(path.resolve(__dirname, "../data/tokens-testnet.json"))
const { callContract, sendNativeAndWait, sendContractAndWait, diagnoseWallet} = require(path.resolve(__dirname, "../lib/chainManager"))
const { getSwapData, sendGetRequest } = require(path.resolve(__dirname, "../lib/okxDexHelper"))

const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];
const swapAndCrossAbi = [
  'function swapAndCross(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes swapCallData) swapParams, tuple(bytes32 smgID, uint256 tokenPairID, uint8 crossType, bytes recipient, uint256 networkFee) bridgeParams) external payable returns (bytes32 txHash, uint256 amountOut)',
  'function updateApproveProxy(address newProxy) external onlyOwner',
]

const updateApproveProxy = async() => {
  const privateKey = process.env.EVM_PRIVATE_KEY;

  const { txResponse, receipt } = await sendContractAndWait(
    'ethereum',
    privateKey,
    '0x142B0B5EbFF5CfEf68A6375c31d14D55c7c0C05B',
    swapAndCrossAbi,
    'updateApproveProxy',
    ['0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f'],
    {},
    1
  );
    console.log(`✅ updateApproveProxy successful! Hash: ${txResponse.hash}`);
}

const sendSwapAndCross = async (fromTokenSymbol, toTokenSymbol, fromChainSymbol, toChainSymbol, tokenPairId, amount, SwapAndCrossAddress, isTestnet = false) => {
    const tokenPairs = isTestnet ? gTokenPairsInfoTestnet.tokenPairs : gTokenPairsInfo.tokenPairs
    const tokens = isTestnet ? gTokenPairsInfoTestnet : gTokensInfo
    const tokenPair = tokenPairs[tokenPairId]
    const myFromConfig = getNetworkByChainType(fromChainSymbol, isTestnet)
    const myToConfig = getNetworkByChainType(toChainSymbol, isTestnet)
    const fromChainID = parseInt(tokenPair.fromChainID)
    const toChainID = parseInt(tokenPair.toChainID)
    
    if (myFromConfig.bip44 !== fromChainID && myFromConfig.bip44 !== toChainID) {
      console.log(`bad from chain`)
      return
    }
    if (myToConfig.bip44 !== fromChainID && myToConfig.bip44 !== toChainID) {
      console.log(`bad to chain`)
      return
    }

    const allCoins = await sendGetRequest('/api/v6/dex/aggregator/all-tokens', {chainIndex: myFromConfig.chainId})
    const fromTokensInfo = allCoins.filter(info => info.tokenSymbol === fromTokenSymbol)
    const toTokensInfo = allCoins.filter(info => info.tokenSymbol === toTokenSymbol)
    if (fromTokensInfo.length !== 1 || toTokensInfo.length !== 1) {
      console.log(`bad tokenSymbol, from count ${fromTokensInfo.length}, to count ${toTokensInfo.length}`)
      return
    }

    let crossType = 0
    const crossFromTokenAddress = myFromConfig.bip44 === fromChainID ? tokenPair.fromAccount : tokenPair.toAccount
    const crossToTokenAddress = myFromConfig.bip44 === fromChainID ? tokenPair.toAccount : tokenPair.fromAccount

    const swapFromTokenInfo = fromTokensInfo[0]
    const swapToTokenInfo = toTokensInfo[0]
    const swapToTokenAddress = swapToTokenInfo.tokenContractAddress.toLowerCase() === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase() ? '0x0000000000000000000000000000000000000000' : swapToTokenInfo.tokenContractAddress.toLowerCase()
    if (swapToTokenAddress !== crossFromTokenAddress.toLowerCase()) {
      console.log(`swap to address !== cross from address, ${swapToTokenInfo.tokenContractAddress.toLowerCase()} !== ${crossFromTokenAddress.toLowerCase()}`)
      return
    }

    const networkName = myFromConfig.networkName
    const chainIndex = myFromConfig.chainId
    const walletAddress = process.env.EVM_WALLET_ADDRESS;
    const privateKey = process.env.EVM_PRIVATE_KEY;

    console.log('Running wallet diagnosis...');
    const diagResult = await diagnoseWallet(networkName, privateKey);
    if (!diagResult) {
      throw new Error('Wallet diagnosis failed');
    }

    const tokenIn = swapFromTokenInfo.tokenContractAddress
    const tokenOut = swapToTokenInfo.tokenContractAddress
    const tokenInAddress = tokenIn.toLowerCase() === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase() ? '0x0000000000000000000000000000000000000000' : tokenIn.toLowerCase()
    const tokenInfo = tokens[myFromConfig.bip44][tokenInAddress]
    if (tokenInfo === undefined || tokenInfo === null) {
      throw new Error('bad tokenIn Decimals');
    } else {
      console.log(`${myFromConfig.chainType} ${tokenInfo.symbol} ${tokenIn.toLowerCase()} decimals is ${tokenInfo.decimals}`)
    }
    const tokenUnit = BigNumber(10).pow(tokenInfo.decimals)
    const amountIn = BigNumber(amount).multipliedBy(tokenUnit).toFixed(0); // 0.001000000000000000 ETH, 3$
    const slippagePercent = '3.0';

    // const swapChainId = myFromConfig.chainId
    // const SwapAndCrossAddress = require(path.resolve(__dirname, `../ignition/deployments/chain-${swapChainId}/deployed_addresses.json`))["SwapAndCrossV1_1Module#SwapAndCrossV1"]

    console.log('\n=== Getting Fresh Swap Data ===');
    console.log('⚠️  IMPORTANT: userWalletAddress = Contract Address');
    console.log('Contract Address:', SwapAndCrossAddress);
    
    const swapData = await getSwapData(tokenIn, tokenOut, amountIn, slippagePercent, chainIndex, SwapAndCrossAddress, SwapAndCrossAddress, null, '6')
    // parseOkxCallData(swapData)
    console.log('Swap Route:', swapData.routerResult.router);
    console.log('Expected Output:', swapData.routerResult.toTokenAmount, `${toTokenSymbol} (raw)`);
    console.log('Min Receive:', swapData.tx.minReceiveAmount,  `${toTokenSymbol} (raw)`);
    console.log('Price Impact:', swapData.routerResult.priceImpactPercent + '%');
    console.log('================================\n');

    const minAmountOut = swapData.tx.minReceiveAmount
    const swapCallData = swapData.tx.data

    const okxRouterFromApi = swapData.tx.to;
    console.log('OKX Router from API:', okxRouterFromApi);
    
    if (okxRouterFromApi.toLowerCase() !== myFromConfig.okxDexRouter.toLowerCase()) {
      console.error('❌ Router address mismatch!');
      return;
    }

    const feeInfo = await reqQuotaAndFee(fromChainSymbol, toChainSymbol, tokenPairId, toTokenSymbol)
    
    if (feeInfo.networkFee.isPercent) {
      console.log('bad networkFee, isPercent = true!')
      return
    }

    let networkFee = BigNumber(feeInfo.networkFee.value)
    const isNativeSwap = tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    let totalValue = BigNumber(0);

    if (isNativeSwap) {
      totalValue = totalValue.plus(amountIn);
    }
    
    if (!networkFee.isZero()) {
      totalValue = totalValue.plus(networkFee);
    }
    
    const options = totalValue.isGreaterThan(0) ? { value: totalValue.toFixed(0) } : {};
    
    console.log(`\n=== Transaction Value Breakdown ===`);
    console.log(`Swap input (${fromTokenSymbol}): ${amount} ${fromTokenSymbol}`);
    console.log(`Network fee: ${ethers.formatEther(networkFee.toFixed(0))} ${fromChainSymbol}`);
    console.log(`Total value: ${ethers.formatEther(totalValue.toFixed(0))} ${fromChainSymbol}`);
    console.log(`===================================\n`);


    /// check allownce
    if (!isNativeSwap) {
      const allowance = await callContract(networkName, tokenIn, erc20Abi, 'allowance', [walletAddress, SwapAndCrossAddress])
      console.log(`allowance is ${allowance}, type is ${typeof allowance}`)
      if (BigNumber(amountIn).gt(allowance)) {
        console.log('Approving ERC20 token...');
        const { txResponse, receipt } = await sendContractAndWait(
          networkName,
          privateKey,
          tokenIn,
          erc20Abi,
          'approve',
          [SwapAndCrossAddress, amountIn],
          {},
          1
        );
        console.log(`✅ Approval successful! Hash: ${txResponse.hash}`);
      }

    }

    const swapData1 = await getSwapData(tokenIn, tokenOut, amountIn, slippagePercent, chainIndex, SwapAndCrossAddress, SwapAndCrossAddress, null, '6')

    const swapParams = {
      tokenIn, 
      tokenOut, 
      amountIn, 
      minAmountOut : swapData1.tx.minReceiveAmount, 
      swapCallData : swapData1.tx.data
    }
  
    const crossParams = {
      smgID: "0x000000000000000000000000000000000000000000000041726965735f303632",
      tokenPairID: tokenPairId,
      crossType,
      recipient: ethers.getBytes(walletAddress),
      networkFee: networkFee.toFixed(0)
    };

    // ✅ 先测试 OKX Router 是否能直接调用成功
    console.log('\n=== Pre-flight Check: Testing OKX Router ===');
    // try {
    //   const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
      
    //   // 测试从合约地址调用 OKX Router
    //   const testTx = {
    //     to: swapData1.tx.to,
    //     data: swapData1.tx.data,
    //     value: amountIn,
    //     from: SwapAndCrossAddress,
    //     gasLimit: 2000000
    //   };
      
    //   await provider.call(testTx);
    //   console.log('✅ OKX Router call would succeed from contract');
    // } catch (routerError) {
    //   console.error('❌ OKX Router call would FAIL from contract!');
    //   console.error('Error:', routerError.message);
    //   console.error('\n💡 This is the root cause! The swap will fail in your contract.');
    //   console.error('   Possible reasons:');
    //   console.error('   1. Deadline expired (check timestamp in callData)');
    //   console.error('   2. Price moved too much (beyond slippage)');
    //   console.error('   3. Route no longer has liquidity');
    //   console.error('\n   Try getting FRESH swap data immediately before sending tx\n');
    //   return;
    // }

    // 测试完整的 swapAndCross
    console.log('\n=== Running Static Call (Full Contract) ===');
    // try {
    //   const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    //   const wallet = new ethers.Wallet(privateKey, provider);
    //   const contract = new ethers.Contract(SwapAndCrossAddress, swapAndCrossAbi, wallet);
      
    //   const staticResult = await contract.swapAndCross.staticCall(
    //     swapParams,
    //     crossParams,
    //     {
    //       ...options,
    //       gasLimit: 2000000
    //     }
    //   );
      
    //   console.log('✅ Static call SUCCESS!');
    //   console.log('  Simulated TX Hash:', staticResult.txHash);
    //   console.log('  Simulated Amount Out:', staticResult.amountOut.toString(), 'USDT (raw)');
    //   console.log('  Simulated Amount Out:', ethers.formatUnits(staticResult.amountOut, 6), 'USDT');
    //   console.log('========================================\n');
      
    // } catch (staticError) {
    //   console.error('❌ Static call FAILED!');
    //   console.error('Error:', staticError.message);
      
    //   if (staticError.data) {
    //     console.error('Error Data:', staticError.data);
    //   }
      
    //   console.log('\n⚠️  Transaction would fail. Not sending to blockchain.\n');
    //   return;
    // }

    // 发送真实交易
    console.log('Executing real transaction...');
    const result = await sendContractAndWait(
        networkName,
        privateKey,
        SwapAndCrossAddress,
        swapAndCrossAbi,
        'swapAndCross',
        [swapParams, crossParams],
        {
          ...options,
          gasLimit: 2000000
        },
        1
      );
      
    console.log(`\n✅ Transaction successful!`);
    console.log(`  Hash: ${result.txResponse.hash}`);
    console.log(`  Block: ${result.receipt.blockNumber}`);
    console.log(`  Gas Used: ${result.receipt.gasUsed}`);
    console.log(`  Status: ${result.receipt.status === 1 ? 'Success' : 'Failed'}`);
}

setTimeout(async () => {
  // await sendSwapAndCross('ETH', 'USDT', 'ETH', 'AVAX', 232, 0.001, "0x7ADB5dB6830A726C89f953cfE26a3bCacA815010")
  // await sendSwapAndCross('ETH', 'USDC', 'ETH', 'AVAX', 241, 0.001, "0x7ADB5dB6830A726C89f953cfE26a3bCacA815010")
  // await sendSwapAndCross('USDT', 'ETH', 'ETH', 'AVAX', 572, 10, "0x142B0B5EbFF5CfEf68A6375c31d14D55c7c0C05B")
  // await sendSwapAndCross('USDC', 'ETH', 'ETH', 'AVAX', 572, 10, "0x142B0B5EbFF5CfEf68A6375c31d14D55c7c0C05B")
  await updateApproveProxy()

  // await sendSwapAndCross('USDT', 'WETH.e', 'AVAX', 'ETH', 572, 5, "0x98FDFC27aA24e3c9cFeF47274d24253147755BF1")
  // await sendSwapAndCross('USDC', 'WETH.e', 'AVAX', 'ETH', 572, 5, "0x98FDFC27aA24e3c9cFeF47274d24253147755BF1")
}, 0)


// 1035
// USDC
// 源链ID:
// 2147483708 (ETH)
// 目标链ID:
// 2147492648 (AVAX)
// 源代币精度:
// 6
// 目标代币精度:
// 6
// 源地址:
// 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
// 目标地址:
// 0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e

// 241
// USDC
// 源链ID:
// 2147492648 (AVAX)
// 目标链ID:
// 2147483708 (ETH)
// 源代币精度:
// 6
// 目标代币精度:
// 6
// 源地址:
// 0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e
// 目标地址:
// 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48

// 232
// USDT
// 源链ID:
// 2147492648 (AVAX)
// 目标链ID:
// 2147483708 (ETH)
// 源代币精度:
// 6
// 目标代币精度:
// 6
// 源地址:
// 0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7
// 目标地址:
// 0xdac17f958d2ee523a2206206994597c13d831ec7

// 572
// WETH.e => ETH
// 源链ID:
// 2147483708 (ETH)
// 目标链ID:
// 2147492648 (AVAX)
// 源代币精度:
// 18
// 目标代币精度:
// 18
// 源地址:
// 0x0000000000000000000000000000000000000000
// 目标地址:
// 0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab

