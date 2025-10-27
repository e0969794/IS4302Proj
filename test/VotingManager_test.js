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
    treasury = await Treasury.deploy(admin.address, govToken.target, initialMintRate);
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
    await treasury.connect(admin).grantRole(DISBURSER_ROLE, votingManager.target);

    // Create a Proposal
    const tx = await proposalManager.connect(ngo).createProposal(milestonesDesc, milestonesAmt);
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
    await (await treasury.connect(donor1).donateETH({ value: ethers.parseEther("100") })).wait();
    await (await treasury.connect(donor2).donateETH({ value: ethers.parseEther("50") })).wait();
    await (await treasury.connect(donor3).donateETH({ value: ethers.parseEther("25") })).wait();
  });
  describe("Deployment and Setup", function () {
    it("Should deploy with correct initial values", async function () {
        expect(await votingManager.proposalManager()).to.equal(proposalManager.target);
        expect(await votingManager.treasury()).to.equal(treasury.target);

        // Confirm admin role was granted correctly
        const DEFAULT_ADMIN_ROLE = await votingManager.DEFAULT_ADMIN_ROLE();
        const hasAdminRole = await votingManager.hasRole(DEFAULT_ADMIN_ROLE, admin.address);
        expect(hasAdminRole).to.be.true;
    });
    it("Should grant BURNER_ROLE and DISBURSER_ROLE to VotingManager in Treasury", async function () {
        const BURNER_ROLE = await treasury.BURNER_ROLE();
        const DISBURSER_ROLE = await treasury.DISBURSER_ROLE();
        const hasBurner = await treasury.hasRole(BURNER_ROLE, votingManager.target);
        const hasDisburser = await treasury.hasRole(DISBURSER_ROLE, votingManager.target);
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

            const tx = await proposalManager.connect(ngo).createProposal(
                testMilestonesDesc,
                testMilestonesAmt
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
            const testProposalId = event.args.proposalId;

            const proposalData = await proposalManager.getProposal(testProposalId);

            // donor1 votes with 10 votes (quadratic cost = 100 tokens)
            const voteTx = await votingManager.connect(donor1).vote(testProposalId, 10);
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

            const nextMilestone = await votingManager.nextMilestoneMapping(testProposalId);
            expect(nextMilestone).to.equal(1);
        });
        it("Should disburse milestone funds to NGO when votes reach threshold", async function () {
            const desc = ["Milestone 1"];
            const amt = [ethers.parseEther("0.001")]; // small target for test
            const tx = await proposalManager.connect(ngo).createProposal(desc, amt);
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                try {
                    return proposalManager.interface.parseLog(log);
                } catch {
                    return null;
                }
                })
                .filter(e => e && e.name === "ProposalCreated")[0];
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
});
