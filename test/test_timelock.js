const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getFunctionDocumentation } = require("typechain");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("CharityDAO Contracts (TimeLock)", function () {
  let admin, donor1, donor2, donor3, ngo1, ngo2;
  let GovToken, govToken;
  let treasury, proposalManager, votingManager;
  let initialMintRate;
  let timelock;

  beforeEach(async function () {
    [admin, ngo1, ngo2, donor1, donor2, donor3] = await ethers.getSigners();

    // Set up TimeLock
    const TimeLock = await ethers.getContractFactory("TimeLock");
    timelock = await TimeLock.deploy(); 
    await timelock.waitForDeployment();


    // Deploy GovernanceToken
    const GovTokenFactory = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovTokenFactory.deploy(admin.address);
    await govToken.waitForDeployment(); 

    const MINTER_ROLE = await govToken.MINTER_ROLE();
    await govToken.connect(admin).grantRole(MINTER_ROLE, admin.address);

    // Deploy Treasury
    const Treasury = await ethers.getContractFactory("Treasury");
    initialMintRate = ethers.parseEther("1"); // 1 GOV per ETH
    treasury = await Treasury.deploy(
      admin.address,
      govToken.getAddress(),
      initialMintRate,
      10,
      100
    );
    await treasury.waitForDeployment();

    await govToken.connect(admin).grantRole(MINTER_ROLE, treasury.getAddress());

    //Deploy PrposalManager
    const ProposalManager = await ethers.getContractFactory("ProposalManager");
    proposalManager = await ProposalManager.deploy(admin.address, treasury.target);
    await proposalManager.waitForDeployment(); 

     // Deploy VotingManager
    VotingManager = await ethers.getContractFactory("VotingManager");
    votingManager = await VotingManager.deploy(
    admin.address,
    govToken.target,
    proposalManager.target,
    treasury.target,
    timelock.target
    );

    // Set VotingManager in Treasury
    await treasury.connect(admin).setVotingManager(votingManager.target);

    const TREASURY_ADMIN = await treasury.TREASURY_ADMIN();
    await proposalManager
      .connect(admin)
      .grantRole(TREASURY_ADMIN, votingManager.target);
  });
  
  describe("Governance Token", function() {
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

    it("Should allow minter to mint on donation", async function () {
      const amount = ethers.parseEther("10");
      const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

      // Treasury has minter role, so call from treasury context (but simulate)
      // Actually, since mintOnDonation is called by minter, we can impersonate or call directly if we grant to admin for test
      await govToken
        .connect(admin)
        .grantRole(await govToken.MINTER_ROLE(), admin.address); // Temporarily grant to admin for direct test

      const tx = await govToken
        .connect(admin)
        .mintOnDonation(donor1.address, amount, donationId);
      await expect(tx)
        .to.emit(govToken, "MintedOnDonation")
        .withArgs(donor1.address, amount, donationId);

      expect(await govToken.balanceOf(donor1.address)).to.equal(amount);
    });

    it("Should revert mint if not minter", async function () {
      const amount = ethers.parseEther("10");
      const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

      await expect(
        govToken
          .connect(donor1)
          .mintOnDonation(donor1.address, amount, donationId)
      ).to.be.revertedWithCustomError(
        govToken,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should revert mint with bad params", async function () {
      const donationId = ethers.keccak256(ethers.toUtf8Bytes("testId"));

      // Grant minter to admin
      await govToken
        .connect(admin)
        .grantRole(await govToken.MINTER_ROLE(), admin.address);

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
        .grantRole(await govToken.MINTER_ROLE(), admin.address);
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

  describe("Treasury", function() {
    it("Should set initial values correctly", async function () {
      expect(await treasury.gov()).to.equal(govToken.target);
      expect(await treasury.mintRate()).to.equal(initialMintRate);
      expect(await treasury.hasRole(await treasury.TREASURY_ADMIN(), admin.address))
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
      expect(await treasury.connect(donor1).getGovTokenBalance()).to.equal(
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
      ).to.be.revertedWith("Zero ETH");
    });

    it("Should revert donation if mintRate is zero", async function () {
      await treasury.connect(admin).setMintRate(0);
      await expect(
        treasury.connect(donor1).donateETH({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("mintRate=0");
    });
  });

  describe("ProposalManager", function() {
    it("Should set admin and treasury correctly", async function () {
      expect(await proposalManager.admin()).to.equal(admin.address);
      expect(await proposalManager.treasury()).to.equal(treasury.target);
    });
    it("Should create a proposal with correct details", async function () {
      const tx = await proposalManager.connect(ngo1).createProposal(
        ethers.parseEther("3"),
        ["Build school", "Purchase books"],
        [ethers.parseEther("1"), ethers.parseEther("2")]
      );
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

      expect(event).to.exist;
      expect(event.args.ngo).to.equal(ngo1.address);
      expect(event.args.proposalId).to.equal(1);

      const milestone0 = await proposalManager.getMilestone(1, 0);
      expect(milestone0[0]).to.equal("Build school");
      expect(milestone0[1]).to.equal(ethers.parseEther("1"));
      expect(milestone0[2]).to.equal(false);
      expect(milestone0[3]).to.equal(false);

      const milestone1 = await proposalManager.getMilestone(1, 1);
      expect(milestone1[0]).to.equal("Purchase books");
      expect(milestone1[1]).to.equal(ethers.parseEther("2"));
    });
    it("Should return all proposals", async function () {
      const tx = await proposalManager.connect(ngo1).createProposal(
          ethers.parseEther("3"),
          ["Build school", "Purchase books"],
          [ethers.parseEther("1"), ethers.parseEther("2")]
      );

      const tx2 = await proposalManager.connect(ngo2).createProposal(
          ethers.parseEther("5"),
          ["Build a well"],
          [ethers.parseEther("5")]
      );

      const all = await proposalManager.getAllProjects();
      expect(all.length).to.equal(2);
      expect(all[0].ngo).to.equal(ngo1.address);
      expect(all[1].ngo).to.equal(ngo2.address);
    });
  })
  describe("VotingManager", function () {
    const milestonesDesc = ["Build school", "Purchase books", "Hire teachers"];
    const milestonesAmt = [
      ethers.parseEther("10"),
      ethers.parseEther("5"),
      ethers.parseEther("8"),
    ]; 
    const totalFunds = ethers.parseEther("23");
    let proposalId = 1;
    beforeEach(async function () {
      const tx = await proposalManager.connect(ngo1).createProposal(
        totalFunds,
        milestonesDesc,
        milestonesAmt
      );
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

      await treasury.connect(donor1).donateETH({ value: ethers.parseEther("100") });
      await treasury.connect(donor2).donateETH({ value: ethers.parseEther("50") });
      await treasury.connect(donor3).donateETH({ value: ethers.parseEther("25") });  
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
            await votingManager.VOTING_ADMIN(),
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

        const spent = await votingManager.totalCreditsSpent(donor1.address);
        expect(spent).to.equal(100);

        const available = await votingManager.getAvailableCredits(donor1.address);
        expect(available).to.equal(ethers.parseEther("100") - BigInt(100));
      });

      it("Should handle multiple votes correctly (quadratic cost)", async function () {
        // First vote: 5 votes (costs 5^2 = 25 credits)
        await votingManager.connect(donor2).vote(proposalId, 5);
        expect(await votingManager.totalCreditsSpent(donor2.address)).to.equal(25);

        // Second vote: 3 more votes (total 8 votes, costs 8^2 = 64 credits, additional cost = 64-25 = 39)
        await votingManager.connect(donor2).vote(proposalId, 3);
        expect(await votingManager.totalCreditsSpent(donor2.address)).to.equal(64);

        const [votes, creditsSpent] = await votingManager.getUserVotes(proposalId,donor2.address);
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
          .connect(ngo1)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        const voteTx = await votingManager.connect(donor1).vote(testProposalId, 10);

        // Check that milestone was unlocked and funds transferred
        await expect(voteTx)
          .to.emit(votingManager, "MilestoneUnlocked")
          .withArgs(testProposalId, 0, testMilestonesAmt[0], anyValue);

        await expect(voteTx)
          .to.emit(votingManager, "FundsQueued")
          .withArgs(anyValue,testProposalId, 0, ngo1.address, testMilestonesAmt[0]);

        expect(await votingManager.isMilestoneUnlocked(testProposalId, 0)).to.be
          .true;
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 1)).to.be
          .false;

        // Verify funds were transferred from treasury (Removed due to Timelock)
        //const finalTreasuryBalance = await ethers.provider.getBalance(treasury.target);
        //expect(initialTreasuryBalance - finalTreasuryBalance).to.equal(testMilestonesAmt[0]);
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
          .connect(ngo1)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Cast enough votes to unlock both milestones (need 20 votes for second milestone)
        const voteTx = await votingManager
          .connect(donor1)
          .vote(testProposalId, 20);

        // Both milestones should be unlocked
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 0)).to.be.true;
        expect(await votingManager.isMilestoneUnlocked(testProposalId, 1)).to.be.true;

        // Check milestone status
        const [totalVotes, milestonesUnlocked, totalMilestones] = await votingManager.getMilestoneStatus(testProposalId);

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
          .connect(ngo1)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Grant VotingManager role
        const VOTING_ADMIN = await votingManager.VOTING_ADMIN();
        await votingManager.connect(admin).grantRole(VOTING_ADMIN, votingManager.target);

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
          .connect(ngo1)
          .createProposal(
            testTotalFunds,
            testMilestonesDesc,
            testMilestonesAmt
          );
        await tx.wait();

        // Grant VotingManager role
        const VOTING_ADMIN = await votingManager.VOTING_ADMIN();
        await votingManager.connect(admin).grantRole(VOTING_ADMIN, votingManager.target);

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

      // Should be able to validate proposal to have at least 1 milestone(?)
      // it("Should handle proposals with no milestones gracefully", async function () {
      //   // This should be handled at the proposal creation level, but test edge case
      //   const [totalVotes, milestonesUnlocked, totalMilestones] =
      //     await votingManager.getMilestoneStatus(999);
      //   expect(totalVotes).to.equal(0);
      //   expect(milestonesUnlocked).to.equal(0);
      //   expect(totalMilestones).to.equal(0);
      // });
    });
    describe("Integration with Treasury", function () {
      it("Should transfer funds from treasury to NGO when milestone unlocks", async function () {
        const testMilestonesAmt = ethers.parseEther("0.001");

        // Fund the treasury
        await treasury.connect(donor1).donateETH({ value: testMilestonesAmt });

        const treasuryAddress = await treasury.getAddress();
        const ngoAddress = await ngo1.getAddress();

        const initialNgoBalance = await ethers.provider.getBalance(ngoAddress);
        const initialTreasuryBalance = await ethers.provider.getBalance(treasuryAddress);

        // Grant VOTING_MANAGER_ROLE to admin for test purposes
        const VOTING_MANAGER_ROLE = await treasury.VOTING_MANAGER_ROLE();
        await treasury.connect(admin).grantRole(VOTING_MANAGER_ROLE, admin.address);

        // Queue transfer
        const minDelay = await treasury.getMinDelay();  // get the actual minDelay
        const currentBlock = await ethers.provider.getBlock("latest");
        const eta = currentBlock.timestamp + Number(minDelay) + 1; // 1 extra second to be safe

        const tx = await treasury.connect(admin).queueTransfer(ngoAddress, testMilestonesAmt, eta);
        const receipt = await tx.wait();

        const timelockEvent = receipt.logs
        .map(log => {
          try {
            return treasury.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter(e => e && e.name === "TimelockQueued")[0];
        const timelockId = timelockEvent.args.id;

        await ethers.provider.send("evm_increaseTime", [Number(minDelay) + 1]);
        await ethers.provider.send("evm_mine");

        // Execute the queued transfer
        await expect(treasury.executeTimelock(timelockId))
          .to.emit(treasury, "FundsTransferred")
          .withArgs(ngoAddress, testMilestonesAmt);

        // Check balances using BigNumber arithmetic
        const finalNgoBalance = await ethers.provider.getBalance(ngoAddress);
        const finalTreasuryBalance = await ethers.provider.getBalance(treasuryAddress);


        console.log("Initial NGO Balance:", ethers.formatEther(initialNgoBalance), "ETH");
        console.log("Final NGO Balance:", ethers.formatEther(finalNgoBalance), "ETH");
        console.log("Initial Treasury Balance:", ethers.formatEther(initialTreasuryBalance), "ETH");
        console.log("Final Treasury Balance:", ethers.formatEther(finalTreasuryBalance), "ETH");

      });
    });
  });
});
