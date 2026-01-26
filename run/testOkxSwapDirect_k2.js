const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../.env") });

/**
 * 直接测试 Uniswap V3 (绕过 OKX)
 * 
 * 目的：验证合约调用 DEX 的基本可行性
 * 如果这个能成功，说明问题确实在 OKX 的路由选择上
 */

const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';

async function testUniswapV3Direct() {
  const provider = new ethers.JsonRpcProvider(
    process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'
  );
  
  const contractAddress = '0x88381a53b020ea92fb1b059e0ead49cd88be3318';
  
  console.log('=== Testing Direct Uniswap V3 Call ===\n');
  console.log('Contract:', contractAddress);
  console.log('Uniswap V3 Router:', UNISWAP_V3_ROUTER);
  console.log('');
  
  // Uniswap V3 Router ABI (只需要 exactInputSingle)
  const uniswapV3Abi = [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
  ];
  
  const router = new ethers.Contract(UNISWAP_V3_ROUTER, uniswapV3Abi, provider);
  
  const amountIn = ethers.parseEther('0.01'); // 0.01 ETH
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
  
  // Uniswap V3 的 exactInputSingle 参数
  const params = {
    tokenIn: WETH,
    tokenOut: USDT,
    fee: 3000,              // 0.3% fee tier
    recipient: contractAddress,  // 接收地址是合约
    deadline: deadline,
    amountIn: amountIn,
    amountOutMinimum: 0,    // 为了测试，设置为 0
    sqrtPriceLimitX96: 0    // 无价格限制
  };
  
  console.log('Swap params:');
  console.log('  Token in: WETH');
  console.log('  Token out: USDT');
  console.log('  Amount in:', ethers.formatEther(amountIn), 'ETH');
  console.log('  Fee tier: 0.3%');
  console.log('  Recipient:', params.recipient);
  console.log('');
  
  // 编码函数调用
  const callData = router.interface.encodeFunctionData('exactInputSingle', [params]);
  
  console.log('Testing static call from contract address...\n');
  
  try {
    // 注意：Uniswap V3 需要先将 ETH wrap 成 WETH
    // 但为了测试，我们假设合约已经有 WETH
    
    // 这个测试会失败，因为合约没有 WETH 余额
    // 但如果失败原因是 "余额不足" 而不是 "拒绝合约调用"，那就证明了可行性
    
    await provider.call({
      to: UNISWAP_V3_ROUTER,
      data: callData,
      from: contractAddress,
      gasLimit: 3000000
    });
    
    console.log('✅ Unexpected success! (Contract might have WETH balance)');
    
  } catch (error) {
    console.log('Error:', error.message);
    
    // 分析错误类型
    if (error.message.includes('STF') || 
        error.message.includes('insufficient') ||
        error.message.includes('balance')) {
      console.log('\n✅ GOOD NEWS!');
      console.log('═══════════════════════════════════════════════════');
      console.log('Error is about insufficient balance, NOT contract restriction!');
      console.log('This proves that Uniswap V3 DOES accept contract calls.');
      console.log('\nThe issue with OKX is likely:');
      console.log('  1. Complex multi-hop routes using problematic DEXs');
      console.log('  2. Amount too small for certain routes');
      console.log('  3. Need to use simpler routes (Uniswap only)');
      console.log('═══════════════════════════════════════════════════\n');
    } else if (error.message.includes('revert') || error.message.includes('denied')) {
      console.log('\n❌ BAD NEWS');
      console.log('═══════════════════════════════════════════════════');
      console.log('Uniswap V3 might be rejecting contract calls');
      console.log('This is unusual and needs further investigation');
      console.log('═══════════════════════════════════════════════════\n');
    } else {
      console.log('\n⚠️  Unknown error type');
      console.log('Need to investigate further\n');
    }
  }
  
  // 测试 2: 从 EOA 调用（应该也会因为余额不足失败）
  console.log('\n=== Comparison: Call from EOA ===\n');
  
  const wallet = new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider);
  
  try {
    await provider.call({
      to: UNISWAP_V3_ROUTER,
      data: callData,
      from: wallet.address,
      gasLimit: 3000000
    });
    
    console.log('✅ EOA call succeeded');
    
  } catch (error) {
    console.log('EOA Error:', error.message);
    console.log('(Same type of error = contract and EOA treated equally)\n');
  }
  
  console.log('\n=== Recommendations ===');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n1. INCREASE SWAP AMOUNT');
  console.log('   → Use at least 0.01 ETH ($28) or more');
  console.log('   → Small amounts have limited routing options');
  
  console.log('\n2. EXCLUDE PROBLEMATIC DEXS');
  console.log('   → excludeDexIds: "2,6" (Curve, Balancer)');
  console.log('   → Or use dexIds: "1,3,5" (Uniswap V2, V3, Sushiswap)');
  
  console.log('\n3. CORRECT API PARAMETERS');
  console.log('   → userWalletAddress: YOUR_CONTRACT_ADDRESS');
  console.log('   → swapReceiverAddress: YOUR_CONTRACT_ADDRESS');
  
  console.log('\n4. ALTERNATIVE: USE DIRECT UNISWAP V3');
  console.log('   → If OKX keeps failing, call Uniswap V3 directly');
  console.log('   → Your contract wraps ETH → WETH → swap → unwrap');
  
  console.log('\n5. CONSIDER OTHER AGGREGATORS');
  console.log('   → 1inch: Better for contract integration');
  console.log('   → ParaSwap: Supports contract receivers');
  console.log('   → Cowswap: Intent-based, contract-friendly');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

testUniswapV3Direct().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});