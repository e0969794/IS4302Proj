const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying EmergencyFundDAO...");

  // Get the ContractFactory and Signers
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const EmergencyFundDAO = await ethers.getContractFactory("EmergencyFundDAO");
  const dao = await EmergencyFundDAO.deploy();

  await dao.waitForDeployment();

  console.log("EmergencyFundDAO deployed to:", await dao.getAddress());
  
  // Display contract information
  console.log("\n--- Contract Information ---");
  console.log("Min Contribution:", ethers.formatEther(await dao.MIN_CONTRIBUTION()), "ETH");
  console.log("Voting Period:", (await dao.VOTING_PERIOD()).toString(), "seconds");
  console.log("Quorum Percentage:", (await dao.QUORUM_PERCENTAGE()).toString(), "%");
  console.log("Approval Threshold:", (await dao.APPROVAL_THRESHOLD()).toString(), "%");
  
  const stats = await dao.getDAOStats();
  console.log("\n--- Initial DAO Stats ---");
  console.log("Total Fund:", ethers.formatEther(stats[0]), "ETH");
  console.log("Total Members:", stats[1].toString());
  console.log("Proposal Count:", stats[2].toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });