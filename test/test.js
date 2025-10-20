const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CharityDAO Contracts", function () {
  let GovernanceToken, Treasury, ProposalManager, VotingManager;
  let govToken, treasury, proposalManager, votingManager;
  let admin, ngo, donor1, donor2, donor3;
  let initialMintRate = ethers.parseEther("1"); // 1 GOV per 1 ETH

  beforeEach(async function () {
    // Get signers
    //[admin, donor1, donor2] = await ethers.getSigners();
    [admin, ngo, donor1, donor2, donor3] = await ethers.getSigners();

    // 1. Deploy GovernanceToken
    GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(admin.address);
    await govToken.waitForDeployment();

    // 2. Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(
      admin.address,
      govToken.target,
      initialMintRate //dont think we need this
    );
    await treasury.waitForDeployment();
    console.log("Treasury deployed at:", treasury.target);

    // Now grant TREASURY_ROLE to Treasury
    const TREASURY_ROLE = await govToken.TREASURY_ROLE();
    await govToken.connect(admin).grantRole(TREASURY_ROLE, treasury.target);

    // 3. Deploy ProposalManager
    ProposalManager = await ethers.getContractFactory("ProposalManager");
    proposalManager = await ProposalManager.deploy(
      admin.address,
    ); //dont need to grant role
    await proposalManager.waitForDeployment();
    console.log("ProposalManager deployed at:", proposalManager.target);

    // 4. Deploy VotingManager
    VotingManager = await ethers.getContractFactory("VotingManager");
    votingManager = await VotingManager.deploy(
      admin.address,
      proposalManager.target,
      treasury.target
    );
    await votingManager.waitForDeployment();
    console.log("VotingManager deployed at:", votingManager.target);

    // grant BURNER_ROLE and DISBURSER to VotingManager 
    const BURNER_ROLE = await treasury.BURNER_ROLE();
    await treasury.connect(admin).grantRole(BURNER_ROLE, votingManager.target);
    const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
    await treasury.connect(admin).grantRole(DISBURSER_ROLE, votingManager.target);
  });
  
  //this part onwards needs work

  describe("GovernanceToken", function () {

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

  describe("Treasury", function () {
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
        const amountWei = ethers.parseEther("0.5");
      
        await expect(
          treasury.connect(donor1).disburseMilestoneFunds(ngo.address, amountWei)
        ).to.be.revertedWithCustomError(
          treasury,
          "AccessControlUnauthorizedAccount"
        );
      });
      
      it("Should allow admin (with DISBURSER_ROLE) to disburse funds", async function () {
        const amountWei = ethers.parseEther("0.5");
      
        // Donate ETH so Treasury has funds
        await treasury.connect(donor1).donateETH({ value: ethers.parseEther("1") });
      
        // Grant DISBURSER_ROLE to admin
        const disburserRole = await treasury.DISBURSER_ROLE();
        await treasury.connect(admin).grantRole(disburserRole, admin.address);
      
        const ngoBalanceBefore = await ethers.provider.getBalance(ngo.address);
      
        const tx = await treasury
          .connect(admin)
          .disburseMilestoneFunds(ngo.address, amountWei);
        await tx.wait();
      
        const ngoBalanceAfter = await ethers.provider.getBalance(ngo.address);
        expect(ngoBalanceAfter).to.be.gt(ngoBalanceBefore);
      });
  });


  describe("ProposalManager", function () {
    let proposaltarget, proposalId;
    const milestonesDesc = ["Build school", "Purchase books"];
    const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];

    beforeEach(async function () {
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
    });

    it("Should create proposal given the correct details", async function () {
      const proposal = await proposalManager.getProposal(proposalId);

      expect(await proposal.ngo).to.equal(ngo.address);
      
      const milestones = proposal[2]
      expect(await milestones.length).to.equal(2);

      const milestone0 = await milestones[0];
      expect(milestone0[0]).to.equal("Build school");
      expect(milestone0[1]).to.equal(ethers.parseEther("1"));
    });
  });
  
