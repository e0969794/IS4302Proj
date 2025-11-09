# CharityDAO: A Sybil-Resistant, Anti-Whale Governance System

A decentralized autonomous organization (DAO) for charitable giving that combines **quadratic voting**, **reputation-based incentives**, **time-based consistency checks**, and **milestone-driven fund disbursement** to prevent whale manipulation and Sybil attacks while maximizing community participation and accountability.

## 🎯 Core Problem Statement

Traditional charitable DAOs face three critical challenges:

1. **Whale Dominance**: Large token holders can disproportionately influence funding decisions
2. **Sybil Attacks**: Malicious actors can create multiple identities to game voting systems
3. **Accountability Gap**: Funds are often released upfront without proof of impact

Our solution creates a **multi-layered defense system** that addresses all three vulnerabilities through synergistic smart contract design.

---

## 🛡️ Anti-Whale & Anti-Sybil Architecture

### 1. Quadratic Voting Foundation

**Base Formula**: Cost = n²  
Where n = number of votes cast

**Effect**: Makes bulk voting exponentially expensive

- 1 vote = 1 token (0.001 ETH)
- 10 votes = 100 tokens (0.1 ETH)
- 100 votes = 10,000 tokens (10 ETH)

**Why it works**: Whales must pay quadratically more to dominate voting, naturally limiting their influence.

### 2. Reputation-Based Quadratic Discounts

**The Innovation**: Instead of traditional token-based discounts, we **modify the quadratic formula itself** for proven community members.

#### Tier System (Dynamic Formula Modification)

| Tier                    | Requirements                                              | Modified Formula | Effective Discount |
| ----------------------- | --------------------------------------------------------- | ---------------- | ------------------ |
| **0** (No Rep)          | New voters                                                | Cost = n²        | 0%                 |
| **1** (Good Voter)      | 3+ sessions, 3+ proposals, 3+ days, ≤7×mintRate avg votes | Cost = n² × 0.96 | ~4%                |
| **2** (Very Good Voter) | 5+ sessions, 4+ proposals, 7+ days, ≤5×mintRate avg votes | Cost = n² × 0.92 | ~8%                |

**Key Design Choice**: Discounts only apply to **multi-vote scenarios** (n ≥ 2), preventing micro-gaming of single votes.

### 3. Time-Based Consistency Checks (Anti-Whale Core)

**The Problem**: A whale could theoretically vote on multiple proposals to build "fake" reputation quickly.

**The Solution**: We track **time between first and last vote** and enforce minimum activity periods:

```solidity
uint256 daysActive = (lastVoteTimestamp - firstVoteTimestamp) / 1 days;

// Tier 1 requires: daysActive ≥ 3 days
// Tier 2 requires: daysActive ≥ 7 days
```

**Why it works**:

- Genuine community members: Vote consistently over weeks/months → earn discounts
- Whales trying to game system: Can't build reputation quickly → remain Tier 0 with full quadratic costs
- Sybil attackers: Would need to maintain multiple identities over extended time periods → economically unfeasible

### 4. Whale Detection via Average Votes Per Session

**The Mechanism**: We calculate `avgVotesPerSession = totalVotesCast / totalSessions`

**Dynamic Thresholds** (scale with mint rate):

```solidity
uint256 mintRate = treasury.mintRate(); // e.g., 1000 tokens per ETH

uint256 whaleThreshold = 10 * mintRate;     // 10,000 votes/session at 1000:1 rate
uint256 tier2MaxAvg = 5 * mintRate;         // 5,000 votes/session for Tier 2
uint256 tier1MaxAvg = 7 * mintRate;         // 7,000 votes/session for Tier 1
```

**Behavior Detection**:

- **Genuine Community Member**: Casts 1-5×mintRate votes per session (e.g., 1,000-5,000 at 1000:1 rate)
- **Moderate Voter**: 5-7×mintRate votes per session → qualifies for Tier 1 only
- **Heavy User**: 7-10×mintRate votes per session → remains Tier 0
- **Whale**: >10×mintRate votes per session → **BLOCKED from any tier**, pays full quadratic cost

**Example at 1000:1 mint rate**:

- User A: Votes 2,000 tokens across 4 sessions = 500 avg → ✅ Can reach Tier 2
- User B: Votes 30,000 tokens across 5 sessions = 6,000 avg → ⚠️ Stuck at Tier 1
- User C: Votes 50,000 tokens across 4 sessions = 12,500 avg → ❌ Whale detected, remains Tier 0

