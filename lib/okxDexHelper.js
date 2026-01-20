const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const path = require('path');

/// 只适合 api v6

// Load environment variables
if (!process.env.OKX_API_KEY) {
    require('dotenv').config({ path: path.resolve(__dirname, "../.env") });
}

const isDebugging = () => {
    return process.debugPort !== 9229;
}
// 配置代理
let agent = null;
if (isDebugging()) {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const proxyUrl = 'http://127.0.0.1:7897'; // 你的代理地址
    agent = new HttpsProxyAgent(proxyUrl);
}

// 定义 API 凭证
const api_config = {
    "api_key": process.env.OKX_API_KEY,
    "secret_key": process.env.OKX_SECRET_KEY,
    "passphrase": process.env.OKX_API_PASSPHRASE,
    "project_id": process.env.OKX_PROJECT_ID,
};

// 验证配置
validateDexConfig();

function preHash(timestamp, method, request_path, params) {
    // 根据字符串和参数创建预签名
    let query_string = '';
    if (method === 'GET' && params) {
        query_string = '?' + querystring.stringify(params);
    }
    if (method === 'POST' && params) {
        query_string = JSON.stringify(params);
    }
    console.log(`query_string ${query_string}`);
    return timestamp + method + request_path + query_string;
}

function sign(message, secret_key) {
    // 使用 HMAC-SHA256 对预签名字符串进行签名
    const hmac = crypto.createHmac('sha256', secret_key);
    hmac.update(message);
    return hmac.digest('base64');
}

function createSignature(method, request_path, params) {
    // 获取 ISO 8601 格式时间戳
    // const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
    const timestamp = new Date().toISOString();
    // 生成签名
    const message = preHash(timestamp, method, request_path, params);
    const signature = sign(message, api_config['secret_key']);
    return { signature, timestamp };
}

