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

* CharityTimelock – OpenZeppelin TimelockController; queues and executes approved operations.

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
npx hardhat coverage
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```
