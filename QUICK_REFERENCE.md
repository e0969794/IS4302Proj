# Quick Reference: Reputation-Based Voting

## For Frontend Developers

### Check Voter Reputation

```javascript
const [tier, sessions, uniqueProposals, daysActive, avgVotesPerSession] =
  await votingManager.getVoterReputation(voterAddress);

// tier: 0 (none), 1 (good), 2 (very good)
// sessions: total voting transactions
// uniqueProposals: distinct proposals voted on
// daysActive: days between first and last vote
// avgVotesPerSession: average votes per session (whale detection)
```

### Display Tier Information

```javascript
const tierNames = ["No Reputation", "Good Voter", "Very Good Voter"];
const tierDiscounts = ["0%", "~4%", "~8%"];

console.log(`Tier: ${tierNames[tier]}`);
console.log(`Discount: ${tierDiscounts[tier]}`);
console.log(`Voting sessions: ${sessions}`);
console.log(`Unique proposals: ${uniqueProposals}`);
console.log(`Days active: ${daysActive}`);
console.log(`Avg votes/session: ${avgVotesPerSession}`);
```

### Calculate Vote Cost Before Voting

```javascript
const cost = await votingManager.calculateVoteCost(
  proposalId,
  numberOfVotes,
  voterAddress
);

console.log(`Voting ${numberOfVotes} times will cost ${cost} tokens`);
```

### Show Progress to Next Tier

```javascript
function getProgressToNextTier(
  tier,
  sessions,
  uniqueProposals,
  daysActive,
  avgVotesPerSession
) {
  if (tier === 2) {
    return "Maximum tier reached!";
  }

  // Check for whale behavior
  if (avgVotesPerSession > 10) {
    return "⚠️ High voting frequency detected. Spread your votes over more sessions to build reputation.";
  }

  if (tier === 0) {
    const needSessions = Math.max(0, 3 - sessions);
    const needUnique = Math.max(0, 3 - uniqueProposals);
    const needDays = Math.max(0, 3 - daysActive);
    const needAvgVotes =
      avgVotesPerSession > 7 ? "Reduce avg votes/session to ≤7" : "✓";
    return `To reach Tier 1: ${needSessions} more sessions, ${needUnique} more unique proposals, ${needDays} more days active, avg votes: ${needAvgVotes}`;
  }

  if (tier === 1) {
    const needSessions = Math.max(0, 5 - sessions);
    const needUnique = Math.max(0, 4 - uniqueProposals);
    const needDays = Math.max(0, 7 - daysActive);
    const needAvgVotes =
      avgVotesPerSession > 5 ? "Reduce avg votes/session to ≤5" : "✓";
    return `To reach Tier 2: ${needSessions} more sessions, ${needUnique} more unique proposals, ${needDays} more days active, avg votes: ${needAvgVotes}`;
  }
}
```

### Display Savings

```javascript
// Calculate base cost (no reputation)
const baseCost = numberOfVotes ** 2;

// Get actual cost with reputation
const actualCost = await votingManager.calculateVoteCost(
  proposalId,
  numberOfVotes,
  voterAddress
);

const savings = baseCost - actualCost;
const percentSaved = ((savings / baseCost) * 100).toFixed(1);

console.log(`You're saving ${savings} tokens (${percentSaved}%)`);
```

## For Smart Contract Developers

### Key Functions

#### Vote (automatic reputation)

```solidity
function vote(uint256 proposalId, uint256 newVotes) external
```

- Automatically applies reputation discount
- Updates reputation tracking
- Emits VoteCast with actual cost

#### Get Reputation

```solidity
function getVoterReputation(address voter)
    external view
    returns (
        uint256 tier,
        uint256 sessions,
        uint256 uniqueProposals,
        uint256 daysActive,
        uint256 avgVotesPerSession
    )
```

#### Calculate Cost

```solidity
function calculateVoteCost(uint256 proposalId, uint256 newVotes, address voter)
    external view
    returns (uint256)
