const { ethers } = require('ethers')
const crossAbi = require('./abi/abi.CrossDelegateV4.json')

const serviceFeeDecoder = (data) => {
  const iface = new ethers.Interface(crossConfigAbi);
  const result = iface.decodeFunctionResult('getCrossChainAgentFee', data);
  return {
    numerator: result[0].toString(),
    denominator: result[1].toString(),
    fixedFee: result[2].toString(),
    minFeeLimit: result[3].toString(),
    maxFeeLimit: result[4].toString()
  };
}

const addServiceFeeToFetch = (key, id, serviceFeeToFetch) => {
  const [symbol, fromChainID, toChainID] = key.split('/')
  if (!serviceFeeToFetch[key] || serviceFeeToFetch[key].id < id) {
    if (serviceFeeToFetch[key]) {
      console.warn(`same serviceFeeToFetch, key = ${key}, old id = ${serviceFeeToFetch[key].id}, new id = ${id}`)
    } 
    serviceFeeToFetch[key] = {
      params: [symbol, fromChainID, toChainID],
      id,
      decoder: serviceFeeDecoder,
    }
  }
}

const addAllServiceFeeToFetch = (id, symbol, fromChainID, toChainID, serviceFeeToFetch) => {
  // 1.symbol/fromchainid/tochainid
  // 2.symbol/fromchainid/0
  // 3.symbol/0/tochainid
  // 4.""/fromchainid/tochainid
  // 5.""/fromchainid/0
  // 6.""/0/tochainid
  addServiceFeeToFetch(`${symbol}/${fromChainID}/${toChainID}`, id, serviceFeeToFetch)
  addServiceFeeToFetch(`${symbol}/${fromChainID}/0`, id, serviceFeeToFetch)
  addServiceFeeToFetch(`${symbol}/0/${toChainID}`, id, serviceFeeToFetch)
  addServiceFeeToFetch(`/${fromChainID}/${toChainID}`, id, serviceFeeToFetch)
  addServiceFeeToFetch(`/${fromChainID}/0`, id, serviceFeeToFetch)
  addServiceFeeToFetch(`/0/${toChainID}`, id, serviceFeeToFetch)
}

const networkFeeDecoder = (data) => {
  const iface = new ethers.Interface(crossAbi);
  return iface.decodeFunctionResult('getFee', data)[0].toString();
}

const addNetworkFeeToFetch = (key, id, networkFeeToFetch) => {
  let [id_, fromChainID, toChainID] = key.split('/')
  if (!networkFeeToFetch[key] || networkFeeToFetch[key].id < id) {
    if (networkFeeToFetch[key]) {
      console.warn(`same networkFeeToFetch, key = ${key}, old id = ${networkFeeToFetch[key].id}, new id = ${id}`)
    }
    const chainConfig = bip44ToChainConfig[fromChainID]
    if (id_ === '') {
      networkFeeToFetch[key] = {
        params: [[parseInt(fromChainID), parseInt(toChainID)]],
        method: 'getFee',
        id,
        chainConfig,
        decoder: networkFeeDecoder,
      }
    } else {
      networkFeeToFetch[key] = {
        params: [id],
        method: 'getTokenPairFee',
        id,
        chainConfig,
        decoder: (data) => {
          const iface = new ethers.Interface(crossAbi);
          return iface.decodeFunctionResult('getTokenPairFee', data)[0].toString();
        }
      }
    }
  }
}

const addAllNetworkFeeToFetch = (id, symbol, fromChainID, toChainID, networkFeeToFetch) => {
  // 1. cross.mapTokenPairContractFee[id]
  // 2. cross.mapContractFee[fromchainid][tochainid]  // current = from
  // 2. cross.mapContractFee[fromchainid][0]          // current = from
  // 2. cross.mapContractFee[tochainid][fromchainid]  // current = to
  // 2. cross.mapContractFee[tochainid][0]  // current = to
  addNetworkFeeToFetch(`${id}/${fromChainID}/${toChainID}`, id, networkFeeToFetch)
  addNetworkFeeToFetch(`/${fromChainID}/${toChainID}`, id, networkFeeToFetch)
  addNetworkFeeToFetch(`/${fromChainID}/0`, id, networkFeeToFetch)
  addNetworkFeeToFetch(`/${toChainID}/${fromChainID}`, id, networkFeeToFetch)
  addNetworkFeeToFetch(`/${toChainID}/0`, id, networkFeeToFetch)
}

const getFeesInfo = async (id, tokenPairs) => {
  const tokenPair = tokenPairs[id]
  const {symbol, fromChainID, toChainID} = tokenPair

  const serviceFeeToFetch = {}
  const networkFeeToFetch = {}
  // 正向 service fee
  addAllServiceFeeToFetch(id, symbol, fromChainID, toChainID, serviceFeeToFetch)
  // 反向 service fee
  addAllServiceFeeToFetch(id, symbol, toChainID, fromChainID, serviceFeeToFetch)
  // 正反向 network fee
  addAllNetworkFeeToFetch(id, symbol, fromChainID, toChainID, networkFeeToFetch)


  let chain = 'Wanchain'
  let crossConfigAddr = defiChainConfigs[chain].crossConfigAddr

  let calls = []
  let handleResults = []
  const servicefeeRaw = {}
  const networkfeeRaw = {}
  
  for(let key in serviceFeeToFetch) {
    const {id, params, decoder} = serviceFeeToFetch[key]
    addContractCall(calls, chain, crossConfigAddr, crossConfigAbi, 'getCrossChainAgentFee', params, decoder)
    handleResults.push((fee) => {
      if (fee.numerator !== 0) {
        servicefeeRaw[key] = fee
      }
    })
  }

  let result = await robustMultiCallBatch(chain, calls, 3)
  if (result && result.results) {
    let results = result.results
    for (let i = 0; i < results.length; i++) {
      if (handleResults[i]) {
        handleResults[i](results[i]);
      }
    }
  }

  calls = {}
  handleResults = {}
  for(let key in networkFeeToFetch) {
    const {id, params, decoder, method, chainConfig} = networkFeeToFetch[key]
    const {chain, crossScAddr } = chainConfig
    if (!calls[chain]) {
      calls[chain] = []
      handleResults[chain] = []
    }
    addContractCall(calls[chain], chain, crossScAddr, crossAbi, method, params, decoder)
    handleResults[chain].push((contractFee) => {
      if (contractFee !== 0) {
        networkfeeRaw[key] = contractFee
      }
    })
  }

  for (let chain in calls) {
    result = await robustMultiCallBatch(chain, calls[chain], 3)
    if (result && result.results) {
      let results = result.results
      for (let i = 0; i < results.length; i++) {
        if (handleResults[chain][i]) {
          handleResults[chain][i](results[i]);
        }
      }
    }
  }
}