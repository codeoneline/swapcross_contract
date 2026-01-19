module.exports = {
  Wanchain: {
    bip44: 2153201998,
    chainId: 999,
    rpcs: [
      "https://nodes-testnet.wandevs.org/wan",
      "https://gwan-ssl.wandevs.org:46891/",
    ],
    multiCall: "0x14095a721dddb892d6350a777c75396d634a7d97",
  },
  Avalanche: {
    bip44: 2147492648,
    chainId: 43113,
    rpcs: [
      "https://api.avax-test.network/ext/bc/C/rpc",
      "https://rpc.ankr.com/avalanche_fuji",
      "https://avalanche-fuji-c-chain.publicnode.com"
    ],
    multiCall: "0x0ea414baaf9643be59667e92e26a87c4bae3f33a",
  },
}