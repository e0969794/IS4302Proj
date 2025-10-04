const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CharityDAO Contracts", function () {
  let GovernanceToken, Treasury;
  let govToken, treasury;
  let admin, ngo, donor1, donor2;
  let initialMintRate = ethers.parseEther("1"); // 1 GOV per 1 ETH

  beforeEach(async function () {
    // Get signers
    //[admin, donor1, donor2] = await ethers.getSigners();
    [admin, ngo, donor1, donor2] = await ethers.getSigners();

    // Deploy GovernanceToken
    GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(admin.address);

    // Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(admin.address, govToken.target, initialMintRate);

    // Now grant MINTER_ROLE to Treasury
    const MINTER_ROLE = await govToken.MINTER_ROLE();
    await govToken.connect(admin).grantRole(MINTER_ROLE, treasury.target);

    // Deploy Proposal
    Proposal = await ethers.getContractFactory("Proposal");
  });

  describe("GovernanceToken", function () {
    it("Should set the correct name and symbol", async function () {
        expect(await govToken.name()).to.equal("CharityDAO Governance");
        expect(await govToken.symbol()).to.equal("GOV");
    });

    it("Should assign the admin role to the specified admin", async function () {
        const DEFAULT_ADMIN_ROLE = await govToken.DEFAULT_ADMIN_ROLE();
        expect(await govToken.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should allow admin to pause and unpause", async function () {
        await govToken.connect(admin).pause();
        expect(await govToken.paused()).to.be.true;

        await govToken.connect(admin).unpause();
        expect(await govToken.paused()).to.be.false;
    });

    it("Should revert pause/unpause if not admin", async function () {
        await expect(govToken.connect(donor1).pause()).to.be.revertedWithCustomError(govToken, "AccessControlUnauthorizedAccount");
        await expect(govToken.connect(donor1).unpause()).to.be.revertedWithCustomError(govToken, "AccessControlUnauthorizedAccount");
    });

    it("Should allow minter to mint on donation", async function () {
        const amount = ethers.parseEther("10");
        const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

        // Treasury has minter role, so call from treasury context (but simulate)
        // Actually, since mintOnDonation is called by minter, we can impersonate or call directly if we grant to admin for test
        await govToken.connect(admin).grantRole(await govToken.MINTER_ROLE(), admin.address); // Temporarily grant to admin for direct test

        const tx = await govToken.connect(admin).mintOnDonation(donor1.address, amount, donationId);
        await expect(tx).to.emit(govToken, "MintedOnDonation").withArgs(donor1.address, amount, donationId);

        expect(await govToken.balanceOf(donor1.address)).to.equal(amount);
    });

    it("Should revert mint if not minter", async function () {
        const amount = ethers.parseEther("10");
        const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

        await expect(govToken.connect(donor1).mintOnDonation(donor1.address, amount, donationId))
        .to.be.revertedWithCustomError(govToken, "AccessControlUnauthorizedAccount");
    });

    it("Should revert mint with bad params", async function () {
        const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

        // Grant minter to admin
        await govToken.connect(admin).grantRole(await govToken.MINTER_ROLE(), admin.address);

        await expect(govToken.connect(admin).mintOnDonation(ethers.ZeroAddress, 100, donationId)).to.be.revertedWith("bad params");
        await expect(govToken.connect(admin).mintOnDonation(donor1.address, 0, donationId)).to.be.revertedWith("bad params");
    });

    it("Should prevent transfers when paused", async function () {
        // Mint some tokens
        await govToken.connect(admin).grantRole(await govToken.MINTER_ROLE(), admin.address);
        await govToken.connect(admin).mintOnDonation(donor1.address, ethers.parseEther("10"), ethers.keccak256(ethers.toUtf8Bytes("test")));

        await govToken.connect(admin).pause();

        await expect(govToken.connect(donor1).transfer(donor2.address, ethers.parseEther("1")))
        .to.be.revertedWithCustomError(govToken, "EnforcedPause");
    });
  });

  describe("Treasury", function () {
    it("Should set initial values correctly", async function () {
        expect(await treasury.gov()).to.equal(govToken.target);
        expect(await treasury.mintRate()).to.equal(initialMintRate);
        expect(await treasury.hasRole(await treasury.DAO_ADMIN(), admin.address)).to.be.true;
    });

    it("Should allow admin to update mint rate", async function () {
        const newRate = ethers.parseEther("2");
        const tx = await treasury.connect(admin).setMintRate(newRate);
        await expect(tx).to.emit(treasury, "MintRateUpdated").withArgs(newRate);
        expect(await treasury.mintRate()).to.equal(newRate);
    });

    it("Should revert update mint rate if not admin", async function () {
        await expect(treasury.connect(donor1).setMintRate(100)).to.be.revertedWithCustomError(treasury, "AccessControlUnauthorizedAccount");
    });

    it("Should handle ETH donation via donateETH and mint tokens", async function () {
        const donationAmount = ethers.parseEther("1");
        const expectedMint = donationAmount * initialMintRate / ethers.parseEther("1"); // Since rate is 1e18, mint 1 GOV

        const tx = await treasury.connect(donor1).donateETH({ value: donationAmount });

        const donationId = await tx.wait().then(receipt => {
        const event = receipt.logs.find(log => log.fragment?.name === "DonationReceived");
        return event.args.donationId;
        });

        await expect(tx).to.emit(treasury, "DonationReceived")
        .withArgs(donor1.address, donationAmount, expectedMint, donationId);

        expect(await govToken.balanceOf(donor1.address)).to.equal(expectedMint);
        expect(await treasury.connect(donor1).getGovTokenBalance()).to.equal(expectedMint);
        expect(await ethers.provider.getBalance(treasury.target)).to.equal(donationAmount);
    });

    it("should revert when ETH is sent directly to the Treasury", async function () {
        const donationAmount = ethers.parseEther("2");
        const expectedMint = donationAmount * initialMintRate / ethers.parseEther("1");
        await expect(donor1.sendTransaction({ to: treasury.target, value: donationAmount })).to.be.reverted;

    });

    it("Should revert donation if zero ETH", async function () {
        await expect(treasury.connect(donor1).donateETH({ value: 0 })).to.be.revertedWith("zero ETH");;
    });

    it("Should revert donation if mintRate is zero", async function () {
        await treasury.connect(admin).setMintRate(0);
        await expect(treasury.connect(donor1).donateETH({ value: ethers.parseEther("1") })).to.be.revertedWith("mintRate=0");
    });
  });
  
  describe("NGOOracleMock", function () {
    let ngoOracle;
    let deployer, verifiedNGO, unverifiedNGO;

    beforeEach(async function () {
        [deployer, verifiedNGO, unverifiedNGO] = await ethers.getSigners();

        // ✅ Deploy the oracle contract
        const NGOOracle = await ethers.getContractFactory("NGOOracle");
        ngoOracle = await NGOOracle.deploy();
        await ngoOracle.waitForDeployment();
    });

    it("should pre-approve 3 NGOs at deployment", async function () {
        const ngo1 = "0x1111111111111111111111111111111111111111";
        const ngo2 = "0x2222222222222222222222222222222222222222";
        const ngo3 = "0x3333333333333333333333333333333333333333";

        // Check they are approved
        expect(await ngoOracle.approvedNGOs(ngo1)).to.equal(true);
        expect(await ngoOracle.approvedNGOs(ngo2)).to.equal(true);
        expect(await ngoOracle.approvedNGOs(ngo3)).to.equal(true);

        // Check their details exist
        const details1 = await ngoOracle.ngoDetails(ngo1);
        const details2 = await ngoOracle.ngoDetails(ngo2);
        const details3 = await ngoOracle.ngoDetails(ngo3);

        expect(details1).to.contain("Red Cross");
        expect(details2).to.contain("Save the Children");
        expect(details3).to.contain("World Wildlife");
    });

    it("should return true and emit NGOVerified for verified NGO", async function () {
        const verifiedAddress = "0x1111111111111111111111111111111111111111";

        // Call verifyNGO
        const tx = await ngoOracle.verifyNGO(verifiedAddress);
        const receipt = await tx.wait();

        // Should return true
        const result = await ngoOracle.approvedNGOs(verifiedAddress);
        expect(result).to.equal(true);

        // Check emitted event
        const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "NGOVerified"
        );
        expect(event).to.not.be.undefined;
        expect(event.args.ngo).to.equal(verifiedAddress);
    });

    it("should return false and emit NGORejected for unverified NGO", async function () {
        const unverifiedAddress = unverifiedNGO.address;

        // Call verifyNGO
        const tx = await ngoOracle.verifyNGO(unverifiedAddress);
        const receipt = await tx.wait();

        // Check it returns false
        const isApproved = await ngoOracle.approvedNGOs(unverifiedAddress);
        expect(isApproved).to.equal(false);

        // Check NGORejected event emitted
        const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "NGORejected"
        );
        expect(event).to.not.be.undefined;
        expect(event.args.ngo).to.equal(unverifiedAddress);
    });
    });

    describe("Proposal creation", function () {
    let proposalAddress, proposal;
    const milestonesDesc = ["Build school", "Purchase books"];
    const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];
    const totalFunds = ethers.parseEther("3");

    beforeEach(async function () {
        const tx = await treasury.connect(ngo).createProposal(totalFunds, milestonesDesc, milestonesAmt);
        const receipt = await tx.wait();

        const event = receipt.logs
        .map(log => {
            try { return treasury.interface.parseLog(log); } 
            catch { return null; }
        })
        .filter(e => e && e.name === "ProposalCreated")[0];

        if (!event) throw new Error("ProposalCreated event not found");
        proposalAddress = event.args.proposalAddress;

        proposal = Proposal.attach(proposalAddress);
    });

    it("Should create proposal given the correct details", async function () {
        expect(await proposal.ngo()).to.equal(ngo.address);
        expect(await proposal.treasury()).to.equal(treasury.target);
        expect(await proposal.totalFunds()).to.equal(totalFunds);
        expect(await proposal.fundsDisbursed()).to.equal(0);
        expect(await proposal.isApproved()).to.equal(false);
        expect(await proposal.milestoneCount()).to.equal(2);

        const milestone0 = await proposal.getMilestone(0);
        expect(milestone0.description).to.equal("Build school");
        expect(milestone0.amount).to.equal(milestonesAmt[0]);
        expect(milestone0.completed).to.equal(false);
        expect(milestone0.released).to.equal(false);
    });
    it("Should allow treasury/admin to approve the proposal", async function () {
        expect(await proposal.isApproved()).to.equal(false);
        const proposalId = 1;
        await treasury.connect(admin).approveProposal(proposalId);
        expect(await proposal.isApproved()).to.equal(true);
    });
    });
});
