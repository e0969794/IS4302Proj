// test/RoundManager.test.js
const { ethers } = require("hardhat");
const { expect } = require("chai");

// Mine to proposal "Active"
async function mineToActive(governor, proposalId) {
    const snapshot = await governor.proposalSnapshot(proposalId);
    let block = await ethers.provider.getBlockNumber();
    while (block <= snapshot) {
        await ethers.provider.send("evm_mine");
        block = await ethers.provider.getBlockNumber();
    }
}

// Mine past proposal "Deadline"
async function minePastDeadline(governor, proposalId) {
    const deadline = await governor.proposalDeadline(proposalId);
    let block = await ethers.provider.getBlockNumber();
    while (block <= deadline) {
        await ethers.provider.send("evm_mine");
        block = await ethers.provider.getBlockNumber();
    }
}

describe("RoundManager (via Governor)", function () {
    let owner, proposer, voter;
    let token, timelock, governor, repOracle, roundManager;

    beforeEach(async function () {
        [owner, proposer, voter] = await ethers.getSigners();

        // --- Token (constructor mints 10k CGT to owner) ---
        const Token = await ethers.getContractFactory("CharityGovToken", owner);
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();

        // Distribute voting power from bootstrap supply (no mint calls)
        const ONE_K = ethers.parseUnits("1000", 18);
        for (const acct of [proposer, voter]) {
            await (await token.connect(owner).transfer(await acct.getAddress(), ONE_K)).wait();
            await (await token.connect(acct).delegate(await acct.getAddress())).wait();
        }
        // Owner can delegate too (optional)
        await (await token.connect(owner).delegate(await owner.getAddress())).wait();

        // --- Timelock ---
        const Timelock = await ethers.getContractFactory("CharityTimelock", owner);
        timelock = await Timelock.deploy(2, [], [], owner.address);
        await timelock.waitForDeployment();

        // --- Governor ---
        const Governor = await ethers.getContractFactory("CharityGovernor", owner);
        governor = await Governor.deploy(
            await token.getAddress(),
            await timelock.getAddress(),
            1, // voting delay (blocks)
            5, // voting period (blocks)
            0  // proposal threshold
        );
        await governor.waitForDeployment();

        // Grant roles to Governor on Timelock
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
        await (await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress())).wait();

        // IMPORTANT: set governance first, then transfer ownership
        await (await token.connect(owner).setGovernance(await governor.getAddress())).wait();
        await (await token.transferOwnership(await governor.getAddress())).wait();

        // --- Reputation Oracle ---
        const RepOracle = await ethers.getContractFactory("ReputationOracleMock", owner);
        repOracle = await RepOracle.deploy(await governor.getAddress(), await token.getAddress());
        await repOracle.waitForDeployment();

        // --- Round Manager ---
        const RoundManager = await ethers.getContractFactory("RoundManager", owner);
        roundManager = await RoundManager.deploy(
            await governor.getAddress(),
            await repOracle.getAddress()
        );
        await roundManager.waitForDeployment();
    });

    it("starts and closes a round via governance", async function () {
        // ---------- Start Round ----------
        const desc1 = "Start round";
        const cd1 = roundManager.interface.encodeFunctionData("startRound", [60]);

        // Propose startRound
        const tx1 = await governor.connect(proposer).propose(
            [await roundManager.getAddress()],
            [0],
            [cd1],
            desc1
        );
        const rc1 = await tx1.wait();
        const p1 = rc1.logs[0].args.proposalId;

        await mineToActive(governor, p1);
        for (const acct of [proposer, voter]) {
            await governor.connect(acct).castVote(p1, 1); // For
        }
        await minePastDeadline(governor, p1);

        // Standardized description hash
        const h1 = ethers.keccak256(ethers.toUtf8Bytes(desc1));
        await governor.queue([await roundManager.getAddress()], [0], [cd1], h1);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");

        const ex1 = await governor.execute([await roundManager.getAddress()], [0], [cd1], h1);
        const r1 = await ex1.wait();

        // Read RoundStarted from the RoundManager logs in this block
        let roundId;
        const startedEvents = await roundManager.queryFilter(
            roundManager.filters.RoundStarted(),
            r1.blockNumber,
            r1.blockNumber
        );
        if (startedEvents.length > 0) {
            roundId = startedEvents[0].args.roundId;
        } else {
            // Fallback: RoundManager uses block.timestamp as roundId
            const blk = await ethers.provider.getBlock(r1.blockNumber);
            roundId = BigInt(blk.timestamp);
        }

        const round = await roundManager.rounds(roundId);
        expect(round.active).to.equal(true);
        expect(round.endTime).to.be.greaterThan(0);

        // ---------- Close Round ----------
        const desc2 = "Close round";
        const cd2 = roundManager.interface.encodeFunctionData("closeRound", [roundId]);

        const tx2 = await governor.connect(proposer).propose(
            [await roundManager.getAddress()],
            [0],
            [cd2],
            desc2
        );
        const rc2 = await tx2.wait();
        const p2 = rc2.logs[0].args.proposalId;

        await mineToActive(governor, p2);
        for (const acct of [proposer, voter]) {
            await governor.connect(acct).castVote(p2, 1);
        }
        await minePastDeadline(governor, p2);

        const h2 = ethers.keccak256(ethers.toUtf8Bytes(desc2));
        await governor.queue([await roundManager.getAddress()], [0], [cd2], h2);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");
        await governor.execute([await roundManager.getAddress()], [0], [cd2], h2);

        const roundAfter = await roundManager.rounds(roundId);
        expect(roundAfter.active).to.equal(false);
    });
});
