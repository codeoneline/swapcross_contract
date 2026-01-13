module.exports = {
  Ethereum: {
    bip44: 2147483708,
    chainId: 1,
    rpcs: [
      "https://eth.meowrpc.com",
      "https://rpc.mevblocker.io",
      "https://ethereum.publicnode.com",
      "https://gateway.tenderly.co/public/mainnet",
      "https://1rpc.io/eth"
    ],
    multiCall: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  },
  Wanchain: {
    bip44: 2147485248,
    chainId: 888,
    rpcs: [
      "https://gwan-ssl.wandevs.org:56891",
      "https://mywanwallet.nl/rpc",
    ],
    multiCall: "0x", // 需要填入正确的 MultiCall 地址
  },
  Arbitrum: {
    bip44: 1073741826,
    chainId: 42161,
    rpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://1rpc.io/arb",
      "https://arbitrum-one.publicnode.com",
    ],
    multiCall: "0xb66f96e30d6a0ae64d24e392bb2dbd25155cb3a6",
  },
  BSC: {
    bip44: 2147484362,
    chainId: 56,
    rpcs: [
      "https://bsc-rpc.publicnode.com",
      "https://bsc.drpc.org",
      "https://1rpc.io/bnb",
      "https://bsc.meowrpc.com",
    ],
    multiCall: "0x023a33445f11c978f8a99e232e1c526ae3c0ad70",
  },
  Polygon: {
    bip44: 2147484614,
    chainId: 137,
    rpcs: [
      "https://polygon-rpc.com",
      "https://polygon.drpc.org",
      "https://rpc-mainnet.matic.quiknode.pro",
    ],
    multiCall: "0x1bbc16260d5d052f1493b8f2aeee7888fed1e9ab",
  },
  Optimism: {
    bip44: 2147484262,
    chainId: 10,
    rpcs: [
      "https://optimism.publicnode.com",
      "https://1rpc.io/op",
      "https://optimism.meowrpc.com",
    ],
    multiCall: "0x2dc0e2aa608532da689e89e237df582b783e552c",
  },
  Avalanche: {
    bip44: 2147492648,
    chainId: 43114,
    rpcs: [
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avax.meowrpc.com",
      "https://1rpc.io/avax/c"
    ],
    multiCall: "0xa4726706935901fe7dd0f23cf5d4fb19867dfc88",
  }
};