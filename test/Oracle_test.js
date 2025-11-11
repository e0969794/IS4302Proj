const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Oracles", function () {
    // Contract Factories and Instances
    let ProposalManager, NGOOracle, ProofOracle;
    let proposalManager, ngoOracle, proofOracle;
    let admin;
    let initialMintRate = 1;
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

        // Deploy GovernanceToken
        GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        govToken = await GovernanceToken.deploy(admin.address);
        await govToken.waitForDeployment();

        // Deploy Treasury
        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await Treasury.deploy(admin.address, govToken.target, initialMintRate);
        await treasury.waitForDeployment();

        // Now grant TREASURY_ROLE to Treasury
        const TREASURY_ROLE = await govToken.TREASURY_ROLE();
        await govToken.connect(admin).grantRole(TREASURY_ROLE, treasury.target);

        // Deploy ProposalManager
        ProposalManager = await ethers.getContractFactory("ProposalManager");
        proposalManager = await ProposalManager.deploy(ngoOracle.target);
        await proposalManager.waitForDeployment();

        // Deploy ProofOracle
        ProofOracle = await ethers.getContractFactory("ProofOracle");
        proofOracle = await ProofOracle.deploy(proposalManager.target, ngoOracle.target);
        await proofOracle.waitForDeployment();

        // Set ProofOracle address in ProposalManager
        await proposalManager.connect(wallets.admin).setProofOracle(proofOracle.target);


        // Transfer ORACLE_ADMIN to multi-sig for both oracles
        // await ngoOracle.connect(wallets.admin).transferAdminRole(wallets.multiSig.address);
        // await proofOracle.connect(wallets.admin).transferAdminRole(wallets.multiSig.address);
    });

    describe("NGOOracle", function () {
        it("Should initialize with correct IPFS URL and approved NGOs", async function () {
            expect(await ngoOracle.getNGODetailsURL()).to.equal(mockIpfsUrl);
            for (let i = 0; i < wallets.ngo.length - 1; i++) {
                expect(await ngoOracle.approvedNGOs(wallets.ngo[i].signer.address)).to.equal(true);
            }
            expect(await ngoOracle.approvedNGOs(unverifiedNGO.signer.address)).to.equal(false);
        });

        it("Should simulate JSON parsing and verify NGO details", async function () {
            // Simulate fetching and parsing the JSON from the IPFS URL
            const ipfsUrl = await ngoOracle.getNGODetailsURL();
            expect(ipfsUrl).to.equal(mockIpfsUrl);

            // Mock JSON parsing (in a real app, this would be fetched from Pinata)
            for (let i = 0; i < wallets.ngo.length - 1; i++) {
                const ngo = mockJson.ngos[i];
                expect(ngo.address.toLowerCase()).to.equal(wallets.ngo[i].signer.address.toLowerCase());
                expect(ngo.name).to.equal(ngoDetails[i].split(" - ")[0]);
                expect(ngo.description).to.equal(ngoDetails[i].split(" - ")[1]);
                expect(ngo.registrationId).to.equal(`REG${i + 1}`);
            }
        });

        it("Should emit NGOApproved events during initialization", async function () {
            const tx = await ngoOracle.deploymentTransaction();
            const receipt = await tx.wait();
            const events = receipt.logs
                .map((log) => {
                try {
                    return ngoOracle.interface.parseLog(log);
                } catch {
                    return null;
                }
                })
                .filter((e) => e && e.name === "NGOApproved");

            expect(events.length).to.equal(wallets.ngo.length - 1);
            for (let i = 0; i < wallets.ngo.length - 1; i++) {
                expect(events[i].args.ngo).to.equal(wallets.ngo[i].signer.address);
            }
        });

        it("Should return true and emit NGOVerified for verified NGO", async function () {
            const verifiedAddress = wallets.ngo[0].signer.address;
            const tx = await ngoOracle.connect(wallets.admin).verifyNGO(verifiedAddress);
            
            expect(await ngoOracle.approvedNGOs(verifiedAddress)).to.equal(true);
            await expect(tx).to.emit(ngoOracle, "NGOVerified").withArgs(verifiedAddress, anyValue);
        });

        it("Should return false and emit NGORejected for unverified NGO", async function () {
            const unverifiedAddress = unverifiedNGO.signer.address;
            const tx = await ngoOracle.connect(wallets.admin).verifyNGO(unverifiedAddress);

            expect(await ngoOracle.approvedNGOs(unverifiedAddress)).to.equal(false);
            await expect(tx).to.emit(ngoOracle, "NGORejected").withArgs(unverifiedAddress, anyValue);
        });

        it("Should allow ORACLE_ADMIN to approve a new NGO", async function () {
            const newNGO = unverifiedNGO.signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            // CHANGED: Use wallets.admin
            await ngoOracle.connect(wallets.admin).approveNGO(newNGO, newIpfsUrl);

            expect(await ngoOracle.approvedNGOs(newNGO)).to.equal(true);
            expect(await ngoOracle.getNGODetailsURL()).to.equal(newIpfsUrl);
            // CHANGED: Use wallets.admin
            await expect(ngoOracle.connect(wallets.admin).approveNGO(newNGO, newIpfsUrl)).to.be.revertedWith(
                "NGO already approved"
            );
        });

        it("Should revert approveNGO if not ORACLE_ADMIN", async function () {
            const newNGO = unverifiedNGO.signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            // This test remains valid as it checks a non-admin
            await expect(
                ngoOracle.connect(wallets.donor[0]).approveNGO(newNGO, newIpfsUrl)
            ).to.be.revertedWithCustomError(ngoOracle, "AccessControlUnauthorizedAccount");
        });

        it("Should allow ORACLE_ADMIN to revoke an NGO", async function () {
            const ngoAddress = wallets.ngo[0].signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            // CHANGED: Use wallets.admin
            await ngoOracle.connect(wallets.admin).revokeNGO(ngoAddress, newIpfsUrl);

            expect(await ngoOracle.approvedNGOs(ngoAddress)).to.equal(false);
            expect(await ngoOracle.getNGODetailsURL()).to.equal(newIpfsUrl);
            // CHANGED: Use wallets.admin
            await expect(ngoOracle.connect(wallets.admin).revokeNGO(ngoAddress, newIpfsUrl)).to.be.revertedWith(
                "NGO not approved"
            );
        });

        it("Should revert revokeNGO if not ORACLE_ADMIN", async function () {
            const ngoAddress = wallets.ngo[0].signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            // This test remains valid
            await expect(
                ngoOracle.connect(wallets.donor[0]).revokeNGO(ngoAddress, newIpfsUrl)
            ).to.be.revertedWithCustomError(ngoOracle, "AccessControlUnauthorizedAccount");
        });

        it("Should allow ORACLE_ADMIN to update IPFS URL", async function () {
            const newIpfsUrl = "ipfs://QmTest4567890";
            // CHANGED: Use wallets.admin
            const tx = await ngoOracle.connect(wallets.admin).updateNGODetailsURL(newIpfsUrl);
            await expect(tx).to.emit(ngoOracle, "NGOWhitelistUpdated").withArgs(newIpfsUrl, anyValue);
            expect(await ngoOracle.getNGODetailsURL()).to.equal(newIpfsUrl);
        });

        it("Should revert updateNGODetailsUrl if not ORACLE_ADMIN", async function () {
            const newIpfsUrl = "ipfs://QmTest4567890";
            // This test remains valid
            await expect(
                ngoOracle.connect(wallets.donor[0]).updateNGODetailsURL(newIpfsUrl)
            ).to.be.revertedWithCustomError(ngoOracle, "AccessControlUnauthorizedAccount");
        });
    });

    describe("ProofOracle", function () {
        it("Should initialize with correct ProposalManager and NGOOracle", async function () {
            expect(await proofOracle.proposalManager()).to.equal(proposalManager.target);
            expect(await proofOracle.ngoOracle()).to.equal(ngoOracle.target);
            // CHANGED: Check wallets.admin has the role
            expect(await proofOracle.hasRole(await proofOracle.ORACLE_ADMIN(), wallets.admin.address)).to.be.true;
        });

    it("Should allow NGO to submit a proof and revert if NGO address is not valid", async function () {
        const ngo = wallets.ngo[0].signer;
        const milestonesDesc = ["Build school", "Purchase books"];
        const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];

        // Create proposal
        await proposalManager.connect(ngo).createProposal(milestonesDesc, milestonesAmt);
        const proofUrl = "ipfs://QmProof123";

        await expect(
            proofOracle.connect(unverifiedNGO.signer).submitProof(1, 0, proofUrl)
        ).to.be.revertedWith("NGO not approved");

        const tx = await proofOracle.connect(ngo).submitProof(1, 0, proofUrl);
        
        await expect(tx)
            .to.emit(proofOracle, "ProofSubmitted")
            .withArgs(0, 1, 0, ngo.address); 
        });

        it("Should revert submitProof for invalid inputs", async function () {
            const ngo = wallets.ngo[0].signer;
            const ngo1 = wallets.ngo[1].signer;
            const milestonesDesc = ["Build school", "Purchase books"];
            const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];

            // Create proposal
            await proposalManager.connect(ngo).createProposal(milestonesDesc, milestonesAmt);
            const proofUrl = "ipfs://QmProof123";
            const emptyUrl = "";
            const invalidUrl = "https://something"

            await expect(
            proofOracle.connect(ngo).submitProof(1, 0, emptyUrl)
                ).to.be.revertedWith("Empty URL");
            await expect(
                proofOracle.connect(ngo).submitProof(1, 0, invalidUrl)
                ).to.be.revertedWith("Invalid IPFS URL");
            await expect(
                proofOracle.connect(ngo1).submitProof(1, 0, proofUrl)
                ).to.be.revertedWith("NGO does not own this proposal");
        });

        it("Should allow ProofOracle to verify a proof", async function () {
            const ngo = wallets.ngo[0].signer;
            const milestonesDesc = ["Build school", "Purchase books"];
            const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];

            // Create proposal
            await proposalManager.connect(ngo).createProposal(milestonesDesc, milestonesAmt);
            const proofUrl = "ipfs://QmProof123";
            await proofOracle.connect(ngo).submitProof(1, 0, proofUrl);
        
            // Verify proof
            const tx = await proofOracle
                .connect(wallets.admin) 
                .verifyProof(0, true, "valid proof");
            await expect(tx)
                .to.emit(proofOracle, "ProofAprroved")
                .withArgs(0, true, "valid proof");

            const proposal = await proposalManager.getProposal(1);
            expect(proposal.milestones[0].verified).to.equal(true);
            expect(proposal.milestones[0].proofHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(proofUrl)));
        });

        it("Should revert verifyProof if not ORACLE_ROLE", async function () {
            const ngo = wallets.ngo[0].signer;
            const proofUrl = "ipfs://QmProof123";
            // This test remains valid
            await expect(
                proofOracle.connect(wallets.donor[0]).verifyProof(0, true, "valid proof")
            ).to.be.revertedWithCustomError(proofOracle, "AccessControlUnauthorizedAccount");
        });
    });
});