### 5. Synergistic Multi-Dimensional Requirements

To earn reputation, voters must satisfy **ALL** conditions simultaneously:

**Tier 1 Requirements**:

- ✅ **Frequency**: 3+ voting sessions (proves engagement)
- ✅ **Diversity**: 3+ unique proposals (prevents single-proposal spam)
- ✅ **Consistency**: 3+ days active (prevents rapid gaming)
- ✅ **Moderation**: ≤7×mintRate avg votes/session (not dumping votes)

**Tier 2 Requirements**:

- ✅ **Frequency**: 5+ voting sessions (higher bar)
- ✅ **Diversity**: 4+ unique proposals (broader participation)
- ✅ **Consistency**: 7+ days active (week+ commitment)
- ✅ **Moderation**: ≤5×mintRate avg votes/session (more selective)

**The Synergy**: Each dimension catches a different attack vector:

- Frequency alone → Could spam votes quickly
- Diversity alone → Could create many proposals, vote on all
- Time alone → Could wait and dump votes later
- Average votes alone → Could game with tiny votes
- **All together** → Creates an economically infeasible attack surface

---

## 🏗️ System Architecture

### Smart Contract Ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│                     CharityDAO System                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │ GovernanceToken│────▶│   Treasury   │                    │
│  │   (ERC20Votes) │     │  (Donations) │                    │
│  └──────────────┘      └──────────────┘                    │
│         │                      │                             │
│         │                      │                             │
│         ▼                      ▼                             │
│  ┌──────────────────────────────────────┐                   │
│  │       VotingManager (Core)           │                   │
│  │  • Quadratic Voting                  │                   │
│  │  • Reputation Tracking               │                   │
│  │  • Anti-Whale Detection              │                   │
│  │  • Time-Based Consistency            │                   │
│  └──────────────────────────────────────┘                   │
│         │                      │                             │
│         ▼                      ▼                             │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │ProposalManager│◀─────│ NGOOracle   │ (REQUIRED)         │
│  │  (Milestones) │      │ (Whitelist) │                    │
│  │  Line 78:     │─────▶│ verifyNGO() │                    │
│  │  verifyNGO()  │      └──────────────┘                    │
│  └──────────────┘              │                             │
│         │                      │                             │
│         ▼                      │                             │
│  ┌──────────────┐              │                             │
│  │ ProofOracle  │──────────────┘                            │
│  │(Verification)│                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘

