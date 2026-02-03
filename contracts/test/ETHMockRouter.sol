contract ETHMockRouter {
    fallback(bytes calldata) external payable returns (bytes memory) {
        // 可以转账ETH
        payable(msg.sender).transfer(1 ether);
        return abi.encode(1 ether);
    }
}