```

### Events

#### VoteCast (Updated)

```solidity
event VoteCast(
    address indexed voter,
    uint256 indexed proposalId,
    bytes32 voteId,
    uint256 votes,
    uint256 tokensCost  // New parameter
);
```

#### VoterReputationUpdated (New)

```solidity
event VoterReputationUpdated(
    address indexed voter,
    uint256 totalSessions,
    uint256 uniqueProposals
);
```

## Cost Reference Table

**System Configuration: 1 ETH = 1000 tokens**

| Votes | Tier 0 (tokens) | Tier 0 (ETH) | Tier 1 (tokens) | Tier 1 (ETH) | Tier 2 (tokens) | Tier 2 (ETH) |
| ----- | --------------- | ------------ | --------------- | ------------ | --------------- | ------------ |
| 1     | 1               | 0.001        | 1               | 0.001        | 1               | 0.001        |
| 2     | 4               | 0.004        | 3               | 0.003        | 3               | 0.003        |
| 3     | 9               | 0.009        | 8               | 0.008        | 8               | 0.008        |
| 4     | 16              | 0.016        | 15              | 0.015        | 14              | 0.014        |
| 5     | 25              | 0.025        | 24              | 0.024        | 23              | 0.023        |
| 10    | 100             | 0.1          | 96              | 0.096        | 92              | 0.092        |
| 20    | 400             | 0.4          | 384             | 0.384        | 368             | 0.368        |

## Tier Requirements

### Tier 0 (No Reputation)

- Default for all new voters
- No requirements
- Standard quadratic cost (n²)

### Tier 1 (Good Voter)

- ≥3 voting sessions
- ≥3 unique proposals
- ≥3 days active (time between first and last vote)
- ≤7 average votes per session (anti-whale measure)
- ~4% discount (n² × 0.96)

### Tier 2 (Very Good Voter)

- ≥5 voting sessions
- ≥4 unique proposals
- ≥7 days active (time between first and last vote)
- ≤5 average votes per session (anti-whale measure)
- ~8% discount (n² × 0.92)

### Anti-Whale Protection

- Voters with >10 average votes per session get **NO tier** (remain Tier 0)
- Time requirements prevent rapid reputation building
- Encourages consistent, long-term participation over bulk voting

## Example Scenarios

### Building Reputation (Requires Time)

```javascript
// Start: Tier 0 (0 sessions, 0 unique, 0 days)
await votingManager.vote(proposal1, 1); // Cost: 1 token (0.001 ETH)
// Now: 1 session, 1 unique, 0 days active

// Wait 1+ days...
await votingManager.vote(proposal2, 1); // Cost: 1 token (0.001 ETH)
// Now: 2 sessions, 2 unique, 1 day active

// Wait 1+ days...
await votingManager.vote(proposal3, 1); // Cost: 1 token (0.001 ETH)
// Now: 3 sessions, 3 unique, 3 days active
// ✓ Now Tier 1! (Total spent: 0.003 ETH)

// Wait 1+ days...
await votingManager.vote(proposal4, 1); // Cost: 1 token with Tier 1 discount
// Now: 4 sessions, 4 unique, 4 days active

// Wait 3+ days...
await votingManager.vote(proposal5, 1); // Cost: 1 token
// Now: 5 sessions, 4 unique, 7 days active
// ✓ Now Tier 2! (Total spent: 0.005 ETH over 7+ days)
```

### Using Reputation Discount

```javascript
// Voter has Tier 2 reputation
await votingManager.vote(newProposal, 5);
// Base cost would be: 5² = 25 tokens (0.025 ETH)
// Actual cost: 25 × 0.92 = 23 tokens (0.023 ETH)
// Saved: 2 tokens (0.002 ETH)!
```

### Anti-Gaming (Won't Work)

```javascript
// Trying to game by voting same proposal multiple times
await votingManager.vote(proposal1, 1); // 1 session, 1 unique, 0 days
await votingManager.vote(proposal1, 1); // 2 sessions, 1 unique, 0 days
await votingManager.vote(proposal1, 1); // 3 sessions, 1 unique, 0 days
// Still Tier 0 - need unique proposals AND time!

