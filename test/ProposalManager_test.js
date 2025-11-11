const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProposalManager", function () {
    let ProposalManager, NGOOracle, proposalManager;
    let proposaltarget, ngoOracle, proposalId;
    let admin;
    let initialMintRate = 1;
    const milestonesDesc = ["Build school", "Purchase books"];
    const milestonesAmt = [1, 2];
    // Wallets and Signers
    let wallets = {
        admin: null,
        donor: [],
        ngo: [],
        multiSig: null, // For ORACLE_ADMIN
    };
    let unverifiedNGO;
    // Mock Data
    let ngoDetails = [
        "Red Cross International - Humanitarian aid and disaster relief",
        "Save the Children - Education and health programs for children",
        "World Wildlife Fund - Environmental conservation and research",
        "Global Health Corps - Improving healthcare access in underserved regions"
    ];
    let mockIpfsUrl = "ipfs://QmTest1234567890"; // Mock IPFS URL for JSON whitelist
    let numNGOs = ngoDetails.length;
    // Mock JSON content
    const mockJson = {
        ngos: ngoDetails.map((detail, i) => ({
            address: null, // Will be set in before()
            name: detail.split(" - ")[0],
            description: detail.split(" - ")[1],
            registrationId: i < ngoDetails.length - 1 ? `REG${i + 1}` : "UNREG",
        })),
    };

    before(async function () {
        // Get signers
        const accounts = await ethers.getSigners();
        [admin] = await ethers.getSigners();

        // Set up wallets
        wallets.admin = accounts[0]; // Deployer/admin
        wallets.donor = [accounts[1], accounts[2]]; // Donors
        wallets.ngo = []; // Initialize ngo array
        wallets.multiSig = accounts[19]; // Simulate multi-sig wallet

        // Ensure enough accounts
        if (accounts.length < numNGOs + 2 + wallets.donor.length) {
            throw new Error(`Not enough accounts. Required: ${numNGOs + 2 + wallets.donor.length}, Available: ${accounts.length}`);
        }

        // Use standard hardhat accounts 3-6 for NGOs
        for (let i = 3; i <= numNGOs + wallets.donor.length; i++) {
             wallets.ngo.push({
                 signer: accounts[i], // Start from accounts[3]
                 // Note: privateKey generation removed as it wasn't used in oracle tests
             });
            // Update mockJson with NGO addresses
            mockJson.ngos[i - 3].address = accounts[i].address;
        }
        
        // Use last NGO as unverified
        unverifiedNGO = wallets.ngo[wallets.ngo.length - 1];

        // Debug logs (run once at start)
        console.log(`Deployer: ${wallets.admin.address}`);
        // console.log(`Multi-Sig: ${wallets.multiSig.address}`);
        console.log(`Donors: ${wallets.donor.map(d => d.address).join(", ")}`);
        wallets.ngo.forEach((w, i) => {
            console.log(`NGO ${i + 1}: Address=${w.signer.address}`);
        });
        console.log("Mock JSON:", JSON.stringify(mockJson, null, 2));
    });

    beforeEach(async function () {
        // Deploy NGOOracle
        const ngoAddresses = wallets.ngo.slice(0, numNGOs - 1).map((w) => w.signer.address);
        NGOOracle = await ethers.getContractFactory("NGOOracle");
        ngoOracle = await NGOOracle.deploy(ngoAddresses, mockIpfsUrl);
        await ngoOracle.waitForDeployment();
     
        // Deploy ProposalManager
        ProposalManager = await ethers.getContractFactory("ProposalManager");
        proposalManager = await ProposalManager.deploy(ngoOracle.target);
        await proposalManager.waitForDeployment();
    });

    it("Should reject unverified NGO address from creating proposal", async function () {
        await expect(proposalManager
        .connect(unverifiedNGO.signer)
        .createProposal(milestonesDesc, milestonesAmt)).to.be.revertedWith("NGO address not approved");
    });
    // NGO should not be able to submit if not verified.

    it("Should create proposal given the correct details", async function () {
        const ngo = wallets.ngo[0].signer;
        const tx = await proposalManager
        .connect(ngo)
        .createProposal(milestonesDesc, milestonesAmt);
        const receipt = await tx.wait();

        const event = receipt.logs
        .map((log) => {
            try {
            return proposalManager.interface.parseLog(log);
            } catch {
            return null;
            }
        })
        .filter((e) => e && e.name === "ProposalCreated")[0];

        if (!event) throw new Error("ProposalCreated event not found");
        proposalId = event.args.proposalId;
        const proposal = await proposalManager.getProposal(proposalId);

        expect(await proposal.ngo).to.equal(ngo.address);
        
        const milestones = proposal[2]
        expect(await milestones.length).to.equal(2);

        const milestone0 = await milestones[0];
        expect(milestone0[0]).to.equal("Build school");
        expect(milestone0[1]).to.equal(1);
    });
});