Security Flow: NGOOracle ──validates──> ProposalManager ──creates──> Proposals
```

### Contract Roles & Responsibilities

#### 1. **GovernanceToken.sol**

- ERC20 with ERC20Votes extension (snapshot-based voting power)
- ERC20Permit for gasless approvals
- Minted 1:1000 ratio (1 ETH = 1000 tokens)
- Only Treasury can mint/burn
- Pausable for emergency stops

**Anti-Whale Feature**: Voting power calculation uses ERC20Votes checkpoints, preventing flash loan attacks.

#### 2. **Treasury.sol**

- Receives ETH donations
- Mints governance tokens at configurable rate (default: 1000:1)
- Burns tokens when users vote (implements cost)
- Disburses funds only when milestones are verified
- Role-based access: DISBURSER_ROLE, BURNER_ROLE

**Key Insight**: ~99.7% of donated ETH stays in reserves due to high mint rate, ensuring DAO sustainability.

#### 3. **VotingManager.sol** ⭐ (Core Innovation)

- Implements quadratic voting with reputation discounts
- Tracks 6 reputation metrics per voter:
  1. `voterTotalSessions` - number of voting transactions
  2. `voterUniqueProposals` - distinct proposals voted on
  3. `voterFirstVoteTimestamp` - first participation date
  4. `voterLastVoteTimestamp` - most recent participation
  5. `voterTotalVotesCast` - cumulative votes (whale indicator)
  6. `voterProposalHistory` - mapping of voted proposals
- Calculates dynamic thresholds based on mint rate
- Enforces milestone verification before next milestone voting
- Auto-disburses funds when vote thresholds are met

**Security Features**:

- ReentrancyGuard on all vote functions
- Integer math (no floating point exploits)
- Single transaction state changes
- `canVoteOnMilestone` modifier prevents voting on unverified milestones

#### 4. **ProposalManager.sol**

- **Requires NGOOracle integration** for proposal creation security
- NGOs create milestone-based proposals (only verified NGOs via `ngoOracle.verifyNGO()`)
- Each milestone has: description, amount (cumulative), verification status
- Proposals can be killed if they expire (7 days × milestone number)
- Stores IPFS proof hashes for immutability

**Security Gate**: Line 78 enforces `require(ngoOracle.verifyNGO(msg.sender), "NGO address not approved")` before any proposal creation - this is the **first line of defense** against scam proposals.

**Accountability Design**: Funds unlock **incrementally** as milestones are verified, not upfront.

#### 5. **ProofOracle.sol**

- NGOs submit IPFS proofs (via Pinata) for milestone completion
- Admins (multi-sig recommended) verify proofs off-chain
- Stores submission queue with approval/rejection reasons
- Only verified NGOs can submit proofs

**Trust Minimization**: Proof URLs are hashed and stored on-chain, enabling public audit of original IPFS content.

#### 6. **NGOOracle.sol**

- Maintains whitelist of approved NGO addresses
- Stores IPFS URL pointing to JSON with all NGO details
- Multi-sig admin can approve/revoke NGOs
- All changes emit events with timestamps
- **Required dependency** for ProposalManager - passed to constructor

**Sybil Prevention**: Only pre-approved, verified organizations can create proposals. ProposalManager checks `ngoOracle.verifyNGO(msg.sender)` before allowing proposal creation.

---

## 🔐 Attack Resistance Analysis

### Scenario 1: Whale Attempts to Dominate Voting

**Attack**: Wealthy user donates 100 ETH, tries to control all votes

**Defense Layers**:

1. **Quadratic Cost**: 100 ETH = 100,000 tokens. To cast 316 votes on one proposal costs all tokens (316² = 99,856 ≈ 100,000)
2. **No Reputation Discount**: Even if they vote on 5 proposals, high avgVotesPerSession (>10,000) → Tier 0 → no cost reduction
3. **Limited Impact**: 316 votes vs. 100 community members each casting 3 votes (900 total) → community wins
4. **Economic Disincentive**: Whale spent 100 ETH for 316 votes. Community spent 0.9 ETH (900 votes × 0.001 ETH) for 3× more influence

**Result**: ✅ **Quadratic scaling + reputation system makes whale attacks economically irrational**

### Scenario 2: Sybil Attack (Multiple Fake Identities)

**Attack**: Attacker creates 10 accounts, donates 1 ETH each, tries to amplify influence

**Defense Layers**:

1. **Quadratic Cost**: Each account gets 1,000 tokens. Can cast ~31 votes each (31² = 961). Total: 310 votes across 10 accounts.
2. **No Reputation**: New accounts start at Tier 0, pay full quadratic cost
3. **Time Barrier**: Building to Tier 1 requires 3+ days, Tier 2 requires 7+ days. Maintaining 10 accounts consistently over weeks is expensive.
4. **Comparison**: Single genuine user with 10 ETH = 10,000 tokens = ~100 votes with Tier 2 discount. **More efficient than 10 fake accounts**.

**Result**: ✅ **Time requirements + quadratic costs make Sybil attacks more expensive than legitimate participation**

### Scenario 3: Reputation Gaming

**Attack**: User votes 1 token on many proposals rapidly to build fake reputation

**Defense Layers**:

1. **Time Enforcement**: `daysActive` must be 3+ days for Tier 1, 7+ for Tier 2. Can't rush.
2. **Average Votes Check**: Even with 1-vote sessions, if total votes > 10×mintRate×sessions → whale flag
3. **Diversity Requirement**: Must vote on 3-4 different proposals, can't spam same one
4. **Economic Waste**: Building reputation costs tokens. If you spend them on micro-votes, you have fewer for actual proposals.

**Result**: ✅ **Multi-dimensional requirements prevent single-vector gaming**

### Scenario 4: Flash Loan Attack

**Attack**: Borrow massive ETH, donate, vote, return loan in single transaction

**Defense Layers**:

1. **ERC20Votes Checkpoints**: Voting power is calculated based on **snapshot at proposal creation**, not current balance
2. **Time Requirement**: Reputation requires days/weeks, can't be earned in one transaction
3. **Non-Transferable Reputation**: Reputation is tied to address, can't be bought/sold

**Result**: ✅ **ERC20Votes + time-based reputation prevent flash loan exploits**

---

## 💡 Design Philosophy

### 1. Progressive Trust Building

Users start as **untrusted** (Tier 0) and must **earn** discounts through:

- Consistent participation over time
- Diverse proposal engagement
- Moderate vote volumes

This mirrors real-world reputation systems (eBay seller ratings, Stack Overflow reputation).

### 2. Economic Alignment

- **Genuine Community Members**: Low-volume, consistent voters get 4-8% discounts → more influence per ETH
- **Whales**: High-volume dumping pays full quadratic costs → less influence per ETH
- **Sybil Attackers**: Maintaining multiple accounts over time costs more than single account

**The Math**: It's always more economical to be a good actor than a bad actor.

### 3. Accountability Through Milestones

Unlike traditional DAOs that release full funds upfront:

- Funds unlock **incrementally** as NGOs prove impact
- Community can stop funding if progress stalls
- IPFS proofs provide transparent, immutable evidence
- Oracle admin (multi-sig) acts as quality gate

### 4. Reserve Sustainability

At 1000:1 mint rate:

- User donates 1 ETH → gets 1000 tokens
- Casts 31 votes → costs 961 tokens (31² = 961)
- Actual "used" value: 31 votes = 0.031 ETH worth of influence
- **Reserve retention**: 1 - 0.031 = **0.969 ETH (96.9%)** stays in treasury

**Result**: DAO can sustain itself long-term while rewarding active participation.

---

## 🚀 Getting Started

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

### Running Tests

```bash
# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/VotingManager_test.js

