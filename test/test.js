const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("CharityDAO Contracts", function () {
    let GovernanceToken, Treasury, Proposal, NGOOracle;
    let govToken, treasury, proposal, ngoOracle;
    let wallets = {
        admin: null,
        donor: [],
        ngo: [],
        multiSig: null, // For ORACLE_ADMIN, need to be gnosis safe in production
    };
    let unverifiedNGO;
    let ngoDetails = [
        "Red Cross International - Humanitarian aid and disaster relief",
        "Save the Children - Education and health programs for children",
        "World Wildlife Fund - Environmental conservation and research",
        "Global Health Corps - Improving healthcare access in underserved regions"
    ];
    let mockIpfsUrl = "ipfs://QmTest1234567890"; // Mock IPFS URL for JSON whitelist
    let numNGOs = ngoDetails.length; // Number of NGO wallets to generate
    let initialMintRate = ethers.parseEther("1"); // 1 GOV per 1 ETH
    let minDelay = 3600; // 1 hour in seconds
    let gracePeriod = 86400; // 1 day in seconds

    // Mock JSON content for testing
    const mockJson = {
        ngos: ngoDetails.map((detail, i) => ({
            // Will be set in beforeEach
            address: null,
            // e.g. "Red Cross International"
            name: detail.split(" - ")[0],
            // e.g. "Humanitarian aid and disaster relief"
            description: detail.split(" - ")[1],
            // Mock registration IDs (REG1, REG2, etc.)
            registrationId: i < ngoDetails.length - 1 ? `REG${i + 1}` : "UNREG", 
        })),
    };

    before(async function () {
        // Get signers
        const accounts = await ethers.getSigners();

        // Set up wallets
        wallets.admin = accounts[0]; // Deployer/admin (Signer)
        wallets.donor = [accounts[1], accounts[2]]; // Donors (Signers)
        wallets.ngo = []; // Initialize ngo array
        wallets.multiSig = accounts[19]; // Simulate multi-sig wallet

        // Ensure enough accounts (1 admin + 2 donors + 1 multi-sig + 4 NGOs = 8)
        if (accounts.length < numNGOs + 2 + wallets.donor.length) {
            throw new Error(`Not enough accounts. 
                Required: ${numNGOs + 2 + wallets.donor.length}, Available: ${accounts.length}`);
        }

        // Derive private keys for NGOs
        const mnemonic = "test test test test test test test test test test test junk";
        const rootWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, "", "m/44'/60'/0'/0");
        // Populate ngoWallets with NGOs
        for (let i = 3; i <= numNGOs + wallets.donor.length; i++) {
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
            // Update mockJson with NGO addresses
            mockJson.ngos[i - 3].address = accounts[i].address;
        }
        // Use last NGO as unverified
        unverifiedNGO = wallets.ngo[wallets.ngo.length - 1];

        // Debug logs (run once at start)
        console.log(`Deployer: ${wallets.admin.address}`);
        console.log(`Multi-Sig: ${wallets.multiSig.address}`);
        console.log(`Donors: ${wallets.donor.map(d => d.address).join(", ")}`);
        wallets.ngo.forEach((w, i) => {
            console.log(`NGO ${i + 1}: Address=${w.signer.address}, PrivateKey=${w.privateKey}`);
        });
        console.log("Mock JSON:", JSON.stringify(mockJson, null, 2));
    });

    beforeEach(async function () {
        // Deploy GovernanceToken
        GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        govToken = await GovernanceToken.deploy(wallets.admin.address);
        await govToken.waitForDeployment();

        // Deploy Treasury
        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await Treasury.deploy(wallets.admin.address, govToken.target, 
            initialMintRate, minDelay, gracePeriod);
        await treasury.waitForDeployment();

        // Grant MINTER_ROLE to Treasury
        const MINTER_ROLE = await govToken.MINTER_ROLE();
        await govToken.connect(wallets.admin).grantRole(MINTER_ROLE, treasury.target);

        // Deploy NGOOraclewith mock IPFS URL
        const ngoAddresses = wallets.ngo.slice(0, numNGOs - 1).map((w) => w.signer.address);
        NGOOracle = await ethers.getContractFactory("NGOOracle");
        ngoOracle = await NGOOracle.deploy(ngoAddresses, mockIpfsUrl);
        await ngoOracle.waitForDeployment();

        // Deploy ProposalManager
        ProposalManager = await ethers.getContractFactory("ProposalManager");
        proposalManager = await ProposalManager.deploy(
            wallets.admin.address, treasury.target, ngoOracle.target);
        await proposalManager.waitForDeployment();

        // Deploy ProofOracle
        ProofOracle = await ethers.getContractFactory("ProofOracle");
        proofOracle = await ProofOracle.deploy(proposalManager.target, ngoOracle.target);
        await proofOracle.waitForDeployment();

        // Grant PROOF_ORACLE role to ProofOracle in ProposalManager
        const PROOF_ORACLE_ROLE = await proposalManager.PROOF_ORACLE();
        await proposalManager.connect(wallets.admin).grantRole(PROOF_ORACLE_ROLE, proofOracle.target);

        // Transfer ORACLE_ADMIN to multi-sig
        await ngoOracle.connect(wallets.admin).transferAdminRole(wallets.multiSig.address);
        await proofOracle.connect(wallets.admin).transferAdminRole(wallets.multiSig.address);
    });

    describe("GovernanceToken", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await govToken.name()).to.equal("CharityDAO Governance");
            expect(await govToken.symbol()).to.equal("GOV");
        });

        it("Should assign the admin role to the specified admin", async function () {
            const DEFAULT_ADMIN_ROLE = await govToken.DEFAULT_ADMIN_ROLE();
            expect(await govToken.hasRole(DEFAULT_ADMIN_ROLE, wallets.admin.address)).to.be.true;
        });

        it("Should allow admin to pause and unpause", async function () {
            await govToken.connect(wallets.admin).pause();
            expect(await govToken.paused()).to.be.true;

            await govToken.connect(wallets.admin).unpause();
            expect(await govToken.paused()).to.be.false;
        });

        it("Should revert pause/unpause if not admin", async function () {
            await expect(govToken.connect(wallets.donor[0]).pause())
            .to.be.revertedWithCustomError(govToken, "AccessControlUnauthorizedAccount");
            await expect(govToken.connect(wallets.donor[0]).unpause())
            .to.be.revertedWithCustomError(govToken, "AccessControlUnauthorizedAccount");
        });

        it("Should allow minter to mint on donation", async function () {
            const amount = ethers.parseEther("10");
            const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

            // Treasury has minter role, so call from treasury context (but simulate)
            // Actually, since mintOnDonation is called by minter
            // we can impersonate or call directly if we grant to admin for test
            await govToken.connect(wallets.admin).grantRole(await govToken.MINTER_ROLE(),
            wallets.admin.address); // Temporarily grant to admin for direct test

            const tx = await govToken.connect(wallets.admin)
            .mintOnDonation(wallets.donor[0].address, amount, donationId);
            await expect(tx).to.emit(govToken, "MintedOnDonation")
            .withArgs(wallets.donor[0].address, amount, donationId);

            expect(await govToken.balanceOf(wallets.donor[0].address)).to.equal(amount);
        });

        it("Should revert mint if not minter", async function () {
            const amount = ethers.parseEther("10");
            const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

            await expect(govToken.connect(wallets.donor[1])
            .mintOnDonation(wallets.donor[0].address, amount, donationId))
            .to.be.revertedWithCustomError(govToken, "AccessControlUnauthorizedAccount");
        });

        it("Should revert mint with bad params", async function () {
            const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

            // Grant minter to admin
            await govToken.connect(wallets.admin).grantRole(await govToken.MINTER_ROLE(),
            wallets.admin.address);

            await expect(govToken.connect(wallets.admin)
            .mintOnDonation(ethers.ZeroAddress, 100, donationId)).to.be.revertedWith("bad params");
            await expect(govToken.connect(wallets.admin)
            .mintOnDonation(wallets.donor[0].address, 0, donationId)).to.be.revertedWith("bad params");
        });

        it("Should prevent transfers when paused", async function () {
            // Mint some tokens
            await govToken.connect(wallets.admin)
            .grantRole(await govToken.MINTER_ROLE(), wallets.admin.address);
            await govToken.connect(wallets.admin)
            .mintOnDonation(wallets.donor[0].address, ethers.parseEther("10"),
            ethers.keccak256(ethers.toUtf8Bytes("test")));

            await govToken.connect(wallets.admin).pause();
            await expect(govToken.connect(wallets.donor[0])
            .transfer(wallets.donor[1].address, ethers.parseEther("1")))
            .to.be.revertedWithCustomError(govToken, "EnforcedPause");
        });
    });

    describe("Treasury", function () {
        it("Should set initial values correctly", async function () {
            expect(await treasury.gov()).to.equal(govToken.target);
            expect(await treasury.mintRate()).to.equal(initialMintRate);
            expect(await treasury.hasRole(await treasury.TREASURY_ADMIN(),
            wallets.admin.address)).to.be.true;
            expect(await treasury.getMinDelay()).to.equal(minDelay);
            expect(await treasury.getGracePeriod()).to.equal(gracePeriod);
        });

        it("Should allow admin to update mint rate", async function () {
            const newRate = ethers.parseEther("2");
            const tx = await treasury.connect(wallets.admin).setMintRate(newRate);
            await expect(tx).to.emit(treasury, "MintRateUpdated").withArgs(newRate);
            expect(await treasury.mintRate()).to.equal(newRate);
        });

        it("Should revert update mint rate if not admin", async function () {
            await expect(treasury.connect(wallets.donor[1])
            .setMintRate(100))
            .to.be.revertedWithCustomError(treasury, "AccessControlUnauthorizedAccount");
        });

        it("Should handle ETH donation via donateETH and mint tokens", async function () {
            const donationAmount = ethers.parseEther("1");
            const expectedMint = 
            donationAmount * initialMintRate / ethers.parseEther("1"); // Since rate is 1e18, mint 1 GOV

            const tx = await treasury.connect(wallets.donor[0]).donateETH({ value: donationAmount });

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "DonationReceived");

            await expect(tx).to.emit(treasury, "DonationReceived")
            .withArgs(wallets.donor[0].address, donationAmount, expectedMint, event.args.donationId);

            expect(await govToken.balanceOf(wallets.donor[0].address)).to.equal(expectedMint);
            expect(await treasury.connect(wallets.donor[0]).getGovTokenBalance()).to.equal(expectedMint);
            expect(await ethers.provider.getBalance(treasury.target)).to.equal(donationAmount);
        });

        it("Should revert when ETH is sent directly to the Treasury", async function () {
            const donationAmount = ethers.parseEther("2");
            await expect(wallets.donor[0]
                .sendTransaction({ to: treasury.target, value: donationAmount }))
                .to.be.revertedWith("Direct ETH deposits not allowed; use donateETH()");
        });

        it("Should revert donation if zero ETH", async function () {
            await expect(treasury.connect(wallets.donor[0])
            .donateETH({ value: 0 })).to.be.revertedWith("Zero ETH");
        });

        it("Should revert donation if mintRate is zero", async function () {
            await treasury.connect(wallets.admin).setMintRate(0);
            await expect(treasury.connect(wallets.donor[0])
            .donateETH({ value: ethers.parseEther("1") })).to.be.revertedWith("mintRate=0");
        });

        it("Should allow voting manager to queue a transfer", async function () {
            const recipient = wallets.donor[0].address;
            const amount = ethers.parseEther("1");
            const eta = (await ethers.provider.getBlock("latest")).timestamp + minDelay + 100;

            // Set voting manager
            await treasury.connect(wallets.admin).setVotingManager(wallets.admin.address);

            const tx = await treasury.connect(wallets.admin).queueTransfer(recipient, amount, eta);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "TimelockQueued");

            expect(event).to.not.be.undefined;
            expect(event.args.recipient).to.equal(recipient);
            expect(event.args.amount).to.equal(amount);
            expect(event.args.eta).to.equal(eta);
        });

        it("Should execute timelock transfer after delay", async function () {
            const recipient = wallets.donor[0].address;
            const amount = ethers.parseEther("1");
            const eta = (await ethers.provider.getBlock("latest")).timestamp + minDelay + 100;

            // Fund treasury
            await treasury.connect(wallets.donor[0]).donateETH({ value: amount });

            // Set voting manager and queue transfer
            await treasury.connect(wallets.admin).setVotingManager(wallets.admin.address);
            const tx = await treasury.connect(wallets.admin).queueTransfer(recipient, amount, eta);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "TimelockQueued");
            const timelockId = event.args.id;

            // Fast-forward time
            await ethers.provider.send("evm_increaseTime", [minDelay + 200]);
            await ethers.provider.send("evm_mine");

            // Execute timelock
            const initialBalance = await ethers.provider.getBalance(recipient);
            const txExecute = await treasury.connect(wallets.admin).executeTimelock(timelockId);
            await expect(txExecute).to.emit(treasury, "TimelockExecuted")
            .withArgs(timelockId, recipient, amount);

            const finalBalance = await ethers.provider.getBalance(recipient);
            expect(finalBalance).to.equal(initialBalance + amount);
        });
    });
    
    describe("NGOOracle", function () {
        it("Should initialize with correct IPFS URL and approved NGOs", async function () {
            expect(await ngoOracle.getNGODetailsUrl()).to.equal(mockIpfsUrl);
            for (let i = 0; i < wallets.ngo.length - 1; i++) {
                expect(await ngoOracle.approvedNGOs(wallets.ngo[i].signer.address)).to.equal(true);
            }
            expect(await ngoOracle.approvedNGOs(unverifiedNGO.signer.address)).to.equal(false);
        });

        it("Should simulate JSON parsing and verify NGO details", async function () {
            // Simulate fetching and parsing the JSON from the IPFS URL
            const ipfsUrl = await ngoOracle.getNGODetailsUrl();
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
            const receipt = await tx.wait();

            expect(await ngoOracle.approvedNGOs(verifiedAddress)).to.equal(true);
            await expect(tx).to.emit(ngoOracle, "NGOVerified").withArgs(verifiedAddress, anyValue);
        });

        it("Should return false and emit NGORejected for unverified NGO", async function () {
            const unverifiedAddress = unverifiedNGO.signer.address;
            const tx = await ngoOracle.connect(wallets.admin).verifyNGO(unverifiedAddress);
            const receipt = await tx.wait();

            expect(await ngoOracle.approvedNGOs(unverifiedAddress)).to.equal(false);
            await expect(tx).to.emit(ngoOracle, "NGORejected").withArgs(unverifiedAddress, anyValue);
        });

        it("Should allow ORACLE_ADMIN to approve a new NGO", async function () {
            const newNGO = unverifiedNGO.signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            await ngoOracle.connect(wallets.multiSig).approveNGO(newNGO, newIpfsUrl);

            expect(await ngoOracle.approvedNGOs(newNGO)).to.equal(true);
            expect(await ngoOracle.getNGODetailsUrl()).to.equal(newIpfsUrl);
            await expect(ngoOracle.connect(wallets.multiSig).approveNGO(newNGO, newIpfsUrl)).to.be.revertedWith(
                "NGO already approved"
            );
        });

        it("Should revert approveNGO if not ORACLE_ADMIN", async function () {
            const newNGO = unverifiedNGO.signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            await expect(
                ngoOracle.connect(wallets.donor[0]).approveNGO(newNGO, newIpfsUrl)
            ).to.be.revertedWithCustomError(ngoOracle, "AccessControlUnauthorizedAccount");
        });

        it("Should allow ORACLE_ADMIN to revoke an NGO", async function () {
            const ngoAddress = wallets.ngo[0].signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            await ngoOracle.connect(wallets.multiSig).revokeNGO(ngoAddress, newIpfsUrl);

            expect(await ngoOracle.approvedNGOs(ngoAddress)).to.equal(false);
            expect(await ngoOracle.getNGODetailsUrl()).to.equal(newIpfsUrl);
            await expect(ngoOracle.connect(wallets.multiSig).revokeNGO(ngoAddress, newIpfsUrl)).to.be.revertedWith(
                "NGO not approved"
            );
        });

        it("Should revert revokeNGO if not ORACLE_ADMIN", async function () {
            const ngoAddress = wallets.ngo[0].signer.address;
            const newIpfsUrl = "ipfs://QmTest4567890";
            await expect(
                ngoOracle.connect(wallets.donor[0]).revokeNGO(ngoAddress, newIpfsUrl)
            ).to.be.revertedWithCustomError(ngoOracle, "AccessControlUnauthorizedAccount");
        });

        it("Should allow ORACLE_ADMIN to update IPFS URL", async function () {
            const newIpfsUrl = "ipfs://QmTest4567890";
            const tx = await ngoOracle.connect(wallets.multiSig).updateNGODetailsUrl(newIpfsUrl);
            await expect(tx).to.emit(ngoOracle, "NGOWhitelistUpdated").withArgs(newIpfsUrl, anyValue);
            expect(await ngoOracle.getNGODetailsUrl()).to.equal(newIpfsUrl);
        });

        it("Should revert updateNGODetailsUrl if not ORACLE_ADMIN", async function () {
            const newIpfsUrl = "ipfs://QmTest4567890";
            await expect(
                ngoOracle.connect(wallets.donor[0]).updateNGODetailsUrl(newIpfsUrl)
            ).to.be.revertedWithCustomError(ngoOracle, "AccessControlUnauthorizedAccount");
        });
    });

    describe("ProofOracle", function () {
        it("Should initialize with correct ProposalManager and NGOOracle", async function () {
            expect(await proofOracle.proposalManager()).to.equal(proposalManager.target);
            expect(await proofOracle.ngoOracle()).to.equal(ngoOracle.target);
            expect(await proofOracle.hasRole(await proofOracle.ORACLE_ADMIN(), wallets.multiSig.address)).to.be.true;
        });

        it("Should allow ORACLE_ADMIN to verify a milestone", async function () {
            const ngo = wallets.ngo[0].signer;
            const totalFunds = ethers.parseEther("3");
            const milestonesDesc = ["Build school", "Purchase books"];
            const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];

            // Create proposal
            await proposalManager.connect(ngo).createProposal(totalFunds, milestonesDesc, milestonesAmt);
            const proofUrl = "ipfs://QmProof123";

            // Verify milestone
            const tx = await proofOracle
                .connect(wallets.multiSig)
                .verifyMilestone(1, 0, proofUrl, ngo.address);
            await expect(tx)
                .to.emit(proofOracle, "MilestoneVerified")
                .withArgs(1, 0, ethers.keccak256(ethers.toUtf8Bytes(proofUrl)), proofUrl, ngo.address);

            const proposal = await proposalManager.getProposal(1);
            expect(proposal.milestones[0].completed).to.equal(true);
            expect(proposal.milestones[0].proofHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(proofUrl)));
        });

        it("Should revert verifyMilestone if not ORACLE_ROLE", async function () {
            const ngo = wallets.ngo[0].signer;
            const proofUrl = "ipfs://QmProof123";
            await expect(
                proofOracle.connect(wallets.donor[0]).verifyMilestone(1, 0, proofUrl, ngo.address)
            ).to.be.revertedWithCustomError(proofOracle, "AccessControlUnauthorizedAccount");
        });

        it("Should revert verifyMilestone for unapproved NGO", async function () {
            const unverifiedNGO = wallets.ngo[wallets.ngo.length - 1].signer;
            const proofUrl = "ipfs://QmProof123";
            await expect(
                proofOracle.connect(wallets.multiSig).verifyMilestone(1, 0, proofUrl, unverifiedNGO.address)
            ).to.be.revertedWith("NGO not approved");
        });

        it("Should revert verifyMilestone for invalid inputs", async function () {
            const ngo = wallets.ngo[0].signer;
            await expect(
                proofOracle.connect(wallets.multiSig).verifyMilestone(1, 0, "", ngo.address)
            ).to.be.revertedWith("Proof URL cannot be empty");
            await expect(
                proofOracle.connect(wallets.multiSig).verifyMilestone(1, 0, "http://invalid", ngo.address)
            ).to.be.revertedWith("Invalid IPFS URL format");
            await expect(
                proofOracle.connect(wallets.multiSig).verifyMilestone(1, 0, "ipfs://QmProof123", ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid NGO address");
        });

        it("Should allow ORACLE_ADMIN to transfer ORACLE_ADMIN role", async function () {
            const newOracle = wallets.donor[0].address;
            const tx = await proofOracle.connect(wallets.multiSig).transferAdminRole(newOracle);
            await expect(tx)
                .to.emit(proofOracle, "AdminRoleTransferred")
                .withArgs(wallets.multiSig.address, newOracle);
            expect(await proofOracle.hasRole(await proofOracle.ORACLE_ADMIN(), newOracle)).to.be.true;
            expect(await proofOracle.hasRole(await proofOracle.ORACLE_ADMIN(), wallets.multiSig.address)).to.be.false;
        });
    });

    // describe("Proposal creation", function () {
    //     let proposalAddress, proposal;
    //     const milestonesDesc = ["Build school", "Purchase books"];
    //     const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];
    //     const totalFunds = ethers.parseEther("3");

    //     beforeEach(async function () {
    //         const tx = await treasury.connect(wallets.ngo[0].signer)
    //         .createProposal(totalFunds, milestonesDesc, milestonesAmt);
    //         const receipt = await tx.wait();

    //         const event = receipt.logs
    //             .map(log => {
    //                 try { return treasury.interface.parseLog(log); }
    //                 catch { return null; }
    //             })
    //             .filter(e => e && e.name === "ProposalCreated")[0];

    //         if (!event) throw new Error("ProposalCreated event not found");
    //         proposalAddress = event.args.proposalAddress;

    //         proposal = Proposal.attach(proposalAddress);
    //     });

    //     it("Should create proposal given the correct details", async function () {
    //         expect(await proposal.ngo()).to.equal(wallets.ngo[0].signer.address);
    //         expect(await proposal.treasury()).to.equal(treasury.target);
    //         expect(await proposal.totalFunds()).to.equal(totalFunds);
    //         expect(await proposal.fundsDisbursed()).to.equal(0);
    //         expect(await proposal.isApproved()).to.equal(false);
    //         expect(await proposal.milestoneCount()).to.equal(2);

    //         const milestone0 = await proposal.getMilestone(0);
    //         expect(milestone0.description).to.equal("Build school");
    //         expect(milestone0.amount).to.equal(milestonesAmt[0]);
    //         expect(milestone0.completed).to.equal(false);
    //         expect(milestone0.released).to.equal(false);
    //     });

    //     it("Should allow treasury/admin to approve the proposal", async function () {
    //         expect(await proposal.isApproved()).to.equal(false);
    //         const proposalId = 1;
    //         await treasury.connect(wallets.admin).approveProposal(proposalId);
    //         expect(await proposal.isApproved()).to.equal(true);
    //     });
    // });
});
