# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

# Folder

## config
 key必须和hardhat.config.js中的networks下的key保持一致


## data
 token和tokenPair 信息

## 核心目录
  1. contracts : 合约， SwapAndCrossV1为核心合约，其它为测试合约
  2. config : 合约的网络配置，key必须和hardhat.config.js中的networks下的key保持一致
  3. test : 合约的单元测试
  4. ignition : 非可升级合约的部署脚本和信息，以后会废弃
  5. scripts: 可升级合约的部署脚本，测试脚本
  6. run : 调用部署好的合约功能的脚本，之前是基于ignition部署的合约写的，之后需改成基于scripts手动部署的合约
  7. lib : run目录的支持库
  8. abi : run目录的支持abi
  9. data : run目录的token, tokenPair信息

## 生成的目录
  1. artifacts、cache ： 由hardhat 编译合约生成
  2. coverage ： 由solidity-coverage运行单元测试生成

## deployments, deployments/.openzeppelin
  1. deployments ： 由script目录下的部署脚本手动生成，
  2. deployments/.openzeppelin ： 由hardhat-upgrades部署合约时自动生成

## log目录
  1. dev_log ：各类的测试log
