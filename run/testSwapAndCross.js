const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const networksConfig = require(path.resolve(__dirname, "../config/networks"))
const { getValidAmount, getNetworkfee, sleep, tryLoadJsonObj, getNetworkByChainType} = require(path.resolve(__dirname, "../lib/utils"))
const gTokenPairsInfo = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-testnet.json"), {total: 0, tokenPairs: {}});
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
const sendSwapAndCross = async (fromTokenSymbol, toTokenSymbol, fromChainSymbol, toChainSymbol, tokenPairId, isTestnet) => {
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

    const allCoins = await sendGetRequest('/api/v6/dex/aggregator/all-tokens', {chainIndex: 1})
    const fromTokensInfo = allCoins.filter(info => info.tokenSymbol === fromTokenSymbol)
    const toTokensInfo = allCoins.filter(info => info.tokenSymbol === toTokenSymbol)
    if (fromTokensInfo.length !== 1 || toTokensInfo.length !== 1) {
      console.log(`bad tokenSymbol, from count ${fromTokensInfo.length}, to count ${toTokensInfo.length}`)
      return
    }


    const crossType = myFromConfig.bip44 === fromChainID ? 0 : 1
    const crossFromTokenAddress = myFromConfig.bip44 === fromChainID ? tokenPair.fromAccount : tokenPair.toAccount
    const crossToTokenAddress = myFromConfig.bip44 === fromChainID ? tokenPair.toAccount : tokenPair.fromAccount

    const swapFromTokenInfo = fromTokensInfo[0]
    const swapToTokenInfo = toTokensInfo[0]
    if (swapToTokenInfo.tokenContractAddress.toLowerCase() !== crossFromTokenAddress.toLowerCase()) {
      console.log(`swap to address !== cross from address, ${swapToTokenInfo.tokenContractAddress.toLowerCase()} !== ${crossFromTokenAddress.toLowerCase()}`)
    }


    const networkName = myFromConfig.networkName
    const chainIndex = myFromConfig.chainIndex
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

    const tokenIn = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const tokenOut = USDC_ETH
    const amountIn = 100000000000000;//ethers.parseUnits("1000", 6); // 1000 USDT
    const slippagePercent = '0.5';

    // 步骤 1: 用户授权 Swap 合约
    const SwapAddress = '0xc28F4d079fBB6B4AF630dd8822c59107c2402f8b'
    const { txResponse, receipt } = await sendContractAndWait(
      networkName,
      privateKey,
      tokenIn,
      erc20Abi,
      'approve',
      [SwapAddress, amountIn],
      {}, // options
      1   // confirmations
    );

    console.log(`✓ Transaction successful!`);
    console.log(`  Hash: ${txResponse.hash}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log(`  Gas Used: ${receipt.gasUsed}`);
    console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);

    // 步骤 2: 获取 OKX DEX API 的 callData
    const swapData = await getSwapData(tokenIn, tokenOut, amountIn, slippagePercent, chainIndex, walletAddress)
    console.log('Swap data obtained');

    // 步骤 3: 调用 swap
    const minReceiveAmount = swapData.tx.minReceiveAmount
    const swapCallData = swapData.tx.data

    const isNativeSwap = tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const options = isNativeSwap ? { value: amountIn } : {};  // 添加 ETH value
    // 或者这么写
    // const txValue = swapData.tx.value;
    // const options = txValue && txValue !== "0" ? { value: txValue } : {};

    const swapChainId = myFromConfig.chainIndex
    const SwapAndCrossAddress = require(path.resolve(__dirname, `../ignition/deployments/chain-${swapChainId}/deployed_addresses.json`))["SwapAndCrossModule#SwapAndCross"]
    const swapParams = {
      tokenIn, 
      tokenOut, 
      amountIn, 
      minReceiveAmount, 
      swapCallData
    }

    const crossParams = {
      token: token,// "0x1f6515c5e45c7d572fbb5d18ce613332c17ab288",           // USDT地址
      amount: amount.toFixed(),            // 0.000100 USDT (6 decimals)
      smgID: "0x000000000000000000000000000000000000000000000000006465765f323638",           // Storeman Group ID
      tokenPairID: tokenPairId,         // 代币对ID
      crossType,             // 0=Lock, 1=Burn
      recipient: ethers.getBytes("0x8d7a93ab1e89719e060fec1f21244f6832c46fb6"),       // 目标链接收地址(bytes格式)
      networkFee: networkFee.toFixed(0)
    };

    const result = await sendContractAndWait(
        networkName,
        privateKey,
        SwapAddress,
        swapAbi,
        'swap',
        [tokenIn, tokenOut, amountIn, minReceiveAmount, swapCallData],
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
    await sendSwapAndCross('ETH', 'USDT', 'ETH', 'AVAX', 232)
}, 0)
