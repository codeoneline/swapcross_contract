const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

const { getSwapData } = require(path.resolve(__dirname, "../lib/okxDexHelper"));

/**
 * 测试更大金额的 swap
 * 
 * 策略：
 * 1. 使用 0.01 ETH（约 $28）而不是 0.0001 ETH
 * 2. 排除可能有问题的 DEX（Curve, Balancer）
 * 3. 使用合约地址作为 userWalletAddress
 */
async function testLargerAmount() {
  const provider = new ethers.JsonRpcProvider(
    process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'
  );
  
  const wallet = new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider);
  const contractAddress = '0x88381a53b020ea92fb1b059e0ead49cd88be3318';
  
  console.log('=== Testing Larger Amount Swap ===\n');
  console.log('Contract:', contractAddress);
  console.log('');
  
  // const WETH_ETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH on ETH
  const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7'; // USDT on ETH
  const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on ETH
  
  // const tokenIn = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  // const tokenOut = '0xdac17f958d2ee523a2206206994597c13d831ec7'; // USDT

  const tokenIn = USDC_ETH;
  const tokenOut = USDT_ETH;
  
  // 测试不同的金额
  // const amounts = [
  //   ethers.parseEther('0.01'),   // $28
  //   ethers.parseEther('0.05'),   // $143
  //   ethers.parseEther('0.1'),    // $286
  // ];
  
  // for (const amount of amounts) {
    let amount = 1000000
    console.log(`\n=== Testing ${ethers.formatEther(amount)} ETH ===\n`);
    
    try {
      // 策略 A: 排除 Curve 和 Balancer
      console.log('Strategy A: Exclude Curve (2) and Balancer (6)');
      
      const swapData = await getSwapData(
        tokenIn,
        tokenOut,
        amount.toString(),
        '2.0',
        1,
        contractAddress,  // userWalletAddress
        contractAddress,  // swapReceiverAddress
        null,
        // '2,6'            // 排除 Curve 和 Balancer
      );
      
      console.log('✅ Got swap route');
      console.log('Router:', swapData.routerResult.router);
      console.log('DEX protocols used:');
      swapData.routerResult.dexRouterList.forEach((hop, i) => {
        console.log(`  ${i + 1}. ${hop.dexProtocol.dexName} (${hop.dexProtocol.percent}%)`);
      });
      
      // 测试静态调用
      console.log('\nTesting static call from contract...');
      
      await provider.call({
        to: swapData.tx.to,
        data: swapData.tx.data,
        value: amount,
        from: contractAddress,
        gasLimit: 5000000 // 更高的 gas limit
      });
      
      console.log('✅ SUCCESS! This amount and route works!\n');
      console.log('═══════════════════════════════════════════════════');
      console.log('🎉 SOLUTION FOUND!');
      console.log('═══════════════════════════════════════════════════');
      console.log(`Amount: ${ethers.formatEther(amount)} ETH`);
      console.log('Exclude DEXs: Curve (2), Balancer (6)');
      console.log('User wallet address: Contract address');
      console.log('Swap receiver address: Contract address');
      console.log('═══════════════════════════════════════════════════\n');
      
      return; // 找到可行方案，退出
      
    } catch (error) {
      if (error.message.includes('Insufficient liquidity')) {
        console.log('❌ Insufficient liquidity for this amount\n');
      } else {
        console.log('❌ Failed:', error.shortMessage || error.message);
        console.log('');
      }
    }
    
    // 如果上面失败，尝试策略 B：只用 Uniswap
    try {
      console.log('Strategy B: Uniswap V2 + V3 only');
      
      const swapData = await getSwapData(
        tokenIn,
        tokenOut,
        amount.toString(),
        '2.0',
        1,
        contractAddress,
        contractAddress,
        '1,3',  // 只用 Uniswap V2 (1) 和 V3 (3)
        null
      );
      
      console.log('✅ Got Uniswap-only route');
      console.log('Router:', swapData.routerResult.router);
      
      await provider.call({
        to: swapData.tx.to,
        data: swapData.tx.data,
        value: amount,
        from: contractAddress,
        gasLimit: 5000000
      });
      
      console.log('✅ SUCCESS! Uniswap-only route works!\n');
      console.log('═══════════════════════════════════════════════════');
      console.log('🎉 SOLUTION FOUND!');
      console.log('═══════════════════════════════════════════════════');
      console.log(`Amount: ${ethers.formatEther(amount)} ETH`);
      console.log('DEXs: Uniswap V2 + V3 only');
      console.log('User wallet address: Contract address');
      console.log('Swap receiver address: Contract address');
      console.log('═══════════════════════════════════════════════════\n');
      
      return;
      
    } catch (error) {
      if (error.message.includes('Insufficient liquidity')) {
        console.log('❌ Uniswap: Insufficient liquidity\n');
      } else {
        console.log('❌ Uniswap failed:', error.shortMessage || error.message);
        console.log('');
      }
    }
  // }
  
  // console.log('\n⚠️  All amounts tested failed');
  // console.log('Next steps:');
  // console.log('1. Try even larger amounts (0.5 ETH+)');
  // console.log('2. Try different token pairs (ETH → DAI, WETH → USDC)');
  // console.log('3. Use a different DEX aggregator (1inch, ParaSwap)');
}

testLargerAmount().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});