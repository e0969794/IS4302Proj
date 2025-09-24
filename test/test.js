const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CharityDAO Contracts", function () {
  let GovernanceToken, Treasury;
  let govToken, treasury;
  let admin, donor1, donor2;
  let initialMintRate = ethers.parseEther("1"); // 1 GOV per 1 ETH

  beforeEach(async function () {
    // Get signers
    [admin, donor1, donor2] = await ethers.getSigners();

    // Deploy GovernanceToken
    GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(admin.address);

    // Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(admin.address, govToken.target, initialMintRate);

    // Now grant MINTER_ROLE to Treasury
    const MINTER_ROLE = await govToken.MINTER_ROLE();
    await govToken.connect(admin).grantRole(MINTER_ROLE, treasury.target);
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
        expect(await ethers.provider.getBalance(treasury.target)).to.equal(donationAmount);
    });

    it("Should handle ETH donation via receive fallback", async function () {
        const donationAmount = ethers.parseEther("2");
        const expectedMint = donationAmount * initialMintRate / ethers.parseEther("1");

        const tx = await donor1.sendTransaction({ to: treasury.target, value: donationAmount });
        const receipt = await tx.wait();

        // Parse the DonationReceived event using the contract's ABI
        const donationReceivedEvent = receipt.logs.find(log => {
            try {
                const parsedLog = treasury.interface.parseLog(log);
                return parsedLog?.name === "DonationReceived";
            } catch {
                return false; // Ignore logs that can't be parsed
            }
        });

        if (!donationReceivedEvent) {
            throw new Error("DonationReceived event not found in transaction receipt");
        }
        const parsedLog = treasury.interface.parseLog(donationReceivedEvent);
        const donationId = parsedLog.args.donationId;

        await expect(tx).to.emit(treasury, "DonationReceived")
            .withArgs(donor1.address, donationAmount, expectedMint, donationId);

        expect(await govToken.balanceOf(donor1.address)).to.equal(expectedMint);
        expect(await ethers.provider.getBalance(treasury.target)).to.equal(donationAmount);
    });

    it("Should revert donation if zero ETH", async function () {
        await expect(treasury.connect(donor1).donateETH({ value: 0 })).to.be.revertedWith("zero ETH");
        await expect(donor1.sendTransaction({ to: treasury.target, value: 0 })).to.be.revertedWith("zero ETH");
    });

    it("Should revert donation if mintRate is zero", async function () {
        await treasury.connect(admin).setMintRate(0);
        await expect(treasury.connect(donor1).donateETH({ value: ethers.parseEther("1") })).to.be.revertedWith("mintRate=0");
    });
  });
});
