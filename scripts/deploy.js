// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Governance parameters
  const minDelay = 2 * 24 * 60 * 60; // 2 days in seconds
  const proposers = []; // Will set to governor later
  const executors = [ethers.ZeroAddress]; // Anyone can execute after delay
  const admin = deployer.address; // Temporary admin

  // Deploy CharityGovToken
  const CharityGovToken = await ethers.getContractFactory("CharityGovToken");
  const govToken = await CharityGovToken.deploy(deployer.address);
  await govToken.waitForDeployment();
  const govTokenAddress = await govToken.getAddress();
  console.log("CharityGovToken deployed to:", govTokenAddress);

  // Deploy CharityTimelock
  const CharityTimelock = await ethers.getContractFactory("CharityTimelock");
  const timelock = await CharityTimelock.deploy(minDelay, proposers, executors, admin);
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("CharityTimelock deployed to:", timelockAddress);

  // Deploy CharityGovernor
  const CharityGovernor = await ethers.getContractFactory("CharityGovernor");
  const governor = await CharityGovernor.deploy(govTokenAddress, timelockAddress);
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("CharityGovernor deployed to:", governorAddress);

  // Configure Timelock roles
  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
  await timelock.grantRole(proposerRole, governorAddress);
  await timelock.grantRole(executorRole, ethers.ZeroAddress);
  await timelock.grantRole(adminRole, timelockAddress); // Self-administer
  await timelock.revokeRole(adminRole, deployer.address);
  console.log("Timelock roles configured");

  // Deploy Oracles and other contracts, passing governorAddress as _governance
  const ReputationOracleMock = await ethers.getContractFactory("ReputationOracleMock");
  const repOracle = await ReputationOracleMock.deploy(governorAddress, govTokenAddress);
  await repOracle.waitForDeployment();
  const repOracleAddress = await repOracle.getAddress();
  console.log("ReputationOracleMock deployed to:", repOracleAddress);

  const MilestoneOracleMock = await ethers.getContractFactory("MilestoneOracleMock");
  const milestoneOracle = await MilestoneOracleMock.deploy(governorAddress);
  await milestoneOracle.waitForDeployment();
  const milestoneOracleAddress = await milestoneOracle.getAddress();
  console.log("MilestoneOracleMock deployed to:", milestoneOracleAddress);

  const NGOOracleMock = await ethers.getContractFactory("NGOOracleMock");
  const ngoOracle = await NGOOracleMock.deploy(governorAddress);
  await ngoOracle.waitForDeployment();
  const ngoOracleAddress = await ngoOracle.getAddress();
  console.log("NGOOracleMock deployed to:", ngoOracleAddress);

  const ProjectRegistry = await ethers.getContractFactory("ProjectRegistry");
  const projectRegistry = await ProjectRegistry.deploy(governorAddress, ngoOracleAddress, milestoneOracleAddress);
  await projectRegistry.waitForDeployment();
  const projectRegistryAddress = await projectRegistry.getAddress();
  console.log("ProjectRegistry deployed to:", projectRegistryAddress);

  const RoundManager = await ethers.getContractFactory("RoundManager");
  const roundManager = await RoundManager.deploy(governorAddress, repOracleAddress);
  await roundManager.waitForDeployment();
  const roundManagerAddress = await roundManager.getAddress();
  console.log("RoundManager deployed to:", roundManagerAddress);

  // Deploy Treasury
  const reserve = deployer.address; // For testing; in prod, set a multisig or DAO-controlled address
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(governorAddress, roundManagerAddress, milestoneOracleAddress, projectRegistryAddress, reserve);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("Treasury deployed to:", treasuryAddress);

  // Verify governance control (optional, for logging)
  console.log("Verifying governance setup...");
  console.log("Timelock in Governor:", await governor.timelock());
  console.log("Governance in Treasury:", await treasury.governance());

  console.log("Deployment complete! Contracts are under timelock control.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
  