/*
  describe("VotingManager", function () {
    let proposaltarget, proposal;
    const milestonesDesc = ["Build school", "Purchase books", "Hire teachers"];
    const milestonesAmt = [
      ethers.parseEther("10"),
      ethers.parseEther("5"),
      ethers.parseEther("8"),
    ]; // 10 ETH, 5 ETH, 8 ETH
    const totalFunds = ethers.parseEther("23");
    let proposalId = 1;

    beforeEach(async function () {
      // Create a proposal (no approval needed - all proposals are votable immediately)
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(totalFunds, milestonesDesc, milestonesAmt);
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
      proposaltarget = event.args.proposaltarget;
      proposalId = Proposal.attach(proposaltarget);

      // Give donors some tokens by making donations
      await treasury
        .connect(donor1)
        .donateETH({ value: ethers.parseEther("100") }); // 100 GOV tokens
      await treasury
        .connect(donor2)
        .donateETH({ value: ethers.parseEther("50") }); // 50 GOV tokens
      await treasury
        .connect(donor3)
        .donateETH({ value: ethers.parseEther("25") }); // 25 GOV tokens
    });

    describe("Deployment and Setup", function () {
      it("Should deploy with correct initial values", async function () {
        expect(await votingManager.govToken()).to.equal(govToken.target);
        expect(await votingManager.proposalManager()).to.equal(
          proposalManager.target
        );
        expect(await votingManager.treasury()).to.equal(treasury.target);
        expect(
          await votingManager.hasRole(
            await votingManager.DAO_ADMIN(),
            admin.address
          )
        ).to.be.true;
      });

      it("Should be set as VotingManager in Treasury", async function () {
        expect(await treasury.votingManager()).to.equal(votingManager.target);
        const VOTING_MANAGER_ROLE = await treasury.VOTING_MANAGER_ROLE();
        expect(
          await treasury.hasRole(VOTING_MANAGER_ROLE, votingManager.target)
        ).to.be.true;
      });
    });

    describe("Credit Management", function () {
      it("Should calculate available credits correctly", async function () {
        expect(
          await votingManager.getAvailableCredits(donor1.address)
        ).to.equal(ethers.parseEther("100")); // 100 GOV tokens = 100 credits
        expect(
          await votingManager.getAvailableCredits(donor2.address)
        ).to.equal(ethers.parseEther("50")); // 50 GOV tokens = 50 credits
        expect(
          await votingManager.getAvailableCredits(donor3.address)
        ).to.equal(ethers.parseEther("25")); // 25 GOV tokens = 25 credits
      });

      it("Should track spent credits correctly", async function () {
        // Cast 10 votes (costs 10^2 = 100 credits)
        await votingManager.connect(donor1).vote(proposalId, 10);

        expect(await votingManager.totalCreditsSpent(donor1.address)).to.equal(
          100
        );
        expect(
          await votingManager.getAvailableCredits(donor1.address)
        ).to.equal(ethers.parseEther("100") - BigInt(100));
      });

      it("Should handle multiple votes correctly (quadratic cost)", async function () {
        // First vote: 5 votes (costs 5^2 = 25 credits)
        await votingManager.connect(donor2).vote(proposalId, 5);
        expect(await votingManager.totalCreditsSpent(donor2.address)).to.equal(
          25
        );

        // Second vote: 3 more votes (total 8 votes, costs 8^2 = 64 credits, additional cost = 64-25 = 39)
        await votingManager.connect(donor2).vote(proposalId, 3);
        expect(await votingManager.totalCreditsSpent(donor2.address)).to.equal(
          64
        );

        const [votes, creditsSpent] = await votingManager.getUserVotes(
          proposalId,
          donor2.address
        );
        expect(votes).to.equal(8);
        expect(creditsSpent).to.equal(64);
      });
    });

    describe("Voting Functionality", function () {
      it("Should allow voting on approved proposals", async function () {
        const votesToCast = 10;
        const expectedCredits = votesToCast * votesToCast; // 100

        const tx = await votingManager
          .connect(donor1)
          .vote(proposalId, votesToCast);

        await expect(tx)
          .to.emit(votingManager, "VoteCast")
          .withArgs(donor1.address, proposalId, votesToCast, expectedCredits);

        expect(await votingManager.getProposalVotes(proposalId)).to.equal(
          votesToCast
        );

        const [userVotes, userCredits] = await votingManager.getUserVotes(
          proposalId,
          donor1.address
        );
        expect(userVotes).to.equal(votesToCast);
        expect(userCredits).to.equal(expectedCredits);
      });

      it("Should revert voting on non-existent proposals", async function () {
        // Try to vote on a proposal ID that doesn't exist
        const nonExistentProposalId = 999;

        await expect(
          votingManager.connect(donor1).vote(nonExistentProposalId, 5)
        ).to.be.revertedWith("Proposal does not exist");
      });

      it("Should revert if insufficient credits", async function () {
        // donor3 has 25 GOV tokens = 25 * 1e18 credits
        // Trying to cast 6 votes would cost 6^2 = 36 credits (in base units)
        // But we need to account for the token decimals
        const availableCredits = await votingManager.getAvailableCredits(
          donor3.address
        );
        console.log(
          "Available credits for donor3:",
          availableCredits.toString()
        );

        // Try to cast enough votes that would exceed their credits
        // donor3 has 25e18 credits, so casting 25e9 + 1 votes would cost (25e9+1)^2 which exceeds 25e18
        const votesToCast = Math.floor(Math.sqrt(Number(availableCredits))) + 1;

        await expect(
          votingManager.connect(donor3).vote(proposalId, votesToCast)
        ).to.be.revertedWith("Insufficient credits");
      });

      it("Should revert if zero votes", async function () {
        await expect(
          votingManager.connect(donor1).vote(proposalId, 0)
        ).to.be.revertedWith("Must cast at least 1 vote");
      });
    });

    describe("Milestone Processing", function () {
      it("Should calculate milestone thresholds correctly", async function () {
        // Milestone thresholds are calculated as milestoneAmount / 1e14
        // Milestone 0: 10 ETH = 1e19 wei, threshold = 1e19 / 1e14 = 1e5 = 100,000 votes
        // Milestone 1: 5 ETH = 5e18 wei, threshold = 5e18 / 1e14 = 5e4 = 50,000 votes
        // Milestone 2: 8 ETH = 8e18 wei, threshold = 8e18 / 1e14 = 8e4 = 80,000 votes

        const [totalVotes, totalMilestones, thresholds, unlocked] =
          await votingManager.getVotingDetails(proposalId);

        expect(totalMilestones).to.equal(3);
        expect(thresholds[0]).to.equal(100000); // 10 ETH threshold
        expect(thresholds[1]).to.equal(50000); // 5 ETH threshold
        expect(thresholds[2]).to.equal(80000); // 8 ETH threshold
        expect(unlocked[0]).to.be.false;
        expect(unlocked[1]).to.be.false;
        expect(unlocked[2]).to.be.false;
      });

      it("Should unlock milestones when thresholds are met", async function () {
        // We need 100,000 votes for first milestone (10 ETH)
        // This is a very high threshold for testing, so let's create a proposal with smaller amounts for testing

        // Create a new proposal with smaller milestone amounts for easier testing
        const testMilestonesDesc = ["Test milestone 1", "Test milestone 2"];
        const testMilestonesAmt = [
          ethers.parseEther("0.001"),
          ethers.parseEther("0.002"),
        ]; // Very small amounts
        // Thresholds will be: 0.001 ETH = 1e15 wei, threshold = 1e15/1e14 = 10 votes
        //                     0.002 ETH = 2e15 wei, threshold = 2e15/1e14 = 20 votes

        const testTotalFunds = ethers.parseEther("0.003");

        // Get current proposal ID
        const currentProposalId = await proposalManager.nextProposalId();
        const testProposalId = currentProposalId;

        const tx = await proposalManager
          .connect(ngo)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Get the test proposal target
        const testProposalAddr = await proposalManager.getProposal(
          testProposalId
        );
        const testProposal = Proposal.attach(testProposalAddr);

        // Grant VotingManager DAO_ADMIN role on the proposal
        const DAO_ADMIN = await testProposal.DAO_ADMIN();
        await testProposal
          .connect(admin)
          .grantRole(DAO_ADMIN, votingManager.target);

        // Cast enough votes to unlock first milestone (need 10 votes)
        const initialTreasuryBalance = await ethers.provider.getBalance(
          treasury.target
        );

        const voteTx = await votingManager
          .connect(donor1)
          .vote(testProposalId, 10);

        // Check that milestone was unlocked and funds transferred
        await expect(voteTx)
          .to.emit(votingManager, "MilestoneUnlocked")
          .withArgs(testProposalId, 0, testMilestonesAmt[0]);

        await expect(voteTx)
          .to.emit(votingManager, "FundsReleased")
          .withArgs(testProposalId, 0, ngo.target, testMilestonesAmt[0]);

        expect(await votingManager.isMilestoneUnlocked(testProposalId, 0)).to.be
          .true;
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 1)).to.be
          .false;

        // Verify funds were transferred from treasury
        const finalTreasuryBalance = await ethers.provider.getBalance(
          treasury.target
        );
        expect(initialTreasuryBalance - finalTreasuryBalance).to.equal(
          testMilestonesAmt[0]
        );
      });

      it("Should unlock multiple milestones in order", async function () {
        // Using the same test proposal from previous test
        const testMilestonesDesc = ["Test milestone 1", "Test milestone 2"];
        const testMilestonesAmt = [
          ethers.parseEther("0.001"),
          ethers.parseEther("0.002"),
        ];
        const testTotalFunds = ethers.parseEther("0.003");

        // Get current proposal ID
        const currentProposalId = await proposalManager.nextProposalId();
        const testProposalId = currentProposalId;

        const tx = await proposalManager
          .connect(ngo)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Grant VotingManager DAO_ADMIN role on the proposal
        const testProposalAddr = await proposalManager.getProposal(
          testProposalId
        );
        const testProposal = Proposal.attach(testProposalAddr);
        const DAO_ADMIN = await testProposal.DAO_ADMIN();
        await testProposal
          .connect(admin)
          .grantRole(DAO_ADMIN, votingManager.target);

        // Cast enough votes to unlock both milestones (need 20 votes for second milestone)
        const voteTx = await votingManager
          .connect(donor1)
          .vote(testProposalId, 20);

        // Both milestones should be unlocked
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 0)).to.be
          .true;
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 1)).to.be
          .true;

        // Check milestone status
        const [totalVotes, milestonesUnlocked, totalMilestones] =
          await votingManager.getMilestoneStatus(testProposalId);
        expect(totalVotes).to.equal(20);
        expect(milestonesUnlocked).to.equal(2);
        expect(totalMilestones).to.equal(2);
      });

      it("Should handle manual milestone processing by admin", async function () {
        const testMilestonesDesc = ["Manual test"];
        const testMilestonesAmt = [ethers.parseEther("0.001")];
        const testTotalFunds = ethers.parseEther("0.001");

        // Get current proposal ID
        const currentProposalId = await proposalManager.nextProposalId();
        const testProposalId = currentProposalId;

        const tx = await proposalManager
          .connect(ngo)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Grant VotingManager DAO_ADMIN role on the proposal
        const testProposalAddr = await proposalManager.getProposal(
          testProposalId
        );
        const testProposal = Proposal.attach(testProposalAddr);
        const DAO_ADMIN = await testProposal.DAO_ADMIN();
        await testProposal
          .connect(admin)
          .grantRole(DAO_ADMIN, votingManager.target);

        // Cast votes
        await votingManager.connect(donor1).vote(testProposalId, 10);

        // Admin can manually process milestones
        await expect(
          votingManager.connect(admin).processMilestones(testProposalId)
        ).to.not.be.reverted;
      });
    });

    describe("Multiple Users Voting", function () {
      it("Should aggregate votes from multiple users", async function () {
        const testMilestonesDesc = ["Multi-user test"];
        const testMilestonesAmt = [ethers.parseEther("0.002")]; // 20 votes needed
        const testTotalFunds = ethers.parseEther("0.002");

        // Get current proposal ID
        const currentProposalId = await proposalManager.nextProposalId();
        const testProposalId = currentProposalId;

        const tx = await proposalManager
          .connect(ngo)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Grant VotingManager DAO_ADMIN role on the proposal
        const testProposalAddr = await proposalManager.getProposal(
          testProposalId
        );
        const testProposal = Proposal.attach(testProposalAddr);
        const DAO_ADMIN = await testProposal.DAO_ADMIN();
        await testProposal
          .connect(admin)
          .grantRole(DAO_ADMIN, votingManager.target);

        // Multiple users vote
        await votingManager.connect(donor1).vote(testProposalId, 8); // 8 votes, 64 credits
        await votingManager.connect(donor2).vote(testProposalId, 7); // 7 votes, 49 credits
        await votingManager.connect(donor3).vote(testProposalId, 5); // 5 votes, 25 credits

        // Total votes should be 8 + 7 + 5 = 20
        expect(await votingManager.getProposalVotes(testProposalId)).to.equal(
          20
        );

        // Milestone should be unlocked (needs 20 votes)
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 0)).to.be
          .true;

        // Check individual user votes
        const [votes1, credits1] = await votingManager.getUserVotes(
          testProposalId,
          donor1.address
        );
        const [votes2, credits2] = await votingManager.getUserVotes(
          testProposalId,
          donor2.address
        );
        const [votes3, credits3] = await votingManager.getUserVotes(
          testProposalId,
          donor3.address
        );

        expect(votes1).to.equal(8);
        expect(credits1).to.equal(64);
        expect(votes2).to.equal(7);
        expect(credits2).to.equal(49);
        expect(votes3).to.equal(5);
        expect(credits3).to.equal(25);
      });
    });

    describe("Error Handling", function () {
      it("Should revert for non-existent proposals", async function () {
        await expect(
          votingManager.connect(donor1).vote(999, 5)
        ).to.be.revertedWith("Proposal does not exist");
      });

      it("Should handle proposals with no milestones gracefully", async function () {
        // This should be handled at the proposal creation level, but test edge case
        const [totalVotes, milestonesUnlocked, totalMilestones] =
          await votingManager.getMilestoneStatus(999);
        expect(totalVotes).to.equal(0);
        expect(milestonesUnlocked).to.equal(0);
        expect(totalMilestones).to.equal(0);
      });
    });

    describe("Integration with Treasury", function () {
      it("Should transfer funds from treasury to NGO when milestone unlocks", async function () {
        const testMilestonesDesc = ["Treasury integration test"];
        const testMilestonesAmt = [ethers.parseEther("0.001")]; // 10 votes needed
        const testTotalFunds = ethers.parseEther("0.001");

        // Get current proposal ID
        const currentProposalId = await proposalManager.nextProposalId();
        const testProposalId = currentProposalId;

        const tx = await proposalManager
          .connect(ngo)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Grant VotingManager DAO_ADMIN role on the proposal
        const testProposalAddr = await proposalManager.getProposal(
          testProposalId
        );
        const testProposal = Proposal.attach(testProposalAddr);
        const DAO_ADMIN = await testProposal.DAO_ADMIN();
        await testProposal
          .connect(admin)
          .grantRole(DAO_ADMIN, votingManager.target);

        const initialNgoBalance = await ethers.provider.getBalance(ngo.target);
        const initialTreasuryBalance = await ethers.provider.getBalance(
          treasury.target
        );

        // Cast votes to unlock milestone
        await votingManager.connect(donor1).vote(testProposalId, 10);

        const finalNgoBalance = await ethers.provider.getBalance(ngo.target);
        const finalTreasuryBalance = await ethers.provider.getBalance(
          treasury.target
        );

        // NGO should receive the milestone amount
        expect(finalNgoBalance - initialNgoBalance).to.equal(
          testMilestonesAmt[0]
        );
        // Treasury should lose the milestone amount
        expect(initialTreasuryBalance - finalTreasuryBalance).to.equal(
          testMilestonesAmt[0]
        );
      });
    });
  });
  */
});