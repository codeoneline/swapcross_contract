// 不同链的 OKX DEX Router 地址
// Ethereum: 0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f
// TokenApprove

// Arbitrum: 0x70cBb871E8f30Fc8Ce23609E9E0Ea87B6b222F58
// 授权：

// Optimism: 0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f
// 授权： 0x68D6B739D2020067D1e2F713b999dA97E4d54812     OPT

// Polygon: 0x057cfd839aa88994d1a8a8c6d336cf21550f05ef  MATIC
// 授权： 0x3B86917369B83a6892f553609F3c2F439C184e31

constructor("0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f")
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");


module.exports = buildModule("OKXDexSwapModule", (m) => {
  const unlockTime = m.getParameter("unlockTime", Now);
  const lockedAmount = m.getParameter("lockedAmount", ONE_GWEI);

  const lock = m.contract("OKXDexSwap", [unlockTime], {});

  return { lock };
});