const axios = require('axios');
const CryptoJS = require('crypto-js');

// Load environment variables
const path = require('path')
if (!process.env.OKX_API_KEY) {
    const envFilePath = path.resolve(__dirname, "../.env")
    require('dotenv').config({ path: envFilePath });
}
validateDexConfig()
// axios, 貌似会使用默认代理

// 配置代理
// const { HttpsProxyAgent } = require('https-proxy-agent');
// const proxyUrl = 'http://127.0.0.1:7897'; // 你的代理地址
// const agent = new HttpsProxyAgent(proxyUrl);


// API URL
const baseUrl = 'https://web3.okx.com/api/v6/';

/**
 * Generate API authentication headers
 */
function getHeaders(timestamp, method, requestPath, queryString = "", body = "") {
    const apiKey = process.env.OKX_API_KEY;
    const secretKey = process.env.OKX_SECRET_KEY;
    const apiPassphrase = process.env.OKX_API_PASSPHRASE;
    const projectId = process.env.OKX_PROJECT_ID;

    if (!apiKey || !secretKey || !apiPassphrase || !projectId) {
        throw new Error("Missing required environment variables for API authentication");
    }

    const signContent = method === 'GET' ? queryString : body;
    const stringToSign = timestamp + method + requestPath + signContent;

    return {
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": CryptoJS.enc.Base64.stringify(
            CryptoJS.HmacSHA256(stringToSign, secretKey)
        ),
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": apiPassphrase,
        "OK-ACCESS-PROJECT": projectId,
    };
}

const getTimeStamp = () => {
  const t1 = new Date().toISOString()
  console.log(t1)
  const t2 = t1.slice(0, -5) + 'Z'
  console.log(t2)
  return t2;
}

/**
 * Get transaction gas limit from Onchain gateway API
 * @param {string} fromAddress - Sender address
 * @param {string} toAddress - Target contract address
 * @param {string} txAmount - Transaction amount (0 for approvals)
 * @param {string} inputData - Transaction calldata
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
        
        const path = 'dex/pre-transaction/gas-limit';
        const url = `${baseUrl}${path}`;

        const body = {
            chainIndex: chainIndex,
            fromAddress: fromAddress,
            toAddress: toAddress,
            txAmount: txAmount,
            extJson: {
                inputData: inputData
            }
        };

        // Prepare authentication with body included in signature
        const bodyString = JSON.stringify(body);
        const timestamp = getTimeStamp() ;
        const requestPath = `/api/v6/${path}`;
        const headers = getHeaders(timestamp, 'POST', requestPath, "", bodyString);

        const response = await axios.post(url, body, { headers });

        console.log('Gas Limit API Response:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code === '0') {
            const gasLimit = response.data.data[0].gasLimit;
            console.log(`Gas Limit obtained: ${gasLimit}`);
            return gasLimit;
        } else {
            throw new Error(`API Error: ${response.data.msg || 'Unknown error'}`);
        }
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
        
        const path = 'dex/aggregator/swap';
        const url = `${baseUrl}${path}`;

        const params = {
            chainIndex: chainIndex,
            fromTokenAddress: fromTokenAddress,
            toTokenAddress: toTokenAddress,
            amount: amount,
            slippagePercent: slippagePercent,
            userWalletAddress: walletAddress
        };

        console.log('Swap API Request Parameters:');
        console.log(JSON.stringify(params, null, 2));

        // Prepare authentication with query string
        const queryString = "?" + new URLSearchParams(params).toString();
        const timestamp = getTimeStamp() ;
        const requestPath = `/api/v6/${path}`;
        const headers = getHeaders(timestamp, 'GET', requestPath, queryString);

        const response = await axios.get(`${url}${queryString}`, { headers });

        console.log('Swap API Response:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code === '0') {
            return response.data.data[0];
        } else {
            throw new Error(`Swap API Error: ${response.data.msg || 'Unknown error'}`);
        }
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
        
        const path = 'dex/pre-transaction/simulate';
        const url = `${baseUrl}${path}`;

        const body = {
            chainIndex: chainIndex,
            fromAddress: swapData.tx.from,
            toAddress: swapData.tx.to,
            txAmount: swapData.tx.value || '0',
            extJson: {
                inputData: swapData.tx.data
            }
        };

        // Prepare authentication with body included in signature
        const bodyString = JSON.stringify(body);
        const timestamp = getTimeStamp() ;
        const requestPath = `/api/v6/${path}`;
        const headers = getHeaders(timestamp, 'POST', requestPath, "", bodyString);

        const response = await axios.post(url, body, { headers });

        console.log('Simulation API Response:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code === '0') {
            const simulationResult = response.data.data[0];
            // Check if simulation was successful (no failReason or empty failReason)
            if (!simulationResult.failReason || simulationResult.failReason === '') {
                console.log(`Transaction simulation successful. Gas used: ${simulationResult.gasUsed}`);
                return simulationResult;
            } else {
                throw new Error(`Simulation failed: ${simulationResult.failReason}`);
            }
        } else {
            throw new Error(`Simulation API Error: ${response.data.msg || 'Unknown error'}`);
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
            const path = 'dex/post-transaction/orders';
            const url = `https://web3.okx.com/api/v6/${path}`;

            const params = {
                orderId: orderId,
                chainIndex: chainIndex,
                address: walletAddress,
                limit: '1'
            };

            const timestamp = getTimeStamp() ;
            const requestPath = `/api/v6/${path}`;
            const queryString = "?" + new URLSearchParams(params).toString();
            const headers = getHeaders(timestamp, 'GET', requestPath, queryString);

            const response = await axios.get(url, { params, headers });

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

// ======== Main Execution ========

async function simulateOnly(
    fromTokenAddress,
    toTokenAddress,
    amount,
    slippagePercent = '0.5',
    chainIndex,
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
        const swapData = await getSwapData(fromTokenAddress, toTokenAddress, amount, slippagePercent, chainIndex);
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

async function validateDexConfig() {
  console.log('Validating configuration...');
  
  // 检查 API 凭证
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

module.exports = {
    simulateOnly,
    getSwapData,
    simulateTransaction,
    getGasLimit,
    trackTransaction,
    validateDexConfig,
};