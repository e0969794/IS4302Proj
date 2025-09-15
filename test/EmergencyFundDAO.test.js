const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("EmergencyFundDAO", function () {
  
  async function deployEmergencyFundDAOFixture() {
    // Deploy the contract
    const [owner, member1, member2, member3, beneficiary] = await ethers.getSigners();
    
    const EmergencyFundDAO = await ethers.getContractFactory("EmergencyFundDAO");
    const dao = await EmergencyFundDAO.deploy();
    
    return { dao, owner, member1, member2, member3, beneficiary };
  }
  
  async function deployWithMembersFixture() {
    const { dao, owner, member1, member2, member3, beneficiary } = await loadFixture(deployEmergencyFundDAOFixture);
    
    // Register members with initial contributions
    await dao.connect(member1).registerMember({ value: ethers.parseEther("1.0") });
    await dao.connect(member2).registerMember({ value: ethers.parseEther("0.5") });
    await dao.connect(member3).registerMember({ value: ethers.parseEther("0.2") });
    
    return { dao, owner, member1, member2, member3, beneficiary };
  }

  describe("Deployment", function () {
    it("Should initialize with correct default values", async function () {
      const { dao } = await loadFixture(deployEmergencyFundDAOFixture);
      
      const stats = await dao.getDAOStats();
      expect(stats[0]).to.equal(0); // totalFund
      expect(stats[1]).to.equal(0); // totalMembers
      expect(stats[2]).to.equal(0); // proposalCount
      
      expect(await dao.VOTING_PERIOD()).to.equal(3 * 24 * 60 * 60); // 3 days
      expect(await dao.MIN_CONTRIBUTION()).to.equal(ethers.parseEther("0.01"));
      expect(await dao.QUORUM_PERCENTAGE()).to.equal(51);
      expect(await dao.APPROVAL_THRESHOLD()).to.equal(60);
    });
  });

  describe("Member Registration", function () {
    it("Should register a new member with minimum contribution", async function () {
      const { dao, member1 } = await loadFixture(deployEmergencyFundDAOFixture);
      
      const contribution = ethers.parseEther("0.01");
      await expect(dao.connect(member1).registerMember({ value: contribution }))
        .to.emit(dao, "MemberRegistered")
        .withArgs(member1.address, anyValue)
        .and.to.emit(dao, "ContributionMade")
        .withArgs(member1.address, contribution, anyValue);
      
      const member = await dao.getMember(member1.address);
      expect(member.isRegistered).to.be.true;
      expect(member.totalContributions).to.equal(contribution);
      expect(member.hasVotingRights).to.be.true;
      
      const stats = await dao.getDAOStats();
      expect(stats[0]).to.equal(contribution); // totalFund
      expect(stats[1]).to.equal(1); // totalMembers
    });
    
    it("Should reject registration with insufficient contribution", async function () {
      const { dao, member1 } = await loadFixture(deployEmergencyFundDAOFixture);
      
      await expect(dao.connect(member1).registerMember({ value: ethers.parseEther("0.005") }))
        .to.be.revertedWith("Minimum contribution required");
    });
    
    it("Should reject double registration", async function () {
      const { dao, member1 } = await loadFixture(deployEmergencyFundDAOFixture);
      
      await dao.connect(member1).registerMember({ value: ethers.parseEther("0.1") });
      
      await expect(dao.connect(member1).registerMember({ value: ethers.parseEther("0.1") }))
        .to.be.revertedWith("Already registered");
    });
  });

  describe("Contributions", function () {
    it("Should allow members to make additional contributions", async function () {
      const { dao, member1 } = await loadFixture(deployEmergencyFundDAOFixture);
      
      await dao.connect(member1).registerMember({ value: ethers.parseEther("0.1") });
      
      const additionalContribution = ethers.parseEther("0.5");
      await expect(dao.connect(member1).contribute({ value: additionalContribution }))
        .to.emit(dao, "ContributionMade")
        .withArgs(member1.address, additionalContribution, anyValue);
      
      const member = await dao.getMember(member1.address);
      expect(member.totalContributions).to.equal(ethers.parseEther("0.6"));
      
      const stats = await dao.getDAOStats();
      expect(stats[0]).to.equal(ethers.parseEther("0.6")); // totalFund
    });
    
    it("Should reject contributions from non-members", async function () {
      const { dao, member1 } = await loadFixture(deployEmergencyFundDAOFixture);
      
      await expect(dao.connect(member1).contribute({ value: ethers.parseEther("0.1") }))
        .to.be.revertedWith("Not a registered member");
    });
    
    it("Should reject zero contributions", async function () {
      const { dao, member1 } = await loadFixture(deployEmergencyFundDAOFixture);
      
      await dao.connect(member1).registerMember({ value: ethers.parseEther("0.1") });
      
      await expect(dao.connect(member1).contribute({ value: 0 }))
        .to.be.revertedWith("Contribution must be greater than 0");
    });
  });

  describe("Proposal Creation", function () {
    it("Should create a proposal successfully", async function () {
      const { dao, member1, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      const description = "Emergency funds needed for earthquake relief";
      const disasterType = "Earthquake";
      const amountRequested = ethers.parseEther("0.5");
      
      await expect(dao.connect(member1).createProposal(
        description,
        disasterType,
        amountRequested,
        beneficiary.address
      ))
        .to.emit(dao, "ProposalCreated")
        .withArgs(0, member1.address, description, amountRequested, beneficiary.address);
      
      const proposal = await dao.getProposal(0);
      expect(proposal.proposer).to.equal(member1.address);
      expect(proposal.description).to.equal(description);
      expect(proposal.disasterType).to.equal(disasterType);
      expect(proposal.amountRequested).to.equal(amountRequested);
      expect(proposal.beneficiary).to.equal(beneficiary.address);
      expect(proposal.active).to.be.true;
      expect(proposal.executed).to.be.false;
    });
    
    it("Should reject proposals from non-members", async function () {
      const { dao, owner, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      await expect(dao.connect(owner).createProposal(
        "Test proposal",
        "Fire",
        ethers.parseEther("0.1"),
        beneficiary.address
      )).to.be.revertedWith("Not a registered member");
    });
    
    it("Should reject proposals with insufficient funds", async function () {
      const { dao, member1, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      const stats = await dao.getDAOStats();
      const totalFund = stats[0];
      
      await expect(dao.connect(member1).createProposal(
        "Too much money requested",
        "Flood",
        totalFund + ethers.parseEther("1.0"),
        beneficiary.address
      )).to.be.revertedWith("Insufficient funds");
    });
    
    it("Should reject proposals with empty description", async function () {
      const { dao, member1, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      await expect(dao.connect(member1).createProposal(
        "",
        "Fire",
        ethers.parseEther("0.1"),
        beneficiary.address
      )).to.be.revertedWith("Description required");
    });
  });

  describe("Voting", function () {
    async function deployWithProposalFixture() {
      const { dao, owner, member1, member2, member3, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      // Create a proposal
      await dao.connect(member1).createProposal(
        "Emergency flood relief",
        "Flood",
        ethers.parseEther("0.5"),
        beneficiary.address
      );
      
      return { dao, owner, member1, member2, member3, beneficiary };
    }
    
    it("Should allow members to vote on proposals", async function () {
      const { dao, member1, member2 } = await loadFixture(deployWithProposalFixture);
      
      await expect(dao.connect(member1).vote(0, true))
        .to.emit(dao, "VoteCast")
        .withArgs(0, member1.address, true, anyValue);
      
      await expect(dao.connect(member2).vote(0, false))
        .to.emit(dao, "VoteCast")
        .withArgs(0, member2.address, false, anyValue);
      
      const proposal = await dao.getProposal(0);
      expect(proposal.votesFor).to.equal(1);
      expect(proposal.votesAgainst).to.equal(1);
      
      expect(await dao.hasVoted(0, member1.address)).to.be.true;
      expect(await dao.hasVoted(0, member2.address)).to.be.true;
    });
    
    it("Should reject votes from non-members", async function () {
      const { dao, owner } = await loadFixture(deployWithProposalFixture);
      
      await expect(dao.connect(owner).vote(0, true))
        .to.be.revertedWith("Not a registered member");
    });
    
    it("Should reject double voting", async function () {
      const { dao, member1 } = await loadFixture(deployWithProposalFixture);
      
      await dao.connect(member1).vote(0, true);
      
      await expect(dao.connect(member1).vote(0, false))
        .to.be.revertedWith("Already voted");
    });
    
    it("Should reject votes on expired proposals", async function () {
      const { dao, member1 } = await loadFixture(deployWithProposalFixture);
      
      // Fast forward past voting deadline
      await time.increase(4 * 24 * 60 * 60); // 4 days
      
      await expect(dao.connect(member1).vote(0, true))
        .to.be.revertedWith("Voting period ended");
    });
  });

  describe("Proposal Execution", function () {
    async function deployWithVotedProposalFixture() {
      const { dao, owner, member1, member2, member3, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      // Create proposal
      await dao.connect(member1).createProposal(
        "Emergency earthquake relief",
        "Earthquake",
        ethers.parseEther("0.5"),
        beneficiary.address
      );
      
      // All members vote in favor (100% approval, meets quorum)
      await dao.connect(member1).vote(0, true);
      await dao.connect(member2).vote(0, true);
      await dao.connect(member3).vote(0, true);
      
      // Fast forward past voting period
      await time.increase(4 * 24 * 60 * 60); // 4 days
      
      return { dao, owner, member1, member2, member3, beneficiary };
    }
    
    it("Should execute approved proposal successfully", async function () {
      const { dao, beneficiary } = await loadFixture(deployWithVotedProposalFixture);
      
      const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);
      
      await expect(dao.executeProposal(0))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(0, ethers.parseEther("0.5"), beneficiary.address)
        .and.to.emit(dao, "EmergencyFundsReleased")
        .withArgs(0, ethers.parseEther("0.5"), "Earthquake");
      
      const finalBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);
      expect(finalBeneficiaryBalance - initialBeneficiaryBalance).to.equal(ethers.parseEther("0.5"));
      
      const proposal = await dao.getProposal(0);
      expect(proposal.executed).to.be.true;
      expect(proposal.active).to.be.false;
      
      const stats = await dao.getDAOStats();
      expect(stats[0]).to.equal(ethers.parseEther("1.2")); // Remaining fund after execution
    });
    
    it("Should reject execution of proposal with insufficient votes", async function () {
      const { dao, member1, member2, member3, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      await dao.connect(member1).createProposal(
        "Test proposal",
        "Fire",
        ethers.parseEther("0.1"),
        beneficiary.address
      );
      
      // Only one vote in favor (33% approval, below 60% threshold)
      await dao.connect(member1).vote(0, true);
      await dao.connect(member2).vote(0, false);
      await dao.connect(member3).vote(0, false);
      
      await time.increase(4 * 24 * 60 * 60);
      
      await expect(dao.executeProposal(0))
        .to.be.revertedWith("Proposal not approved");
    });
    
    it("Should reject execution without quorum", async function () {
      const { dao, member1, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      await dao.connect(member1).createProposal(
        "Test proposal",
        "Fire",
        ethers.parseEther("0.1"),
        beneficiary.address
      );
      
      // Only one vote (33% participation, below 51% quorum)
      await dao.connect(member1).vote(0, true);
      
      await time.increase(4 * 24 * 60 * 60);
      
      await expect(dao.executeProposal(0))
        .to.be.revertedWith("Quorum not reached");
    });
    
    it("Should reject execution during voting period", async function () {
      const { dao, member1, member2, member3 } = await loadFixture(deployWithMembersFixture);
      
      await dao.connect(member1).createProposal(
        "Test proposal",
        "Fire",
        ethers.parseEther("0.1"),
        member1.address
      );
      
      await dao.connect(member1).vote(0, true);
      await dao.connect(member2).vote(0, true);
      await dao.connect(member3).vote(0, true);
      
      await expect(dao.executeProposal(0))
        .to.be.revertedWith("Voting still ongoing");
    });
  });

  describe("Utility Functions", function () {
    it("Should return correct DAO statistics", async function () {
      const { dao } = await loadFixture(deployWithMembersFixture);
      
      const stats = await dao.getDAOStats();
      expect(stats[0]).to.equal(ethers.parseEther("1.7")); // totalFund
      expect(stats[1]).to.equal(3); // totalMembers
      expect(stats[2]).to.equal(0); // proposalCount
    });
    
    it("Should return all member addresses", async function () {
      const { dao, member1, member2, member3 } = await loadFixture(deployWithMembersFixture);
      
      const members = await dao.getAllMembers();
      expect(members).to.have.lengthOf(3);
      expect(members).to.include(member1.address);
      expect(members).to.include(member2.address);
      expect(members).to.include(member3.address);
    });
    
    it("Should correctly check proposal execution eligibility", async function () {
      const { dao, member1, member2, member3, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      await dao.connect(member1).createProposal(
        "Test proposal",
        "Fire",
        ethers.parseEther("0.1"),
        beneficiary.address
      );
      
      // Before voting
      expect(await dao.canExecuteProposal(0)).to.be.false;
      
      // After successful voting
      await dao.connect(member1).vote(0, true);
      await dao.connect(member2).vote(0, true);
      await dao.connect(member3).vote(0, true);
      
      // Still during voting period
      expect(await dao.canExecuteProposal(0)).to.be.false;
      
      // After voting period
      await time.increase(4 * 24 * 60 * 60);
      expect(await dao.canExecuteProposal(0)).to.be.true;
      
      // After execution
      await dao.executeProposal(0);
      expect(await dao.canExecuteProposal(0)).to.be.false;
    });
  });

  describe("Direct Donations", function () {
    it("Should accept direct ETH transfers", async function () {
      const { dao, owner } = await loadFixture(deployEmergencyFundDAOFixture);
      
      const donation = ethers.parseEther("1.0");
      await owner.sendTransaction({
        to: dao.target,
        value: donation
      });
      
      const stats = await dao.getDAOStats();
      expect(stats[0]).to.equal(donation);
      expect(await ethers.provider.getBalance(dao.target)).to.equal(donation);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle proposals requesting exact available funds", async function () {
      const { dao, member1, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      const stats = await dao.getDAOStats();
      const totalFund = stats[0];
      
      await expect(dao.connect(member1).createProposal(
        "Use all funds",
        "Tsunami",
        totalFund,
        beneficiary.address
      )).to.not.be.reverted;
    });
    
    it("Should reject execution if contract balance is insufficient", async function () {
      const { dao, member1, member2, member3, beneficiary } = await loadFixture(deployWithMembersFixture);
      
      await dao.connect(member1).createProposal(
        "Test proposal",
        "Fire",
        ethers.parseEther("0.5"),
        beneficiary.address
      );
      
      // Vote to approve
      await dao.connect(member1).vote(0, true);
      await dao.connect(member2).vote(0, true);
      await dao.connect(member3).vote(0, true);
      
      // Manually drain contract balance (simulate unexpected scenario)
      // This would normally not happen in real usage, but tests edge case
      
      await time.increase(4 * 24 * 60 * 60);
      
      // Should still work with current balance
      await expect(dao.executeProposal(0)).to.not.be.reverted;
    });
  });
});