# Charity DAO Project

On‑chain Charity DAO treasury and grants system using token-based governance with timelock, oracle-assisted project gating, and milestone verification.

## High-level Goals

* Transparent governance with auditable on‑chain state and time‑delayed execution.
* Safety-by-default treasury with least-privilege execution paths.
* Composable oracles that can be replaced with real feeds over time (current mocks).
* Deterministic flows for project registration, round management, and milestone-based disbursement.

## Core Components (smart contracts)

* CharityGovToken – ERC20Votes governance token. Ownership is transferred to the Governor; minting is governance-gated.
* CharityGovernor – OpenZeppelin Governor variant with TimelockControl.
* ReputationOracleMock – Tracks/attests contributor reputation (mocked for tests).
* NGOOracleMock – Approves NGO addresses and records metadata.
* MilestoneOracleMock – Sets per-project milestone allocations and verifies completion indices.

> Auxiliary contracts used by the system:

1. ProjectRegistry – Registers projects (owner/NGO, metadata, status).
2. RoundManager – Creates & controls funding rounds (time/window based, ID fallback).
3. Treasury – Receives deposits; releases funds under governance/timelock control.


Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
npx hardhat clean
npx hardhat compile
npx hardhat coverage (**NOTE: TRY THIS TO SEE CODE COVERAGE**)
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```
# Charity DAO – Contract Roles & Interactions

## 🎯 Big Picture
Our project is a Charity DAO:
* People donate funds into a shared Treasury.
* The community votes on proposals for how to spend those funds.
* Safeguards (like oracles and milestones) make sure the money goes to approved NGOs and verified projects.

## 🏛 Core Governance Contracts
1. CharityGovToken
    * A special “voting token.”
    * Whoever holds and delegates these tokens gets a voice in decisions.
    * New tokens can only be created if the DAO votes on it — no single person can just print tokens.

2. CharityGovernor
    * The decision-maker: collects proposals and votes.
    * But it cannot spend money immediately — it can only instruct the next layer (Timelock).
    * Think of it as “Parliament”: they decide but cannot act instantly.

3. Timelock (OpenZeppelin)
    * The executor with a delay.
    * It enforces a waiting period between approval and action, so the community can react if something strange is passed.
    * Example: if a malicious proposal sneaks through, people have time to withdraw before execution.
    * Timelock actually presses the “button” to release funds or update settings.

## 🔍 Oracle Contracts (Checks & Balances)
These act like auditors or verifiers. They don’t hold money — they validate steps.

1. NGOOracleMock
    * Approves NGOs before they can receive funds.
    * Example: If a random scammer registers as an NGO, they won’t be able to get money unless the DAO explicitly approves them.

2. ReputationOracleMock
    * Tracks contributor reputation.
    * Donors who give more or consistently might get higher “reputation points.”
    * This can influence future voting power or eligibility.

3. MilestoneOracleMock
    * Splits projects into milestones (e.g., 50% → build clinic, 30% → buy equipment, 20% → training).
    * DAO sets these milestones.
    * Funds are only released as each milestone is verified.
    * Prevents dumping all money at once and reduces misuse.

## 💰 Treasury & Project Flow
1. Treasury
    * A secure “bank” for the DAO.
    * Collects donations (deposit).
    * Only releases funds after DAO approval and Timelock execution.
    * Prevents anyone from directly draining funds.

2. ProjectRegistry
    * A catalog of projects submitted by NGOs.
    * Stores metadata: who owns the project, what it’s about, and its current status.
    * Works with NGOOracle (must be approved NGO to register).

3. RoundManager
    * Organizes funding rounds.
    * Like “seasons” of funding — helps the DAO decide which projects to support this round.
    * Keeps track of timing (start/end dates) and ensures proposals happen in order.

## 🔄 How They Work Together (Story)
1. Register NGO: An NGO applies → DAO approves it via NGOOracle.
2. Submit Project: NGO registers project in ProjectRegistry.
3. Create Milestones: DAO sets milestones via MilestoneOracle.
4. Fundraising Round: DAO uses RoundManager to start a round. Donors send money into Treasury.
5. DAO Proposal: Members propose funding project X for milestone Y.
6. Voting: DAO votes using GovToken.
7. Timelock Delay: If passed, proposal sits in Timelock until safe to execute.
8. Execution: Timelock executes → Treasury releases funds to NGO, only for verified milestones.

## 🧩 Key Value
* Transparency: All decisions and fund releases are on the blockchain, anyone can audit.
* Checks & Balances: No single contract can act alone.
* Accountability: Milestone verification ensures money is released responsibly.
* Community Driven: Token holders shape how charity money is used.
