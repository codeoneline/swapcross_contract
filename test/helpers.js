// test/helpers.js
const { ethers } = require("hardhat");

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

async function getBalance(token, address) {
    if (token === NATIVE_TOKEN) {
        return ethers.provider.getBalance(address);
    } else {
        const contract = await ethers.getContractAt("IERC20", token);
        return contract.balanceOf(address);
    }
}

async function setBalance(token, address, amount) {
    // 仅用于测试的辅助函数，实际需要impersonate或者使用mint
    if (token !== NATIVE_TOKEN) {
        const contract = await ethers.getContractAt("IERC20", token);
        // 假设测试代币有mint功能
        if (contract.mint) {
            await contract.mint(address, amount);
        }
    }
}

async function approveToken(token, owner, spender, amount) {
    if (token !== NATIVE_TOKEN) {
        const contract = await ethers.getContractAt("IERC20", token);
        await contract.connect(owner).approve(spender, amount);
    }
}

function encodeRecipient(address) {
    // 将地址编码为bytes，去除0x前缀
    return ethers.AbiCoder.defaultAbiCoder().encode(["address"], [address]);
}

function getRevertMessage(error) {
    if (error.message.includes("Swap failed")) {
        return "SwapFailed";
    } else if (error.message.includes("Insufficient output amount")) {
        return "SlippageExceeded";
    } else if (error.message.includes("Insufficient ETH")) {
        return "InsufficientETH";
    }
    return error.message;
}

module.exports = {
    NATIVE_TOKEN,
    getBalance,
    setBalance,
    approveToken,
    encodeRecipient,
    getRevertMessage
};