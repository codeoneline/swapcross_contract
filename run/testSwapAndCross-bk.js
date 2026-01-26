const { ethers } = require('ethers');
const BigNumber = require('bignumber.js')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const networksConfig = require(path.resolve(__dirname, "../config/networks"))
const { getValidAmount, getNetworkfee, reqQuotaAndFee, tryLoadJsonObj, getNetworkByChainType} = require(path.resolve(__dirname, "../lib/utils"))
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

// fromSymbol -> toAssetSymbol
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

    // fromChainSymbol -> toChainSymbol
    // 如果是原生币，则用调用useLock
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

    // 1. 首先运行诊断
    console.log('Running wallet diagnosis...');
    const diagResult = await diagnoseWallet(networkName, privateKey);
    if (!diagResult) {
      throw new Error('Wallet diagnosis failed');
    }

    // 2. 调用 swap
    // const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7'; // USDT on ETH
    // const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on ETH

    const tokenIn = swapFromTokenInfo.tokenContractAddress //"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const tokenOut = swapToTokenInfo.tokenContractAddress // 0xdac17f958d2ee523a2206206994597c13d831ec7
    const amountIn = 100000000000000;//  0.0001 eth
    const slippagePercent = '0.5';

    // const SwapAndCrossAddress = '0x32d4464bb786c31375C61e22683642CA97B44854'
    const swapChainId = myFromConfig.chainId
    const SwapAndCrossAddress = require(path.resolve(__dirname, `../ignition/deployments/chain-${swapChainId}/deployed_addresses.json`))["SwapAndCrossModule#SwapAndCross"]

    const feeInfo = await reqQuotaAndFee(fromChainSymbol, toChainSymbol, tokenPairId, toTokenSymbol)
    console.log(`${toTokenSymbol}, ${tokenPairId}, ${fromChainSymbol} ->  ${toChainSymbol} fee is ${JSON.stringify(feeInfo, null, 2)}`)
    if (feeInfo.networkFee.isPercent) {
      console.log('bad networkFee, isPercent = true!')
      return
    }
    // let amountValid = BigNumber(getValidAmount(feeInfo.networkFee, minAmountOut))
    // let networkFee = BigNumber(getNetworkfee(feeInfo.networkFee, amountValid))
    let networkFee = BigNumber(feeInfo.networkFee.value)
    const isNativeSwap = tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    let totalValue = BigNumber(0);

    // 如果是原生币 swap，需要包含 amountIn
    if (isNativeSwap) {
      totalValue = totalValue.plus(amountIn);
      console.log(`Adding swap amount: ${amountIn}`);
    }
    
    // 添加 bridge 的 network fee
    if (!networkFee.isZero()) {
      totalValue = totalValue.plus(networkFee);
      console.log(`Adding network fee: ${networkFee.toFixed(0)}`);
    }
    
    const options = totalValue.isGreaterThan(0) ? { value: totalValue.toFixed(0) } : {};
    console.log(`\n=== Transaction Value Breakdown ===`);
    console.log(`Swap input (ETH): ${isNativeSwap ? ethers.formatEther(amountIn) : '0'} ETH`);
    console.log(`Network fee: ${ethers.formatEther(networkFee.toFixed(0))} ETH`);
    console.log(`Total value: ${ethers.formatEther(totalValue.toFixed(0))} ETH`);
    console.log(`===================================\n`);

    
    // 步骤 1: 用户授权 Swap 合约, 转erc20才用
    if (!isNativeSwap) {
      const { txResponse, receipt } = await sendContractAndWait(
        networkName,
        privateKey,
        tokenIn,
        erc20Abi,
        'approve',
        [SwapAndCrossAddress, amountIn],
        {}, // options
        1   // confirmations
      );
      console.log(`✓ Transaction successful!`);
      console.log(`  Hash: ${txResponse.hash}`);
      console.log(`  Block: ${receipt.blockNumber}`);
      console.log(`  Gas Used: ${receipt.gasUsed}`);
      console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    }


    const swapData = await getSwapData(tokenIn, tokenOut, amountIn, slippagePercent, chainIndex, SwapAndCrossAddress)
    console.log('Swap data obtained');

    const minAmountOut = swapData.tx.minReceiveAmount
    const swapCallData = swapData.tx.data
    const swapParams = {
      tokenIn, 
      tokenOut, 
      amountIn, 
      minAmountOut,
      swapCallData
    }
  
    const crossParams = {
      smgID: "0x000000000000000000000000000000000000000000000041726965735f303632",           // Storeman Group ID
      // token: tokenOut,// "0x1f6515c5e45c7d572fbb5d18ce613332c17ab288",           // USDT地址
      // amount: amount.toFixed(),            // 0.000100 USDT (6 decimals)
      tokenPairID: tokenPairId,         // 代币对ID
      crossType,             // 0=Lock, 1=Burn
      recipient: ethers.getBytes(walletAddress), //ethers.getBytes("0x8d7a93ab1e89719e060fec1f21244f6832c46fb6"),       // 目标链接收地址(bytes格式)
      networkFee: networkFee.toFixed(0)
    };
    console.log('Executing swapAndCross...');
    const result = await sendContractAndWait(
        networkName,
        privateKey,
        SwapAndCrossAddress,
        swapAndCrossAbi,
        'swapAndCross',
        [swapParams, crossParams],
        options, // optionsc
        1   // confirmations
      );
      console.log(`✓ Transaction successful!`);
      console.log(`  Hash: ${result.txResponse.hash}`);
      console.log(`  Block: ${result.receipt.blockNumber}`);
      console.log(`  Gas Used: ${result.receipt.gasUsed}`);
      console.log(`  Status: ${result.receipt.status === 1 ? 'Success' : 'Failed'}`);
}

setTimeout(async () => {
  // await sendSwapAndCross('ETH', 'USDT', 'ETH', 'AVAX', 232)
  await sendSwapAndCross('ETH', 'USDC', 'ETH', 'AVAX', 241)
}, 0)
// cast call 0x32d4464bb786c31375C61e22683642CA97B44854 \
//   "swapAndCross((address,address,uint256,uint256,bytes),(bytes32,uint256,uint8,bytes,uint256))" \
//   --value 0.0001044ether \
//   --from 0x34aABB238177eF195ed90FEa056Edd6648732014 \
//   --rpc-url https://rpc.mevblocker.io