const BigNumber = require('bignumber.js')
const fs = require('fs')
const axios = require('axios')
const path = require('path')
const networksConfig = require(path.resolve(__dirname, "../config/networks"))

const { ethers } = require('ethers');

/**
 * 解析 OKX DEX 的 callData
 */
function parseOkxCallData(callData) {
  console.log('\n=== Parsing OKX CallData ===\n');
  console.log('CallData length:', callData.length, 'characters');
  console.log('Function selector:', callData.slice(0, 10));
  
  // OKX 的 aggregateSwap 函数签名
  const iface = new ethers.Interface([
    'function aggregateSwap(uint256 routerIndex, address fromTokenAddress, address toTokenAddress, uint256 fromTokenAmount, uint256 minReturnAmount, uint256 deadLine, bytes swapData)'
  ]);
  
  try {
    const decoded = iface.parseTransaction({ data: callData });
    
    console.log('\nFunction:', decoded.name);
    console.log('Parameters:');
    console.log('  Router Index:', decoded.args[0].toString());
    console.log('  From Token:', decoded.args[1]);
    console.log('  To Token:', decoded.args[2]);
    console.log('  From Amount:', decoded.args[3].toString(), 'wei');
    console.log('  Min Return:', decoded.args[4].toString());
    console.log('  Deadline:', decoded.args[5].toString());
    
    // 解析 deadline
    const deadline = Number(decoded.args[5]);
    const now = Math.floor(Date.now() / 1000);
    const timeUntilDeadline = deadline - now;
    
    console.log('\nDeadline Analysis:');
    console.log('  Deadline timestamp:', deadline);
    console.log('  Deadline time:', new Date(deadline * 1000).toISOString());
    console.log('  Current time:', new Date(now * 1000).toISOString());
    console.log('  Time remaining:', timeUntilDeadline, 'seconds');
    
    if (timeUntilDeadline < 0) {
      console.log('  ❌ EXPIRED! This swap will fail!');
    } else if (timeUntilDeadline < 60) {
      console.log('  ⚠️  WARNING: Less than 1 minute remaining!');
    } else {
      console.log('  ✅ Valid (expires in', Math.floor(timeUntilDeadline / 60), 'minutes)');
    }
    
    return {
      routerIndex: decoded.args[0].toString(),
      fromToken: decoded.args[1],
      toToken: decoded.args[2],
      fromAmount: decoded.args[3].toString(),
      minReturn: decoded.args[4].toString(),
      deadline: deadline,
      isExpired: timeUntilDeadline < 0,
      timeRemaining: timeUntilDeadline
    };
    
  } catch (error) {
    console.log('❌ Could not decode callData');
    console.log('Error:', error.message);
    
    // 尝试手动提取一些信息
    console.log('\nManual extraction:');
    try {
      // 跳过函数选择器 (4 bytes = 8 hex chars)
      const params = callData.slice(10);
      
      // 每个参数是 32 bytes = 64 hex chars
      const routerIndex = '0x' + params.slice(0, 64);
      const fromToken = '0x' + params.slice(64 + 24, 128); // address 是 20 bytes, 在右侧
      const toToken = '0x' + params.slice(128 + 24, 192);
      const fromAmount = '0x' + params.slice(192, 256);
      const minReturn = '0x' + params.slice(256, 320);
      const deadline = '0x' + params.slice(320, 384);
      
      console.log('  Router Index:', BigInt(routerIndex).toString());
      console.log('  From Token:', fromToken);
      console.log('  To Token:', toToken);
      console.log('  From Amount:', BigInt(fromAmount).toString());
      console.log('  Min Return:', BigInt(minReturn).toString());
      console.log('  Deadline:', BigInt(deadline).toString());
      
      const deadlineNum = Number(BigInt(deadline));
      const now = Math.floor(Date.now() / 1000);
      console.log('  Deadline time:', new Date(deadlineNum * 1000).toISOString());
      console.log('  Is expired?', deadlineNum < now);
      
    } catch (e) {
      console.log('  Manual extraction also failed:', e.message);
    }
  }
  
  console.log('\n============================\n');
}

