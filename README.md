# CharityDAO: Sybil-Resistant Governance System

A decentralized autonomous organization (DAO) for charitable giving that combines quadratic voting, reputation-based incentives, and milestone-driven fund disbursement to prevent whale manipulation and ensure accountability.

## Features

- **Quadratic Voting**: Cost increases quadratically (n²) to prevent whale dominance
- **Reputation System**: 3-tier system with voting cost discounts for consistent participants
- **Milestone-Based Funding**: Incremental fund release with proof verification
- **NGO Verification**: Only verified NGOs can create proposals
- **Anti-Sybil Protection**: Time-based consistency checks prevent fake accounts

## System Overview

The system includes 6 smart contracts:

- **GovernanceToken**: ERC20 governance token with voting snapshots
- **Treasury**: Handles donations, token minting, and fund disbursement
- **VotingManager**: Core quadratic voting with reputation tracking
- **ProposalManager**: Milestone-based proposal management
- **ProofOracle**: Milestone verification and proof submission
- **NGOOracle**: NGO whitelist and verification system

## Getting Started

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd IS4302Proj

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

### Running Local Development

```bash
# Start local Hardhat node
npx hardhat node

# Deploy contracts (in separate terminal)
npx hardhat run scripts/deploy.js --network localhost

# Start frontend (in charity-dao directory)
cd charity-dao
npm install
npm run dev
```

### Testing

```bash
# Run all tests
npx hardhat test

# Run specific test
npx hardhat test test/VotingManager_test.js

# Coverage report
npx hardhat coverage
```

## Key Features

### Reputation Tiers

| Tier | Sessions | Unique Proposals | Days Active | Max Avg Votes/Session | Discount |
| ---- | -------- | ---------------- | ----------- | --------------------- | -------- |
| 0    | Any      | Any              | Any         | Any                   | 0%       |
| 1    | ≥3       | ≥3               | ≥3          | ≤100                  | ~4%      |
| 2    | ≥5       | ≥5               | ≥7          | ≤100                  | ~8%      |

### Voting Costs (1000:1 mint rate)

| Votes | Tier 0    | Tier 1    | Tier 2    |
| ----- | --------- | --------- | --------- |
| 1     | 0.001 ETH | 0.001 ETH | 0.001 ETH |
| 5     | 0.025 ETH | 0.024 ETH | 0.023 ETH |
| 10    | 0.1 ETH   | 0.096 ETH | 0.092 ETH |

## Usage

### For Donors

1. Connect wallet and donate ETH to receive governance tokens
2. Vote on NGO proposals using quadratic voting
3. Build reputation over time for voting discounts

### For NGOs

1. Get verified through the NGO Oracle system
2. Create milestone-based proposals
3. Submit proofs for milestone completion via IPFS

### For Admins

1. Verify NGOs and manage whitelist
2. Review and approve milestone proofs
3. Manage system parameters

## Technology Stack

- **Smart Contracts**: Solidity 0.8.24 with OpenZeppelin
- **Testing**: Hardhat + Ethers.js v6 + Chai
- **Frontend**: React + Vite + TailwindCSS
- **Storage**: IPFS via Pinata

## Contributing

This is an academic project for IS4302. For suggestions:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## License

MIT License - See [LICENSE](./LICENSE) for details

---

**Developed for IS4302 - Blockchain and Distributed Ledger Technologies**  
**National University of Singapore**
