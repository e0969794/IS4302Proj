const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VotingManager", function () {
  let GovernanceToken, Treasury, ProposalManager, VotingManager;
  let govToken, treasury, proposalManager, votingManager;
  let proposalId;
  let admin, ngo, donor1, donor2, donor3;
  const initialMintRate = ethers.parseEther("1"); // 1 GOV per 1 ETH

  const milestonesDesc = ["Build school", "Purchase books", "Hire teachers"];
  const milestonesAmt = [
    ethers.parseEther("10"),
    ethers.parseEther("5"),
    ethers.parseEther("8"),
  ];

  beforeEach(async function () {
    // Get Signers
    [admin, ngo, donor1, donor2, donor3] = await ethers.getSigners();

    // Deploy GovernanceToken
    GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(admin.address);
    await govToken.waitForDeployment();

    // Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(
      admin.address,
      govToken.target,
      initialMintRate
    );
    await treasury.waitForDeployment();

    // Now grant TREASURY_ROLE to Treasury
    const TREASURY_ROLE = await govToken.TREASURY_ROLE();
    await govToken.connect(admin).grantRole(TREASURY_ROLE, treasury.target);

    // Deploy ProposalManager
    ProposalManager = await ethers.getContractFactory("ProposalManager");
    proposalManager = await ProposalManager.deploy();
    await proposalManager.waitForDeployment();

    // Deploy VotingManager
    VotingManager = await ethers.getContractFactory("VotingManager");
    votingManager = await VotingManager.deploy(
      admin.address,
      proposalManager.target,
      treasury.target
    );
    await votingManager.waitForDeployment();

    // Give BURNER_ROLE & DISBURSER_ROLE to VotingManager
    const BURNER_ROLE = await treasury.BURNER_ROLE();
    const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
    await treasury.connect(admin).grantRole(BURNER_ROLE, votingManager.target);
    await treasury
      .connect(admin)
      .grantRole(DISBURSER_ROLE, votingManager.target);

    // Create a Proposal
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

    // Make Donations
    await (
      await treasury
        .connect(donor1)
        .donateETH({ value: ethers.parseEther("100") })
    ).wait();
    await (
      await treasury
        .connect(donor2)
        .donateETH({ value: ethers.parseEther("50") })
    ).wait();
    await (
      await treasury
        .connect(donor3)
        .donateETH({ value: ethers.parseEther("25") })
    ).wait();
  });
  describe("Deployment and Setup", function () {
    it("Should deploy with correct initial values", async function () {
      expect(await votingManager.proposalManager()).to.equal(
        proposalManager.target
      );
      expect(await votingManager.treasury()).to.equal(treasury.target);

      // Confirm admin role was granted correctly
      const DEFAULT_ADMIN_ROLE = await votingManager.DEFAULT_ADMIN_ROLE();
      const hasAdminRole = await votingManager.hasRole(
        DEFAULT_ADMIN_ROLE,
        admin.address
      );
      expect(hasAdminRole).to.be.true;
    });
    it("Should grant BURNER_ROLE and DISBURSER_ROLE to VotingManager in Treasury", async function () {
      const BURNER_ROLE = await treasury.BURNER_ROLE();
      const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
      const hasBurner = await treasury.hasRole(
        BURNER_ROLE,
        votingManager.target
      );
      const hasDisburser = await treasury.hasRole(
        DISBURSER_ROLE,
        votingManager.target
      );
      expect(hasBurner).to.be.true;
      expect(hasDisburser).to.be.true;
    });
  });
  describe("Credit Management", function () {
    it("Should correctly calculate available credits via Treasury", async function () {
      const donor1Balance = await treasury.getTokenBalance(donor1.address);
      const donor2Balance = await treasury.getTokenBalance(donor2.address);
      const donor3Balance = await treasury.getTokenBalance(donor3.address);

      expect(donor1Balance).to.equal(ethers.parseEther("100"));
      expect(donor2Balance).to.equal(ethers.parseEther("50"));
      expect(donor3Balance).to.equal(ethers.parseEther("25"));
    });

    it("Should deduct quadratic cost correctly when voting", async function () {
      // donor1 votes with 5 votes → cost = 5^2 = 25 GOV tokens
      const beforeBalance = await treasury.getTokenBalance(donor1.address);
      await votingManager.connect(donor1).vote(proposalId, 5);
      const afterBalance = await treasury.getTokenBalance(donor1.address);

      const spent = beforeBalance - afterBalance;
      //console.log("Credits spent:", spent.toString());
      expect(spent).to.equal(BigInt(25));

      // check proposal vote tally
      const totalVotes = await votingManager.getProposalVotes(proposalId);
      expect(totalVotes).to.equal(5);
    });

    it("Should handle multiple votes correctly (quadratic cost accumulates)", async function () {
      // First vote: 5 votes (costs 5^2 = 25 credits)
      const beforeBalance = await treasury.getTokenBalance(donor2.address);
      await votingManager.connect(donor2).vote(proposalId, 5);
      const afterBalance = await treasury.getTokenBalance(donor2.address);
      const spent = beforeBalance - afterBalance;
      expect(spent).to.equal(BigInt(25));

      // Second vote: 3 more votes (total 8 votes, costs 8^2 = 64 credits, additional cost = 64-25 = 39)
      await votingManager.connect(donor2).vote(proposalId, 3);
      const new_afterBalance = await treasury.getTokenBalance(donor2.address);
      const new_spent = beforeBalance - new_afterBalance;
      expect(new_spent).to.equal(BigInt(64));
    });

    it("Should revert if donor has insufficient credits", async function () {
      // donor3 only has 25 credits → cannot cast 6 votes (requires 36 credits)
      await expect(
        votingManager.connect(donor3).vote(proposalId, 6)
      ).to.be.revertedWith("Insufficient credits");
    });

    it("Should revert voting on non-existent proposals", async function () {
      // Try to vote on a proposal ID that doesn't exist
      const nonExistentProposalId = 999;

      await expect(
        votingManager.connect(donor1).vote(nonExistentProposalId, 5)
      ).to.be.revertedWith("proposal does not exist");
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
      const proposal = await proposalManager.getProposal(proposalId);

      const milestone0 = proposal.milestones[0].amount;
      const milestone1 = proposal.milestones[1].amount;
      const milestone2 = proposal.milestones[2].amount;

      const threshold0 = Number(milestone0 / BigInt(1e14));
      const threshold1 = Number(milestone1 / BigInt(1e14));
      const threshold2 = Number(milestone2 / BigInt(1e14));

      expect(threshold0).to.equal(100000);
      expect(threshold1).to.equal(50000);
      expect(threshold2).to.equal(80000);
    });
    it("Should unlock milestones when thresholds are met", async function () {
      const testMilestonesDesc = ["Test milestone 1", "Test milestone 2"];
      const testMilestonesAmt = [
        ethers.parseEther("0.001"), // 0.001 ETH milestone
        ethers.parseEther("0.002"), // 0.002 ETH milestone
      ];

      const tx = await proposalManager
        .connect(ngo)
        .createProposal(testMilestonesDesc, testMilestonesAmt);
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
      const testProposalId = event.args.proposalId;

      const proposalData = await proposalManager.getProposal(testProposalId);

      // donor1 votes with 10 votes (quadratic cost = 100 tokens)
      const voteTx = await votingManager
        .connect(donor1)
        .vote(testProposalId, 10);
      const voteReceipt = await voteTx.wait();

      // Check that the event was emitted
      const milestoneEvent = voteReceipt.logs
        .map((log) => {
          try {
            return votingManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "MilestoneUnlocked")[0];

      expect(milestoneEvent).to.not.be.undefined;
      expect(milestoneEvent.args.proposalId).to.equal(testProposalId);
      expect(milestoneEvent.args.milestoneIndex).to.equal(0);
      expect(milestoneEvent.args.amountReleased).to.equal(testMilestonesAmt[0]);

      const totalVotes = await votingManager.getProposalVotes(testProposalId);
      expect(totalVotes).to.equal(10);

      const nextMilestone = await votingManager.nextMilestoneMapping(
        testProposalId
      );
      expect(nextMilestone).to.equal(1);
    });
    it("Should disburse milestone funds to NGO when votes reach threshold", async function () {
      const desc = ["Milestone 1"];
      const amt = [ethers.parseEther("0.001")]; // small target for test
      const tx = await proposalManager.connect(ngo).createProposal(desc, amt);
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
      const testProposalId = event.args.proposalId;

      // NGO balance before
      const beforeBalance = await ethers.provider.getBalance(ngo.address);

      // Cast enough votes
      await votingManager.connect(donor1).vote(testProposalId, 10);

      // NGO balance after
      const afterBalance = await ethers.provider.getBalance(ngo.address);

      // Ensure funds were sent
      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });

  describe("Reputation System", function () {
    let testProposalId1, testProposalId2, testProposalId3;

    beforeEach(async function () {
      // Create multiple test proposals for reputation testing
      const testMilestonesDesc = ["Test milestone"];
      const testMilestonesAmt = [ethers.parseEther("0.001")];

      // Create proposal 1
      const tx1 = await proposalManager
        .connect(ngo)
        .createProposal(testMilestonesDesc, testMilestonesAmt);
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs
        .map((log) => {
          try {
            return proposalManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "ProposalCreated")[0];
      testProposalId1 = event1.args.proposalId;

      // Create proposal 2
      const tx2 = await proposalManager
        .connect(ngo)
        .createProposal(testMilestonesDesc, testMilestonesAmt);
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs
        .map((log) => {
          try {
            return proposalManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "ProposalCreated")[0];
      testProposalId2 = event2.args.proposalId;

      // Create proposal 3
      const tx3 = await proposalManager
        .connect(ngo)
        .createProposal(testMilestonesDesc, testMilestonesAmt);
      const receipt3 = await tx3.wait();
      const event3 = receipt3.logs
        .map((log) => {
          try {
            return proposalManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "ProposalCreated")[0];
      testProposalId3 = event3.args.proposalId;
    });

    describe("Reputation Initialization", function () {
      it("Should initialize with zero reputation for new users", async function () {
        const reputation = await votingManager.getUserReputation(
          donor1.address
        );
        expect(reputation.totalVotes).to.equal(0);
        expect(reputation.proposalsVotedOn).to.equal(0);
        expect(reputation.firstVoteTimestamp).to.equal(0);
        expect(reputation.lastVoteTimestamp).to.equal(0);
        expect(reputation.consecutiveActivePeriods).to.equal(0);

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.equal(0);
      });

      it("Should set firstVoteTimestamp on first vote", async function () {
        const beforeTimestamp = await ethers.provider
          .getBlock("latest")
          .then((b) => b.timestamp);

        await votingManager.connect(donor1).vote(testProposalId1, 1);

        const reputation = await votingManager.getUserReputation(
          donor1.address
        );
        expect(reputation.firstVoteTimestamp).to.be.gt(beforeTimestamp);
        expect(reputation.lastVoteTimestamp).to.equal(
          reputation.firstVoteTimestamp
        );
        expect(reputation.totalVotes).to.equal(1);
        expect(reputation.proposalsVotedOn).to.equal(1);
        expect(reputation.consecutiveActivePeriods).to.equal(1);
      });
    });

    describe("Reputation Building", function () {
      it("Should track votes on different proposals for diversity", async function () {
        // Vote on proposal 1
        await votingManager.connect(donor1).vote(testProposalId1, 1);
        let reputation = await votingManager.getUserReputation(donor1.address);
        expect(reputation.proposalsVotedOn).to.equal(1);

        // Vote on proposal 2
        await votingManager.connect(donor1).vote(testProposalId2, 1);
        reputation = await votingManager.getUserReputation(donor1.address);
        expect(reputation.proposalsVotedOn).to.equal(2);

        // Vote again on proposal 1 (should not increase proposalsVotedOn)
        await votingManager.connect(donor1).vote(testProposalId1, 1);
        reputation = await votingManager.getUserReputation(donor1.address);
        expect(reputation.proposalsVotedOn).to.equal(2);
        expect(reputation.totalVotes).to.equal(3);
      });

      it("Should track consecutive active periods", async function () {
        // First vote
        await votingManager.connect(donor1).vote(testProposalId1, 1);
        let reputation = await votingManager.getUserReputation(donor1.address);
        expect(reputation.consecutiveActivePeriods).to.equal(1);

        // Vote within active period (should increment)
        await votingManager.connect(donor1).vote(testProposalId2, 1);
        reputation = await votingManager.getUserReputation(donor1.address);
        expect(reputation.consecutiveActivePeriods).to.equal(2);
      });

      it("Should reset consecutive periods after gap in activity", async function () {
        // First vote
        await votingManager.connect(donor1).vote(testProposalId1, 1);

        // Fast forward beyond active period (30 days + 1 second)
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine");

        // Vote after gap (should reset consecutive periods)
        await votingManager.connect(donor1).vote(testProposalId2, 1);
        const reputation = await votingManager.getUserReputation(
          donor1.address
        );
        expect(reputation.consecutiveActivePeriods).to.equal(1);
      });
    });

    describe("Reputation Discount Calculation", function () {
      it("Should give 0% discount for users with less than 90 days participation", async function () {
        await votingManager.connect(donor1).vote(testProposalId1, 1);

        // Fast forward 89 days (just under minimum)
        await ethers.provider.send("evm_increaseTime", [89 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.equal(0);
      });

      it("Should start giving discount after 90+ days of participation", async function () {
        await votingManager.connect(donor1).vote(testProposalId1, 1);

        // Fast forward 91 days
        await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        // Vote to update reputation
        await votingManager.connect(donor1).vote(testProposalId2, 1);

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.be.gt(0);
      });

      it("Should calculate diversity discount correctly", async function () {
        // Vote on 10 different proposals to get 5% diversity discount
        for (let i = 0; i < 10; i++) {
          const tx = await proposalManager
            .connect(ngo)
            .createProposal(["Test"], [ethers.parseEther("0.001")]);
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
          const newProposalId = event.args.proposalId;

          await votingManager.connect(donor1).vote(newProposalId, 1);
        }

        // Fast forward past minimum participation period
        await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        // Make another vote to trigger discount calculation
        await votingManager.connect(donor1).vote(testProposalId1, 1);

        const reputation = await votingManager.getUserReputation(
          donor1.address
        );
        expect(reputation.proposalsVotedOn).to.equal(11); // 10 new + 1 existing

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.be.gte(5); // Should have at least 5% from diversity
      });

      it("Should cap discount at maximum 25%", async function () {
        // Create many proposals for diversity
        for (let i = 0; i < 25; i++) {
          const tx = await proposalManager
            .connect(ngo)
            .createProposal(["Test"], [ethers.parseEther("0.001")]);
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
          const newProposalId = event.args.proposalId;

          await votingManager.connect(donor1).vote(newProposalId, 1);
        }

        // Fast forward 15 months for maximum time discount
        await ethers.provider.send("evm_increaseTime", [
          15 * 30 * 24 * 60 * 60,
        ]);
        await ethers.provider.send("evm_mine");

        // Make another vote to trigger calculation
        await votingManager.connect(donor1).vote(testProposalId1, 1);

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.equal(25); // Should be capped at 25%
      });

      it("Should reduce discount for inactive users", async function () {
        // Build some reputation first
        await votingManager.connect(donor1).vote(testProposalId1, 1);

        // Fast forward past minimum period to build reputation
        await ethers.provider.send("evm_increaseTime", [120 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        await votingManager.connect(donor1).vote(testProposalId2, 1);
        const activeDiscount = await votingManager.getReputationDiscount(
          donor1.address
        );

        // Fast forward to become inactive (2+ periods = 60+ days)
        await ethers.provider.send("evm_increaseTime", [61 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        const inactiveDiscount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(inactiveDiscount).to.be.lt(activeDiscount);
        expect(inactiveDiscount).to.equal(activeDiscount / 2); // Should be halved
      });
    });

    describe("Voting Cost Reduction", function () {
      it("Should apply reputation discount to voting costs", async function () {
        // Build reputation over 91 days
        await votingManager.connect(donor1).vote(testProposalId1, 1);
        await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        // Vote on multiple proposals for diversity
        await votingManager.connect(donor1).vote(testProposalId2, 1);
        await votingManager.connect(donor1).vote(testProposalId3, 1);

        // Get current discount
        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.be.gt(0);

        // Test voting cost with reputation discount
        const beforeBalance = await treasury.getTokenBalance(donor1.address);

        // Vote 5 votes (base cost = 25 tokens)
        await votingManager.connect(donor1).vote(testProposalId1, 5);

        const afterBalance = await treasury.getTokenBalance(donor1.address);
        const actualCost = beforeBalance - afterBalance;
        const expectedBaseCost = BigInt(25);
        const expectedDiscountedCost =
          (expectedBaseCost * BigInt(100 - discount)) / BigInt(100);

        expect(actualCost).to.equal(expectedDiscountedCost);
        expect(actualCost).to.be.lt(expectedBaseCost);
      });

      it("Should maintain quadratic cost structure even with discount", async function () {
        // Build some reputation
        await votingManager.connect(donor1).vote(testProposalId1, 1);
        await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");
        await votingManager.connect(donor1).vote(testProposalId2, 1);

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );

        // Create new proposal for clean testing
        const tx = await proposalManager
          .connect(ngo)
          .createProposal(["Test"], [ethers.parseEther("0.001")]);
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
        const cleanProposalId = event.args.proposalId;

        // Test quadratic scaling with discount
        const beforeBalance = await treasury.getTokenBalance(donor1.address);

        // First vote: 3 votes (cost = 9 tokens with discount)
        await votingManager.connect(donor1).vote(cleanProposalId, 3);
        const midBalance = await treasury.getTokenBalance(donor1.address);
        const firstCost = beforeBalance - midBalance;

        // Second vote: 2 more votes (total 5, cost = 25 - 9 = 16 tokens with discount)
        await votingManager.connect(donor1).vote(cleanProposalId, 2);
        const afterBalance = await treasury.getTokenBalance(donor1.address);
        const secondCost = midBalance - afterBalance;

        // Verify quadratic relationship is maintained
        const expectedFirstCost =
          (BigInt(9) * BigInt(100 - discount)) / BigInt(100);
        const expectedSecondCost =
          (BigInt(16) * BigInt(100 - discount)) / BigInt(100);

        expect(firstCost).to.equal(expectedFirstCost);
        expect(secondCost).to.equal(expectedSecondCost);
      });

      it("Should emit ReputationUpdated event when reputation changes", async function () {
        const tx = await votingManager.connect(donor1).vote(testProposalId1, 1);
        const receipt = await tx.wait();

        const reputationEvent = receipt.logs
          .map((log) => {
            try {
              return votingManager.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .filter((e) => e && e.name === "ReputationUpdated")[0];

        expect(reputationEvent).to.not.be.undefined;
        expect(reputationEvent.args.user).to.equal(donor1.address);
        expect(reputationEvent.args.newReputationDiscount).to.equal(0); // New user gets 0% discount
      });
    });

    describe("Long-term Participation Scenarios", function () {
      it("Should reward consistent long-term participation", async function () {
        // Simulate 6 months of consistent voting
        for (let month = 0; month < 6; month++) {
          // Create new proposal each month
          const tx = await proposalManager
            .connect(ngo)
            .createProposal(["Monthly test"], [ethers.parseEther("0.001")]);
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
          const monthlyProposalId = event.args.proposalId;

          await votingManager.connect(donor1).vote(monthlyProposalId, 1);

          // Fast forward 30 days
          await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
          await ethers.provider.send("evm_mine");
        }

        const reputation = await votingManager.getUserReputation(
          donor1.address
        );
        expect(reputation.proposalsVotedOn).to.equal(6);
        expect(reputation.consecutiveActivePeriods).to.equal(6);

        const discount = await votingManager.getReputationDiscount(
          donor1.address
        );
        expect(discount).to.be.gt(5); // Should have meaningful discount after 6 months
      });

      it("Should differentiate between whale and long-term participant costs", async function () {
        // Create a new whale account
        const [whale] = await ethers.getSigners();

        // Whale makes large donation
        await treasury
          .connect(whale)
          .donateETH({ value: ethers.parseEther("1000") });

        // Both whale and donor1 make their first vote
        const whaleBalanceBefore = await treasury.getTokenBalance(
          whale.address
        );
        const donor1BalanceBefore = await treasury.getTokenBalance(
          donor1.address
        );

        await votingManager.connect(whale).vote(testProposalId1, 5); // Whale votes
        await votingManager.connect(donor1).vote(testProposalId1, 5); // Donor1 votes

        const whaleCostFirst =
          whaleBalanceBefore - (await treasury.getTokenBalance(whale.address));
        const donor1CostFirst =
          donor1BalanceBefore -
          (await treasury.getTokenBalance(donor1.address));

        // Both should have same cost initially (no reputation)
        expect(whaleCostFirst).to.equal(donor1CostFirst);

        // Fast forward and build donor1's reputation
        await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");

        // Build donor1's reputation through diverse participation
        for (let i = 0; i < 5; i++) {
          const tx = await proposalManager
            .connect(ngo)
            .createProposal(["Reputation test"], [ethers.parseEther("0.001")]);
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
          const repProposalId = event.args.proposalId;

          await votingManager.connect(donor1).vote(repProposalId, 1);
        }

        // Now test voting costs again
        const whaleBalanceSecond = await treasury.getTokenBalance(
          whale.address
        );
        const donor1BalanceSecond = await treasury.getTokenBalance(
          donor1.address
        );

        await votingManager.connect(whale).vote(testProposalId2, 5);
        await votingManager.connect(donor1).vote(testProposalId2, 5);

        const whaleCostSecond =
          whaleBalanceSecond - (await treasury.getTokenBalance(whale.address));
        const donor1CostSecond =
          donor1BalanceSecond -
          (await treasury.getTokenBalance(donor1.address));

        // Donor1 should now have lower cost due to reputation
        expect(donor1CostSecond).to.be.lt(whaleCostSecond);
        expect(donor1CostSecond).to.be.lt(25); // Less than base cost of 25
        expect(whaleCostSecond).to.equal(25); // Whale still pays full price
      });
    });
  });
});
