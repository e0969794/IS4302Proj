require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 31337, // Default chain ID for Hardhat Network
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337, // Chain ID for your local network
    },
  }
};
