/// 跨 usdt
/// 233, usdt avax -> wan
// 源链ID:
// 2147492648 (AVAX)
// 目标链ID:
// 2153201998 (WAN)
// 源代币精度:
// 6
// 目标代币精度:
// 6
// 源地址:
// 0x1f6515c5e45c7d572fbb5d18ce613332c17ab288
// 目标地址:
// 0x3d5950287b45f361774e5fb6e50d70eea06bc167

/// 跨 wan
/// 44,  wan  wan -> avax
// 源链ID:
// 2153201998 (WAN)
// 目标链ID:
// 2147492648 (AVAX)
// 源代币精度:
// 18
// 目标代币精度:
// 18
// 源地址:
// 0x0000000000000000000000000000000000000000
// 目标地址:
// 0x14687d327e54f80582731e3748544762b36ddecd

// USDT AVAX ->  WAN fee is {
//   "symbol": "USDT",
//   "minQuota": "1",
//   "maxQuota": "800266488740",
//   "networkFee": {
//     "value": "0",
//     "isPercent": false
//   },
//   "operationFee": {
//     "value": "0",
//     "isPercent": false
//   }
// }
// USDT WAN -> AVAX fee is {
//   "symbol": "USDT",
//   "minQuota": "400000",
//   "maxQuota": "124031816038",
//   "networkFee": {
//     "value": "63000000000000000",
//     "isPercent": false
//   },
//   "operationFee": {
//     "value": "0.004",
//     "isPercent": true,
//     "minFeeLimit": "200000",
//     "maxFeeLimit": "100000000"
//   }
// }
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const axios = require('axios')
const { ethers } = require('ethers')
const BigNumber = require('bignumber.js');

const { getValidAmount, getNetworkfee, sleep, tryLoadJsonObj} = require(path.resolve(__dirname, "../lib/utils"))
const { callContract, sendNativeAndWait, sendContractAndWait, diagnoseWallet} = require(path.resolve(__dirname, "../lib/chainManagerTestnet"))

const crossAbi = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata swapCallData) external payable returns (uint256 amountOut)',
]

let gTokenPairsInfo = tryLoadJsonObj(path.resolve(__dirname, "../data/TokenPairs-testnet.json"), {total: 0, tokenPairs: {}});

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

