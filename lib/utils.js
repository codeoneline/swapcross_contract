const BigNumber = require('bignumber.js')
const fs = require('fs')
const path = require('path')
const networksConfig = require(path.resolve(__dirname, "../config/networks"))

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

module.exports = {
  sleep,
  getValidAmount,
  getNetworkfee,
  tryLoadJsonObj,
  getNetworkByChainType
}