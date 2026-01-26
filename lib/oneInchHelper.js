const axios = require('axios');

/**
 * 1inch API Helper
 * 文档: https://portal.1inch.dev/documentation/swap/swagger
 */

const ONEINCH_API_BASE = 'https://api.1inch.dev/swap/v6.0';

// 1inch Router 地址（各链相同）
const ONEINCH_ROUTER_V6 = '0x111111125421cA6dc452d289314280a0f8842A65';

/**
 * 获取 1inch swap 数据
 * @param {number} chainId - 链 ID (1 = Ethereum)
 * @param {string} src - 源代币地址
 * @param {string} dst - 目标代币地址
 * @param {string} amount - 输入数量（wei）
 * @param {string} from - 调用者地址（你的合约）
 * @param {string} receiver - 接收者地址（你的合约）
 * @param {number} slippage - 滑点 (1-50)
 * @returns {Promise<object>} swap 数据
 */
async function get1inchSwapData(
  chainId,
  src,
  dst,
  amount,
  from,
  receiver,
  slippage = 1
) {
  const url = `${ONEINCH_API_BASE}/${chainId}/swap`;
  
  const params = {
    src,                    // 源代币
    dst,                    // 目标代币
    amount,                 // 数量
    from,                   // 调用者（合约地址）
    receiver,               // 接收者（合约地址）
    slippage,               // 滑点百分比
    disableEstimate: true,  // 禁用 gas 估算
    allowPartialFill: false // 不允许部分成交
  };

  console.log('\n=== 1inch API Request ===');
  console.log('URL:', url);
  console.log('Parameters:', JSON.stringify(params, null, 2));

  try {
    const response = await axios.get(url, { 
      params,
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = response.data;

    console.log('\n=== 1inch API Response ===');
    console.log('To Amount:', data.dstAmount);
    console.log('Router:', data.tx.to);
    console.log('Gas:', data.tx.gas);
    console.log('===========================\n');

    return {
      router: data.tx.to,           // 1inch Router 地址
      callData: data.tx.data,       // swap callData
      value: data.tx.value || '0',  // ETH value
      toAmount: data.dstAmount,     // 预期输出数量
      estimatedGas: data.tx.gas     // 估算 gas
    };

  } catch (error) {
    if (error.response) {
      console.error('1inch API Error:', error.response.data);
      throw new Error(`1inch API failed: ${error.response.data.description || error.message}`);
    }
    throw error;
  }
}

/**
 * 获取代币信息
 */
async function get1inchTokens(chainId) {
  const url = `${ONEINCH_API_BASE}/${chainId}/tokens`;
  
  try {
    const response = await axios.get(url);
    return response.data.tokens;
  } catch (error) {
    console.error('Failed to get tokens:', error.message);
    throw error;
  }
}

/**
 * 获取报价（不执行 swap）
 */
async function get1inchQuote(chainId, src, dst, amount) {
  const url = `${ONEINCH_API_BASE}/${chainId}/quote`;
  
  const params = { src, dst, amount };
  
  try {
    const response = await axios.get(url, { params });
    return {
      dstAmount: response.data.dstAmount,
      gas: response.data.gas
    };
  } catch (error) {
    console.error('Failed to get quote:', error.message);
    throw error;
  }
}

module.exports = {
  get1inchSwapData,
  get1inchTokens,
  get1inchQuote,
  ONEINCH_ROUTER_V6
};