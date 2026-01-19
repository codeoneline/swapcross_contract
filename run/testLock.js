// const fs = require('fs')
const { ethers } = require('ethers')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const { callContract, sendNativeAndWait, sendContractAndWait, diagnoseWallet} = require(path.resolve(__dirname, "../lib/chainManagerTestnet"))

const LockAbi = require('../artifacts/contracts/Lock.sol/Lock.json').abi
const LockAddressOnWanchain = "0x213510bC45a26AB7cD6fbcEd8Ef2091DD472B7Fb"
const privateKey = process.env.PK

const sendWan = async () => {
  const { txResponse, receipt } = await sendNativeAndWait(
    'Wanchain', 
    privateKey, 
    LockAddressOnWanchain, 
    ethers.parseEther('0.1')
  );
  console.log(`tx is ${txResponse}, receipt is ${JSON.stringify(receipt)}`)
}

const getUnlockTime = async() => {
  const unlockTime = await callContract('Wanchain', LockAddressOnWanchain, LockAbi, "unlockTime")
  // unlockTime is 1768280808, type is bigint
  console.log(`unlockTime is ${unlockTime}, type is ${typeof unlockTime}`)
}

const sendWithdraw = async () => {
  try {
    // 1. 首先运行诊断
    console.log('Running wallet diagnosis...');
    const diagResult = await diagnoseWallet('Wanchain', privateKey);
    if (!diagResult) {
      throw new Error('Wallet diagnosis failed');
    }
    
    // 2. 调用 withdraw
    console.log('\nCalling withdraw...');
    const { txResponse, receipt } = await sendContractAndWait(
      'Wanchain',
      privateKey,
      LockAddressOnWanchain,
      LockAbi,
      'withdraw',
      [],
      {}, // options
      1   // confirmations
    );
    
    console.log(`✓ Transaction successful!`);
    console.log(`  Hash: ${txResponse.hash}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log(`  Gas Used: ${receipt.gasUsed}`);
    console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    
  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
    
    // 详细错误信息
    if (error.error) {
      console.error('Error details:', error.error);
    }
    if (error.transaction) {
      console.error('Transaction data:', error.transaction);
    }
  }
}

setTimeout(async () => {
 await sendWithdraw()
}, 0)