const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

function getEnv() {
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, "utf8");
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.startsWith("#"));

    for (const line of lines) {
      const [key, ...valueParts] = line.split("=");
      if (key) {
        const value = valueParts.join("=").trim().replace(/"/g, "");
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
      console.warn(
        "Could not parse existing config.json, starting fresh:",
        err
      );
    }
  }

  // Prepare immutable fields (Pinata + IPFS) — load from defaults
  const staticFields = {
    NGO_IPFS_URL: existingConfig.NGO_IPFS_URL,
    Pinata_API_Key: existingConfig.Pinata_API_Key,
    Pinata_Secret_Key: existingConfig.Pinata_Secret_Key,
    Pinata_Group_ID: existingConfig.Pinata_Group_ID,
  };

  // Wallets and Signers
  const wallets = {
    admin: null,
    donor: [],
    ngo: [],
  };
  const ngoDetails = [
    "Red Cross International - Humanitarian aid and disaster relief",
    "Save the Children - Education and health programs for children",
    "World Wildlife Fund - Environmental conservation and research",
    "Global Health Corps - Improving healthcare access in underserved regions",
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
            ${numNGOs + 1 + wallets.donor.length}, Available: ${
      accounts.length
    }`);
  }

  // Derive private keys for NGOs
  const mnemonic =
    "test test test test test test test test test test test junk";
  const rootWallet = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    "",
    "m/44'/60'/0'/0"
  );
  // Using standard hardhat accounts for NGOs
  for (
    let i = wallets.donor.length + 1;
    i <= numNGOs + wallets.donor.length;
    i++
  ) {
    const path = `${i}`;
    const wallet = rootWallet.derivePath(path);

    if (wallet.address.toLowerCase() !== accounts[i].address.toLowerCase()) {
      throw new Error(`Address mismatch for account ${i}: 
                expected ${accounts[i].address}, got ${wallet.address}`);
    }
    wallets.ngo.push({
      signer: accounts[i], // Start from accounts[3]
      privateKey: wallet.privateKey,
    });
  }

  // Define initial parameters
  const initialMintRate = ethers.parseEther("1000"); // 1 GOV token per 1 ETH
  const ethToSend = ethers.parseEther("100"); // 100 ETH per NGO wallet

  // Deploy the GovernanceToken
  console.log("Deploying GovernanceToken...");
  const GovernanceToken = await hre.ethers.getContractFactory(
    "GovernanceToken"
  );
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
  await governanceToken
    .connect(wallets.admin)
    .grantRole(TREASURY_ROLE, await treasury.getAddress());
  console.log("TREASURY_ROLE granted to Treasury");

  // Send ETH to each NGO wallet
  console.log(
    `Sending ${ethers.formatEther(ethToSend)} ETH to each NGO wallet...`
  );
  for (let i = 0; i < wallets.ngo.length; i++) {
    const wallet = wallets.ngo[i];
    const tx = await wallets.admin.sendTransaction({
      to: wallet.signer.address,
      value: ethToSend,
    });
    await tx.wait();
    console.log(
      `Sent ${ethers.formatEther(ethToSend)} ETH to NGO ${i + 1} (${
        wallet.signer.address
      }), tx hash: ${tx.hash}`
    );
    // const balance = await ethers.provider.getBalance(wallet.signer.address);
  }

  // Deploy NGOOracle with IPFS URL
  // Note that the last NGO is unverified
  console.log("Deploying NGOOracle...");
  const ngoAddresses = wallets.ngo
    .slice(0, numNGOs - 1)
    .map((w) => w.signer.address);
  const NGOOracle = await ethers.getContractFactory("NGOOracle");
  const ngoOracle = await NGOOracle.deploy(ngoAddresses, IpfsURL);
  await ngoOracle.waitForDeployment();

  // Deploy ProposalManager
  console.log("Deploying ProposalManager...");
  const ProposalManager = await ethers.getContractFactory("ProposalManager");
  const proposalManager = await ProposalManager.deploy(
    await ngoOracle.getAddress()
  );
  await proposalManager.waitForDeployment();

  // Deploy ProofOracle
  console.log("Deploying ProofOracle...");
  const ProofOracle = await ethers.getContractFactory("ProofOracle");
  const proofOracle = await ProofOracle.deploy(
    proposalManager.target,
    ngoOracle.target
  );
  await proofOracle.waitForDeployment();
  await proposalManager
    .connect(wallets.admin)
    .setProofOracle(proofOracle.target);

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
  await treasury
    .connect(wallets.admin)
    .grantRole(BURNER_ROLE, await votingManager.getAddress());
  console.log("BURNER_ROLE granted to VotingManager");

  // Grant DISBURSER_ROLE to VotingManager so it can disburse milestone funds
  console.log("Granting DISBURSER_ROLE to VotingManager...");
  const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
  await treasury
    .connect(wallets.admin)
    .grantRole(DISBURSER_ROLE, await votingManager.getAddress());
  console.log("DISBURSER_ROLE granted to VotingManager");

  // Fund donors with ETH to get GOV tokens for reputation building
  console.log("Funding donors for reputation building...");
  for (let i = 0; i < wallets.donor.length; i++) {
    await treasury
      .connect(wallets.donor[i])
      .donateETH({ value: ethers.parseEther("50") });
    console.log(`Donor ${i + 1} (${wallets.donor[i].address}) donated 50 ETH`);
  }

  // Create multiple proposals for reputation building and demonstration
  console.log(
    "Creating proposals for reputation building and demonstration..."
  );
  const reputationProposals = [];
  const ngo1 = proposalManager.connect(wallets.ngo[0].signer);
  const ngo2 = proposalManager.connect(wallets.ngo[1].signer);
  const ngo3 = proposalManager.connect(wallets.ngo[2].signer);

  // Create 5 proposals for reputation building (needed for Tier 2: 4+ unique proposals)
  const proposalData = [
    { desc: ["Build school"], amt: [ethers.parseEther("3")], ngo: ngo1 },
    { desc: ["Purchase books"], amt: [ethers.parseEther("2")], ngo: ngo1 },
    { desc: ["Train teachers"], amt: [ethers.parseEther("4")], ngo: ngo2 },
    { desc: ["Build playground"], amt: [ethers.parseEther("5")], ngo: ngo2 },
    { desc: ["Community center"], amt: [ethers.parseEther("6")], ngo: ngo3 },
  ];

  for (let i = 0; i < proposalData.length; i++) {
    const { desc, amt, ngo } = proposalData[i];
    const tx = await ngo.createProposal(desc, amt);
    const receipt = await tx.wait();

    // Parse ProposalCreated event
    const event = receipt.logs
      .map((log) => {
        try {
          return proposalManager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "ProposalCreated");

    if (event) {
      reputationProposals.push(event.args.proposalId);
      console.log(`Created proposal ${event.args.proposalId}: ${desc[0]}`);
    }
  }

  // Build reputation for donors over time to achieve different tiers
  console.log("\nBuilding donor reputations...");

  // Helper function to advance time
  async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  }

  // Donor 0: Keep at Tier 0 (Base) - no votes
  console.log("Donor 0: Staying at Tier 0 (Base tier)");

  // Donor 1: Build to Tier 1
  // Requirements: 3+ sessions, 3+ proposals, 3+ days, ≤7×mintRate avg votes
  console.log("Building Donor 1 to Tier 1...");
  const voter1 = votingManager.connect(wallets.donor[1]);

  // Vote on 3 different proposals over 4+ days (ensuring 3+ days requirement)
  await voter1.vote(reputationProposals[0], 1); // Session 1, Proposal 1
  await advanceTime(2 * 24 * 60 * 60); // Advance 2 days

  await voter1.vote(reputationProposals[1], 1); // Session 2, Proposal 2
  await advanceTime(24 * 60 * 60); // Advance 1 day (total 3 days)

  await voter1.vote(reputationProposals[2], 1); // Session 3, Proposal 3
  await advanceTime(24 * 60 * 60); // Advance 1 day (total 4 days)

  console.log("Donor 1 built to Tier 1: 3 sessions, 3 proposals, 4+ days");

  // Donor 2: Build to Tier 2
  // Requirements: 5+ sessions, 4+ proposals, 7+ days, ≤5×mintRate avg votes
  console.log("Building Donor 2 to Tier 2...");
  const voter2 = votingManager.connect(wallets.donor[2]);

  // Vote on 4 different proposals over 8+ days with 5+ sessions (ensuring 7+ days requirement)
  await voter2.vote(reputationProposals[0], 1); // Session 1, Proposal 1
  await advanceTime(2 * 24 * 60 * 60); // Advance 2 days

  await voter2.vote(reputationProposals[1], 1); // Session 2, Proposal 2
  await advanceTime(2 * 24 * 60 * 60); // Advance 2 days (total 4 days)

  await voter2.vote(reputationProposals[2], 1); // Session 3, Proposal 3
  await advanceTime(2 * 24 * 60 * 60); // Advance 2 days (total 6 days)

  await voter2.vote(reputationProposals[3], 1); // Session 4, Proposal 4
  await advanceTime(2 * 24 * 60 * 60); // Advance 2 days (total 8 days)

  await voter2.vote(reputationProposals[0], 1); // Session 5, same proposal (total 5 sessions)

  console.log("Donor 2 built to Tier 2: 5 sessions, 4 proposals, 8+ days");

  // Verify final reputations
  console.log("\nFinal Reputation Status:");
  for (let i = 0; i < wallets.donor.length; i++) {
    const rep = await votingManager.getVoterReputation(
      wallets.donor[i].address
    );
    console.log(
      `Donor ${i} (${wallets.donor[i].address}): Tier ${rep.tier}, Sessions: ${rep.sessions}, Unique: ${rep.uniqueProposals}, Days: ${rep.daysActive}`
    );
  }

  // Create main demonstration proposals for each verified NGO
  console.log("\nCreating main demonstration proposals...");

  // NGO 1: Has milestone that passed vote threshold - awaiting proof submission
  console.log("Creating NGO 1 proposal (will reach milestone threshold)...");
  const ngo1MainDesc = ["Build water well", "Install water filtration system"];
  const ngo1MainAmt = [ethers.parseEther("0.1"), ethers.parseEther("0.2")]; // First milestone: 0.1 ETH (100 votes)

  const ngo1MainTx = await ngo1.createProposal(ngo1MainDesc, ngo1MainAmt);
  const ngo1MainReceipt = await ngo1MainTx.wait();

  const ngo1MainEvent = ngo1MainReceipt.logs
    .map((log) => {
      try {
        return proposalManager.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "ProposalCreated");

  let ngo1MainProposalId = null;
  if (ngo1MainEvent) {
    ngo1MainProposalId = ngo1MainEvent.args.proposalId;
    console.log(`NGO 1 main proposal created: ${ngo1MainProposalId}`);

    // Vote enough to reach first milestone (0.1 ETH = 100 votes needed with 1000:1 ratio)
    // Using manageable vote amounts: 50 + 30 + 25 = 105 votes (exceeds 100 milestone)
    console.log("Voting to reach NGO 1's first milestone (0.1 ETH target)...");
    const voter1 = votingManager.connect(wallets.donor[1]);
    await voter1.vote(ngo1MainProposalId, 50); // 50 votes (cost: 2500 tokens)

    const voter2 = votingManager.connect(wallets.donor[2]);
    await voter2.vote(ngo1MainProposalId, 30); // 30 votes (cost: ~900 tokens)

    const voter0 = votingManager.connect(wallets.donor[0]);
    await voter0.vote(ngo1MainProposalId, 25); // 25 votes (cost: ~625 tokens)

    // Total: 105 votes = 0.105 ETH > 0.1 ETH milestone threshold
    console.log(
      "NGO 1's first milestone reached (105 votes > 100 needed) - awaiting proof submission!"
    );
  }

  // NGO 2: Regular proposal with some votes but no milestones reached yet
  console.log("Creating NGO 2 proposal (active voting)...");
  const ngo2MainDesc = [
    "Medical supplies for rural clinic",
    "Training for healthcare workers",
  ];
  const ngo2MainAmt = [ethers.parseEther("0.08"), ethers.parseEther("0.15")]; // 80 and 150 votes needed

  const ngo2MainTx = await ngo2.createProposal(ngo2MainDesc, ngo2MainAmt);
  const ngo2MainReceipt = await ngo2MainTx.wait();

  const ngo2MainEvent = ngo2MainReceipt.logs
    .map((log) => {
      try {
        return proposalManager.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "ProposalCreated");

  let ngo2MainProposalId = null;
  if (ngo2MainEvent) {
    ngo2MainProposalId = ngo2MainEvent.args.proposalId;
    console.log(`NGO 2 main proposal created: ${ngo2MainProposalId}`);

    // Add some votes but not enough for milestone (need 80 votes, give 40)
    const voter0_ngo2 = votingManager.connect(wallets.donor[0]);
    await voter0_ngo2.vote(ngo2MainProposalId, 40); // 40 votes (need 80 for milestone)
    console.log("NGO 2 has 40 votes but needs 80 for first milestone");
  }

  // NGO 3: Another proposal with different progress
  console.log("Creating NGO 3 proposal (different voting pattern)...");
  const ngo3MainDesc = [
    "Educational books for school library",
    "Computer lab setup",
  ];
  const ngo3MainAmt = [ethers.parseEther("0.06"), ethers.parseEther("0.12")]; // 60 and 120 votes needed

  const ngo3MainTx = await ngo3.createProposal(ngo3MainDesc, ngo3MainAmt);
  const ngo3MainReceipt = await ngo3MainTx.wait();

  const ngo3MainEvent = ngo3MainReceipt.logs
    .map((log) => {
      try {
        return proposalManager.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "ProposalCreated");

  let ngo3MainProposalId = null;
  if (ngo3MainEvent) {
    ngo3MainProposalId = ngo3MainEvent.args.proposalId;
    console.log(`NGO 3 main proposal created: ${ngo3MainProposalId}`);

    // Add moderate votes (need 60 votes, give 35)
    const voter1_ngo3 = votingManager.connect(wallets.donor[1]);
    await voter1_ngo3.vote(ngo3MainProposalId, 35); // 35 votes (need 60 for milestone)
    console.log("NGO 3 has 35 votes but needs 60 for first milestone");
  }

  // Use NGO 1's main proposal as the primary demo proposal
  const mainEvent = ngo1MainEvent;

  // Verify setup
  console.log("Verifying setup...");
  const isMinter = await governanceToken.hasRole(
    TREASURY_ROLE,
    await treasury.getAddress()
  );
  const isAdmin = await governanceToken.hasRole(
    await governanceToken.DEFAULT_ADMIN_ROLE(),
    await wallets.admin.address
  );
  const treasuryAdmin = await treasury.hasRole(
    await treasury.DEFAULT_ADMIN_ROLE(),
    wallets.admin.address
  );
  const isBurner = await treasury.hasRole(
    BURNER_ROLE,
    await votingManager.getAddress()
  );
  const isDisburser = await treasury.hasRole(
    DISBURSER_ROLE,
    await votingManager.getAddress()
  );
  const NGOAdmin = await ngoOracle.hasRole(
    await ngoOracle.DEFAULT_ADMIN_ROLE(),
    await wallets.admin.address
  );
  const ProofAdmin = await proofOracle.hasRole(
    await proofOracle.DEFAULT_ADMIN_ROLE(),
    await wallets.admin.address
  );

  console.log("Treasury has TREASURY_ROLE:", isMinter);
  console.log("Deployer is GovernanceToken admin:", isAdmin);
  console.log("Deployer is Treasury admin:", treasuryAdmin);
  console.log("VotingManager has BURNER_ROLE:", isBurner);
  console.log("VotingManager has DISBURSER_ROLE:", isDisburser);
  console.log("Deployer is NGO Oracle admin:", NGOAdmin);
  console.log("Deployer is Proof Oracle admin:", ProofAdmin);

  // Demonstrate voting cost differences
  // Display current proposal states
  console.log("\n=== PROPOSAL STATUS SUMMARY ===");
  console.log(
    "NGO 1 (Verified): Water well project - First milestone REACHED (105/100 votes, awaiting proof)"
  );
  console.log(
    "NGO 2 (Verified): Medical supplies - Active voting (40/80 votes needed)"
  );
  console.log(
    "NGO 3 (Verified): Educational books - Moderate votes (35/60 votes needed)"
  );
  console.log(
    "NGO 4 (UNVERIFIED): Cannot create proposals - Demo admin verification"
  );

  console.log("\n=== VOTING COST DEMONSTRATION ===");
  if (mainEvent) {
    const mainProposalId = mainEvent.args.proposalId;
    console.log(
      `Using NGO 1's proposal (${mainProposalId}) for cost comparison:`
    );

    console.log("\nVoting cost comparison for 5 votes:");
    for (let i = 0; i < wallets.donor.length; i++) {
      const cost = await votingManager.calculateVoteCost(
        mainProposalId,
        5,
        wallets.donor[i].address
      );
      const rep = await votingManager.getVoterReputation(
        wallets.donor[i].address
      );
      console.log(
        `  Donor ${i} (Tier ${rep.tier}): ${ethers.formatEther(
          cost
        )} ETH (${cost.toString()} wei)`
      );
    }

    console.log("\nVoting cost comparison for 10 votes:");
    for (let i = 0; i < wallets.donor.length; i++) {
      const cost = await votingManager.calculateVoteCost(
        mainProposalId,
        10,
        wallets.donor[i].address
      );
      const rep = await votingManager.getVoterReputation(
        wallets.donor[i].address
      );
      console.log(
        `  Donor ${i} (Tier ${rep.tier}): ${ethers.formatEther(
          cost
        )} ETH (${cost.toString()} wei)`
      );
    }
  }

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("All contracts deployed successfully.");
  console.log("GovToken:", await governanceToken.getAddress());
  console.log("Treasury:", await treasury.getAddress());
  console.log("NGO Oracle:", await ngoOracle.getAddress());
  console.log("ProposalManager:", await proposalManager.getAddress());
  console.log("Proof Oracle:", await proofOracle.getAddress());
  console.log("VotingManager:", await votingManager.getAddress());

  console.log(`\nAdmin/Deployer: ${wallets.admin.address}`);
  console.log("\nDonors with different reputation tiers:");
  for (let i = 0; i < wallets.donor.length; i++) {
    const rep = await votingManager.getVoterReputation(
      wallets.donor[i].address
    );
    console.log(`  Donor ${i} (Tier ${rep.tier}): ${wallets.donor[i].address}`);
  }

  console.log("\nNGO Status:");
  console.log(
    `  NGO 1 (VERIFIED): ${wallets.ngo[0].signer.address} - Water well project (milestone reached)`
  );
  console.log(
    `  NGO 2 (VERIFIED): ${wallets.ngo[1].signer.address} - Medical supplies (active voting)`
  );
  console.log(
    `  NGO 3 (VERIFIED): ${wallets.ngo[2].signer.address} - Educational books (moderate votes)`
  );
  console.log(
    `  NGO 4 (UNVERIFIED): ${wallets.ngo[3].signer.address} - Ready for admin verification demo`
  );

  console.log("\nPrivate Keys for NGOs (for demo purposes):");
  wallets.ngo.forEach((w, i) => {
    const status = i < 3 ? "VERIFIED" : "UNVERIFIED";
    console.log(`  NGO ${i + 1} (${status}): ${w.privateKey}`);
  });
  console.log("NGO IPFS:", IpfsURL);

  // Prepare updated contract addresses
  const addressFields = {
    GovernanceToken: await governanceToken.getAddress(),
    Treasury: await treasury.getAddress(),
    NGOOracle: await ngoOracle.getAddress(),
    ProposalManager: await proposalManager.getAddress(),
    ProofOracle: await proofOracle.getAddress(),
    VotingManager: await votingManager.getAddress(),
  };

  // Prepare donor information with their tiers
  const donorInfo = {};
  for (let i = 0; i < wallets.donor.length; i++) {
    const rep = await votingManager.getVoterReputation(
      wallets.donor[i].address
    );
    donorInfo[`donor${i}`] = {
      address: wallets.donor[i].address,
      tier: rep.tier.toString(),
      sessions: rep.sessions.toString(),
      uniqueProposals: rep.uniqueProposals.toString(),
      daysActive: rep.daysActive.toString(),
    };
  }

  // Prepare NGO information with verification status
  const ngoInfo = {};
  wallets.ngo.forEach((w, i) => {
    const isVerified = i < 3; // First 3 NGOs are verified, 4th is unverified
    ngoInfo[`ngo${i}`] = {
      address: w.signer.address,
      privateKey: w.privateKey,
      verified: isVerified,
      status: isVerified ? "VERIFIED" : "UNVERIFIED - Ready for admin demo",
    };
  });

  // Merge together (immutable + dynamic)
  const newConfig = {
    ...staticFields,
    ...addressFields,
    mainProposalId: mainEvent ? mainEvent.args.proposalId.toString() : "1",
    ngo1MilestoneReached: ngo1MainProposalId
      ? ngo1MainProposalId.toString()
      : null,
    ngo2ActiveVoting: ngo2MainProposalId ? ngo2MainProposalId.toString() : null,
    ngo3ModerateVotes: ngo3MainProposalId
      ? ngo3MainProposalId.toString()
      : null,
    donors: donorInfo,
    ngos: ngoInfo,
    demoScenarios: {
      ngo1: "Water well project - First milestone reached (105/100 votes, 0.105 ETH), awaiting proof submission",
      ngo2: "Medical supplies - Active voting (40/80 votes, 0.04 ETH), no milestones reached",
      ngo3: "Educational books - Moderate votes (35/60 votes, 0.035 ETH), no milestones reached",
      ngo4: "UNVERIFIED - Use admin panel to verify this NGO for demonstration",
    },
    updatedAt: new Date().toISOString(),
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
