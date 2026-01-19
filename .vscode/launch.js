module.exports = {
  // 使用 IntelliSense 了解相关属性。 
  // 悬停以查看现有属性的描述。
  // 欲了解更多信息，请访问: https://go.microsoft.com/fwlink/?linkid=830387
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "run testSwapCross",
      "skipFiles": [
        "<node_internals>/**"
      ],
      "program": "${workspaceFolder}/run/testSwapCross.js"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "testCross",
      "skipFiles": [
        "<node_internals>/**"
      ],
      "program": "${workspaceFolder}/run/testCross.js"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "run testSwapCross",
      "skipFiles": [
        "<node_internals>/**"
      ],
      "program": "${workspaceFolder}/run/testSwapCross.js"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "run testLock",
      "skipFiles": [
        "<node_internals>/**"
      ],
      "program": "${workspaceFolder}/run/testLock.js"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Deploy SwapCross to Ethereum",
      "runtimeExecutable": "npx",
      "runtimeArgs": [
        "hardhat"
      ],
      "args": [
        "ignition",
        "deploy",
        "./ignition/modules/SwapCross.js",
        "--network",
        "ethereum",
        "--parameters",
        "{\"SwapCrossModule\":{\"network\":\"ethereum\"}}"
      ],
      "console": "integratedTerminal",
      "skipFiles": [
        "<node_internals>/**"
      ]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "test cmc_crypto local",
      "skipFiles": [
        "<node_internals>/**"
      ],
      "runtimeArgs": ["-r", "dotenv/config"],
      "cwd": "${workspaceRoot}",
			"stopOnEntry": false,
			"runtimeExecutable": null,
			"env": { "NODE_ENV": "develop"},
      "program": "${workspaceFolder}/node_modules/.bin/_mocha",
      "args": ["./test/cmc_crypto_test.js", "dotenv_config_path=.env.local"]
    }
  ]
}