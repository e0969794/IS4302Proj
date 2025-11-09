# Quadratic Voting Cost Comparison

**System Configuration: 1 ETH = 1000 tokens (1000:1 mint rate)**

## Cost Structure by Reputation Tier

### Single Vote (Always Standard Cost)

```
1 vote = 1 token = 0.001 ETH (all tiers)
```

### Multi-Vote Scenarios

#### 2 Votes

- **Tier 0** (No Reputation): 2² = **4 tokens** (0.004 ETH)
- **Tier 1** (Good Voter): 4 × 0.96 = **3 tokens** (0.003 ETH) → Save 1 token / 0.001 ETH (25%)
- **Tier 2** (Very Good): 4 × 0.92 = **3 tokens** (0.003 ETH) → Save 1 token / 0.001 ETH (25%)

#### 3 Votes

- **Tier 0**: 3² = **9 tokens** (0.009 ETH)
- **Tier 1**: 9 × 0.96 = **8 tokens** (0.008 ETH) → Save 1 token / 0.001 ETH (11%)
- **Tier 2**: 9 × 0.92 = **8 tokens** (0.008 ETH) → Save 1 token / 0.001 ETH (11%)

#### 5 Votes

- **Tier 0**: 5² = **25 tokens** (0.025 ETH)
- **Tier 1**: 25 × 0.96 = **24 tokens** (0.024 ETH) → Save 1 token / 0.001 ETH (4%)
- **Tier 2**: 25 × 0.92 = **23 tokens** (0.023 ETH) → Save 2 tokens / 0.002 ETH (8%)

#### 10 Votes

- **Tier 0**: 10² = **100 tokens** (0.1 ETH)
- **Tier 1**: 100 × 0.96 = **96 tokens** (0.096 ETH) → Save 4 tokens / 0.004 ETH (4%)
- **Tier 2**: 100 × 0.92 = **92 tokens** (0.092 ETH) → Save 8 tokens / 0.008 ETH (8%)

#### 20 Votes

- **Tier 0**: 20² = **400 tokens** (0.4 ETH)
- **Tier 1**: 400 × 0.96 = **384 tokens** (0.384 ETH) → Save 16 tokens / 0.016 ETH (4%)
- **Tier 2**: 400 × 0.92 = **368 tokens** (0.368 ETH) → Save 32 tokens / 0.032 ETH (8%)

## Complete Cost Table (1-20 votes)

| Votes | Tier 0 (tokens) | Tier 0 (ETH) | Tier 1 (tokens) | Tier 1 (ETH) | Tier 2 (tokens) | Tier 2 (ETH) | T1 Savings | T2 Savings |
| ----- | --------------- | ------------ | --------------- | ------------ | --------------- | ------------ | ---------- | ---------- |
| 1     | 1               | 0.001        | 1               | 0.001        | 1               | 0.001        | 0          | 0          |
| 2     | 4               | 0.004        | 3               | 0.003        | 3               | 0.003        | 1          | 1          |
| 3     | 9               | 0.009        | 8               | 0.008        | 8               | 0.008        | 1          | 1          |
| 4     | 16              | 0.016        | 15              | 0.015        | 14              | 0.014        | 1          | 2          |
| 5     | 25              | 0.025        | 24              | 0.024        | 23              | 0.023        | 1          | 2          |
| 6     | 36              | 0.036        | 34              | 0.034        | 33              | 0.033        | 2          | 3          |
| 7     | 49              | 0.049        | 47              | 0.047        | 45              | 0.045        | 2          | 4          |
| 8     | 64              | 0.064        | 61              | 0.061        | 58              | 0.058        | 3          | 6          |
| 9     | 81              | 0.081        | 77              | 0.077        | 74              | 0.074        | 4          | 7          |
| 10    | 100             | 0.1          | 96              | 0.096        | 92              | 0.092        | 4          | 8          |
| 11    | 121             | 0.121        | 116             | 0.116        | 111             | 0.111        | 5          | 10         |
| 12    | 144             | 0.144        | 138             | 0.138        | 132             | 0.132        | 6          | 12         |
| 13    | 169             | 0.169        | 162             | 0.162        | 155             | 0.155        | 7          | 14         |
| 14    | 196             | 0.196        | 188             | 0.188        | 180             | 0.180        | 8          | 16         |
| 15    | 225             | 0.225        | 216             | 0.216        | 207             | 0.207        | 9          | 18         |
| 16    | 256             | 0.256        | 245             | 0.245        | 235             | 0.235        | 11         | 21         |
| 17    | 289             | 0.289        | 277             | 0.277        | 265             | 0.265        | 12         | 24         |
| 18    | 324             | 0.324        | 311             | 0.311        | 298             | 0.298        | 13         | 26         |
| 19    | 361             | 0.361        | 346             | 0.346        | 332             | 0.332        | 15         | 29         |
| 20    | 400             | 0.4          | 384             | 0.384        | 368             | 0.368        | 16         | 32         |

**Note**: Savings shown in tokens. Divide by 1000 to get ETH savings.

## Incremental Cost Examples

### Scenario: Voting multiple times on same proposal

**Voter starts with 0 votes, then votes 2, then votes 3 more (total 5)**

#### Tier 0 (No Reputation)

