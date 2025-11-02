const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

function getEnv() {
    if (fs.existsSync(ENV_PATH)) {
        const content = fs.readFileSync(ENV_PATH, "utf8");
        const lines = content.split(/\r?\n/).filter(
            line => line.trim() && !line.startsWith('#'));
        
        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            if (key) {
                const value = valueParts.join('=').trim().replace(/"/g, '');
                envVars[key.trim()] = value;
            }
        }
        // console.log("Loaded .env vars:", Object.keys(envVars));
    } else {
        console.log("Creating new .env at:", ENV_PATH);
    }
}

function updateEnv(vars) {
    const existingVars = { ...envVars };
    for (const [k, v] of Object.entries(vars)) {
        existingVars[k] = v;
    }
    const out = Object.entries(existingVars)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
    fs.writeFileSync(ENV_PATH, out + "\n");
    console.log("Updated .env with new addresses.");
}

async function main() {
    const CONFIG_PATH = path.join(process.cwd(), "./charity-dao/config.json");

    // Read existing config.json if present
    let existingConfig = {};
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            existingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        } catch (err) {
            console.warn("Could not parse existing config.json, starting fresh:", err);
        }
    }

    // Prepare immutable fields (Pinata + IPFS) — load from defaults
    const staticFields = {
        NGO_IPFS_URL: existingConfig.NGO_IPFS_URL,
        Pinata_API_Key: existingConfig.Pinata_API_Key,
        Pinata_Secret_Key: existingConfig.Pinata_Secret_Key,
        Pinata_Group_ID: existingConfig.Pinata_Group_ID
    };

    // Wallets and Signers
    const wallets = {
        admin: null,
        donor: [],
        ngo: []
    };
    const ngoDetails = [
        "Red Cross International - Humanitarian aid and disaster relief",
        "Save the Children - Education and health programs for children",
        "World Wildlife Fund - Environmental conservation and research",
        "Global Health Corps - Improving healthcare access in underserved regions"
    ];
    const IpfsURL = staticFields.NGO_IPFS_URL || "ipfs://abcd";
    const numNGOs = ngoDetails.length; // Number of NGO wallets to generate

    // Set up wallets
    const accounts = await ethers.getSigners();
    wallets.admin = accounts[0]; // Deployer/admin
    wallets.donor = [accounts[1], accounts[2], accounts[3]]; // Donors
    wallets.ngo = []; // Initialize ngo array

    // Ensure enough accounts
    if (accounts.length < numNGOs + 1 + wallets.donor.length) {
        throw new Error(`Not enough accounts. Required: 
            ${numNGOs + 1 + wallets.donor.length}, Available: ${accounts.length}`);
    }

    // Derive private keys for NGOs
    const mnemonic = "test test test test test test test test test test test junk";
    const rootWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, "", "m/44'/60'/0'/0");
    // Using standard hardhat accounts for NGOs
    for (let i = wallets.donor.length + 1; i <= numNGOs + wallets.donor.length; i++) {
        const path = `${i}`;
        const wallet = rootWallet.derivePath(path);

        if (wallet.address.toLowerCase() !== accounts[i].address.toLowerCase()) {
            throw new Error(`Address mismatch for account ${i}: 
                expected ${accounts[i].address}, got ${wallet.address}`);
        }
        wallets.ngo.push({
            signer: accounts[i], // Start from accounts[3]
            privateKey: wallet.privateKey
        });
    }

    // Define initial parameters
    const initialMintRate = ethers.parseEther("1"); // 1 GOV token per 1 ETH
    const ethToSend = ethers.parseEther("100"); // 100 ETH per NGO wallet

    // Deploy the GovernanceToken
    console.log("Deploying GovernanceToken...");
    const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
    const governanceToken = await GovernanceToken.deploy(wallets.admin.address);
    await governanceToken.waitForDeployment();

    // Deploy Treasury
    console.log("Deploying Treasury...");
    const TreasuryFactory = await ethers.getContractFactory("Treasury");
    const treasury = await TreasuryFactory.deploy(
        wallets.admin.address, // Admin address
        await governanceToken.getAddress(), // GovernanceToken address
        initialMintRate
    );
    await treasury.waitForDeployment();

    // Grant TREASURY_ROLE to Treasury
    console.log("Granting TREASURY_ROLE to Treasury...");
    const TREASURY_ROLE = await governanceToken.TREASURY_ROLE();
    await governanceToken.connect(wallets.admin).grantRole(TREASURY_ROLE, await treasury.getAddress());
    console.log("TREASURY_ROLE granted to Treasury");

    // Send ETH to each NGO wallet
    console.log(`Sending ${ethers.formatEther(ethToSend)} ETH to each NGO wallet...`);
    for (let i = 0; i < wallets.ngo.length; i++) {
        const wallet = wallets.ngo[i];
        const tx = await wallets.admin.sendTransaction({
            to: wallet.signer.address,
            value: ethToSend
        });
        await tx.wait();
        console.log(`Sent ${ethers.formatEther(ethToSend)} ETH to NGO ${i + 1} (${wallet.signer.address}), tx hash: ${tx.hash}`);
        // const balance = await ethers.provider.getBalance(wallet.signer.address);
    }

    // Deploy NGOOracle with IPFS URL
    // Note that the last NGO is unverified
    console.log("Deploying NGOOracle...");
    const ngoAddresses = wallets.ngo.slice(0, numNGOs - 1).map((w) => w.signer.address);
    const NGOOracle = await ethers.getContractFactory("NGOOracle");
    const ngoOracle = await NGOOracle.deploy(ngoAddresses, IpfsURL);
    await ngoOracle.waitForDeployment();

    // Deploy ProposalManager
    console.log("Deploying ProposalManager...");
    const ProposalManager = await ethers.getContractFactory("ProposalManager");
    const proposalManager = await ProposalManager.deploy();
    await proposalManager.waitForDeployment();

    // Deploy ProofOracle
    console.log("Deploying ProofOracle...");
    const ProofOracle = await ethers.getContractFactory("ProofOracle");
    const proofOracle = await ProofOracle.deploy(proposalManager.target, ngoOracle.target);
    await proofOracle.waitForDeployment();
    await proposalManager.connect(wallets.admin).setProofOracle(proofOracle.target);

    // Deploy VotingManager
    console.log("Deploying VotingManager...");
    const VotingManager = await ethers.getContractFactory("VotingManager");
    const votingManager = await VotingManager.deploy(
        wallets.admin.address, // Admin address
        await proposalManager.getAddress(), // ProposalManager address
        await treasury.getAddress() // Treasury address
    );
    await votingManager.waitForDeployment();

    // Grant BURNER_ROLE to VotingManager so it can burn tokens when users vote
    console.log("Granting BURNER_ROLE to VotingManager...");
    const BURNER_ROLE = await treasury.BURNER_ROLE();
    await treasury.connect(wallets.admin).grantRole(BURNER_ROLE, await votingManager.getAddress());
    console.log("BURNER_ROLE granted to VotingManager");

    // Grant DISBURSER_ROLE to VotingManager so it can disburse milestone funds
    console.log("Granting DISBURSER_ROLE to VotingManager...");
    const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
    await treasury.connect(wallets.admin).grantRole(DISBURSER_ROLE, await votingManager.getAddress());
    console.log("DISBURSER_ROLE granted to VotingManager");

    // Create proposal
    const ngo1 = proposalManager.connect(wallets.ngo[0].signer);
    const milestonesDesc = ["Build school", "Purchase books"];
    const milestonesAmt = [ethers.parseEther("6"), ethers.parseEther("8")];

    const tx = await ngo1.createProposal(milestonesDesc, milestonesAmt);
    const receipt = await tx.wait();

    // Parse ProposalCreated event
    const event = receipt.logs
    .map(log => {
        try { return proposalManager.interface.parseLog(log); }
        catch { return null; }
    })
    .find(e => e && e.name === 'ProposalCreated');

    // Verify setup
    console.log("Verifying setup...");
    const isMinter = await governanceToken.hasRole(TREASURY_ROLE, await treasury.getAddress());
    const isAdmin = await governanceToken.hasRole(await governanceToken.DEFAULT_ADMIN_ROLE(), await wallets.admin.address);
    const treasuryAdmin = await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), wallets.admin.address);
    const isBurner = await treasury.hasRole(BURNER_ROLE, await votingManager.getAddress());
    const isDisburser = await treasury.hasRole(DISBURSER_ROLE, await votingManager.getAddress());
    const NGOAdmin = await ngoOracle.hasRole(await ngoOracle.DEFAULT_ADMIN_ROLE(), await wallets.admin.address)
    const ProofAdmin = await proofOracle.hasRole(await proofOracle.DEFAULT_ADMIN_ROLE(), await wallets.admin.address)

    console.log("Treasury has TREASURY_ROLE:", isMinter);
    console.log("Deployer is GovernanceToken admin:", isAdmin);
    console.log("Deployer is Treasury admin:", treasuryAdmin);
    console.log("VotingManager has BURNER_ROLE:", isBurner);
    console.log("VotingManager has DISBURSER_ROLE:", isDisburser);
    console.log("Deployer is NGO Oracle admin:", NGOAdmin);
    console.log("Deployer is Proof Oracle admin:", ProofAdmin);

    console.log("All contracts deployed successfully.");
    console.log("GovToken:", await governanceToken.getAddress());
    console.log("Treasury:", await treasury.getAddress());
    console.log("NGO Oracle:", await ngoOracle.getAddress());
    console.log("ProposalManager:", await proposalManager.getAddress());
    console.log("Proof Oracle:", await proofOracle.getAddress());
    console.log("VotingManager:", await votingManager.getAddress());

    console.log(`Deployer: ${wallets.admin.address}`);
    console.log(`Donors: ${wallets.donor.map(d => d.address).join(", ")}`);
    wallets.ngo.forEach((w, i) => {
        console.log(`NGO ${i + 1}: Address=${w.signer.address}, PrivateKey=${w.privateKey}`);
    });
    console.log("NGO IPFS:", IpfsURL);

    // Prepare updated contract addresses
    const addressFields = {
        GovernanceToken: await governanceToken.getAddress(),
        Treasury: await treasury.getAddress(),
        NGOOracle: await ngoOracle.getAddress(),
        ProposalManager: await proposalManager.getAddress(),
        ProofOracle: await proofOracle.getAddress(),
        VotingManager: await votingManager.getAddress()
    };

    // Merge together (immutable + dynamic)
    const newConfig = {
        ...staticFields,
        ...addressFields,
        updatedAt: new Date().toISOString()
    };
    
    // Write final JSON
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    console.log("Wrote new addresses to:", CONFIG_PATH);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
