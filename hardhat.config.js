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
  etherscan: {
    apiKey: "NR74JXIII693YYXXTTKHENDPTT8QVG8PG2"
  },
  networks: {
    ethereum: {
      url: "https://ethereum-rpc.publicnode.com",
      accounts: [process.env.PK],
    },
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
    arbitrum: {
      url: "https://arbitrum-one-rpc.publicnode.com",
      accounts: [process.env.PK],
    },
    op: {
      url: "https://optimism-rpc.publicnode.com",
      accounts: [process.env.PK],
    },
    bsc: {
      url: "https://bsc-rpc.publicnode.com",
      accounts: [process.env.PK],
      gasPrice: 3e9,
    },
    base: {
      url: "https://base-rpc.publicnode.com",
      accounts: [process.env.PK],
    },
    polygon: {
      url: process.env.RPC_URL || 'https://polygon-rpc.com',
      accounts: [process.env.PK],
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
    },
    sepolia: {
      url: "https://rpc2.sepolia.org",
      accounts: [process.env.PK],
    },
    fuji: {
      url: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
      accounts: [process.env.PK],
    },
    avalanche: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
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