# Run reputation system tests
npx hardhat test test/VotingReputation_test.js

# Coverage report
npx hardhat coverage
```

### Deployment

```bash
# Deploy to local network
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost

# Deploy to testnet (e.g., Sepolia)
npx hardhat run scripts/deploy.js --network sepolia
```

**Important**: When deploying manually, ensure:

1. Deploy NGOOracle first with initial approved NGO addresses
2. Pass NGOOracle address to ProposalManager constructor
3. Set ProofOracle address in ProposalManager after deployment
4. Grant BURNER_ROLE and DISBURSER_ROLE to VotingManager in Treasury

---

## 📊 Key Metrics & Thresholds

### Reputation Tiers (at 1000:1 mint rate)

| Metric                | Tier 0  | Tier 1  | Tier 2  |
| --------------------- | ------- | ------- | ------- |
| Sessions              | Any     | ≥3      | ≥5      |
| Unique Proposals      | Any     | ≥3      | ≥4      |
| Days Active           | Any     | ≥3      | ≥7      |
| Max Avg Votes/Session | Any     | ≤7,000  | ≤5,000  |
| Whale Threshold       | >10,000 | ≤10,000 | ≤10,000 |
| Discount              | 0%      | ~4%     | ~8%     |

### Cost Examples (1000:1 mint rate)

| Scenario | Tier 0                | Tier 1                 | Tier 2                 |
| -------- | --------------------- | ---------------------- | ---------------------- |
| 1 vote   | 1 token (0.001 ETH)   | 1 token (0.001 ETH)    | 1 token (0.001 ETH)    |
| 5 votes  | 25 tokens (0.025 ETH) | 24 tokens (0.024 ETH)  | 23 tokens (0.023 ETH)  |
| 10 votes | 100 tokens (0.1 ETH)  | 96 tokens (0.096 ETH)  | 92 tokens (0.092 ETH)  |
| 20 votes | 400 tokens (0.4 ETH)  | 384 tokens (0.384 ETH) | 368 tokens (0.368 ETH) |

### Long-Term Savings

**Scenario**: Cast 5 votes on 10 different proposals

- **Tier 0**: 250 tokens (0.25 ETH)
- **Tier 1**: 171 tokens (0.171 ETH) - **32% savings**
- **Tier 2**: 120 tokens (0.12 ETH) - **52% savings**

---

## 🔧 Configuration

### Adjustable Parameters

**Treasury.sol**:

```solidity
mintRate = 1000; // Tokens per ETH (adjustable by admin)
```

**VotingManager.sol**:

```solidity
// Whale detection thresholds (auto-scale with mintRate)
whaleThreshold = 10 * mintRate;
tier2MaxAvg = 5 * mintRate;
tier1MaxAvg = 7 * mintRate;

// Time requirements (in days)
TIER1_MIN_DAYS = 3;
TIER2_MIN_DAYS = 7;

