const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Treasury", function () {
    let GovernanceToken, govToken;
    let admin, donor1, ngo;
    let initialMintRate = 1;

    beforeEach(async function () {
    // Get signers
    [admin, donor1, ngo] = await ethers.getSigners();

    // Deploy GovernanceToken
    GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(admin.address);
    await govToken.waitForDeployment();

    // Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(
      admin.address,
      govToken.target,
      initialMintRate //dont think we need this
    );
    await treasury.waitForDeployment();
    // console.log("Treasury deployed at:", treasury.target);

    // Now grant TREASURY_ROLE to Treasury
    const TREASURY_ROLE = await govToken.TREASURY_ROLE();
    await govToken.connect(admin).grantRole(TREASURY_ROLE, treasury.target);
    });

    it("Should set initial values correctly", async function () {
        expect(await treasury.token()).to.equal(govToken.target);
        expect(await treasury.mintRate()).to.equal(initialMintRate);
        expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), admin.address))
        .to.be.true;
    });

    it("Should allow admin to update mint rate", async function () {
        const newRate = ethers.parseEther("2");
        const tx = await treasury.connect(admin).setMintRate(newRate);
        await expect(tx).to.emit(treasury, "MintRateUpdated").withArgs(newRate);
        expect(await treasury.mintRate()).to.equal(newRate);
    });

    it("Should revert update mint rate if not admin", async function () {
        await expect(
        treasury.connect(donor1).setMintRate(100)
        ).to.be.revertedWithCustomError(
        treasury,
        "AccessControlUnauthorizedAccount"
        );
    });

    it("Should handle ETH donation via donateETH and mint tokens", async function () {
        const donationAmount = ethers.parseEther("1");
        const expectedMint =
        (donationAmount * initialMintRate) / ethers.parseEther("1"); // Since rate is 1e18, mint 1 GOV

        const tx = await treasury
        .connect(donor1)
        .donateETH({ value: donationAmount });

        const donationId = await tx.wait().then((receipt) => {
        const event = receipt.logs.find(
            (log) => log.fragment?.name === "DonationReceived"
        );
        return event.args.donationId;
        });

        await expect(tx)
        .to.emit(treasury, "DonationReceived")
        .withArgs(donor1.address, donationAmount, expectedMint, donationId);

        expect(await govToken.balanceOf(donor1.address)).to.equal(expectedMint);
        expect(await treasury.connect(donor1).getTokenBalance(donor1.address)).to.equal(
        expectedMint
        );
        expect(await ethers.provider.getBalance(treasury.target)).to.equal(
        donationAmount
        );
    });

    it("should revert when ETH is sent directly to the Treasury", async function () {
        const donationAmount = ethers.parseEther("2");
        const expectedMint =
        (donationAmount * initialMintRate) / ethers.parseEther("1");
        await expect(
        donor1.sendTransaction({ to: treasury.target, value: donationAmount })
        ).to.be.reverted;
    });

    it("Should revert donation if zero ETH", async function () {
        await expect(
        treasury.connect(donor1).donateETH({ value: 0 })
        ).to.be.revertedWith("zero ETH");
    });

    it("Should revert donation if mintRate is zero", async function () {
        await treasury.connect(admin).setMintRate(0);
        await expect(
        treasury.connect(donor1).donateETH({ value: ethers.parseEther("1") })
        ).to.be.revertedWith("mintRate=0");
    });
    it("Should revert burnETH if caller is not BURNER_ROLE", async function () {
        const burnAmount = ethers.parseEther("1");
        
        // donor1 should not have the BURNER_ROLE
        await expect(
            treasury.connect(donor1).burnETH(donor1.address, burnAmount)
        ).to.be.revertedWithCustomError(
            treasury,
            "AccessControlUnauthorizedAccount"
        );
    });
    
    it("Should allow admin (with BURNER_ROLE) to burn tokens", async function () {
    const burnAmount = ethers.parseEther("1");
    
    // Give donor1 some GOV tokens first
    await treasury.connect(donor1).donateETH({ value: burnAmount });
    
    // Grant BURNER_ROLE to admin
    const burnerRole = await treasury.BURNER_ROLE();
    await treasury.connect(admin).grantRole(burnerRole, admin.address);
    
    const balanceBefore = await govToken.balanceOf(donor1.address);
    
    // Burn tokens
    await expect(treasury.connect(admin).burnETH(donor1.address, burnAmount))
        .to.emit(govToken, "Transfer")
        .withArgs(donor1.address, ethers.ZeroAddress, burnAmount);
    
    const balanceAfter = await govToken.balanceOf(donor1.address);
    expect(balanceAfter).to.equal(balanceBefore - burnAmount);
    });
    
    it("Should revert disburseMilestoneFunds if caller is not DISBURSER_ROLE", async function () {
        const tokensDisbursed = "0.5";
        const weiDisbursed = ethers.parseEther(tokensDisbursed);
        
        await expect(
            treasury.connect(donor1).disburseMilestoneFunds(ngo.address, weiDisbursed)
        ).to.be.revertedWithCustomError(
            treasury,
            "AccessControlUnauthorizedAccount"
        );
    });
    
    it("Should allow admin (with DISBURSER_ROLE) to disburse funds", async function () {
        const tokensDonated = 2;
        const weiDonated = ethers.parseEther(tokensDonated.toString());
        const tokensDisbursed = 1;
        const weiDisbursed = ethers.parseEther(tokensDisbursed.toString());
    
        // Donate ETH so Treasury has funds
        await treasury.connect(donor1).donateETH({ value: weiDonated }); 
        //^^now donor should have 2 token worth of funds 
        
        // Grant DISBURSER_ROLE to admin
        const disburserRole = await treasury.DISBURSER_ROLE();
        await treasury.connect(admin).grantRole(disburserRole, admin.address);
        
        const ngoBalanceBefore = await ethers.provider.getBalance(ngo.address);
        
        const tx = await treasury
            .connect(admin)
            .disburseMilestoneFunds(ngo.address, tokensDisbursed);
        await tx.wait();
        
        const ngoBalanceAfter = await ethers.provider.getBalance(ngo.address);
        expect(ngoBalanceAfter).to.be.gt(ngoBalanceBefore);
    });
});