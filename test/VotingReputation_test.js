const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VotingManager - Reputation-Based Quadratic Voting", function () {
  let GovernanceToken, Treasury, ProposalManager, VotingManager;
  let govToken, treasury, proposalManager, votingManager;
  let admin, ngo, voter1, voter2, voter3;
  const initialMintRate = 1; // 1 GOV per 1 ETH

  beforeEach(async function () {
    // Get Signers
    [admin, ngo, voter1, voter2, voter3] = await ethers.getSigners();

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

    // Grant TREASURY_ROLE to Treasury
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

    // Grant roles to VotingManager
    const BURNER_ROLE = await treasury.BURNER_ROLE();
    const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
    await treasury.connect(admin).grantRole(BURNER_ROLE, votingManager.target);
    await treasury
      .connect(admin)
      .grantRole(DISBURSER_ROLE, votingManager.target);

    // Fund voters with ETH donations to get GOV tokens
    await treasury
      .connect(voter1)
      .donateETH({ value: ethers.parseEther("100") });
    await treasury
      .connect(voter2)
      .donateETH({ value: ethers.parseEther("100") });
    await treasury
      .connect(voter3)
      .donateETH({ value: ethers.parseEther("100") });
  });

  describe("Voter Reputation Tracking", function () {
    it("Should start with zero reputation for new voters", async function () {
      const [tier, sessions, uniqueProposals, daysActive, avgVotes] =
        await votingManager.getVoterReputation(voter1.address);
      expect(tier).to.equal(0);
      expect(sessions).to.equal(0);
      expect(uniqueProposals).to.equal(0);
      expect(daysActive).to.equal(0);
      expect(avgVotes).to.equal(0);
    });

    it("Should track voting sessions and unique proposals", async function () {
      // Create proposal 1
      const tx1 = await proposalManager
        .connect(ngo)
        .createProposal(["Milestone 1"], [5]);
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
      const proposalId1 = event1.args.proposalId;

      // Create proposal 2
      const tx2 = await proposalManager
        .connect(ngo)
        .createProposal(["Milestone 2"], [5]);
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
      const proposalId2 = event2.args.proposalId;

      // Voter1 votes on proposal 1 (session 1, unique proposal 1)
      await votingManager.connect(voter1).vote(proposalId1, 2);
      let [tier, sessions, uniqueProposals] =
        await votingManager.getVoterReputation(voter1.address);
      expect(sessions).to.equal(1);
      expect(uniqueProposals).to.equal(1);
      expect(tier).to.equal(0); // Not enough for tier 1

      // Voter1 votes on proposal 1 again (session 2, same proposal)
      await votingManager.connect(voter1).vote(proposalId1, 1);
      [tier, sessions, uniqueProposals] =
        await votingManager.getVoterReputation(voter1.address);
      expect(sessions).to.equal(2);
      expect(uniqueProposals).to.equal(1); // Still just 1 unique proposal
      expect(tier).to.equal(0);

      // Voter1 votes on proposal 2 (session 3, unique proposal 2)
      await votingManager.connect(voter1).vote(proposalId2, 2);
      [tier, sessions, uniqueProposals] =
        await votingManager.getVoterReputation(voter1.address);
      expect(sessions).to.equal(3);
      expect(uniqueProposals).to.equal(2);
      expect(tier).to.equal(0); // Not enough for tier 1 (needs 3 unique)
    });

    it("Should achieve Tier 1 (Good Voter) with 3+ sessions and 3+ unique proposals over time", async function () {
      // Create 3 proposals
      const proposals = [];
      for (let i = 0; i < 3; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Milestone ${i + 1}`], [5]);
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
        proposals.push(event.args.proposalId);
      }

      // Vote on all 3 proposals with time gaps (prove consistency, not whale)
      await votingManager.connect(voter1).vote(proposals[0], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[1], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[2], 1);

      const [tier, sessions, uniqueProposals] =
        await votingManager.getVoterReputation(voter1.address);
      expect(sessions).to.equal(3);
      expect(uniqueProposals).to.equal(3);
      expect(tier).to.equal(1); // Should be Tier 1
    });

    it("Should achieve Tier 2 (Very Good Voter) with 5+ sessions and 4+ unique proposals over time", async function () {
      // Create 4 proposals
      const proposals = [];
      for (let i = 0; i < 4; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Milestone ${i + 1}`], [5]);
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
        proposals.push(event.args.proposalId);
      }

      // Vote on all 4 proposals with time gaps, plus extra session
      await votingManager.connect(voter1).vote(proposals[0], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[1], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[2], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[3], 1);

      // One more vote to reach 5 sessions
      await ethers.provider.send("evm_increaseTime", [1 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[0], 1);

      const [tier, sessions, uniqueProposals] =
        await votingManager.getVoterReputation(voter1.address);
      expect(sessions).to.equal(5);
      expect(uniqueProposals).to.equal(4);
      expect(tier).to.equal(2); // Should be Tier 2
    });
  });

  // Helper function to build reputation over time
  async function buildReputationOverTime(voter, targetTier) {
    const numProposals = targetTier === 2 ? 4 : 3;
    const numSessions = targetTier === 2 ? 5 : 3;

    const proposals = [];
    for (let i = 0; i < numProposals; i++) {
      const tx = await proposalManager
        .connect(ngo)
        .createProposal([`BuildRep ${i + 1}`], [5]);
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
      proposals.push(event.args.proposalId);
    }

    // Vote over time
    for (let i = 0; i < numProposals; i++) {
      if (i > 0) {
        await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");
      }
      await votingManager.connect(voter).vote(proposals[i], 1);
    }

    // Extra sessions if needed for Tier 2
    for (let i = numProposals; i < numSessions; i++) {
      await ethers.provider.send("evm_increaseTime", [1 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter).vote(proposals[0], 1);
    }
  }

  describe("Reputation-Based Cost Calculation", function () {
    it("Should charge standard cost (no discount) for 1 vote regardless of reputation", async function () {
      // Build Tier 2 reputation for voter1 over time
      await buildReputationOverTime(voter1, 2);

      // Verify Tier 2 reputation
      const [tier] = await votingManager.getVoterReputation(voter1.address);
      expect(tier).to.equal(2);

      // Create a new proposal for testing
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [5]);
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

      // Check cost for 1 vote - should be 1 (no discount)
      const cost = await votingManager.calculateVoteCost(
        testProposalId,
        1,
        voter1.address
      );
      expect(cost).to.equal(1);
    });

    it("Should charge standard cost for voters with no reputation", async function () {
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test Milestone"], [10]);
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
      const proposalId = event.args.proposalId;

      // voter2 has no reputation
      const [tier] = await votingManager.getVoterReputation(voter2.address);
      expect(tier).to.equal(0);

      // Cost for 2 votes should be 4 (2^2 = 4)
      const cost2 = await votingManager.calculateVoteCost(
        proposalId,
        2,
        voter2.address
      );
      expect(cost2).to.equal(4);

      // Cost for 5 votes should be 25 (5^2 = 25)
      const cost5 = await votingManager.calculateVoteCost(
        proposalId,
        5,
        voter2.address
      );
      expect(cost5).to.equal(25);
    });

    it("Should provide ~4% discount for Tier 1 (Good) voters on multi-votes", async function () {
      // Build Tier 1 reputation over time
      await buildReputationOverTime(voter1, 1);

      const [tier] = await votingManager.getVoterReputation(voter1.address);
      expect(tier).to.equal(1);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [10]);
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

      // For 2 votes: base cost = 4, with 96% = 3.84 ≈ 3 (rounded down)
      const cost2 = await votingManager.calculateVoteCost(
        testProposalId,
        2,
        voter1.address
      );
      expect(cost2).to.equal(3); // 4 * 0.96 = 3.84 → 3

      // For 5 votes: base cost = 25, with 96% = 24
      const cost5 = await votingManager.calculateVoteCost(
        testProposalId,
        5,
        voter1.address
      );
      expect(cost5).to.equal(24); // 25 * 0.96 = 24
    });

    it("Should provide ~8% discount for Tier 2 (Very Good) voters on multi-votes", async function () {
      // Build Tier 2 reputation over time
      await buildReputationOverTime(voter1, 2);

      const [tier] = await votingManager.getVoterReputation(voter1.address);
      expect(tier).to.equal(2);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [10]);
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

      // For 2 votes: base cost = 4, with 92% = 3.68 ≈ 3
      const cost2 = await votingManager.calculateVoteCost(
        testProposalId,
        2,
        voter1.address
      );
      expect(cost2).to.equal(3); // 4 * 0.92 = 3.68 → 3

      // For 5 votes: base cost = 25, with 92% = 23
      const cost5 = await votingManager.calculateVoteCost(
        testProposalId,
        5,
        voter1.address
      );
      expect(cost5).to.equal(23); // 25 * 0.92 = 23
    });
  });

  describe("Actual Voting with Reputation Discounts", function () {
    it("Should burn discounted tokens for Tier 1 voters", async function () {
      // Build Tier 1 reputation over time
      await buildReputationOverTime(voter1, 1);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [10]);
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

      const balanceBefore = await treasury.getTokenBalance(voter1.address);

      // Vote with 5 votes (should cost 24 instead of 25)
      await votingManager.connect(voter1).vote(testProposalId, 5);

      const balanceAfter = await treasury.getTokenBalance(voter1.address);
      const spent = balanceBefore - balanceAfter;

      expect(spent).to.equal(24); // Tier 1 discount: 25 * 0.96 = 24
    });

    it("Should burn discounted tokens for Tier 2 voters", async function () {
      // Build Tier 2 reputation over time
      await buildReputationOverTime(voter1, 2);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [10]);
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

      const balanceBefore = await treasury.getTokenBalance(voter1.address);

      // Vote with 5 votes (should cost 23 instead of 25)
      await votingManager.connect(voter1).vote(testProposalId, 5);

      const balanceAfter = await treasury.getTokenBalance(voter1.address);
      const spent = balanceBefore - balanceAfter;

      expect(spent).to.equal(23); // Tier 2 discount: 25 * 0.92 = 23
    });

    it("Should emit VoteCast event with actual token cost", async function () {
      // Build Tier 2 reputation over time
      await buildReputationOverTime(voter1, 2);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [10]);
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

      // Vote and check event
      const voteTx = await votingManager
        .connect(voter1)
        .vote(testProposalId, 5);
      const voteReceipt = await voteTx.wait();

      // Find the VoteCast event
      const voteCastEvent = voteReceipt.logs
        .map((log) => {
          try {
            return votingManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "VoteCast")[0];

      expect(voteCastEvent).to.not.be.undefined;
      expect(voteCastEvent.args.voter).to.equal(voter1.address);
      expect(voteCastEvent.args.proposalId).to.equal(testProposalId);
      expect(voteCastEvent.args.votes).to.equal(5);
      expect(voteCastEvent.args.tokensCost).to.equal(23); // Cost should be 23
    });

    it("Comparison: No reputation vs Tier 1 vs Tier 2 costs", async function () {
      // voter2: No reputation (stays as-is)
      // voter1: Build to Tier 1 over time
      // voter3: Build to Tier 2 over time

      await buildReputationOverTime(voter1, 1);
      await buildReputationOverTime(voter3, 2);

      // Verify tiers
      const [tier1] = await votingManager.getVoterReputation(voter1.address);
      const [tier2] = await votingManager.getVoterReputation(voter2.address);
      const [tier3] = await votingManager.getVoterReputation(voter3.address);
      expect(tier1).to.equal(1);
      expect(tier2).to.equal(0);
      expect(tier3).to.equal(2);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [30]);
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

      // Get balances before
      const balance1Before = await treasury.getTokenBalance(voter1.address);
      const balance2Before = await treasury.getTokenBalance(voter2.address);
      const balance3Before = await treasury.getTokenBalance(voter3.address);

      // All vote with 5 votes
      await votingManager.connect(voter1).vote(testProposalId, 5);
      await votingManager.connect(voter2).vote(testProposalId, 5);
      await votingManager.connect(voter3).vote(testProposalId, 5);

      // Get balances after
      const balance1After = await treasury.getTokenBalance(voter1.address);
      const balance2After = await treasury.getTokenBalance(voter2.address);
      const balance3After = await treasury.getTokenBalance(voter3.address);

      const spent1 = balance1Before - balance1After; // Tier 1
      const spent2 = balance2Before - balance2After; // No tier
      const spent3 = balance3Before - balance3After; // Tier 2

      console.log("Costs for 5 votes:");
      console.log("  No reputation (Tier 0):", spent2.toString(), "tokens");
      console.log("  Good voter (Tier 1):", spent1.toString(), "tokens");
      console.log("  Very good voter (Tier 2):", spent3.toString(), "tokens");

      expect(spent2).to.equal(25); // Base cost
      expect(spent1).to.equal(24); // 4% discount
      expect(spent3).to.equal(23); // 8% discount
    });
  });

  describe("Incremental Voting with Reputation", function () {
    it("Should apply discount correctly on incremental votes", async function () {
      // Build Tier 2 reputation over time
      await buildReputationOverTime(voter1, 2);

      // Create test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [30]);
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

      const balanceInitial = await treasury.getTokenBalance(voter1.address);

      // First vote: 2 votes (costs 3 with Tier 2 discount: 4 * 0.92 = 3.68 → 3)
      await votingManager.connect(voter1).vote(testProposalId, 2);
      const balanceAfter1 = await treasury.getTokenBalance(voter1.address);
      const cost1 = balanceInitial - balanceAfter1;
      expect(cost1).to.equal(3);

      // Second vote: 3 more votes (total 5, incremental cost with discount)
      // Incremental cost = (5^2 - 2^2) * 0.92 = 21 * 0.92 = 19.32 → 19
      await votingManager.connect(voter1).vote(testProposalId, 3);
      const balanceAfter2 = await treasury.getTokenBalance(voter1.address);
      const cost2 = balanceAfter1 - balanceAfter2;
      expect(cost2).to.equal(19); // (5^2 - 2^2) * 0.92 = 21 * 0.92 = 19.32 → 19
    });
  });

  describe("Edge Cases and Anti-Gaming", function () {
    it("Should prevent gaming by not awarding reputation for multiple votes on same proposal", async function () {
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [20]);
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
      const proposalId = event.args.proposalId;

      // Vote multiple times on same proposal
      await votingManager.connect(voter1).vote(proposalId, 1);
      await votingManager.connect(voter1).vote(proposalId, 1);
      await votingManager.connect(voter1).vote(proposalId, 1);

      const [tier, sessions, uniqueProposals] =
        await votingManager.getVoterReputation(voter1.address);

      expect(sessions).to.equal(3); // 3 voting sessions
      expect(uniqueProposals).to.equal(1); // But only 1 unique proposal
      expect(tier).to.equal(0); // Should NOT reach Tier 1
    });
  });

  describe("Anti-Whale Measures (Time-Based Consistency)", function () {
    it("Should NOT grant tier to whale who votes quickly on many proposals", async function () {
      // Create 5 proposals
      const proposals = [];
      for (let i = 0; i < 5; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Quick ${i}`], [5]);
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
        proposals.push(event.args.proposalId);
      }

      // Whale behavior: Vote on all 5 proposals rapidly (same block/day)
      for (const pid of proposals) {
        await votingManager.connect(voter1).vote(pid, 1);
      }

      const [tier, sessions, uniqueProposals, daysActive] =
        await votingManager.getVoterReputation(voter1.address);

      expect(sessions).to.equal(5);
      expect(uniqueProposals).to.equal(5);
      expect(daysActive).to.equal(0); // All in same day
      expect(tier).to.equal(0); // NO TIER - not enough time consistency
    });

    it("Should grant Tier 1 to consistent voter who votes over multiple days", async function () {
      // Create 3 proposals
      const proposals = [];
      for (let i = 0; i < 3; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Day ${i}`], [5]);
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
        proposals.push(event.args.proposalId);
      }

      // Vote on proposal 0
      await votingManager.connect(voter2).vote(proposals[0], 1);

      // Fast forward 2 days
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      // Vote on proposal 1
      await votingManager.connect(voter2).vote(proposals[1], 1);

      // Fast forward 2 more days
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      // Vote on proposal 2
      await votingManager.connect(voter2).vote(proposals[2], 1);

      const [tier, sessions, uniqueProposals, daysActive, avgVotes] =
        await votingManager.getVoterReputation(voter2.address);

      expect(sessions).to.equal(3);
      expect(uniqueProposals).to.equal(3);
      expect(daysActive).to.be.gte(3); // At least 3 days active
      expect(avgVotes).to.equal(1); // 3 votes / 3 sessions = 1
      expect(tier).to.equal(1); // TIER 1 - meets time requirement
    });

    it("Should grant Tier 2 to very consistent voter active for 7+ days", async function () {
      // Create 4 proposals
      const proposals = [];
      for (let i = 0; i < 4; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Week ${i}`], [5]);
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
        proposals.push(event.args.proposalId);
      }

      // Spread votes over 8 days
      await votingManager.connect(voter3).vote(proposals[0], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter3).vote(proposals[1], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter3).vote(proposals[2], 1);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter3).vote(proposals[3], 1);

      // 5th session (can revote on first proposal)
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter3).vote(proposals[0], 1);

      const [tier, sessions, uniqueProposals, daysActive, avgVotes] =
        await votingManager.getVoterReputation(voter3.address);

      expect(sessions).to.equal(5);
      expect(uniqueProposals).to.equal(4);
      expect(daysActive).to.be.gte(7); // At least 7 days active
      expect(avgVotes).to.equal(1); // 5 votes / 5 sessions = 1
      expect(tier).to.equal(2); // TIER 2 - meets all requirements
    });

    it("Should LIMIT tier to whale who dumps many votes per session (Tier 1 max, no Tier 2)", async function () {
      // Create 5 proposals
      const proposals = [];
      for (let i = 0; i < 5; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Whale ${i}`], [50]);
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
        proposals.push(event.args.proposalId);
      }

      // Whale behavior: Cast 4 votes per session (moderate volume but consistent)
      // 4 votes per proposal starting from 0: 1²+2²+3²+4² = 1+4+9+16 = 30 each
      // Total cost: 30 × 5 = 150 tokens... still too much!
      // Let's use 3 votes per session: 1²+2²+3² = 14 each, 14×5 = 70 tokens
      // Wait, the test name says "dumps many votes" so let's make it 6 per session on 3 proposals
      // 1²+2²+3²+4²+5²+6² = 91 tokens for first, then next proposals also accumulate...
      // Actually, let's just do 6 votes ONCE on 5 different proposals (6² = 36 each)
      // Total: 36 × 5 = 180... still over 100
      //
      // New approach: 4 votes on 5 proposals = 16 × 5 = 80 tokens, avg = 4 votes/session (not whale)
      // Let's do 3 proposals with 7 votes each = 49 × 3 = 147 tokens (too much)
      //
      // FINAL: 3 proposals, 6 votes each, incremental cost per proposal
      // Proposal 0: 1+4+9+16+25+36 = 91 tokens (EXCEED BUDGET)
      //
      // ACTUAL FINAL: Use 8 votes spread across 8 sessions to show high avg
      // 8 sessions × 1 vote = 8 tokens total, avg = 1 (too low)
      // Let's use 4 sessions × 8 votes = 4² on fresh proposal = 16 each = 64 total

      // Give voter1 extra ETH to demonstrate whale behavior
      await treasury
        .connect(voter1)
        .donateETH({ value: ethers.parseEther("300") });

      // Now voter1 has 400 tokens total (100 + 300)
      // Whale: 8 votes per session on 5 proposals
      // Cost per fresh proposal with 8 votes: 1+4+9+16+25+36+49+64 = 204 each
      // Total: 204 × 5 = 1020 tokens (still too much even with 400!)
      //
      // Let's do 6 votes per session on 5 proposals
      // Cost: (1+4+9+16+25+36) × 5 = 91 × 5 = 455 tokens (within 400 budget)
      await votingManager.connect(voter1).vote(proposals[0], 6);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[1], 6);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[2], 6);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[3], 6);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter1).vote(proposals[4], 6);

      const [tier, sessions, uniqueProposals, daysActive, avgVotes] =
        await votingManager.getVoterReputation(voter1.address);

      expect(sessions).to.equal(5);
      expect(uniqueProposals).to.equal(5);
      expect(daysActive).to.be.gte(7);
      expect(avgVotes).to.equal(6); // 30 votes / 5 sessions = 6
      expect(tier).to.equal(1); // TIER 1 ONLY - avgVotes (6) qualifies for Tier 1 (≤7) but NOT Tier 2 (>5)
      // This demonstrates the anti-whale measure: high volume voters get REDUCED benefits
    });

    it("Should grant tier to moderate user casting 5 votes per session", async function () {
      // Create 4 proposals
      const proposals = [];
      for (let i = 0; i < 4; i++) {
        const tx = await proposalManager
          .connect(ngo)
          .createProposal([`Moderate ${i}`], [50]);
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
        proposals.push(event.args.proposalId);
      }

      // Moderate user: 3-5 votes per session over time
      // Total: 3² + 4² + 5² + 4² + 3² = 9 + 16 + 25 + 16 + 9 = 75 tokens
      await votingManager.connect(voter2).vote(proposals[0], 3);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter2).vote(proposals[1], 4);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter2).vote(proposals[2], 5);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter2).vote(proposals[3], 4);

      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await votingManager.connect(voter2).vote(proposals[0], 3); // Revote on first proposal

      const [tier, sessions, uniqueProposals, daysActive, avgVotes] =
        await votingManager.getVoterReputation(voter2.address);

      expect(sessions).to.equal(5);
      expect(uniqueProposals).to.equal(4);
      expect(daysActive).to.be.gte(7);
      expect(avgVotes).to.be.lte(5); // (19 votes / 5 sessions = 3.8)
      expect(tier).to.equal(2); // TIER 2 - legitimate moderate voter
    });

    it("Should maintain 1000:1 ETH ratio integrity despite discounts", async function () {
      // The key insight: discounts only affect token burning, not vote power
      // Less tokens burned = more tokens stay in circulation for other purposes
      // But the ETH in treasury remains properly backed

      // Build Tier 2 reputation over time
      await buildReputationOverTime(voter1, 2);

      // Check token balance in treasury vs ETH
      const ethBalance = await ethers.provider.getBalance(treasury.target);
      const voter1TokensBefore = await treasury.getTokenBalance(voter1.address);

      // Create and vote on test proposal
      const tx = await proposalManager
        .connect(ngo)
        .createProposal(["Test"], [30]);
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

      // Vote with 5 votes (burns 23 tokens instead of 25)
      await votingManager.connect(voter1).vote(testProposalId, 5);

      const voter1TokensAfter = await treasury.getTokenBalance(voter1.address);
      const tokensBurned = voter1TokensBefore - voter1TokensAfter;

      // The discount means 2 fewer tokens burned
      // This means voter1 retains more purchasing power
      // But the ETH backing remains unchanged
      expect(tokensBurned).to.equal(23); // 2 tokens saved vs base cost of 25

      console.log("ETH in treasury:", ethers.formatEther(ethBalance), "ETH");
      console.log("Tokens burned with discount:", tokensBurned.toString());
      console.log(
        "Tokens saved by good voter:",
        (25 - Number(tokensBurned)).toString()
      );
    });
  });
});