const sendCrossUsdt = async (fromChainSymbol, toChainSymbol, assetSymbol, tokenPairId) => {
  const feeInfo = await reqQuotaAndFee(fromChainSymbol, toChainSymbol, tokenPairId, assetSymbol)
  console.log(`${assetSymbol}, ${tokenPairId}, ${fromChainSymbol} ->  ${toChainSymbol} fee is ${JSON.stringify(feeInfo, null, 2)}`)

  let amount = 100000
  amount = BigNumber(getValidAmount(feeInfo.networkFee, amount))
  let networkFee = BigNumber(getNetworkfee(feeInfo.networkFee, amount))
  const params = {
    token: "0x1f6515c5e45c7d572fbb5d18ce613332c17ab288",           // USDT地址
    amount: amount.toFixed(),            // 0.000100 USDT (6 decimals)
    smgID: "0x000000000000000000000000000000000000000000000000006465765f323638",           // Storeman Group ID
    tokenPairID: tokenPairId,         // 代币对ID
    crossType: 0,             // 0=Lock, 1=Burn
    recipient: ethers.getBytes("0x8d7a93ab1e89719e060fec1f21244f6832c46fb6"),       // 目标链接收地址(bytes格式)
    networkFee: networkFee.toFixed(0)
  };

  
  const isNativeCross = params.token.toLowerCase() === '0x0000000000000000000000000000000000000000';
  let value = networkFee
  if (isNativeCross) {
    value = networkFee.plus(amount)
  }

  const chainName = 'Avalanche'
  const privateKey = process.env.PK
  const CrossAddress = '0xB46D6Fa374b9f172648586a0Cfb0ba10b41751EB'
  const CrossAbi = ['function cross(tuple(address token, uint256 amount, bytes32 smgID, uint256 tokenPairID, uint8 crossType, bytes recipient, uint256 networkFee) params) external payable returns (bytes32 txHash)']
  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];

  // 步骤 1: 用户授权 Cross 合约
  if (!isNativeCross) {
    const { txResponse, receipt } = await sendContractAndWait(
      chainName,
      privateKey,
      params.token,
      erc20Abi,
      'approve',
      [CrossAddress, params.amount],
      {}, // options
      1   // confirmations
    );
    console.log(`✓ Transaction successful!`);
    console.log(`  Hash: ${txResponse.hash}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log(`  Gas Used: ${receipt.gasUsed}`);
    console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
  }

  // 步骤 2: 调用Cross
  // const options = isNativeCross ? { value: value.toFixed(0) } : {};  // 添加 ETH value
  const options = value.isZero() ? {} : { value: value.toFixed(0) } ;  // 添加 ETH value
  const result = await sendContractAndWait(
    chainName,
    privateKey,
    CrossAddress,
    CrossAbi,
    'cross',
    [params],
    options, // optionsc
    1   // confirmations
  );
  console.log(`✓ Transaction successful!`);
  console.log(`  Hash: ${result.txResponse.hash}`);
  console.log(`  Block: ${result.receipt.blockNumber}`);
  console.log(`  Gas Used: ${result.receipt.gasUsed}`);
  console.log(`  Status: ${result.receipt.status === 1 ? 'Success' : 'Failed'}`);
}

const sendCrossBurnUsdt = async (fromChainSymbol, toChainSymbol, assetSymbol, tokenPairId) => {
  const feeInfo = await reqQuotaAndFee(fromChainSymbol, toChainSymbol, tokenPairId, assetSymbol)
  console.log(`${assetSymbol}, ${tokenPairId}, ${fromChainSymbol} ->  ${toChainSymbol} fee is ${JSON.stringify(feeInfo, null, 2)}`)

  let amount = 999700
  amount = BigNumber(getValidAmount(feeInfo.networkFee, amount))
  let networkFee = BigNumber(getNetworkfee(feeInfo.networkFee, amount)).plus()
  networkFee = BigNumber("837218039856179603")  // only for test
  const params = {
    token: "0x3d5950287b45f361774e5fb6e50d70eea06bc167",           // wanUSDT地址
    amount: amount.toFixed(),            // 0.000100 USDT (6 decimals)
    smgID: "0x000000000000000000000000000000000000000000000000006465765f323638",           // Storeman Group ID
    tokenPairID: tokenPairId,         // 代币对ID
    crossType: 1,             // 0=Lock, 1=Burn
    recipient: ethers.getBytes("0x8d7a93ab1e89719e060fec1f21244f6832c46fb6"),       // 目标链接收地址(bytes格式)
    networkFee: networkFee.toFixed(0)
  };

  
  const isNativeCross = params.token.toLowerCase() === '0x0000000000000000000000000000000000000000';
  let value = networkFee
  if (isNativeCross) {
    value = networkFee.plus(amount)
  }

  const chainName = 'Wanchain'
  const privateKey = process.env.PK
  const CrossAddress = '0xB46D6Fa374b9f172648586a0Cfb0ba10b41751EB' // 再wanchain上部署的Cross
  const CrossAbi = ['function cross(tuple(address token, uint256 amount, bytes32 smgID, uint256 tokenPairID, uint8 crossType, bytes recipient, uint256 networkFee) params) external payable returns (bytes32 txHash)']
  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];

  // 步骤 1: 用户授权 Cross 合约
  // if (!isNativeCross) {
  //   const { txResponse, receipt } = await sendContractAndWait(
  //     chainName,
  //     privateKey,
  //     params.token,
  //     erc20Abi,
  //     'approve',
  //     [CrossAddress, params.amount],
  //     {}, // options
  //     1   // confirmations
  //   );
  //   console.log(`✓ Transaction successful!`);
  //   console.log(`  Hash: ${txResponse.hash}`);
  //   console.log(`  Block: ${receipt.blockNumber}`);
  //   console.log(`  Gas Used: ${receipt.gasUsed}`);
  //   console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
  // }

  // 步骤 2: 调用Cross
  const options = value.isZero() ? {} : { value: value.toFixed(0) } ;  // 添加 ETH value
  console.log(`params is ${JSON.stringify(params, null, 2)}`)
  console.log(`options is ${JSON.stringify(options, null, 2)}`)
  const result = await sendContractAndWait(
    chainName,
    privateKey,
    CrossAddress,
    CrossAbi,
    'cross',
    [params],
    options, // options
    1   // confirmations
  );
  console.log(`✓ Transaction successful!`);
  console.log(`  Hash: ${result.txResponse.hash}`);
  console.log(`  Block: ${result.receipt.blockNumber}`);
  console.log(`  Gas Used: ${result.receipt.gasUsed}`);
  console.log(`  Status: ${result.receipt.status === 1 ? 'Success' : 'Failed'}`);
}



setTimeout( async() => {
  // usdt AVAX->WAN
  // await sendCrossUsdt('AVAX', 'WAN', 'USDT', 233)
  await sendCrossBurnUsdt('WAN', 'AVAX', 'USDT', 233)
}, 0)

/*
// 方式1: 完整参数版本, usdt avax -> wan

await simpleBridge.bridgeERC20(params, { value: params.networkFee });

// 方式2: 简化版本（默认使用Lock模式）
await simpleBridge.bridgeERC20Simple(
    "0x...",      // token
    "1000000000", // amount
    "0x...",      // smgID
    123,          // tokenPairID
    "0x...",      // recipient
    { value: ethers.utils.parseEther("0.1") }
);
```

### 2. 跨链原生币

```javascript
// 方式1: 完整参数版本
const params = {
    token: ethers.constants.AddressZero, // 原生币用地址0
    amount: ethers.utils.parseEther("1"), // 1 ETH
    smgID: "0x...",
    tokenPairID: 456,
    crossType: 0,  // 原生币只支持Lock模式
    recipient: "0x...",
    networkFee: ethers.utils.parseEther("0.1")
};

// msg.value = amount + networkFee
await simpleBridge.bridgeNative(params, { 
    value: ethers.utils.parseEther("1.1") 
});

// 方式2: 简化版本
await simpleBridge.bridgeNativeSimple(
    ethers.utils.parseEther("1"),    // amount
    "0x...",                         // smgID
    456,                             // tokenPairID
    "0x...",                         // recipient
    ethers.utils.parseEther("0.1"),  // networkFee
    { value: ethers.utils.parseEther("1.1") }
);
```

## Lock vs Burn 模式说明

### Lock模式 (CrossType.UserLock = 0)
```
源链: 锁定 1000 USDC
  ↓
目标链: 铸造 1000 USDC (映射代币)
```
**适用场景**: 资产从原生链跨到其他链

### Burn模式 (CrossType.UserBurn = 1)
```
源链: 销毁 1000 USDC (映射代币)
  ↓
目标链: 解锁 1000 USDC (原生代币)
```
**适用场景**: 资产从其他链跨回原生链

## 完整示例：从以太坊跨链USDC到BSC

```javascript
const { ethers } = require("ethers");

async function bridgeUSDCToBSC() {
    // 1. 连接合约
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const bridgeAddress = "0x..."; // SimpleBridge合约地址
    const bridge = new ethers.Contract(bridgeAddress, ABI, signer);

    // 2. 授权USDC
    const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
    const amount = ethers.utils.parseUnits("1000", 6); // 1000 USDC
    
    await usdc.approve(bridgeAddress, amount);
    console.log("✅ USDC approved");

    // 3. 准备跨链参数
    const params = {
        token: usdcAddress,
        amount: amount,
        smgID: "0x1234...", // 从Wanchain获取
        tokenPairID: 100,    // USDC在ETH-BSC的pair ID
        crossType: 0,        // Lock模式
        recipient: ethers.utils.hexlify(
            ethers.utils.toUtf8Bytes("0xYourBSCAddress")
        ),
        networkFee: ethers.utils.parseEther("0.05") // 0.05 ETH
    };

    // 4. 执行跨链
    const tx = await bridge.bridgeERC20(params, {
        value: params.networkFee,
        gasLimit: 300000
    });

    console.log("🚀 Transaction sent:", tx.hash);

    // 5. 等待确认
    const receipt = await tx.wait();
    console.log("✅ Bridge completed!");

    // 6. 获取交易哈希
    const event = receipt.events.find(e => e.event === "BridgeInitiated");
    const txHash = event.args.txHash;
    console.log("📝 Bridge txHash:", txHash);

    // 7. 查询跨链记录
    const record = await bridge.getBridgeRecord(txHash);
    console.log("Record:", {
        user: record.user,
        token: record.token,
        amount: record.amount.toString(),
        timestamp: new Date(record.timestamp.toNumber() * 1000),
        completed: record.completed
    });
}
```

## 查询跨链状态

```javascript
// 通过交易哈希查询
const txHash = "0x...";
const record = await bridge.getBridgeRecord(txHash);

console.log({
    user: record.user,
    token: record.token,
    amount: ethers.utils.formatUnits(record.amount, 6), // 假设是USDC
    time: new Date(record.timestamp * 1000).toLocaleString(),
    completed: record.completed
});

// 检查是否完成
const isCompleted = await bridge.isBridgeCompleted(txHash);
console.log("Bridge completed:", isCompleted);
```

## 重要参数说明

### smgID (Storeman Group ID)
- Wanchain的验证者组标识
- 需要从Wanchain官方获取当前活跃的smgID
- 不同的smgID对应不同的跨链路由

### tokenPairID
- 代币对ID，标识源链代币和目标链代币的映射关系
- 例如: ETH-USDC <-> BSC-USDC 的pair ID
- 需要从Wanchain Bridge配置中查询

### recipient (bytes格式)
```javascript
// 方式1: 从地址字符串转换
const recipient = ethers.utils.hexlify(
    ethers.utils.toUtf8Bytes("0xYourTargetAddress")
);

// 方式2: 直接使用地址的bytes
const recipient = ethers.utils.arrayify("0xYourTargetAddress");
```

### networkFee
- 支付给Storeman Group的跨链手续费
- 金额取决于目标链和网络拥堵情况
- 建议通过Wanchain API查询实时费率

## 错误处理

```javascript
try {
    const tx = await bridge.bridgeERC20(params, { value: networkFee });
    await tx.wait();
} catch (error) {
    if (error.message.includes("insufficient network fee")) {
        console.error("网络费不足，请增加msg.value");
    } else if (error.message.includes("amount must be greater than 0")) {
        console.error("跨链数量必须大于0");
    } else if (error.message.includes("invalid recipient")) {
        console.error("接收地址格式错误");
    } else {
        console.error("跨链失败:", error.message);
    }
}
```

## 部署合约

```javascript
const SimpleBridge = await ethers.getContractFactory("SimpleBridge");
const wanBridgeAddress = "0x..."; // Wanchain Bridge地址

const bridge = await SimpleBridge.deploy(wanBridgeAddress);
await bridge.deployed();

console.log("SimpleBridge deployed to:", bridge.address);
```

## 安全提示

⚠️ **使用前必读**:
1. 确保已授权足够的代币额度
2. 确认networkFee足够支付跨链费用
3. 仔细核对recipient地址（跨链后无法撤回）
4. 小额测试后再进行大额跨链
5. 保存好txHash用于追踪跨链状态
6. 跨链需要等待Storeman确认，通常需要几分钟到十几分钟

## 对比原始CrossSwap

| 功能 | SimpleBridge | CrossSwap |
|------|-------------|-----------|
| 资产跨链 | ✅ | ✅ |
| Swap交换 | ❌ | ✅ |
| 消息跨链 | ❌ | ✅ |
| 复杂度 | 低 | 高 |
| Gas费用 | 较低 | 较高 |
| 使用场景 | 纯跨链转账 | 跨链+交换 |

SimpleBridge更适合只需要跨链转账的场景，代码更简洁，gas消耗更低。
*/