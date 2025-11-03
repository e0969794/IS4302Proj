const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("VotingManager", function () {
  let GovernanceToken, Treasury, ProposalManager, VotingManager;
  let govToken, treasury, proposalManager, votingManager;
  let proposalId;
  let admin, ngo, donor1, donor2, donor3;
  const initialMintRate = 1; // 1 GOV per 1 ETH

  const milestonesDesc = ["Build school", "Purchase books", "Hire teachers"];
  const milestonesAmt = [
    10,
    5,
    8,
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

            expect(donor1Balance).to.equal(100);
            expect(donor2Balance).to.equal(50);
            expect(donor3Balance).to.equal(25);
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
            const befdonorBal = await govToken.balanceOf(donor2.address);
            console.log("Donor balance:", befdonorBal.toString());
            
            const beforeBalance = await treasury.getTokenBalance(donor2.address);
            await votingManager.connect(donor2).vote(proposalId, 5);
            const afterBalance = await treasury.getTokenBalance(donor2.address);
            const spent = beforeBalance - afterBalance;
            expect(spent).to.equal(BigInt(25));
            const afterdonorBal1 = await govToken.balanceOf(donor2.address);
            console.log("Afer 1st Donation, Donor balance:", afterdonorBal1.toString());
            
            // Second vote: 3 more votes (total 8 votes, costs 8^2 = 64 credits, additional cost = 64-25 = 39)
            await votingManager.connect(donor2).vote(proposalId, 2);
            const afterdonorBa2 = await govToken.balanceOf(donor2.address);
            console.log("Afer 2nd Donation, Donor balance:", afterdonorBa2.toString());
            const new_afterBalance = await treasury.getTokenBalance(donor2.address);
            const new_spent = beforeBalance - new_afterBalance;
            expect(new_spent).to.equal(BigInt(49));
        });

        it("Should revert if donor has insufficient credits", async function () {
            // donor3 only has 25 credits → cannot cast 6 votes (requires 36 credits)
            const donorBal = await govToken.balanceOf(donor3.address);
            console.log("Donor balance:", donorBal.toString());
            await expect(
            votingManager.connect(donor3).vote(proposalId, 6)
            ).to.be.revertedWith("Insufficient credits");
        });

        it("Should revert voting on non-existent proposals", async function () {
            // Try to vote on a proposal ID that doesn't exist
            const nonExistentProposalId = 999;

            await expect(
            votingManager.connect(donor1).vote(nonExistentProposalId, 5)
            ).to.be.revertedWith("Proposal not valid");
        });

        it("Should revert if zero votes", async function () {
            await expect(
            votingManager.connect(donor1).vote(proposalId, 0)
            ).to.be.revertedWith("Must cast at least 1 vote");
        });
    });
    describe("Milestone Processing", function () {
        it("Should calculate milestone thresholds correctly", async function () {
            const proposal = await proposalManager.getProposal(proposalId);
            const milestone0 = proposal.milestones[0].amount;
            const milestone1 = proposal.milestones[1].amount;
            const milestone2 = proposal.milestones[2].amount;

            expect(milestone0).to.equal(10);
            expect(milestone1).to.equal(5);
            expect(milestone2).to.equal(8);
        });
        it("Should unlock milestones when thresholds are met", async function () {
            const testMilestonesDesc = ["Test milestone 1", "Test milestone 2"];
            const testMilestonesAmt = [
                2,
                4, 
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
                .filter((e) => e && e.name === "DisburseMilestone")[0];

            expect(milestoneEvent).to.not.be.undefined;
            expect(milestoneEvent.args.proposalId).to.equal(testProposalId);
            expect(milestoneEvent.args.milestoneIndex).to.equal(0);
            expect(milestoneEvent.args.amountReleased).to.equal(2); // 2 GovToken worth of funds (2 Eth)

            const totalVotes = await votingManager.getProposalVotes(testProposalId);
            expect(totalVotes).to.equal(10);

            const nextMilestone = await votingManager.nextMilestoneMapping(testProposalId);
            expect(nextMilestone).to.equal(1);
        });
        it("Should disburse milestone funds to NGO when votes reach threshold", async function () {
            const desc = ["Milestone 1"];
            const amt = [2]; // small target for test
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
    describe("Valid Proposals", function() {
        const weekInSeconds = 7 * 24 * 60 * 60;

        it("Should allow oracle to kill proposal after expiry and mark it invalid", async function () {
            const milestoneDesc = ["Build library"];
            const milestoneAmt = [ethers.parseEther("5")];
            const createTx = await proposalManager.connect(ngo).createProposal(milestoneDesc, milestoneAmt);
            await createTx.wait();

            const proposalId = await proposalManager.nextProposalId() - 1n;

            // fast-forward 8 days
            await ethers.provider.send("evm_increaseTime", [weekInSeconds * 2]); // simulate expiry
            await ethers.provider.send("evm_mine");

            // kills proposal
            await expect(proposalManager.connect(admin).killProposal(proposalId))
                .to.emit(proposalManager, "ProposalKilled")
                .withArgs(proposalId, ngo.address);

            // confirm proposal no longer valid
            const killed = await proposalManager.proposals(proposalId);
            expect(killed.id).to.equal(0);
        });

        it("Should fast forward 8 days, create two new proposals, and retrieve all and valid proposals", async function () {
            
            // advance time before creating proposals
            const eightDays = 8 * 24 * 60 * 60;
            await ethers.provider.send("evm_increaseTime", [eightDays]);
            await ethers.provider.send("evm_mine");

            // create two new proposals
            const milestoneDesc2 = ["Buy laptops"];
            const milestoneAmt2 = [ethers.parseEther("6")];
            const milestoneDesc1 = ["Construct classroom"];
            const milestoneAmt1 = [ethers.parseEther("10")];
            await proposalManager.connect(ngo).createProposal(milestoneDesc1, milestoneAmt1);


            await proposalManager.connect(ngo).createProposal(milestoneDesc2, milestoneAmt2);
            await votingManager.connect(admin).cleanInvalidProposals();
            // Get all proposals
            const allProposals = await proposalManager.getAllProposals();
            expect(allProposals.length).to.be.gte(2); // at least two exist (could include older ones)

            // Get all valid Proposols
            const validProposals = await votingManager.getValidProposals();

            // Check
            expect(validProposals.length).to.be.equal(2);
            console.log(`Total proposals: ${allProposals.length}, Valid proposals: ${validProposals.length}`);
        });

        it("Should not allow votes for expired proposals", async function () {
            
            // advance time before creating proposals
            const eightDays = 8 * 24 * 60 * 60;
            await ethers.provider.send("evm_increaseTime", [eightDays]);
            await ethers.provider.send("evm_mine");

            // create two new proposals
            const milestoneDesc2 = ["Buy laptops"];
            const milestoneAmt2 = [ethers.parseEther("6")];
            const milestoneDesc1 = ["Construct classroom"];
            const milestoneAmt1 = [ethers.parseEther("10")];
            await proposalManager.connect(ngo).createProposal(milestoneDesc1, milestoneAmt1);


            await proposalManager.connect(ngo).createProposal(milestoneDesc2, milestoneAmt2);
            await votingManager.connect(admin).cleanInvalidProposals();

            await proposalManager.connect(ngo).createProposal(milestoneDesc2, milestoneAmt2);
            await votingManager.connect(admin).cleanInvalidProposals();
        
            // Try to vote on proposal ID 1 (the original one from beforeEach, now expired/killed)
            await expect(
                votingManager.connect(donor1).vote(proposalId, 5)
            ).to.be.revertedWith("Proposal not valid");
           
        });
    });
    describe("Voting Logic and Milestone Progression", function() {
        let testProposalId;
        const testMilestoneAmts = [10, 20]; // M0 needs 10 votes, M1 needs 20

        beforeEach(async function() {
        // Create a specific proposal for these tests
            const tx = await proposalManager.connect(ngo).createProposal(
             ["Test M0", "Test M1"],
             testMilestoneAmts
            );
             const receipt = await tx.wait();
             const event = receipt.logs
                .map(log => {
             try { return proposalManager.interface.parseLog(log); } catch { return null; }
             })
             .filter(e => e && e.name === "ProposalCreated")[0];
             testProposalId = event.args.proposalId;
        });

         it("Should allow voting on milestone 0 (no previous milestone to check)", async function() {
             // Donor 1 has 100 credits, 5 votes costs 25
             await expect(votingManager.connect(donor1).vote(testProposalId, 5))
            .to.emit(votingManager, "VoteCast")
            .withArgs(donor1.address, testProposalId, anyValue, 5);

            expect(await votingManager.getProposalVotes(testProposalId)).to.equal(5);
            expect(await votingManager.nextMilestoneMapping(testProposalId)).to.equal(0);
            });

        it("Should revert voting on milestone 1 if milestone 0 is released but NOT verified", async function() {
        // 1. Fund milestone 0
        // Donor 1 has 100 credits. 10 votes costs 10^2 = 100 credits.
            await votingManager.connect(donor1).vote(testProposalId, 10);

            // Check that milestone 0 was funded and state advanced
            expect(await votingManager.nextMilestoneMapping(testProposalId)).to.equal(1);
            expect(await proposalManager.getMilestoneReleaseStatus(testProposalId, 0)).to.be.true;

            // 2. Check verification status (should be false, no oracle)
            expect(await proposalManager.getMilestoneStatus(testProposalId, 0)).to.be.false;

            await expect(
            votingManager.connect(donor2).vote(testProposalId, 1)
            ).to.be.revertedWith("Previous milestone released but not verified");
        });

        it("Should revert voting if proposal is fully funded", async function() {
        // 1. Fund milestone 0 (needs 10 votes)
        await votingManager.connect(donor1).vote(testProposalId, 10);

        const tx = await proposalManager.connect(ngo).createProposal(["One Milestone"], [5]);
        const receipt = await tx.wait();
          const event = receipt.logs
            .map(log => {
                try { return proposalManager.interface.parseLog(log); } catch { return null; }
            })
            .filter(e => e && e.name === "ProposalCreated")[0];
        const oneMilestoneId = event.args.proposalId;
         // Fund the only milestone
            await votingManager.connect(donor2).vote(oneMilestoneId, 5);
            expect(await votingManager.nextMilestoneMapping(oneMilestoneId)).to.equal(1); // Now at index 1

         // Try to vote again
             await expect(
             votingManager.connect(donor2).vote(oneMilestoneId, 1)
             ).to.be.revertedWith("Proposal already fully funded");
         });
     });
});
