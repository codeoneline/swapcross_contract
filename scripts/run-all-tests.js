#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const testFiles = [
  'test/00_deployment.test.js',
  'test/01_basic_functions.test.js',
  'test/02_upgradeability.test.js',
  'test/02b_uups_upgrade.test.js',
  'test/03_swap_integration.test.js',
];

async function runTest(file) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 开始测试: ${file}`);
    console.log('='.repeat(50));

    const startTime = Date.now();
    
    const child = exec(`npx hardhat test ${file} --no-compile`, (error, stdout, stderr) => {
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      if (error) {
        console.log(`❌ ${file} 测试失败 (${duration}s)`);
        console.error(stderr);
        reject(error);
      } else {
        console.log(`✅ ${file} 测试通过 (${duration}s)`);
        console.log(stdout);
        resolve();
      }
    });
  });
}

async function runAllTests() {
  console.log('🎯 开始运行所有测试');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  for (const file of testFiles) {
    if (fs.existsSync(file)) {
      try {
        await runTest(file);
        passed++;
      } catch (error) {
        failed++;
        console.error(`测试失败: ${error.message}`);
      }
    } else {
      console.log(`⚠️  文件不存在: ${file}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果汇总:');
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📁 总计: ${testFiles.length}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过!');
  }
}

// 运行测试
runAllTests().catch(console.error);