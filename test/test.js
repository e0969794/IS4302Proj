const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CharityDAO Contracts", function () {
    let GovernanceToken, Treasury, Proposal, NGOOracle;
    let govToken, treasury, proposal, ngoOracle;
    let wallets = {
        admin: null,
        donor: [],
        ngo: []
    };
    let ngoDetails = [
        "Red Cross International - Humanitarian aid and disaster relief",
        "Save the Children - Education and health programs for children",
        "World Wildlife Fund - Environmental conservation and research",
        "Global Health Corps - Improving healthcare access in underserved regions"
    ];
    let numNGOs = ngoDetails.length; // Number of NGO wallets to generate
    let initialMintRate = ethers.parseEther("1"); // 1 GOV per 1 ETH
    let minDelay = 3600; // 1 hour in seconds
    let gracePeriod = 86400; // 1 day in seconds

    before(async function () {
        // Get signers
        const accounts = await ethers.getSigners();

        // Set up wallets
        wallets.admin = accounts[0]; // Deployer/admin (Signer)
        wallets.donor = [accounts[1], accounts[2]]; // Donors (Signers)
        wallets.ngo = []; // Initialize ngo array

        // Ensure enough accounts (1 admin + 2 donors + 4 NGOs = 7)
        if (accounts.length < numNGOs + 1 + wallets.donor.length) {
            throw new Error(`Not enough accounts. 
                Required: ${numNGOs + 1 + wallets.donor.length}, Available: ${accounts.length}`);
        }

        // Derive private keys for NGOs
        const mnemonic = "test test test test test test test test test test test junk";
        const rootWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, "", "m/44'/60'/0'/0");
        // Populate ngoWallets with verified NGOs (accounts[1] to accounts[ngoDetails.length - 1])
        for (let i = 3; i < numNGOs + wallets.donor.length; i++) {
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
        // Unverified NGO (accounts[ngoDetails.length - 1])
        const unverifiedPath = `${numNGOs + wallets.donor.length}`;
        const unverifiedWallet = rootWallet.derivePath(unverifiedPath);

        if (unverifiedWallet.address.toLowerCase() !== 
        accounts[numNGOs + wallets.donor.length].address.toLowerCase()) {
            throw new Error(`Address mismatch for unverified NGO: 
                expected ${accounts[numNGOs + wallets.donor.length].address},
                got ${unverifiedWallet.address}`);
        }
        wallets.ngo.push({
            signer: accounts[numNGOs + 2],
            privateKey: unverifiedWallet.privateKey,
        });

        // Debug logs (run once at start)
        console.log(`Deployer: ${wallets.admin.address}`);
        console.log(`Donors: ${wallets.donor.map(d => d.address).join(", ")}`);
        wallets.ngo.forEach((w, i) => {
            console.log(`NGO ${i + 1}: Address=${w.signer.address}, PrivateKey=${w.privateKey}`);
        });
    });

    beforeEach(async function () {
        // Get the list of accounts from Hardhat's provider
        const accounts = await ethers.getSigners();

        // Reset ngo array to prevent accumulation
        wallets.ngo = [];

        // Derive private keys from Hardhat's default mnemonic
        const mnemonic = "test test test test test test test test test test test junk";
        const rootWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, "", "m/44'/60'/0'/0"); // Base path

        // Populate ngoWallets with verified NGOs (accounts[1] to accounts[ngoDetails.length - 1])
        for (let i = 3; i < numNGOs + wallets.donor.length; i++) {
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
        // Unverified NGO (accounts[ngoDetails.length - 1])
        const unverifiedPath = `${numNGOs + wallets.donor.length}`;
        const unverifiedWallet = rootWallet.derivePath(unverifiedPath);

        if (unverifiedWallet.address.toLowerCase() !== 
        accounts[numNGOs + wallets.donor.length].address.toLowerCase()) {
            throw new Error(`Address mismatch for unverified NGO: 
                expected ${accounts[numNGOs + wallets.donor.length].address},
                got ${unverifiedWallet.address}`);
        }
        wallets.ngo.push({
            signer: accounts[numNGOs + 2],
            privateKey: unverifiedWallet.privateKey,
        });

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
        await govToken.connect(accounts[0]).grantRole(MINTER_ROLE, treasury.target);

        // Deploy NGOOracle
        const ngoAddresses = wallets.ngo.slice(0, numNGOs - 1).map(w => w.signer.address);
        NGOOracle = await ethers.getContractFactory("NGOOracle");
        ngoOracle = await NGOOracle.deploy(ngoAddresses, ngoDetails.slice(0, numNGOs - 1));
        await ngoOracle.waitForDeployment();

        // Load Proposal contract factory
        Proposal = await ethers.getContractFactory("Proposal");
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
            expect(await treasury.getGovTokenBalance(wallets.donor[0].address)).to.equal(expectedMint);
            expect(await ethers.provider.getBalance(treasury.target)).to.equal(donationAmount);
        });

        it("should revert when ETH is sent directly to the Treasury", async function () {
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
    
    describe("NGOOracleMock", function () {
        let unverifiedNGO;

        beforeEach(async function () {
            unverifiedNGO = wallets.ngo[wallets.ngo.length - 1]; // Use last NGO (unverified)
        });
        
        it("should pre-approve 3 NGOs at deployment", async function () {
            for (let i = 0; i < wallets.ngo.length - 1; i++) {
                expect(await ngoOracle.approvedNGOs(wallets.ngo[i].signer.address)).to.equal(true);
                const details = await ngoOracle.ngoDetails(wallets.ngo[i].signer.address);
                expect(details).to.equal(ngoDetails[i]);
            }
        });

        it("should return true and emit NGOVerified for verified NGO", async function () {
            const verifiedAddress = wallets.ngo[0].signer.address;
            const tx = await ngoOracle.connect(wallets.admin).verifyNGO(verifiedAddress);
            const receipt = await tx.wait();

            const result = await ngoOracle.approvedNGOs(verifiedAddress);
            expect(result).to.equal(true);

            const event = receipt.logs.find(log => log.fragment?.name === "NGOVerified");
            expect(event).to.not.be.undefined;
            expect(event.args.ngo).to.equal(verifiedAddress);
        });

        it("should return false and emit NGORejected for unverified NGO", async function () {
            const unverifiedAddress = unverifiedNGO.signer.address;
            const tx = await ngoOracle.connect(wallets.admin).verifyNGO(unverifiedAddress);
            const receipt = await tx.wait();

            const isApproved = await ngoOracle.approvedNGOs(unverifiedAddress);
            expect(isApproved).to.equal(false);

            const event = receipt.logs.find(log => log.fragment?.name === "NGORejected");
            expect(event).to.not.be.undefined;
            expect(event.args.ngo).to.equal(unverifiedAddress);
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
