const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovernanceToken", function () {
  let GovernanceToken, govToken;
  let admin, donor1, donor2;

    beforeEach(async function () {
    // Get signers
    [admin, donor1, donor2] = await ethers.getSigners();

    // Deploy GovernanceToken
    GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(admin.address);
    await govToken.waitForDeployment();
    });

    it("Should set the correct name and symbol", async function () {
        expect(await govToken.name()).to.equal("CharityDAO Governance");
        expect(await govToken.symbol()).to.equal("GOV");
    });

    it("Should assign the admin role to the specified admin", async function () {
        const DEFAULT_ADMIN_ROLE = await govToken.DEFAULT_ADMIN_ROLE();
        expect(await govToken.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
    });

    it("Should allow admin to pause and unpause", async function () {
        await govToken.connect(admin).pause();
        expect(await govToken.paused()).to.be.true;

        await govToken.connect(admin).unpause();
        expect(await govToken.paused()).to.be.false;
    });

    it("Should revert pause/unpause if not admin", async function () {
        await expect(
        govToken.connect(donor1).pause()
        ).to.be.revertedWithCustomError(
        govToken,
        "AccessControlUnauthorizedAccount"
        );
        await expect(
        govToken.connect(donor1).unpause()
        ).to.be.revertedWithCustomError(
        govToken,
        "AccessControlUnauthorizedAccount"
        );
    });

    it("Should revert mint if not treasury", async function () {
        const amount = ethers.parseEther("10");
        const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

        await expect(
        govToken
            .connect(admin)
            .mintOnDonation(admin.address, amount, donationId)
        ).to.be.revertedWithCustomError(
        govToken,
        "AccessControlUnauthorizedAccount"
        );
    });

    it("Should revert mint with bad params", async function () {
        const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

        await govToken
        .connect(admin)
        .grantRole(await govToken.TREASURY_ROLE(), admin.address);

        await expect(
        govToken
            .connect(admin)
            .mintOnDonation(ethers.ZeroAddress, 100, donationId)
        ).to.be.revertedWith("bad params");
        await expect(
        govToken.connect(admin).mintOnDonation(donor1.address, 0, donationId)
        ).to.be.revertedWith("bad params");
    });

    it("Should prevent transfers when paused", async function () {
        // Mint some tokens
        await govToken
        .connect(admin)
        .grantRole(await govToken.TREASURY_ROLE(), admin.address);
        await govToken
        .connect(admin)
        .mintOnDonation(
            donor1.address,
            ethers.parseEther("10"),
            ethers.keccak256(ethers.toUtf8Bytes("test"))
        );

        await govToken.connect(admin).pause();

        await expect(
        govToken
            .connect(donor1)
            .transfer(donor2.address, ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(govToken, "EnforcedPause");
    });
});