// 测试数据（从你提供的 swapData 中提取）
// const testCallData = "0xf2c426960000000000000000000000000000000000000000000000000000000000035418000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec700000000000000000000000000000000000000000000000000005af3107a4000000000000000000000000000000000000000000000000000000000000004938a0000000000000000000000000000000000000000000000000000000069719b4200000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000004c000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000160000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000000000000000000000000000000000000000000010000000000000000000000002fa31d2ac017869998f9574bac76094a8110cf7c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000002fa31d2ac017869998f9574bac76094a8110cf7c00000000000000000000000000000000000000000000000000000000000000018000000000000000000127109b208194acc0a8ccb2a8dcafeacfbb7dcc093f81000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000160000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000010000000000000000000000006747bcaf9bd5a5f0758cbe08903490e45ddfacb500000000000000000000000000000000000000000000000000000000000000010000000000000000000000006747bcaf9bd5a5f0758cbe08903490e45ddfacb50000000000000000000000000000000000000000000000000000000000000001000000000000000001022710919b20ac45304aeb09c9df5c604b3cd9d99a51ca0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000040000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000fa2b947eec368f42195f24f36d2af29f7c24cec200000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000160000000000000000000000000fa2b947eec368f42195f24f36d2af29f7c24cec200000000000000000000000000000000000000000000000000000000000000010000000000000000000000006747bcaf9bd5a5f0758cbe08903490e45ddfacb500000000000000000000000000000000000000000000000000000000000000010000000000000000000000006747bcaf9bd5a5f0758cbe08903490e45ddfacb50000000000000000000000000000000000000000000000000000000000000001800000000000000002032710c275a7390966e4bcbf331b837cd7316c4a3efa830000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000040000000000000000000000000fa2b947eec368f42195f24f36d2af29f7c24cec2000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec77777777711118000000000000000000000000000000000000000000000049f60777777771111000000000064fa00a9ed787f3793db668bff3e6e6e7db0f92a1b";

// parseOkxCallData(testCallData);

function sleep(ms) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      resolve();
    }, ms);
  })
}

// {
//   "symbol": "BTC",
//   "minQuota": "0",
//   "maxQuota": "5061694752",
//   "networkFee": {
//     "value": "0",
//     "isPercent": false
//   },
//   "operationFee": {
//     "value": "0.006",
//     "isPercent": true,
//     "minFeeLimit": "35000",
//     "maxFeeLimit": "50000000"
//   }
// }
const getValidAmount = (networkFeeConfig, amount) => {
  const minQuota = BigNumber(networkFeeConfig.minQuota)
  if (!minQuota.isNaN()) {
    if (minQuota.gt(amount)) {
      return networkFeeConfig.minQuota
    }
  }
  const maxQuota = BigNumber(networkFeeConfig.maxQuota)
  if (!minQuota.isNaN()) {
    if (maxQuota.lt(amount)) {
      return networkFeeConfig.maxQuota
    }
  }
  return amount
}
const getNetworkfee = (networkFeeConfig, amount) => {
  let networkFee = BigNumber(networkFeeConfig.value)
  if (networkFeeConfig.isPercent) {
    networkFee = networkFee.multipliedBy(amount).integerValue(BigNumber.ROUND_CEIL)
    if (networkFeeConfig.minFeeLimit) {
      if (networkFee.lt(networkFeeConfig.minFeeLimit)) {
        return networkFeeConfig.minFeeLimit
      } 
    }
    if (networkFeeConfig.maxFeeLimit) {
      if (networkFee.gt(networkFeeConfig.maxFeeLimit)) {
        return networkFeeConfig.maxFeeLimit
      } 
    }
  }

  return networkFee.toFixed()
}

function tryLoadJsonObj(fileFullPath, defaultObj) {
  if (fs.existsSync(fileFullPath)) {
    try {
      const data = fs.readFileSync(fileFullPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading ${fileFullPath}:`, error);
      return defaultObj;
    }
  }

  return defaultObj;
}

function getNetworkByChainType(chainType, isTestnet = false) {
  let config = null;
  for (let key in networksConfig) {
    if (networksConfig[key].chainType === chainType && !!networksConfig[key].isTestnet === isTestnet) {
      config = networksConfig[key];
      config.networkName = key
      break;
    }
  }
  return config
}

async function reqQuotaAndFee(fromSymbol, toSymbol, tokenPairID, symbol) {
  do {
    try {
      let urlReal = `https://bridge-api.wanchain.org/api/quotaAndFee?fromChainType=${fromSymbol}&toChainType=${toSymbol}&tokenPairID=${tokenPairID}&symbol=${symbol}`
      // let urlTest = 'https://bridge-api.wanchain.org/api/quotaAndFee?fromChainType=ETH&toChainType=BTC&tokenPairID=14&symbol=BTC'
      let url = urlReal
      const res = await axios.get(url)
      if (res.status === 200) {
        const data = res.data
        if (data.success) {
          return data.data
        } else {
          await sleep(10000)
        }
      } else {
        await sleep(10000)
      }
    } catch (error) {
      await sleep(10000)
    }
  } while (true);
}

module.exports = {
  sleep,
  reqQuotaAndFee,
  tryLoadJsonObj,
  getNetworkfee,
  getValidAmount,
  getNetworkByChainType,
  parseOkxCallData,

}