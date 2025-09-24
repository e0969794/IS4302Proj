const { ethers } = require("hardhat");

async function main() {
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Define initial parameters
    const initialMintRate = ethers.parseEther("1"); // 1 GOV token per 1 ETH

    // Deploy the GovernanceToken
    console.log("Deploying GovernanceToken...");
    const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
    const governanceToken = await GovernanceToken.deploy(deployer.address);
    await governanceToken.waitForDeployment();
    console.log("GovernanceToken contract deployed to:", governanceToken.target);

    // Deploy Treasury
    console.log("Deploying Treasury...");
    const TreasuryFactory = await ethers.getContractFactory("Treasury");
    const treasury = await TreasuryFactory.deploy(
        deployer.address, // Admin address
        governanceToken.target, // GovernanceToken address
        initialMintRate
    );
    await treasury.waitForDeployment();
    console.log("Treasury deployed to:", treasury.target);

    // Grant MINTER_ROLE to Treasury
    console.log("Granting MINTER_ROLE to Treasury...");
    const MINTER_ROLE = await governanceToken.MINTER_ROLE();
    await governanceToken.connect(deployer).grantRole(MINTER_ROLE, treasury.target);
    console.log("MINTER_ROLE granted to Treasury");

    // Verify setup
    console.log("Verifying setup...");
    const isMinter = await governanceToken.hasRole(MINTER_ROLE, treasury.target);
    const isAdmin = await governanceToken.hasRole(await governanceToken.DEFAULT_ADMIN_ROLE(), deployer.address);
    const treasuryAdmin = await treasury.hasRole(await treasury.DAO_ADMIN(), deployer.address);
    console.log("Treasury has MINTER_ROLE:", isMinter);
    console.log("Deployer is GovernanceToken admin:", isAdmin);
    console.log("Deployer is Treasury admin:", treasuryAdmin);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
