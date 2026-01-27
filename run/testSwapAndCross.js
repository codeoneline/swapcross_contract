const { ethers } = require('ethers');
const BigNumber = require('bignumber.js')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const networksConfig = require(path.resolve(__dirname, "../config/networks"))
const { getValidAmount, getNetworkfee, reqQuotaAndFee, tryLoadJsonObj, getNetworkByChainType, parseOkxCallData} = require(path.resolve(__dirname, "../lib/utils"))
const gTokenPairsInfo = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-mainnet.json"), {total: 0, tokenPairs: {}});
const gTokenPairsInfoTestnet = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-testnet.json"), {total: 0, tokenPairs: {}});
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
]

const sendSwapAndCross = async (fromTokenSymbol, toTokenSymbol, fromChainSymbol, toChainSymbol, tokenPairId, isTestnet = false) => {
    const tokenPairs = isTestnet ? gTokenPairsInfoTestnet.tokenPairs : gTokenPairsInfo.tokenPairs
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
    if (swapToTokenInfo.tokenContractAddress.toLowerCase() !== crossFromTokenAddress.toLowerCase()) {
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
    const amountIn = 1000000000000000; // 0.001 ETH
    const slippagePercent = '3.0';

    const swapChainId = myFromConfig.chainId
    const SwapAndCrossAddress = require(path.resolve(__dirname, `../ignition/deployments/chain-${swapChainId}/deployed_addresses.json`))["SwapAndCrossV1_1Module#SwapAndCrossV1"]

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
    
    if (okxRouterFromApi.toLowerCase() !== '0x5E1f62Dac767b0491e3CE72469C217365D5B48cC'.toLowerCase()) {
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
    console.log(`Swap input (ETH): ${ethers.formatEther(amountIn)} ETH`);
    console.log(`Network fee: ${ethers.formatEther(networkFee.toFixed(0))} ETH`);
    console.log(`Total value: ${ethers.formatEther(totalValue.toFixed(0))} ETH`);
    console.log(`===================================\n`);


    /// check allownce
    if (!isNativeSwap) {
      const allowance = await callContract(networkName, tokenIn, erc20Abi, 'allowance', [walletAddress, SwapAndCrossAddress])
      console.log(`allowance is ${allowance}, type is ${typeof allowance}`)
      if (allowance < amountIn) {
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

    const swapParams = {
      tokenIn, 
      tokenOut, 
      amountIn, 
      minAmountOut, 
      swapCallData
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
    //   const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com');
      
    //   // 测试从合约地址调用 OKX Router
    //   const testTx = {
    //     to: okxRouterFromApi,
    //     data: swapCallData,
    //     value: amountIn,
    //     from: SwapAndCrossAddress,
    //     gasLimit: 1000000
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
    // console.log('\n=== Running Static Call (Full Contract) ===');
    // try {
    //   const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com');
    //   const wallet = new ethers.Wallet(privateKey, provider);
    //   const contract = new ethers.Contract(SwapAndCrossAddress, swapAndCrossAbi, wallet);
      
    //   const staticResult = await contract.swapAndCross.staticCall(
    //     swapParams,
    //     crossParams,
    //     {
    //       ...options,
    //       gasLimit: 800000
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
  await sendSwapAndCross('ETH', 'USDT', 'ETH', 'AVAX', 232)
  // await sendSwapAndCross('ETH', 'USDC', 'ETH', 'AVAX', 241)
}, 0)