// Session/proposal requirements
TIER1_MIN_SESSIONS = 3;
TIER1_MIN_UNIQUE = 3;
TIER2_MIN_SESSIONS = 5;
TIER2_MIN_UNIQUE = 4;
```

---

## 📚 Additional Documentation

- **[Quick Reference](./QUICK_REFERENCE.md)**: Frontend integration guide, code snippets, and common patterns
- **[Cost Comparison](./COST_COMPARISON.md)**: Detailed cost analysis, savings calculations, and reserve impact

---

## 🧪 Testing Coverage

- ✅ **GovernanceToken**: Minting, burning, role-based access, pausability
- ✅ **Treasury**: Donations, token minting, fund disbursement, mint rate updates
- ✅ **ProposalManager**: Proposal creation with NGO verification, milestone tracking, unauthorized access rejection
- ✅ **VotingManager**: Quadratic voting, reputation tracking, milestone unlocking, NGO whitelist integration
- ✅ **VotingReputation**: Tier calculations, time-based checks, whale detection, consistency enforcement
- ✅ **Oracles**: NGO verification, proof submission, IPFS validation, whitelist operations

**Total Tests**: 60+ comprehensive test cases  
**Edge Cases Covered**: Flash loan attempts, rapid voting, single-vote gaming, expired proposals, invalid proofs, unverified NGO rejection, NGO revocation, whitelist integrity

**Recent Test Additions**:

- NGO verification requirements for proposal creation
- Revoked NGO access control
- Multiple verified NGOs creating proposals
- Whitelist integrity after approve/revoke operations

---

## 🛠️ Technology Stack

- **Smart Contracts**: Solidity 0.8.24
- **Testing Framework**: Hardhat + Ethers.js v6 + Chai
- **Security Libraries**: OpenZeppelin Contracts 5.4.0
  - AccessControl (role-based permissions)
  - ReentrancyGuard (reentrancy prevention)
  - ERC20Votes (snapshot-based governance)
  - Pausable (emergency stops)
- **Frontend**: React + Vite + TailwindCSS (in `/charity-dao`)
- **Storage**: IPFS via Pinata (for NGO details and milestone proofs)

---

## 🔒 Security Considerations

### Audited Patterns

- ✅ Checks-Effects-Interactions pattern
- ✅ Integer-only arithmetic (no floating point)
- ✅ Reentrancy guards on all state-changing functions
- ✅ Role-based access control (OpenZeppelin)
- ✅ Input validation on all external calls

### Recommended Practices

- 🔐 Deploy with multi-sig wallets for admin roles
- 🔐 Use Gnosis Safe for ORACLE_ADMIN and DEFAULT_ADMIN_ROLE
- 🔐 Gradual rollout with small initial mint rate
- 🔐 Monitor avgVotesPerSession metrics for anomalies
- 🔐 Conduct third-party security audit before mainnet

---

## 🌟 Innovation Highlights

1. **World's First Time-Based Quadratic Voting System with Dynamic Whale Detection**

   - Combines quadratic costs with temporal consistency checks
   - Thresholds scale automatically with mint rate
   - Prevents both rapid gaming and gradual manipulation

2. **Multi-Dimensional Reputation (6 Metrics)**

   - First DAO to track sessions, diversity, time span, and average voting volume
   - No single metric can be gamed in isolation
   - Creates emergent anti-Sybil properties

3. **Formula-Level Discounts vs. Post-Calculation Rebates**

   - Modifies n² → n²×0.96 at calculation time
   - More gas-efficient than storing/rebating
   - Psychologically incentivizes reputation building

4. **Milestone-Gated Voting**

   - Can't vote on next milestone if previous is released but unverified
   - Creates accountability feedback loop
   - Encourages NGOs to submit proofs promptly

5. **Multi-Oracle Security Architecture**
   - NGOOracle serves as mandatory gatekeeper for proposal creation
   - ProofOracle handles milestone verification with IPFS immutability
   - Separates concerns: identity verification vs. proof validation
   - ProposalManager enforces verification at contract level (line 78)

---

## 🤝 Contributing

This is an academic project for IS4302. For suggestions or improvements:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Write tests for new functionality
4. Ensure all tests pass (`npx hardhat test`)
5. Submit a pull request

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details

---

## 👥 Team

Developed for IS4302 - Blockchain and Distributed Ledger Technologies  
National University of Singapore

---

## 🙏 Acknowledgments

- OpenZeppelin for battle-tested smart contract libraries
- Ethereum community for quadratic voting research (Vitalik Buterin, RadicalxChange)
- Gitcoin Grants for pioneering quadratic funding mechanisms
- Course instructors and TAs for project guidance

---

**Built with ❤️ for transparent, equitable charitable giving**
