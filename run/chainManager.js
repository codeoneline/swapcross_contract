const { ethers } = require('ethers')
let configs = require('./configs_mainnet')

const createProvider = (rpc_url, name, chainId) => {
  if (!rpc_url) {
    console.error('rpc error');
    return null;
  }

  if (rpc_url.startsWith('http')) {
    return new ethers.JsonRpcProvider(rpc_url, {name, chainId}, {
      staticNetwork: true,
    });
  } else if (rpc_url.startsWith('ws')) {
    return new ethers.WebSocketProvider(rpc_url, {name, chainId});
  }
  
  console.error(`Unsupported RPC protocol: ${rpc_url}`);
  return null;
}

class ChainManager {
  constructor(config, chainName) {
    this.chainName = chainName
    this.config = config;
    this.rpcIndex = 0;
    this.provider = null;
    this.contracts = new Map();
    this.wallet = null;
    this.init();
  }

  init() {
    this.provider = createProvider(this.config.rpcs[0], this.chainName, this.config.chainId);
    if (!this.provider) {
      throw new Error(`Failed to create provider for chain`);
    }
  }

  // 设置钱包私钥
  setWallet(privateKey) {
    if (!privateKey) {
      throw new Error('Private key is required');
    }
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    return this.wallet;
  }

  // 获取钱包地址
  getAddress() {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call setWallet() first');
    }
    return this.wallet.address;
  }

  // 获取余额
  async getBalance(address) {
    const addr = address || this.getAddress();
    const balance = await this.provider.getBalance(addr);
    return balance;
  }

  switchRpc() {
    const oldIndex = this.rpcIndex;
    this.rpcIndex = (this.rpcIndex + 1) % this.config.rpcs.length;
    
    if (oldIndex === this.rpcIndex) {
      return false;
    }
    
    console.log(`Switching RPC from ${this.config.rpcs[oldIndex]} to ${this.config.rpcs[this.rpcIndex]}`);
    const newProvider = createProvider(this.config.rpcs[this.rpcIndex], this.chainName, this.config.chainId);
    if (newProvider) {
      this._cleanupProvider();
      
      // 保存旧的私钥
      const oldPrivateKey = this.wallet ? this.wallet.privateKey : null;
      
      this.provider = newProvider;
      
      // 重新连接钱包到新的 provider，使用正确的 chainId
      if (oldPrivateKey) {
        this.wallet = new ethers.Wallet(oldPrivateKey, this.provider);
      }
      
      this.contracts.clear();
      return true;
    }
    return false;
  }

  _cleanupProvider() {
    if (this.provider) {
      try {
        if (typeof this.provider.destroy === 'function') {
          this.provider.destroy();
        } else if (typeof this.provider.disconnect === 'function') {
          this.provider.disconnect();
        }
      } catch (error) {
        console.warn('Error cleaning up provider:', error.message);
      }
    }
  }

  getContract(contractAddress, abi) {
    const key = contractAddress;
    if (!this.contracts.has(key)) {
      const contract = new ethers.Contract(contractAddress, abi, this.provider);
      this.contracts.set(key, contract);
    }
    return this.contracts.get(key);
  }

  // 获取带签名者的合约实例
  getSignedContract(contractAddress, abi) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call setWallet() first');
    }
    return new ethers.Contract(contractAddress, abi, this.wallet);
  }

  async callWithRetry(contractInfo, methodName, ...args) {
    let lastError = null;
    
    for (let attempt = 0; attempt < this.config.rpcs.length * 2; attempt++) {
      try {
        let contract;
        if (typeof contractInfo === 'string') {
          contract = this.getContract(contractInfo, args[0]);
        } else if (contractInfo.address && contractInfo.abi) {
          contract = this.getContract(contractInfo.address, contractInfo.abi);
        } else {
          contract = contractInfo;
        }
        
        if (methodName.includes('.')) {
          const parts = methodName.split('.');
          let target = contract;
          for (let i = 0; i < parts.length; i++) {
            target = target[parts[i]];
          }
          return await target(...args);
        }
        
        return await contract[methodName](...args);
      } catch (error) {
        lastError = error;
        console.warn(`rpc=${this.config.rpcs[this.rpcIndex]} attempt=${attempt + 1} exception: ${error.message}`);
        
        if (attempt < this.config.rpcs.length * 2 - 1) {
          const switched = this.switchRpc();
          if (switched) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (Math.floor(attempt / this.config.rpcs.length) + 1)));
          }
        }
      }
    }
    
    throw new Error(`All RPC attempts failed: ${lastError?.message}`);
  }

  // 发送原生代币 (ETH/BNB/MATIC 等)
  async sendNative(toAddress, amount, options = {}) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call setWallet() first');
    }

    const tx = {
      to: toAddress,
      value: amount,
      ...options
    };

    // 如果没有指定 gasLimit，自动估算
    if (!tx.gasLimit) {
      tx.gasLimit = await this.provider.estimateGas(tx);
    }

    const txResponse = await this.wallet.sendTransaction(tx);
    console.log(`Transaction sent: ${txResponse.hash}`);
    
    return txResponse;
  }

  // 等待交易确认
  async waitForTransaction(txHash, confirmations = 1, timeout = 120000) {
    try {
      const receipt = await this.provider.waitForTransaction(txHash, confirmations, timeout);
      
      if (receipt.status === 0) {
        throw new Error(`Transaction failed: ${txHash}`);
      }
      
      console.log(`Transaction confirmed: ${txHash}, block: ${receipt.blockNumber}`);
      return receipt;
    } catch (error) {
      throw new Error(`Transaction wait failed: ${error.message}`);
    }
  }

  // 调用合约的写方法
  async callContractMethod(contractAddress, abi, methodName, params = [], options = {}) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call setWallet() first');
    }

    // 验证钱包地址
    console.log(`Wallet address: ${this.wallet.address}`);
    
    // 获取网络信息
    const network = await this.provider.getNetwork();
    console.log(`Network: chainId=${network.chainId}, name=${network.name}`);
    
    // 检查余额
    const balance = await this.provider.getBalance(this.wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} native token`);
    
    const contract = this.getSignedContract(contractAddress, abi);
    
    // 准备交易参数
    const txOptions = { ...options };
    
    // 获取当前 nonce
    if (!txOptions.nonce) {
      txOptions.nonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
      console.log(`Nonce: ${txOptions.nonce}`);
    }
    
    // 获取 gas price
    if (!txOptions.gasPrice && !txOptions.maxFeePerGas) {
      const feeData = await this.provider.getFeeData();
      if (feeData.maxFeePerGas) {
        // EIP-1559
        txOptions.maxFeePerGas = feeData.maxFeePerGas;
        txOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        console.log(`Gas (EIP-1559): maxFee=${ethers.formatUnits(feeData.maxFeePerGas, 'gwei')} gwei, maxPriority=${ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')} gwei`);
      } else if (feeData.gasPrice) {
        // Legacy
        txOptions.gasPrice = feeData.gasPrice;
        console.log(`Gas Price (Legacy): ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
      }
    }
    
    // 估算 gas limit
    if (!txOptions.gasLimit) {
      try {
        const estimatedGas = await contract[methodName].estimateGas(...params, txOptions);
        // 增加 20% 的 gas buffer
        txOptions.gasLimit = estimatedGas * 120n / 100n;
        console.log(`Estimated gas: ${estimatedGas}, with buffer: ${txOptions.gasLimit}`);
      } catch (error) {
        console.warn('Gas estimation failed:', error.message);
        // 使用默认值
        txOptions.gasLimit = 500000n;
      }
    }

    console.log(`Calling ${methodName} with params:`, params);
    console.log(`Transaction options:`, txOptions);
    
    const txResponse = await contract[methodName](...params, txOptions);
    console.log(`Contract call sent: ${txResponse.hash}`);
    
    return txResponse;
  }

  // 发送交易并等待确认
  async sendAndWait(toAddress, amount, options = {}, confirmations = 1) {
    const txResponse = await this.sendNative(toAddress, amount, options);
    const receipt = await this.waitForTransaction(txResponse.hash, confirmations);
    return { txResponse, receipt };
  }

  // 调用合约方法并等待确认
  async callAndWait(contractAddress, abi, methodName, params = [], options = {}, confirmations = 1) {
    const txResponse = await this.callContractMethod(contractAddress, abi, methodName, params, options);
    const receipt = await this.waitForTransaction(txResponse.hash, confirmations);
    return { txResponse, receipt };
  }

  // 批量发送交易（顺序执行）
  async batchSendNative(recipients, options = {}) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call setWallet() first');
    }

    const results = [];
    
    for (const recipient of recipients) {
      try {
        const { address, amount } = recipient;
        const txResponse = await this.sendNative(address, amount, options);
        results.push({
          success: true,
          address,
          amount,
          txHash: txResponse.hash,
          txResponse
        });
      } catch (error) {
        results.push({
          success: false,
          address: recipient.address,
          amount: recipient.amount,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // 获取当前 gas price
  async getGasPrice() {
    const feeData = await this.provider.getFeeData();
    return feeData;
  }

  // 获取 nonce
  async getNonce(address) {
    const addr = address || this.getAddress();
    return await this.provider.getTransactionCount(addr, 'pending');
  }

  // 估算 gas
  async estimateGas(tx) {
    return await this.provider.estimateGas(tx);
  }
}

const chainManagers = new Map();

function getChainManager(chainName) {
  if (!chainManagers.has(chainName)) {
    const config = configs[chainName];
    if (!config) {
      throw new Error(`Chain ${chainName} not found in config`);
    }
    chainManagers.set(chainName, new ChainManager(config, chainName));
  }
  return chainManagers.get(chainName);
}

// 修复后的合约调用函数（只读）
async function callContract(chainName, contractAddress, abi, method, params = [], parse) {
  const manager = getChainManager(chainName);
  
  const result = await manager.callWithRetry(
    { address: contractAddress, abi },
    method,
    ...params
  );
  
  return parse ? parse(result) : result;
}

// 发送原生代币的便捷函数
async function sendNative(chainName, privateKey, toAddress, amount, options = {}) {
  const manager = getChainManager(chainName);
  manager.setWallet(privateKey);
  return await manager.sendNative(toAddress, amount, options);
}

// 调用合约写方法的便捷函数
async function sendContractTransaction(chainName, privateKey, contractAddress, abi, methodName, params = [], options = {}) {
  const manager = getChainManager(chainName);
  manager.setWallet(privateKey);
  return await manager.callContractMethod(contractAddress, abi, methodName, params, options);
}

// 发送并等待确认的便捷函数
async function sendNativeAndWait(chainName, privateKey, toAddress, amount, options = {}, confirmations = 1) {
  const manager = getChainManager(chainName);
  manager.setWallet(privateKey);
  return await manager.sendAndWait(toAddress, amount, options, confirmations);
}

// 调用合约并等待确认的便捷函数
async function sendContractAndWait(chainName, privateKey, contractAddress, abi, methodName, params = [], options = {}, confirmations = 1) {
  const manager = getChainManager(chainName);
  manager.setWallet(privateKey);
  return await manager.callAndWait(contractAddress, abi, methodName, params, options, confirmations);
}

// 修复后的批量调用函数
function addContractCall(calls, chainName, contractAddress, abi, method, params = [], decoder) {
  const iface = new ethers.Interface(abi);
  const functionFragment = iface.getFunction(method);
  const callData = iface.encodeFunctionData(functionFragment, params);
  
  calls.push({
    target: contractAddress,
    callData,
    decoder,
    abi
  });
}

// 修复后的批量调用
async function multiCallBatch(chainName, calls, batchSize = 100) {
  if (!calls || calls.length === 0) {
    return { blockNumber: 0, results: [] };
  }

  const manager = getChainManager(chainName);
  const multiCallAddress = manager.config?.multiCall;
  if (!multiCallAddress) {
    throw new Error(`MultiCall address not configured for chain ${chainName}`);
  }

  const results = [];
  
  const adjustedBatchSize = Math.min(batchSize, Math.max(20, Math.floor(10000 / (calls.length || 1))));

  for (let i = 0; i < calls.length; i += adjustedBatchSize) {
    const batchCalls = calls.slice(i, i + adjustedBatchSize);
    const multicallCalls = batchCalls.map(c => ({
      target: c.target,
      callData: c.callData
    }));

    const multiCallAbi = [
      "function aggregate((address target, bytes callData)[] calls) public returns (uint256 blockNumber, bytes[] returnData)"
    ];

    const batchResult = await manager.callWithRetry(
      { address: multiCallAddress, abi: multiCallAbi },
      'aggregate.staticCall',
      multicallCalls
    );
    
    if (!batchResult) {
      throw new Error(`MultiCall batch ${Math.floor(i / adjustedBatchSize) + 1} returned null result`);
    }

    const decodedResults = batchResult[1].map((data, index) => {
      const callIndex = i + index;
      return calls[callIndex]?.decoder ? calls[callIndex].decoder(data) : data;
    });
    
    if (i === 0) {
      results.blockNumber = Number(batchResult[0]);
    }
    
    results.push(...decodedResults);
  }

  return {
    blockNumber: results.blockNumber || 0,
    results: results
  };
}

// 自动重试版本
async function robustMultiCallBatch(chainName, calls, maxRetries = 3) {
  if (!calls || calls.length === 0) {
    return { blockNumber: 0, results: [] };
  }

  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const batchSize = Math.max(20, Math.floor(200 / (attempt + 1)));
      return await multiCallBatch(chainName, calls, batchSize);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    }
  }
  
  throw new Error(`MultiCall failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// 诊断工具：检查钱包和网络状态
async function diagnoseWallet(chainName, privateKey) {
  console.log('\n=== Wallet Diagnosis ===');
  const manager = getChainManager(chainName);
  manager.setWallet(privateKey);
  
  try {
    const address = manager.getAddress();
    console.log(`✓ Wallet address: ${address}`);
    
    const network = await manager.provider.getNetwork();
    console.log(`✓ Network: chainId=${network.chainId}, name=${network.name}`);
    
    const balance = await manager.getBalance();
    console.log(`✓ Balance: ${ethers.formatEther(balance)} native token`);
    
    const nonce = await manager.getNonce();
    console.log(`✓ Nonce: ${nonce}`);
    
    const feeData = await manager.provider.getFeeData();
    console.log(`✓ Gas Price: ${feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei' : 'EIP-1559'}`);
    
    // 测试签名
    const testMessage = 'test';
    const signature = await manager.wallet.signMessage(testMessage);
    console.log(`✓ Signature test: ${signature.slice(0, 20)}...`);
    
    console.log('=== Diagnosis Complete ===\n');
    return true;
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    console.log('=== Diagnosis Failed ===\n');
    return false;
  }
}

module.exports = {
  getChainManager,
  callContract,
  sendNative,
  sendContractTransaction,
  sendNativeAndWait,
  sendContractAndWait,
  addContractCall,
  multiCallBatch,
  robustMultiCallBatch,
  diagnoseWallet,
};