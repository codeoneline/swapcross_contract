module.exports = {
  ethereum: {
    chainName: "Ethereum",
    chainType: "ETH",         // for bridge-api
    // symbol:              // for tokenPair ？
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
    okxDexRouter: "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC",
    wanBridge: "0xfceaaaeb8d564a9d0e71ef36f027b9d162bc334e",
    approveProxy: "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f",
  },
  wanchainMainnet: {
    chainName: "Wanchain",
    bip44: 2147485248,
    chainId: 888,
    chainType: "WAN",
    rpcs: [
      "https://gwan-ssl.wandevs.org:56891",
      "https://mywanwallet.nl/rpc",
    ],
    multiCall: "0xba5934ab3056fca1fa458d30fbb3810c3eb5145f",
    wanBridge: "0xe85b0d89cbc670733d6a40a9450d8788be13da47",
  },
  arbitrum: {
    chainName: "Wanchain",
    bip44: 1073741826,
    chainId: 42161,
    chainType: "ARETH",
    rpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://1rpc.io/arb",
      "https://arbitrum-one.publicnode.com",
    ],
    multiCall: "0xb66f96e30d6a0ae64d24e392bb2dbd25155cb3a6",
    okxDexRouter: "0x368E01160C2244B0363a35B3fF0A971E44a89284",
    wanBridge: "0xf7ba155556e2cd4dfe3fe26e506a14d2f4b97613",
    approveProxy: "0x70cBb871E8f30Fc8Ce23609E9E0Ea87B6b222F58",
  },
  bsc: {
    chainName: "BSC",
    bip44: 2147484362,
    chainId: 56,
    chainType: "BNB",
    rpcs: [
      "https://bsc-rpc.publicnode.com",
      "https://bsc.drpc.org",
      "https://1rpc.io/bnb",
      "https://bsc.meowrpc.com",
    ],
    multiCall: "0x023a33445f11c978f8a99e232e1c526ae3c0ad70",
    okxDexRouter: "0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0",
    wanBridge: "0xc3711bdbe7e3063bf6c22e7fed42f782ac82baee",
    approveProxy: "0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6",
  },
  polygon: {
    chainName: "Polygon",
    bip44: 2147484614,
    chainId: 137,
    chainType: "MATIC",
    rpcs: [
      "https://polygon-rpc.com",
      "https://polygon.drpc.org",
      "https://rpc-mainnet.matic.quiknode.pro",
    ],
    multiCall: "0x1bbc16260d5d052f1493b8f2aeee7888fed1e9ab",
    okxDexRouter: "0x057cfd839aa88994d1a8a8c6d336cf21550f05ef",
    wanBridge: "0x2216072a246a84f7b9ce0f1415dd239c9bf201ab",
    approveProxy: "0x3B86917369B83a6892f553609F3c2F439C184e31",
  },
  op: {
    chainName: "OptimisticEthereum",
    bip44: 2147484262,
    chainId: 10,
    chainType: "OETH",
    rpcs: [
      "https://optimism.publicnode.com",
      "https://1rpc.io/op",
      "https://optimism.meowrpc.com",
    ],
    multiCall: "0x2dc0e2aa608532da689e89e237df582b783e552c",
    okxDexRouter: "0x6733Eb2E75B1625F1Fe5f18aD2cB2BaBDA510d19",
    wanBridge: "0xc6ae1db6c66d909f7bfeeeb24f9adb8620bf9dbf",
    approveProxy: "0x68D6B739D2020067D1e2F713b999dA97E4d54812",
  },
  avalanche: {
    chainName: "Avalanche",
    bip44: 2147492648,
    chainId: 43114,
    chainType: "AVAX",
    rpcs: [
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avax.meowrpc.com",
      "https://1rpc.io/avax/c"
    ],
    multiCall: "0xa4726706935901fe7dd0f23cf5d4fb19867dfc88",
    okxDexRouter: "0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91",
    wanBridge: "0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a",
    approveProxy: "0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f",
  },

  wanchainTestnet: {
    chainName: "Wanchain",
    isTestnet: true,
    bip44: 2153201998,
    chainId: 999,
    chainType: "WAN",
    rpcs: [
      "https://nodes-testnet.wandevs.org/wan",
      "https://gwan-ssl.wandevs.org:46891/",
    ],
    multiCall: "0x14095a721dddb892d6350a777c75396d634a7d97",
    wanBridge: "0x62de27e16f6f31d9aa5b02f4599fc6e21b339e79",
  },
  fuji: {
    chainName: "Avalanche",
    isTestnet: true,
    bip44: 2147492648,
    chainId: 43113,
    chainType: "AVAX",
    rpcs: [
      "https://api.avax-test.network/ext/bc/C/rpc",
      "https://rpc.ankr.com/avalanche_fuji",
      "https://avalanche-fuji-c-chain.publicnode.com"
    ],
    multiCall: "0x0ea414baaf9643be59667e92e26a87c4bae3f33a",
    wanBridge: "0x4c200a0867753454db78af84d147bd03e567f234"
  },
};
