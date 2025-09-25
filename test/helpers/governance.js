const { ethers } = require("hardhat");
const { expect } = require("chai");

function stateToString(state) {
    const states = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed"
    ];
    return states[state] || `Unknown(${state})`;
}

async function logAndAssert(governor, proposalId, label, expected) {
    const s = await governor.state(proposalId);
    console.log(`📌 [${label}] Proposal ${proposalId} → ${stateToString(s)} (${s})`);
    if (expected !== undefined) {
        expect(s).to.equal(expected, `Expected ${stateToString(expected)} at [${label}]`);
    }
    return s;
}

async function advanceBlocks(n) {
    for (let i = 0; i < n; i++) {
        await ethers.provider.send("evm_mine");
    }
}

async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
}

async function fullFlow(
    governor,
    timelock,
    proposer,
    voters,
    target,
    value,
    calldata,
    description,
    options = {}
) {
    console.log("🌐 Starting full DAO flow...");

    const fastMode = options.fastMode || false;
    const skipTimelock = options.skipTimelock || false;

    // Propose
    const tx = await governor.connect(proposer).propose(
        [target],
        [value],
        [calldata],
        description
    );
    const receipt = await tx.wait();
    const proposalId = receipt.logs.find(l => l.fragment?.name === "ProposalCreated").args.proposalId;

    await logAndAssert(governor, proposalId, "After propose", 0);

    // Wait until voting starts
    const snapshot = await governor.proposalSnapshot(proposalId);
    let currentBlock = await ethers.provider.getBlockNumber();
    while (currentBlock <= snapshot) {
        await advanceBlocks(1);
        currentBlock = await ethers.provider.getBlockNumber();
    }
    await logAndAssert(governor, proposalId, "At snapshot (Active)", 1);

    // Cast votes
    for (const voter of voters) {
        await governor.connect(voter).castVote(proposalId, 1); // For
    }
    console.log(`🗳 Cast ${voters.length} votes in favor`);

    // Wait until voting ends
    const deadline = await governor.proposalDeadline(proposalId);
    let nowBlock = await ethers.provider.getBlockNumber();
    while (nowBlock <= deadline) {
        await advanceBlocks(1);
        nowBlock = await ethers.provider.getBlockNumber();
    }
    await logAndAssert(governor, proposalId, "After votingPeriod", 4);

    const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

    if (skipTimelock) {
        await governor.connect(proposer).execute([target], [value], [calldata], descriptionHash);
        await logAndAssert(governor, proposalId, "After execute (no timelock)", 7);
    } else {
        await governor.connect(proposer).queue([target], [value], [calldata], descriptionHash);
        await logAndAssert(governor, proposalId, "After queue", 5);

        // Auto-fund timelock if ETH is required
        if (value > 0n) {
            const tlBal = await ethers.provider.getBalance(await timelock.getAddress());
            if (tlBal < value) {
                console.log(`⛽ Auto-funding Timelock with ${ethers.formatEther(value)} ETH`);
                await (await proposer.sendTransaction({
                    to: await timelock.getAddress(),
                    value: value - tlBal,
                })).wait();
            }
        }

        if (fastMode) {
            const minDelay = await timelock.getMinDelay();
            await advanceTime(Number(minDelay));
        }

        await governor.connect(proposer).execute([target], [value], [calldata], descriptionHash);
        await logAndAssert(governor, proposalId, "After execute", 7);
    }

    console.log("🌐 Full DAO flow complete ✅");
    return proposalId;
}

module.exports = {
    stateToString,
    logAndAssert,
    fullFlow,
    advanceBlocks,
    advanceTime
};