1. First vote (2 votes): 2² - 0² = **4 tokens**
2. Second vote (3 more): 5² - 2² = 25 - 4 = **21 tokens**
3. Total: 4 + 21 = **25 tokens**

#### Tier 1 (Good Voter)

1. First vote (2 votes): (2² - 0²) × 0.96 = 4 × 0.96 = **3 tokens**
2. Second vote (3 more): (5² - 2²) × 0.96 = 21 × 0.96 = 20.16 = **20 tokens**
3. Total: 3 + 20 = **23 tokens** (saves 2)

#### Tier 2 (Very Good Voter)

1. First vote (2 votes): (2² - 0²) × 0.92 = 4 × 0.92 = **3 tokens**
2. Second vote (3 more): (5² - 2²) × 0.92 = 21 × 0.92 = 19.32 = **19 tokens**
3. Total: 3 + 19 = **22 tokens** (saves 3)

## Reputation Building Path

### Path to Tier 1 (Good Voter)

```
Start: 0 sessions, 0 unique proposals
   ↓
Vote on Proposal A (1 vote)
   → 1 session, 1 unique
   ↓
Wait 1 day, vote on Proposal B (1 vote)
   → 2 sessions, 2 unique
   ↓
Wait 1 day, vote on Proposal C (1 vote)
   → 3 sessions, 3 unique, 3 days active
   ✓ TIER 1 ACHIEVED
```

**Total cost to reach Tier 1**: 3 tokens (0.003 ETH) over 3+ days

### Path to Tier 2 (Very Good Voter)

```
Continue from Tier 1...
   ↓
Wait 1 day, vote on Proposal D (1 vote)
   → 4 sessions, 4 unique, 4 days active
   ↓
Wait 3 days, vote on any previous proposal (1 vote)
   → 5 sessions, 4 unique, 7 days active
   ✓ TIER 2 ACHIEVED
```

**Additional cost**: 2 tokens (0.002 ETH)
**Total cost to reach Tier 2**: 5 tokens (0.005 ETH) over 7+ days

## Long-term Savings Analysis

### Example: Active Voter Over 10 Proposals

**Scenario**: Voter casts 5 votes on each of 10 different proposals

#### Without Reputation (Tier 0)

- Cost per proposal: 25 tokens
- Total for 10 proposals: **250 tokens** (0.25 ETH)

#### With Tier 1 (after building reputation on first 3)

- First 3 proposals (building reputation): 1 + 1 + 1 = 3 tokens
- Next 7 proposals (with discount): 7 × 24 = 168 tokens
- Total: 3 + 168 = **171 tokens** (0.171 ETH)
- **Net savings: 79 tokens (0.079 ETH) - 32% off**

#### With Tier 2 (after building to tier 2 on first 5)

- First 5 proposals (building reputation): 1 + 1 + 1 + 1 + 1 = 5 tokens
- Next 5 proposals (with max discount): 5 × 23 = 115 tokens
- Total: 5 + 115 = **120 tokens** (0.12 ETH)
- **Net savings: 130 tokens (0.13 ETH) - 52% off**

## Reserve Impact

### Standard Voter Contribution to Reserves

If a voter donates 100 ETH and uses it all for voting:

- 100 ETH donated = 100,000 tokens (at 1000:1 rate)
- Casts 316 votes on one proposal (costs 99,856 tokens)
- Actual vote power value: 316 votes
- **ETH to reserves**: 100 - 316 × (1/1000) = 100 - 0.316 = **99.684 ETH** (99.68%)

### Tier 2 Voter Contribution

Same 100 ETH donation:

- 100 ETH donated = 100,000 tokens
- Casts 330 votes on one proposal (costs 99,968 tokens with 8% discount)
- Actual vote power value: 330 votes
- **ETH to reserves**: 100 - 330 × (1/1000) = 100 - 0.33 = **99.67 ETH** (99.67%)
- **Difference**: 0.014 ETH less to reserves, but voter has 4.4% more voting power (14 additional votes)

## Gas Cost Comparison

### Per Vote Transaction

- **Standard vote** (Tier 0): ~320k gas
- **Vote with reputation** (Tier 1/2): ~340k gas (+6%)
- **Additional cost**: ~20k gas for reputation tracking

### Amortized Over Multiple Votes

The gas overhead becomes negligible as token savings accumulate:

- 10 votes with Tier 2: Save 8 tokens (0.008 ETH), pay 20k extra gas
- At ETH = $3000 and 50 gwei gas price:
  - Token savings = 0.008 ETH × $3000 = **$24**
  - Extra gas cost = 20,000 × 50 gwei = 0.001 ETH × $3000 = **$3**
  - **Net benefit**: $21 per 10 votes

**Note**: At 1000:1 mint rate, even small token savings translate to meaningful gas cost coverage.

## Key Insights

1. **Larger votes = bigger savings**: Discount % is constant but absolute savings grow quadratically
2. **Build reputation with single votes**: Cheapest way to reach higher tiers
3. **Tier 2 vs Tier 1**: Double the discount (8% vs 4%) for 2 extra qualifying votes
4. **Long-term benefits**: Active, diverse voters save significantly over time
5. **No gaming single votes**: Only multi-vote scenarios benefit from discounts
