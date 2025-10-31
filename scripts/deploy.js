const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const ENV_PATH = path.join(process.cwd(), "./charity-dao/.env");

function updateEnv(vars) {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    const lines = content.split(/\r?\n/).filter(Boolean);
    const map = {};
    for (const line of lines) {
        const idx = line.indexOf("=");
        if (idx > 0) map[line.slice(0, idx)] = line.slice(idx + 1);
    }
    for (const [k, v] of Object.entries(vars)) map[k] = v;
    const out = Object.entries(map)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
    fs.writeFileSync(ENV_PATH, out + "\n");
    console.log("Updated .env with new addresses.");
}

async function main() {
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Define initial parameters
    const initialMintRate = ethers.parseEther("1"); // 1 GOV token per 1 ETH
    const numNGOs = 3; // Number of NGO wallets to generate
    const ethToSend = ethers.parseEther("100"); // 100 ETH per NGO wallet
    const ngoDetails = [
        "Red Cross International - Humanitarian aid and disaster relief",
        "Save the Children - Education and health programs for children",
        "World Wildlife Fund - Environmental conservation and research"
    ];

    // Deploy the GovernanceToken
    console.log("Deploying GovernanceToken...");
    const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
    const governanceToken = await GovernanceToken.deploy(deployer.address);
    await governanceToken.waitForDeployment();

    // Deploy Treasury
    console.log("Deploying Treasury...");
    const TreasuryFactory = await ethers.getContractFactory("Treasury");
    const treasury = await TreasuryFactory.deploy(
        deployer.address, // Admin address
        await governanceToken.getAddress(), // GovernanceToken address
        initialMintRate
    );
    await treasury.waitForDeployment();

    // Grant TREASURY_ROLE to Treasury
    console.log("Granting TREASURY_ROLE to Treasury...");
    const TREASURY_ROLE = await governanceToken.TREASURY_ROLE();
    await governanceToken.connect(deployer).grantRole(TREASURY_ROLE, await treasury.getAddress());
    console.log("TREASURY_ROLE granted to Treasury");

    // Generate random NGO wallets
    console.log(`Generating ${numNGOs} NGO wallets...`);
    const ngoWallets = [];
    for (let i = 0; i < numNGOs; i++) {
        const wallet = ethers.Wallet.createRandom();
        ngoWallets.push({
            address: wallet.address,
            privateKey: wallet.privateKey
        });
    }

    // Send ETH to each NGO wallet
    console.log(`Sending ${ethers.formatEther(ethToSend)} ETH to each NGO wallet...`);
    for (let i = 0; i < ngoWallets.length; i++) {
        const wallet = ngoWallets[i];
        const tx = await deployer.sendTransaction({
            to: wallet.address,
            value: ethToSend
        });
        await tx.wait();
        console.log(`Sent ${ethers.formatEther(ethToSend)} ETH to NGO ${i + 1} (${wallet.address}), tx hash: ${tx.hash}`);
        const balance = await ethers.provider.getBalance(wallet.address);
    }

    // Deploy NGOOracle
    console.log("Deploying NGOOracle...");
    const NGOOracle = await ethers.getContractFactory("NGOOracle");
    const ngoAddresses = ngoWallets.map(wallet => wallet.address);
    const ngoOracle = await NGOOracle.deploy(ngoAddresses, ngoDetails.slice(0, numNGOs));
    await ngoOracle.waitForDeployment();

    // Deploy ProposalManager
    console.log("Deploying ProposalManager...");
    const ProposalManager = await ethers.getContractFactory("ProposalManager");
    const proposalManager = await ProposalManager.deploy();
    await proposalManager.waitForDeployment();

    // Deploy VotingManager
    console.log("Deploying VotingManager...");
    const VotingManager = await ethers.getContractFactory("VotingManager");
    const votingManager = await VotingManager.deploy(
        deployer.address, // Admin address
        await proposalManager.getAddress(), // ProposalManager address
        await treasury.getAddress() // Treasury address
    );
    await votingManager.waitForDeployment();

    // Grant BURNER_ROLE to VotingManager so it can burn tokens when users vote
    console.log("Granting BURNER_ROLE to VotingManager...");
    const BURNER_ROLE = await treasury.BURNER_ROLE();
    await treasury.connect(deployer).grantRole(BURNER_ROLE, await votingManager.getAddress());
    console.log("BURNER_ROLE granted to VotingManager");

    // Grant DISBURSER_ROLE to VotingManager so it can disburse milestone funds
    console.log("Granting DISBURSER_ROLE to VotingManager...");
    const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
    await treasury.connect(deployer).grantRole(DISBURSER_ROLE, await votingManager.getAddress());
    console.log("DISBURSER_ROLE granted to VotingManager");

    // Verify setup
    console.log("Verifying setup...");
    const isMinter = await governanceToken.hasRole(TREASURY_ROLE, await treasury.getAddress());
    const isAdmin = await governanceToken.hasRole(await governanceToken.DEFAULT_ADMIN_ROLE(), await deployer.getAddress());
    const treasuryAdmin = await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), deployer.address);
    const isBurner = await treasury.hasRole(BURNER_ROLE, await votingManager.getAddress());
    const isDisburser = await treasury.hasRole(DISBURSER_ROLE, await votingManager.getAddress());
    console.log("Treasury has TREASURY_ROLE:", isMinter);
    console.log("Deployer is GovernanceToken admin:", isAdmin);
    console.log("Deployer is Treasury admin:", treasuryAdmin);
    console.log("VotingManager has BURNER_ROLE:", isBurner);
    console.log("VotingManager has DISBURSER_ROLE:", isDisburser);

    console.log("All contracts deployed successfully.");
    console.log("GovToken:", await governanceToken.getAddress());
    console.log("Treasury:", await treasury.getAddress());
    console.log("NGO Oracle:", await ngoOracle.getAddress());
    console.log("ProposalManager:", await proposalManager.getAddress());
    console.log("VotingManager:", await votingManager.getAddress());
    console.log("NGO Wallets:");
    ngoWallets.forEach((wallet, index) => {
        console.log(`NGO ${index + 1}: Address=${wallet.address}, Private Key=${wallet.privateKey}, Balance=${ethers.formatEther(ethToSend)} ETH`);
    });

    // Write .env for frontend
    updateEnv({
        VITE_GOVTOKEN_ADDRESS: await governanceToken.getAddress(),
        VITE_TREASURY_ADDRESS: await treasury.getAddress(),
        VITE_NGO_ORACLE_ADDRESS: await ngoOracle.getAddress(),
        VITE_PROPOSAL_MANAGER_ADDRESS: await proposalManager.getAddress(),
        VITE_VOTING_MANAGER_ADDRESS: await votingManager.getAddress(),
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
