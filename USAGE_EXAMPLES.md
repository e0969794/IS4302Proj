# Usage Examples for EmergencyFundDAO

This document provides practical examples of how to interact with the EmergencyFundDAO smart contract.

## Basic Setup

```javascript
const { ethers } = require("hardhat");

// Connect to deployed contract
const dao = await ethers.getContractAt("EmergencyFundDAO", contractAddress);

// Get signers
const [deployer, alice, bob, charlie, beneficiary] = await ethers.getSigners();
```

## 1. Member Registration and Contributions

### Register as a New Member
```javascript
// Register with minimum contribution (0.01 ETH)
await dao.connect(alice).registerMember({ 
  value: ethers.parseEther("0.01") 
});

// Register with larger contribution
await dao.connect(bob).registerMember({ 
  value: ethers.parseEther("1.0") 
});
```

### Make Additional Contributions
```javascript
// Existing members can contribute more
await dao.connect(alice).contribute({ 
  value: ethers.parseEther("0.5") 
});
```

### Check Member Information
```javascript
const memberInfo = await dao.getMember(alice.address);
console.log("Is registered:", memberInfo.isRegistered);
console.log("Total contributions:", ethers.formatEther(memberInfo.totalContributions));
console.log("Has voting rights:", memberInfo.hasVotingRights);
console.log("Joined at:", new Date(memberInfo.joinedAt * 1000));
```

## 2. Creating Emergency Proposals

### Create a Disaster Relief Proposal
```javascript
await dao.connect(alice).createProposal(
  "Emergency earthquake relief - immediate shelter and medical supplies needed for 100 affected families in Region X",
  "Earthquake",
  ethers.parseEther("5.0"),
  beneficiary.address
);

// Get the proposal ID (starts from 0)
const proposalCount = await dao.proposalCount();
const proposalId = proposalCount - 1n;
```

### Different Types of Emergency Proposals
```javascript
// Flood disaster
await dao.connect(bob).createProposal(
  "Flood relief - emergency evacuation and temporary housing",
  "Flood",
  ethers.parseEther("2.5"),
  beneficiary.address
);

// Fire emergency
await dao.connect(charlie).createProposal(
  "Wildfire emergency - evacuation support and temporary shelter",
  "Fire",
  ethers.parseEther("3.0"),
  beneficiary.address
);

// Medical emergency
await dao.connect(alice).createProposal(
  "Medical emergency - equipment and supplies for local clinic",
  "Medical Emergency",
  ethers.parseEther("1.5"),
  beneficiary.address
);
```

## 3. Voting on Proposals

### Cast Votes
```javascript
const proposalId = 0;

// Vote in favor
await dao.connect(alice).vote(proposalId, true);

// Vote against
await dao.connect(bob).vote(proposalId, false);

// Vote in favor
await dao.connect(charlie).vote(proposalId, true);
```

### Check Voting Status
```javascript
// Check if someone has voted
const hasAliceVoted = await dao.hasVoted(proposalId, alice.address);
console.log("Alice has voted:", hasAliceVoted);

// Get proposal voting results
const proposal = await dao.getProposal(proposalId);
console.log("Votes for:", proposal.votesFor.toString());
console.log("Votes against:", proposal.votesAgainst.toString());
console.log("Voting deadline:", new Date(proposal.votingDeadline * 1000));
```

## 4. Proposal Execution

### Check if Proposal Can Be Executed
```javascript
const canExecute = await dao.canExecuteProposal(proposalId);
console.log("Can execute:", canExecute);

if (canExecute) {
  console.log("✅ Proposal meets all execution criteria:");
  console.log("  - Voting period has ended");
  console.log("  - Quorum requirement met (≥51%)");
  console.log("  - Approval threshold met (≥60%)");
  console.log("  - Sufficient funds available");
}
```

### Execute Approved Proposal
```javascript
// Execute the proposal (anyone can call this)
const beneficiaryBalanceBefore = await ethers.provider.getBalance(beneficiary.address);

await dao.executeProposal(proposalId);

const beneficiaryBalanceAfter = await ethers.provider.getBalance(beneficiary.address);
const fundsTransferred = beneficiaryBalanceAfter - beneficiaryBalanceBefore;

console.log("Funds transferred:", ethers.formatEther(fundsTransferred), "ETH");
```

## 5. Monitoring DAO Activity

### Get DAO Statistics
```javascript
const stats = await dao.getDAOStats();
console.log("Total fund:", ethers.formatEther(stats[0]), "ETH");
console.log("Total members:", stats[1].toString());
console.log("Total proposals:", stats[2].toString());
```

### Get All Members
```javascript
const members = await dao.getAllMembers();
console.log("All DAO members:", members);

// Get details for each member
for (const memberAddress of members) {
  const memberInfo = await dao.getMember(memberAddress);
  console.log(`${memberAddress}: ${ethers.formatEther(memberInfo.totalContributions)} ETH`);
}
```

### Get Proposal Details
```javascript
const proposal = await dao.getProposal(proposalId);
console.log("Proposer:", proposal.proposer);
console.log("Description:", proposal.description);
console.log("Disaster type:", proposal.disasterType);
console.log("Amount requested:", ethers.formatEther(proposal.amountRequested), "ETH");
console.log("Beneficiary:", proposal.beneficiary);
console.log("Created at:", new Date(proposal.createdAt * 1000));
console.log("Voting deadline:", new Date(proposal.votingDeadline * 1000));
console.log("Executed:", proposal.executed);
console.log("Active:", proposal.active);
```

## 6. Event Listening

