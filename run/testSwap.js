const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

// 配置代理
// const { HttpsProxyAgent } = require('https-proxy-agent');
// const proxyUrl = 'http://127.0.0.1:7897'; // 你的代理地址
// const agent = new HttpsProxyAgent(proxyUrl);
const { callContract, sendNativeAndWait, sendContractAndWait, diagnoseWallet} = require(path.resolve(__dirname, "../lib/chainManager"))
const { getSwapData } = require(path.resolve(__dirname, "../lib/okxDexhelper"))

const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];
const swapAbi = [
    'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata swapCallData) external payable returns (uint256 amountOut)',
]

const sendSwap = async () => {
    // Your wallet information - REPLACE WITH YOUR OWN VALUES
    const networkName = 'ethereum'
    const chainIndex = 1
    const walletAddress = process.env.EVM_WALLET_ADDRESS;
    const privateKey = process.env.EVM_PRIVATE_KEY;

    // 1. 首先运行诊断
    console.log('Running wallet diagnosis...');
    const diagResult = await diagnoseWallet(networkName, privateKey);
    if (!diagResult) {
      throw new Error('Wallet diagnosis failed');
    }

    // 2. 调用 swap
    const WETH_ETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH on ETH
    const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7'; // USDT on ETH
    const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on ETH

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
    await sendSwap()
}, 0)
