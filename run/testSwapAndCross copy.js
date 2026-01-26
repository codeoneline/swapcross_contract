const { ethers } = require('ethers');
const BigNumber = require('bignumber.js')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const networksConfig = require(path.resolve(__dirname, "../config/networks"))
const { getValidAmount, getNetworkfee, reqQuotaAndFee, tryLoadJsonObj, getNetworkByChainType, sleep} = require(path.resolve(__dirname, "../lib/utils"))
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

/**
 * ✅ 验证 swap callData 是否对合约友好
 */
async function validateSwapForContract(networkName, swapCallData, okxRouter, amountIn, contractAddress) {
  const provider = new ethers.JsonRpcProvider(networksConfig[networkName].rpcs[0]);
  
  try {
    await provider.call({
      to: okxRouter,
      data: swapCallData,
      value: amountIn,
      from: contractAddress,
      gasLimit: 2000000
    });
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error.message
    };
  }
}

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
    const slippagePercent = '1.0';

    const swapChainId = myFromConfig.chainId
    const SwapAndCrossAddress = require(path.resolve(__dirname, `../ignition/deployments/chain-${swapChainId}/deployed_addresses.json`))["SwapAndCrossModule#SwapAndCross"]

    console.log('\n=== Getting Swap Data with Correct Parameters ===');
    console.log('👤 Transaction sender (pays gas):', walletAddress);
    console.log('📦 Token receiver (gets swapped tokens):', SwapAndCrossAddress);
    console.log('================================================\n');
    
    let swapData;
    let attempt = 0;
    
    // ✅ 尝试不同的 DEX 组合
    const dexConfigs = [
      { name: 'Uniswap V2/V3 + Curve', dexIds: '1,2,4' },
      { name: 'Uniswap V2/V3 + SushiSwap', dexIds: '1,2,3' },
      { name: 'All except Balancer', dexIds: '1,2,3,4,5,7,8' },
    ];
    
    for (const config of dexConfigs) {
      attempt++;
      console.log(`Attempt ${attempt}/${dexConfigs.length}: Trying ${config.name}...`);
      
      try {
        // ✅ 正确的参数：
        // - userWalletAddress = 钱包（发起交易）
        // - swapReceiverAddress = 合约（接收代币）
        swapData = await getSwapData(
          tokenIn,
          tokenOut,
          amountIn,
          slippagePercent,
          chainIndex,
          walletAddress,           // ✅ 钱包地址
          SwapAndCrossAddress,     // ✅ 合约地址（接收代币）
          // config.dexIds 
          '6'
        );
        
        console.log('  Route:', swapData.routerResult.router);
        console.log('  Expected output:', swapData.routerResult.toTokenAmount);
        
        // 验证路由是否对合约友好
        const validation = await validateSwapForContract(
          networkName,
          swapData.tx.data,
          swapData.tx.to,
          amountIn.toString(),
          SwapAndCrossAddress
        );
        
        if (validation.valid) {
          console.log('  ✅ This route works from contract!\n');
          break;
        } else {
          console.log('  ❌ This route fails from contract:', validation.error);
          if (attempt === dexConfigs.length) {
            console.error('\n❌ Could not find a working route after', dexConfigs.length, 'attempts');
            return;
          }
          console.log('  Trying next configuration...\n');
        }
      } catch (error) {
        console.error('  Error getting swap data:', error.message);
        if (attempt === dexConfigs.length) {
          throw error;
        }
      }
      await sleep(2000)
    }
    
    console.log('✅ Found working swap route!');
    console.log('Expected Output:', swapData.routerResult.toTokenAmount, 'USDT (raw)');
    console.log('Min Receive:', swapData.tx.minReceiveAmount, 'USDT (raw)');
    console.log('Price Impact:', swapData.routerResult.priceImpactPercent + '%');
    console.log('Receiver Address:', SwapAndCrossAddress);
    console.log('================================\n');

    const minAmountOut = swapData.tx.minReceiveAmount
    const swapCallData = swapData.tx.data

    const okxRouterFromApi = swapData.tx.to;
    
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
    
    console.log(`=== Transaction Value Breakdown ===`);
    console.log(`Swap input (ETH): ${ethers.formatEther(amountIn)} ETH`);
    console.log(`Network fee: ${ethers.formatEther(networkFee.toFixed(0))} ETH`);
    console.log(`Total value: ${ethers.formatEther(totalValue.toFixed(0))} ETH`);
    console.log(`===================================\n`);

    if (!isNativeSwap) {
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

    // 最后验证
    console.log('=== Final Static Call Validation ===');
    try {
      const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com');
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(SwapAndCrossAddress, swapAndCrossAbi, wallet);
      
      const staticResult = await contract.swapAndCross.staticCall(
        swapParams,
        crossParams,
        {
          ...options,
          gasLimit: 800000
        }
      );
      
      console.log('✅ Static call SUCCESS!');
      console.log('  Expected TX Hash:', staticResult.txHash);
      console.log('  Expected USDT Out:', ethers.formatUnits(staticResult.amountOut, 6), 'USDT');
      console.log('====================================\n');
      
    } catch (staticError) {
      console.error('❌ Static call FAILED!');
      console.error('Error:', staticError.message);
      console.log('\n⚠️  Aborting transaction.\n');
      return;
    }

    // 发送真实交易
    console.log('🚀 Sending real transaction to blockchain...\n');
    const result = await sendContractAndWait(
        networkName,
        privateKey,
        SwapAndCrossAddress,
        swapAndCrossAbi,
        'swapAndCross',
        [swapParams, crossParams],
        {
          ...options,
          gasLimit: 800000
        },
        1
      );
      
    console.log(`\n✅ ✅ ✅ Transaction SUCCESSFUL! ✅ ✅ ✅`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`  TX Hash: ${result.txResponse.hash}`);
    console.log(`  Block: ${result.receipt.blockNumber}`);
    console.log(`  Gas Used: ${result.receipt.gasUsed.toString()}`);
    console.log(`  Status: ${result.receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`\n🎉 Swap and Cross completed successfully!`);
    console.log(`View on Etherscan: https://etherscan.io/tx/${result.txResponse.hash}`);
}

setTimeout(async () => {
  // await sendSwapAndCross('ETH', 'USDT', 'ETH', 'AVAX', 232)
  await sendSwapAndCross('ETH', 'USDC', 'ETH', 'AVAX', 241)

}, 0)