// Trying to game by bulk voting (whale behavior)
await votingManager.vote(proposal1, 50); // avgVotesPerSession = 50
await votingManager.vote(proposal2, 50); // avgVotesPerSession = 50
await votingManager.vote(proposal3, 50); // avgVotesPerSession = 50
// Still Tier 0 - avg votes per session >10 = whale detected!
```

## Common UI Patterns

### Reputation Badge

```javascript
function ReputationBadge({ tier }) {
  const badges = [
    { name: "New Voter", color: "gray", icon: "👤" },
    { name: "Good Voter", color: "blue", icon: "⭐" },
    { name: "Very Good Voter", color: "gold", icon: "🌟" },
  ];

  const badge = badges[tier];
  return (
    <Badge color={badge.color}>
      {badge.icon} {badge.name}
    </Badge>
  );
}
```

### Vote Cost Calculator

```javascript
function VoteCostCalculator({ proposalId, voterAddress }) {
  const [votes, setVotes] = useState(1);
  const [cost, setCost] = useState(0);
  const [tier, setTier] = useState(0);

  useEffect(() => {
    async function calculate() {
      const [t] = await votingManager.getVoterReputation(voterAddress);
      setTier(t);

      const c = await votingManager.calculateVoteCost(
        proposalId,
        votes,
        voterAddress
      );
      setCost(c);
    }
    calculate();
  }, [votes, voterAddress, proposalId]);

  const baseCost = votes ** 2;
  const savings = baseCost - cost;

  return (
    <div>
      <input
        type="number"
        value={votes}
        onChange={(e) => setVotes(e.target.value)}
      />
      <p>Cost: {cost} tokens</p>
      {savings > 0 && (
        <p className="savings">
          You're saving {savings} tokens with your reputation!
        </p>
      )}
    </div>
  );
}
```

### Progress Bar to Next Tier

```javascript
function TierProgress({
  sessions,
  uniqueProposals,
  daysActive,
  avgVotesPerSession,
  currentTier,
}) {
  // Check for whale behavior
  if (avgVotesPerSession > 10) {
    return (
      <div className="warning">
        ⚠️ High voting frequency detected (avg: {avgVotesPerSession}{" "}
        votes/session)
        <p>Spread your votes over more sessions to build reputation.</p>
      </div>
    );
  }

  let nextTier, required, current;

  if (currentTier === 0) {
    nextTier = 1;
    required = { sessions: 3, unique: 3, days: 3, maxAvg: 7 };
    current = {
      sessions,
      unique: uniqueProposals,
      days: daysActive,
      avg: avgVotesPerSession,
    };
  } else if (currentTier === 1) {
    nextTier = 2;
    required = { sessions: 5, unique: 4, days: 7, maxAvg: 5 };
    current = {
      sessions,
      unique: uniqueProposals,
      days: daysActive,
      avg: avgVotesPerSession,
    };
  } else {
    return <div>Max tier reached! 🎉</div>;
  }

  const sessionProgress = Math.min(
    100,
    (current.sessions / required.sessions) * 100
  );
  const uniqueProgress = Math.min(
    100,
    (current.unique / required.unique) * 100
  );
  const daysProgress = Math.min(100, (current.days / required.days) * 100);
  const avgOk = current.avg <= required.maxAvg;

  return (
    <div>
      <h3>Progress to Tier {nextTier}</h3>
      <ProgressBar
        label="Voting Sessions"
        value={sessionProgress}
        text={`${current.sessions}/${required.sessions}`}
      />
      <ProgressBar
        label="Unique Proposals"
        value={uniqueProgress}
        text={`${current.unique}/${required.unique}`}
      />
      <ProgressBar
        label="Days Active"
        value={daysProgress}
        text={`${current.days}/${required.days} days`}
      />
      <div className={avgOk ? "success" : "warning"}>
        Avg Votes/Session: {current.avg.toFixed(1)}
        {avgOk ? " ✓" : ` (must be ≤${required.maxAvg})`}
      </div>
    </div>
  );
}
```

## Testing Helpers

### Mock Reputation Building (with Time Gaps)

```javascript
// In tests - MUST include time gaps!
async function buildReputation(voter, tier) {
  const proposals = [];

  // Create enough proposals
  const numProposals = tier === 2 ? 4 : 3;
  for (let i = 0; i < numProposals; i++) {
    const tx = await proposalManager.createProposal([`Test ${i}`], [5]);
    const receipt = await tx.wait();
    const event = receipt.logs.find((e) => e.name === "ProposalCreated");
    proposals.push(event.args.proposalId);
  }

  // Vote on all with time gaps
  for (const pid of proposals) {
    await votingManager.connect(voter).vote(pid, 1);
    // Simulate 1 day passing
    await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
    await ethers.provider.send("evm_mine");
  }

  // If tier 2, need one more session and ensure 7 days total
  if (tier === 2) {
    await ethers.provider.send("evm_increaseTime", [3 * 86400]); // 3 more days
    await ethers.provider.send("evm_mine");
    await votingManager.connect(voter).vote(proposals[0], 1);
  }
}

// Usage
await buildReputation(voter1, 2); // Build to Tier 2 over 7+ days
```

## Security Notes

- ✅ No discounts on single votes (prevents micro-gaming)
- ✅ Requires multiple unique proposals (prevents single-proposal spam)
- ✅ Session count separate from unique count (prevents gaming)
- ✅ Time-based requirements (3-7 days) prevent rapid reputation building
- ✅ Whale detection via avgVotesPerSession (>10 = no tier)
- ✅ Average vote limits per tier (≤7 for Tier 1, ≤5 for Tier 2)
- ✅ Integer math prevents precision exploits
- ✅ All state changes in one transaction (no reentrancy)
- ✅ First/last vote timestamp tracking for consistency checks
