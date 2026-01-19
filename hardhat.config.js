require("@nomicfoundation/hardhat-toolbox");
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "./.env") });

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "london",
      optimizer: {
        enabled: true,
        runs: 0
      }
    }
  },
  sourcify: {
    enabled: true
  },
  networks: {
    localTest: {
      url: "http://127.0.0.1:8545/",
      accounts: [process.env.PK],
    },
    worldchain: {
      url: "https://worldchain-mainnet.g.alchemy.com/public",
      accounts: [process.env.PK],
    },
    sonic: {
      url: "https://sonic-rpc.publicnode.com",
      accounts: [process.env.PK],
    },
    ethereum: {
      url: "https://ethereum-rpc.publicnode.com",
      accounts: [process.env.PK],
      okxDexRouter: "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC",
    },
    arbitrum: {
      url: "https://arbitrum-one-rpc.publicnode.com",
      accounts: [process.env.PK],
      okxDexRouter: "0x368E01160C2244B0363a35B3fF0A971E44a89284",
    },
    op: {
      url: "https://optimism-rpc.publicnode.com",
      accounts: [process.env.PK],
    },
    bsc: {
      url: "https://bsc-rpc.publicnode.com",
      accounts: [process.env.PK],
      gasPrice: 3e9,
      okxDexRouter: "0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0",
    },
    base: {
      url: "https://base-rpc.publicnode.com",
      accounts: [process.env.PK],
      okxDexRouter: "0x4409921ae43a39a11d90f7b7f96cfd0b8093d9fc",
    },
    polygon: {
      url: process.env.RPC_URL || 'https://polygon-rpc.com',
      accounts: [process.env.PK],
      okxDexRouter: "0xf332761c673b59B21fF6dfa8adA44d78c12dEF09"
    },
    wanchainMainnet: {
      url: "https://gwan-ssl.wandevs.org:56891/",
      accounts: [process.env.PK],
      gasPrice: 10e9,
      minGasPrice: 10e9,
      gas: 8e6,
      maxPriorityFeePerGas: 1e9,
    },
    wanchainTestnet: {
      url: "https://gwan-ssl.wandevs.org:46891/",
      accounts: [process.env.PK],
      gasPrice: 10e9,
      minGasPrice: 10e9,
      gas: 8e6,
      maxPriorityFeePerGas: 1e9,
      okxDexRouter: "0x5E1f62Dac767b0491e3CE72469C217365D5B48cC", // 假的
      bridgeAddress: '0x62de27e16f6f31d9aa5b02f4599fc6e21b339e79',
    },
    sepolia: {
      url: "https://rpc2.sepolia.org",
      accounts: [process.env.PK],
    },
    fuji: {
      url: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
      accounts: [process.env.PK],
      bridgeAddress: '0x4c200a0867753454db78af84d147bd03e567f234',
    },
    avalanche: {
      url: 'https://avalanche.public-rpc.com',
      accounts: [process.env.PK],
    },
    polygonZkEvm: {
      url: 'https://polygon-zkevm-mainnet.public.blastapi.io',
      accounts: [process.env.PK],
    },
    linea: {
      url: 'https://linea-rpc.publicnode.com',
      accounts: [process.env.PK],
    },
    xLayer: {
      url: 'https://xlayerrpc.okx.com',
      accounts: [process.env.PK],
    },
    celo: {
      url: 'https://rpc.ankr.com/celo',
      accounts: [process.env.PK],
    }
  }
};