### Listen for DAO Events
```javascript
// Listen for new member registrations
dao.on("MemberRegistered", (member, timestamp, event) => {
  console.log(`New member registered: ${member} at ${new Date(timestamp * 1000)}`);
});

// Listen for new contributions
dao.on("ContributionMade", (member, amount, timestamp, event) => {
  console.log(`${member} contributed ${ethers.formatEther(amount)} ETH`);
});

// Listen for new proposals
dao.on("ProposalCreated", (proposalId, proposer, description, amount, beneficiary, event) => {
  console.log(`New proposal ${proposalId}: ${description}`);
  console.log(`Amount: ${ethers.formatEther(amount)} ETH to ${beneficiary}`);
});

// Listen for votes
dao.on("VoteCast", (proposalId, voter, support, timestamp, event) => {
  console.log(`${voter} voted ${support ? 'YES' : 'NO'} on proposal ${proposalId}`);
});

// Listen for proposal executions
dao.on("ProposalExecuted", (proposalId, amount, beneficiary, event) => {
  console.log(`Proposal ${proposalId} executed: ${ethers.formatEther(amount)} ETH sent to ${beneficiary}`);
});

// Listen for emergency fund releases
dao.on("EmergencyFundsReleased", (proposalId, amount, disasterType, event) => {
  console.log(`EMERGENCY: ${ethers.formatEther(amount)} ETH released for ${disasterType} disaster`);
});
```

## 7. Frontend Integration Example

### React Component Example
```javascript
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

function DAOInterface({ contractAddress, abi }) {
  const [dao, setDao] = useState(null);
  const [stats, setStats] = useState({ totalFund: '0', totalMembers: '0', proposalCount: '0' });
  const [proposals, setProposals] = useState([]);

  useEffect(() => {
    async function initDAO() {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const daoContract = new ethers.Contract(contractAddress, abi, signer);
        setDao(daoContract);
        
        // Load initial data
        await loadDAOStats(daoContract);
        await loadProposals(daoContract);
      }
    }
    initDAO();
  }, [contractAddress, abi]);

  const loadDAOStats = async (daoContract) => {
    const daoStats = await daoContract.getDAOStats();
    setStats({
      totalFund: ethers.formatEther(daoStats[0]),
      totalMembers: daoStats[1].toString(),
      proposalCount: daoStats[2].toString()
    });
  };

  const registerMember = async (amount) => {
    if (dao) {
      const tx = await dao.registerMember({ value: ethers.parseEther(amount) });
      await tx.wait();
      await loadDAOStats(dao);
    }
  };

  const createProposal = async (description, disasterType, amount, beneficiary) => {
    if (dao) {
      const tx = await dao.createProposal(
        description,
        disasterType, 
        ethers.parseEther(amount),
        beneficiary
      );
      await tx.wait();
      await loadDAOStats(dao);
      await loadProposals(dao);
    }
  };

  const voteOnProposal = async (proposalId, support) => {
    if (dao) {
      const tx = await dao.vote(proposalId, support);
      await tx.wait();
      await loadProposals(dao);
    }
  };

  return (
    <div>
      <h2>Emergency Fund DAO</h2>
      <div>
        <p>Total Fund: {stats.totalFund} ETH</p>
        <p>Total Members: {stats.totalMembers}</p>
        <p>Total Proposals: {stats.proposalCount}</p>
      </div>
      {/* Add UI components for registration, proposals, voting, etc. */}
    </div>
  );
}
```

## 8. Error Handling

### Common Error Scenarios
```javascript
try {
  await dao.connect(alice).registerMember({ value: ethers.parseEther("0.005") });
} catch (error) {
  if (error.message.includes("Minimum contribution required")) {
    console.log("Error: Contribution too small. Minimum is 0.01 ETH");
  }
}

try {
  await dao.connect(alice).vote(proposalId, true);
} catch (error) {
  if (error.message.includes("Already voted")) {
    console.log("Error: You have already voted on this proposal");
  } else if (error.message.includes("Voting period ended")) {
    console.log("Error: Voting period has ended");
  } else if (error.message.includes("Not a registered member")) {
    console.log("Error: You must be a registered member to vote");
  }
}

try {
  await dao.executeProposal(proposalId);
} catch (error) {
  if (error.message.includes("Voting still ongoing")) {
    console.log("Error: Wait for voting period to end");
  } else if (error.message.includes("Quorum not reached")) {
    console.log("Error: Not enough members participated in voting");
  } else if (error.message.includes("Proposal not approved")) {
    console.log("Error: Proposal did not receive enough approval votes");
  }
}
```

## 9. Testing Scenarios

### Complete Workflow Test
```javascript
describe("Complete Emergency Response Workflow", function() {
  it("Should handle full disaster response cycle", async function() {
    // 1. Deploy DAO
    const dao = await deployDAO();
    
    // 2. Register members
    await dao.connect(alice).registerMember({ value: ethers.parseEther("1.0") });
    await dao.connect(bob).registerMember({ value: ethers.parseEther("0.5") });
    await dao.connect(charlie).registerMember({ value: ethers.parseEther("0.3") });
    
    // 3. Create emergency proposal
    await dao.connect(alice).createProposal(
      "Earthquake emergency relief",
      "Earthquake", 
      ethers.parseEther("0.8"),
      beneficiary.address
    );
    
    // 4. Community votes
    await dao.connect(alice).vote(0, true);
    await dao.connect(bob).vote(0, true);
    await dao.connect(charlie).vote(0, true);
    
    // 5. Wait for voting period
    await time.increase(4 * 24 * 60 * 60);
    
    // 6. Execute proposal
    await dao.executeProposal(0);
    
    // 7. Verify funds transferred
    const proposal = await dao.getProposal(0);
    expect(proposal.executed).to.be.true;
  });
});
```

This comprehensive guide covers all major use cases for the EmergencyFundDAO smart contract, from basic member operations to complex emergency response scenarios.