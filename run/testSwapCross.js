const { Web3 } = require('web3');
const axios = require('axios');
const dotenv = require('dotenv');
const CryptoJS = require('crypto-js');
const { getSwapData } = require('../lib/okxDexhelper')
const path = require('path')

// 配置代理
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxyUrl = 'http://127.0.0.1:7897'; // 你的代理地址
const agent = new HttpsProxyAgent(proxyUrl);

// Load environment variables
dotenv.config();

// Connect to Base network
const web3 = new Web3(process.env.EVM_RPC_URL);
const chainIndex = '1'; // Base
const baseUrl = 'https://web3.okx.com/api/v6/';

// Your wallet information - REPLACE WITH YOUR OWN VALUES
const WALLET_ADDRESS = process.env.EVM_WALLET_ADDRESS;
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on ETH

// 前端调用示例
const tokenIn = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const tokenOut = USDC_ETH
const amountIn = 100000000000000;//ethers.parseUnits("1000", 6); // 1000 USDT
const slippagePercent = '0.5';

// 步骤 1: 用户授权 OKXDexSwap 合约
const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, signer, WALLET_ADDRESS, chainIndex);
const SwapCrossAddress = '0xc28F4d079fBB6B4AF630dd8822c59107c2402f8b'
await tokenContract.approve(SwapCrossAddress, amountIn);

// 步骤 2: 获取 OKX DEX API 的 callData
// const apiData = await fetch("https://www.okx.com/api/v5/dex/aggregator/swap?...");
const apiData = await getSwapData(tokenIn, tokenOut, amountIn, slippagePercent)

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on ETH
const fromToken = ETH_ADDRESS;

// 步骤 3: 调用 swap
const swapCrossAbi = require('.')
const swapContract = new ethers.Contract(SwapCrossAddress, ABI, signer);
await swapContract.swap(
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    apiData.data
);

