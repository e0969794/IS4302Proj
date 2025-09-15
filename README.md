# EmergencyFundDAO - Decentralized Emergency Relief System

A blockchain-based Decentralized Autonomous Organization (DAO) that enables community members to contribute to a shared emergency fund that can be quickly deployed through democratic voting when disasters strike.

## Overview

The EmergencyFundDAO is a smart contract system built on Ethereum that provides:

- **Community Membership**: Anyone can join by making a minimum contribution
- **Shared Emergency Fund**: All contributions go into a collective emergency fund
- **Democratic Governance**: Proposals for fund disbursement require community voting
- **Quick Emergency Response**: Approved proposals can be executed immediately
- **Transparent Operations**: All activities are recorded on-chain for complete transparency

## Key Features

### 🏛️ Democratic Governance
- 51% quorum requirement for proposal validity
- 60% approval threshold for proposal execution
- 3-day voting period for all proposals
- One member, one vote system

### 💰 Flexible Funding
- Minimum contribution of 0.01 ETH to join
- Members can make additional contributions anytime
- Direct donations accepted from non-members
- Automatic fund tracking and management

### ⚡ Emergency Response
- Quick proposal creation for disaster situations
- Immediate fund disbursement after successful vote
- Support for various disaster types (earthquake, flood, fire, etc.)
- Real-time proposal status tracking

### 🔒 Security & Transparency
- Time-locked voting prevents hasty decisions
- Quorum requirements prevent minority control
- All transactions recorded on blockchain
- Public visibility of all proposals and votes

## Smart Contract Architecture

### Core Components

1. **Member Management**
   - Registration with minimum contribution
   - Voting rights assignment
   - Contribution tracking

2. **Proposal System**
   - Emergency situation documentation
   - Fund amount specification
   - Beneficiary designation
   - Voting deadline management

3. **Voting Mechanism**
   - Democratic voting process
   - Vote tracking and validation
   - Quorum and approval calculations

4. **Fund Management**
   - Secure fund storage
   - Automatic disbursement
   - Balance tracking

## Usage Guide

### For Members

#### 1. Join the DAO
```solidity
// Register as a member with minimum 0.01 ETH contribution
registerMember() payable
```

#### 2. Make Additional Contributions
```solidity
// Contribute more to the emergency fund
contribute() payable
```

#### 3. Create Emergency Proposals
```solidity
// Create a proposal for emergency fund disbursement
createProposal(
    string description,      // "Emergency flood relief in Region X"
    string disasterType,     // "Flood"
    uint256 amountRequested, // Amount in wei
    address beneficiary      // Recipient address
)
```

#### 4. Vote on Proposals
```solidity
// Vote on active proposals
vote(uint256 proposalId, bool support) // true = yes, false = no
```

#### 5. Execute Approved Proposals
```solidity
// Execute proposals that have passed
executeProposal(uint256 proposalId)
```

### For Developers

#### Installation and Setup

```bash
# Clone the repository
git clone https://github.com/e0969794/IS4302Proj.git
cd IS4302Proj

# Install dependencies
npm install

# Compile contracts (requires internet for Solidity compiler download)
npm run compile

# Run tests
npm run test

# Start local Hardhat node
npm run node

# Deploy to local network
npm run deploy-local
```

#### Development Environment

The project uses:
- **Hardhat** for development framework
- **Solidity 0.8.19** for smart contracts
- **Ethers.js** for blockchain interactions
- **Mocha & Chai** for testing

#### Contract Deployment

```javascript
const EmergencyFundDAO = await ethers.getContractFactory("EmergencyFundDAO");
const dao = await EmergencyFundDAO.deploy();
await dao.waitForDeployment();
```

## Contract Interface

### Key Functions

#### Member Functions
- `registerMember() payable` - Join the DAO with initial contribution
- `contribute() payable` - Add funds to the emergency fund
- `getMember(address) returns (bool, uint256, uint256, bool)` - Get member info

#### Proposal Functions
- `createProposal(string, string, uint256, address)` - Create emergency proposal
- `vote(uint256, bool)` - Vote on proposals
- `executeProposal(uint256)` - Execute approved proposals
- `getProposal(uint256) returns (...)` - Get proposal details

#### View Functions
- `getDAOStats() returns (uint256, uint256, uint256)` - Get DAO statistics
- `canExecuteProposal(uint256) returns (bool)` - Check execution eligibility
- `hasVoted(uint256, address) returns (bool)` - Check voting status
- `getAllMembers() returns (address[])` - Get all member addresses

### Events

```solidity
event MemberRegistered(address indexed member, uint256 timestamp);
event ContributionMade(address indexed member, uint256 amount, uint256 timestamp);
event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string description, uint256 amountRequested, address beneficiary);
event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 timestamp);
event ProposalExecuted(uint256 indexed proposalId, uint256 amount, address beneficiary);
event EmergencyFundsReleased(uint256 indexed proposalId, uint256 amount, string disasterType);
```

## Configuration Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MIN_CONTRIBUTION` | 0.01 ETH | Minimum contribution to join DAO |
| `VOTING_PERIOD` | 3 days | Time allowed for voting on proposals |
| `QUORUM_PERCENTAGE` | 51% | Minimum participation required |
| `APPROVAL_THRESHOLD` | 60% | Minimum approval percentage required |

## Example Workflow

### Disaster Response Scenario

1. **Emergency Occurs**: A flood hits a community
2. **Proposal Creation**: A member creates a proposal for flood relief
3. **Community Voting**: Members vote on whether to approve the funding
4. **Execution**: If approved with sufficient votes, funds are immediately sent
5. **Transparency**: All actions are recorded on blockchain for accountability

### Sample Code Integration

```javascript
// Connect to deployed contract
const dao = await ethers.getContractAt("EmergencyFundDAO", contractAddress);

// Register as member
await dao.registerMember({ value: ethers.parseEther("0.1") });

// Create emergency proposal
await dao.createProposal(
  "Emergency earthquake relief for affected families",
  "Earthquake",
  ethers.parseEther("5.0"),
  beneficiaryAddress
);

// Vote on proposal
await dao.vote(0, true); // Vote yes on proposal 0

// Check if proposal can be executed
const canExecute = await dao.canExecuteProposal(0);
if (canExecute) {
  await dao.executeProposal(0);
}
```

## Security Considerations

### Built-in Protections
- **Time locks** prevent rushed decisions
- **Quorum requirements** prevent minority control
- **Approval thresholds** ensure community consensus
- **Balance checks** prevent over-spending
- **Reentrancy protection** via Checks-Effects-Interactions pattern

### Best Practices
- Always verify proposal details before voting
- Check beneficiary addresses carefully
- Monitor fund balances and proposal activities
- Participate actively in governance voting

## Testing

The contract includes comprehensive tests covering:
- Member registration and contributions
- Proposal creation and validation
- Voting mechanisms and edge cases
- Proposal execution and fund transfers
- Security scenarios and access controls

Run tests with: `npm run test`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is licensed under the MIT License - see the code for details.

## Emergency Contact

For urgent issues during actual disasters, please contact local emergency services first. This system is designed to supplement, not replace, traditional emergency response systems.