async function sendGetRequest(request_path, params, includeProject = false) {
    try {
        // 生成签名
        const { signature, timestamp } = createSignature("GET", request_path, params);

        // 生成请求头
        const headers = {
            'OK-ACCESS-KEY': api_config['api_key'],
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': api_config['passphrase'],
            'Content-Type': 'application/json'
        };

        // 如果需要包含 PROJECT ID
        if (includeProject) {
            headers['OK-ACCESS-PROJECT'] = api_config['project_id'];
        }

        const req = {
            method: 'GET',
            url: `https://web3.okx.com${request_path}`,
            params: params,
            headers: headers,
        };

        if (agent) {
            req.httpsAgent = agent;
        }

        const response = await axios(req);

        console.log(`GET ${request_path} Response:`, JSON.stringify(response.data, null, 2));

        if (response.data.code === '0') {
            return response.data.data[0];
        } else {
            throw new Error(`GET ${request_path} ${JSON.stringify(params)} Error: ${response.data.msg || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function sendPostRequest(request_path, params) {
    try {
        // 生成签名
        const { signature, timestamp } = createSignature("POST", request_path, params);

        // 生成请求头
        const headers = {
            'OK-ACCESS-KEY': api_config['api_key'],
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': api_config['passphrase'],
            "OK-ACCESS-PROJECT": api_config['project_id'],
            'Content-Type': 'application/json'
        };

        const req = {
            method: 'POST',
            url: `https://web3.okx.com${request_path}`,
            data: params,
            headers: headers,
        };

        if (agent) {
            req.httpsAgent = agent;
        }

        const response = await axios(req);

        console.log(`POST ${request_path} Response:`, JSON.stringify(response.data, null, 2));

        if (response.data.code === '0') {
            return response.data.data[0];
        } else {
            throw new Error(`POST ${request_path} ${JSON.stringify(params)}, Error: ${response.data.msg || 'Unknown error'}`);
        }
    } catch (error) {
        console.error(`POST ${request_path} ${JSON.stringify(params)}, Exception:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Get transaction gas limit from Onchain gateway API
 * @param {string} fromAddress - Sender address
 * @param {string} toAddress - Target contract address
 * @param {string} txAmount - Transaction amount (0 for approvals)
 * @param {string} inputData - Transaction calldata
 * @param {string} chainIndex - Chain index
 * @returns {Promise<string>} Estimated gas limit
 */
async function getGasLimit(
    fromAddress,
    toAddress,
    txAmount = '0',
    inputData = '',
    chainIndex,
) {
    try {
        console.log('Getting gas limit from Onchain Gateway API...');

        const path = '/api/v6/dex/pre-transaction/gas-limit';

        const params = {
            chainIndex: chainIndex,
            fromAddress: fromAddress,
            toAddress: toAddress,
            txAmount: txAmount,
            extJson: {
                inputData: inputData
            }
        };

        const result = await sendPostRequest(path, params);
        
        const gasLimit = result.gasLimit;
        console.log(`Gas Limit obtained: ${gasLimit}`);
        return gasLimit;
    } catch (error) {
        console.error('Failed to get gas limit:', error.message);
        throw error;
    }
}

/**
 * Get swap data from OKX API
 */
async function getSwapData(
    fromTokenAddress,
    toTokenAddress,
    amount,
    slippagePercent = '0.5',
    chainIndex,
    walletAddress,
) {
    try {
        console.log('Getting swap data from OKX API...');

        const path = '/api/v6/dex/aggregator/swap';

        const params = {
            chainIndex: chainIndex,
            fromTokenAddress: fromTokenAddress,
            toTokenAddress: toTokenAddress,
            amount: amount,
            slippagePercent: slippagePercent,
            userWalletAddress: walletAddress
        };

        console.log('Swap API Request Parameters:', JSON.stringify(params, null, 2));

        const result = await sendGetRequest(path, params);
        return result;
    } catch (error) {
        console.error('Failed to get swap data:', error.message);
        throw error;
    }
}

/**
 * Simulate transaction using Onchain Gateway API
 */
async function simulateTransaction(swapData, chainIndex) {
    try {
        console.log('Simulating transaction with Onchain Gateway API...');

        const path = '/api/v6/dex/pre-transaction/simulate';

        const params = {
            chainIndex: chainIndex,
            fromAddress: swapData.tx.from,
            toAddress: swapData.tx.to,
            txAmount: swapData.tx.value || '0',
            extJson: {
                inputData: swapData.tx.data
            }
        };

        const result = await sendPostRequest(path, params);

        // Check if simulation was successful (no failReason or empty failReason)
        if (!result.failReason || result.failReason === '') {
            console.log(`Transaction simulation successful. Gas used: ${result.gasUsed}`);
            return result;
        } else {
            throw new Error(`Simulation failed: ${result.failReason}`);
        }
    } catch (error) {
        console.error('Transaction simulation failed:', error.message);
        throw error;
    }
}

/**
 * Tracking transaction confirmation status using the Onchain gateway API
 * @param {string} orderId - Order ID from broadcast response
 * @param {number} intervalMs - Polling interval in milliseconds
 * @param {number} timeoutMs - Maximum time to wait
 * @param {string} chainIndex - Chain index
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<any>} Final transaction confirmation status
 */
async function trackTransaction(
    orderId,
    intervalMs = 5000,
    timeoutMs = 300000,
    chainIndex,
    walletAddress,
) {
    console.log(`Tracking transaction with Order ID: ${orderId}`);

    const startTime = Date.now();
    let lastStatus = '';

    while (Date.now() - startTime < timeoutMs) {
        try {
            const path = '/api/v6/dex/post-transaction/orders';

            const params = {
                orderId: orderId,
                chainIndex: chainIndex,
                address: walletAddress,
                limit: '1'
            };

            // 使用 axios 直接调用,因为这里需要访问完整的 response.data
            const { signature, timestamp } = createSignature("GET", path, params);

            const headers = {
                'OK-ACCESS-KEY': api_config['api_key'],
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': api_config['passphrase'],
                'OK-ACCESS-PROJECT': api_config['project_id'],
                'Content-Type': 'application/json'
            };

            const req = {
                method: 'GET',
                url: `https://web3.okx.com${path}`,
                params: params,
                headers: headers,
            };

            if (agent) {
                req.httpsAgent = agent;
            }

            const response = await axios(req);

            if (response.data.code === '0' && response.data.data && response.data.data.length > 0) {
                if (response.data.data[0].orders && response.data.data[0].orders.length > 0) {
                    const txData = response.data.data[0].orders[0];
                    const status = txData.txStatus;

                    if (status !== lastStatus) {
                        lastStatus = status;

                        if (status === '1') {
                            console.log(`Transaction pending: ${txData.txHash || 'Hash not available yet'}`);
                        } else if (status === '2') {
                            console.log(`Transaction successful: https://web3.okx.com/explorer/base/tx/${txData.txHash}`);
                            return txData;
                        } else if (status === '3') {
                            const failReason = txData.failReason || 'Unknown reason';
                            const errorMessage = `Transaction failed: ${failReason}`;

                            console.error(errorMessage);

                            const errorInfo = handleTransactionError(txData);
                            console.log(`Error type: ${errorInfo.error}`);
                            console.log(`Suggested action: ${errorInfo.action}`);

                            throw new Error(errorMessage);
                        }
                    }
                } else {
                    console.log(`No orders found for Order ID: ${orderId}`);
                }
            }
        } catch (error) {
            console.warn('Error checking transaction status:', error.message);
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Transaction tracking timed out');
}

/**
 * Comprehensive error handling with failReason
 * @param {any} txData - Transaction data from post-transaction/orders
 * @returns {Object} Structured error information
 */
function handleTransactionError(txData) {
    const failReason = txData.failReason || 'Unknown reason';

    console.error(`Transaction failed with reason: ${failReason}`);

    return {
        error: 'TRANSACTION_FAILED',
        message: failReason,
        action: 'Try again or contact support'
    };
}

/**
 * Simulation-only mode
 */
async function simulateOnly(
    fromTokenAddress,
    toTokenAddress,
    amount,
    slippagePercent = '0.5',
    chainIndex,
    walletAddress,
) {
    try {
        console.log('Starting simulation-only mode...');
        console.log(`Simulation Details:`);
        console.log(`   From Token: ${fromTokenAddress}`);
        console.log(`   To Token: ${toTokenAddress}`);
        console.log(`   Amount: ${amount}`);
        console.log(`   SlippagePercent: ${slippagePercent}%`);
        console.log(`   chainIndex: ${chainIndex}`);

        // Step 1: Get swap data
        const swapData = await getSwapData(
            fromTokenAddress,
            toTokenAddress,
            amount,
            slippagePercent,
            chainIndex,
            walletAddress
        );
        console.log('Swap data obtained');

        // Step 2: Simulate transaction
        const simulationResult = await simulateTransaction(swapData, chainIndex);
        console.log('Transaction simulation completed');

        // Step 3: Get gas limit
        const gasLimit = await getGasLimit(
            swapData.tx.from,
            swapData.tx.to,
            swapData.tx.value || '0',
            swapData.tx.data,
            chainIndex
        );

        return {
            success: true,
            swapData,
            simulationResult,
            gasLimit,
            estimatedGasUsed: simulationResult.gasUsed,
        };
    } catch (error) {
        console.error('Simulation failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Validate DEX configuration
 */
function validateDexConfig() {
    console.log('Validating configuration...');

    const requiredEnvVars = [
        'OKX_API_KEY',
        'OKX_SECRET_KEY',
        'OKX_API_PASSPHRASE',
        'OKX_PROJECT_ID',
    ];

    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
}

// setTimeout(() => {
//     sendGetRequest('/api/v6/dex/aggregator/swap', {
//         chainIndex: 1,
//         amount: 100000000000000,
//         fromTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
//         toTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDT 
//         slippagePercent: 0.05,
//         userWalletAddress: '0x34aABB238177eF195ed90FEa056Edd6648732014'
//       })
//     const postRequestPath = '/api/v5/mktplace/nft/ordinals/listings';
//     // {"slug":"sats"}
//     const postParams = {
//         'slug': 'sats'
//     };
//     sendPostRequest(postRequestPath, postParams);
// })

module.exports = {
    sendGetRequest,
    sendPostRequest,
    simulateOnly,
    getSwapData,
    simulateTransaction,
    getGasLimit,
    trackTransaction,
    validateDexConfig,
};