const { ethers } = require("hardhat");
const { expect } = require("chai");
const { fullFlow, logAndAssert } = require("./helpers/governance");

describe("CharityDAO System (Governor + Timelock)", function () {
    let owner, proposer, voter1, voter2, ngo;
    let token, timelock, governor;

    const TIMELOCK_DELAY = 2;

    beforeEach(async function () {
        [owner, proposer, voter1, voter2, ngo] = await ethers.getSigners();

        // Token (constructor mints 10k to owner)
        const Token = await ethers.getContractFactory("CharityGovToken", owner);
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();

        // Distribute voting power from bootstrap supply
        const ONE_K = ethers.parseUnits("1000", 18);
        for (const acct of [proposer, voter1, voter2]) {
            await (await token.connect(owner).transfer(await acct.getAddress(), ONE_K)).wait();
            await (await token.connect(acct).delegate(await acct.getAddress())).wait();
        }

        // Timelock
        const Timelock = await ethers.getContractFactory("CharityTimelock", owner);
        timelock = await Timelock.deploy(TIMELOCK_DELAY, [], [], owner.address);
        await timelock.waitForDeployment();

        // Governor
        const Governor = await ethers.getContractFactory("CharityGovernor", owner);
        governor = await Governor.deploy(
            await token.getAddress(),
            await timelock.getAddress(),
            1, // voting delay (blocks)
            5, // voting period (blocks)
            0  // proposal threshold
        );
        await governor.waitForDeployment();

        // Roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
        await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
        await (await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress())).wait();
        await (await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress())).wait();

        // Link token governance first
        await (await token.connect(owner).setGovernance(await governor.getAddress())).wait();

        // Then transfer ownership
        await (await token.transferOwnership(await governor.getAddress())).wait();
    });

    it("full flow: transfer ETH to NGO via governance", async function () {
        const valueToSend = ethers.parseEther("0.25");
        const description = "Donate 0.25 ETH to NGO";

        await fullFlow(
            governor,
            timelock,
            proposer,
            [proposer, voter1, voter2],
            await ngo.getAddress(),
            valueToSend,
            "0x",
            description
        );

        const ngoBal = await ethers.provider.getBalance(await ngo.getAddress());
        expect(ngoBal).to.be.greaterThanOrEqual(valueToSend);
    });

    it("full flow: mint CGT tokens to NGO via governance", async function () {
        const amount = ethers.parseEther("1000");
        const description = "Mint 1000 CGT to NGO";

        const mintCalldata = token.interface.encodeFunctionData("mint", [
            await ngo.getAddress(),
            amount,
        ]);

        // Propose mint
        const proposeTx = await governor.connect(proposer).propose(
            [await token.getAddress()],
            [0],
            [mintCalldata],
            description
        );
        const rc = await proposeTx.wait();
        const proposalId = rc.logs.find(l => l.fragment?.name === "ProposalCreated").args.proposalId;

        // Move to Active
        let currentBlock = await ethers.provider.getBlockNumber();
        const snapshot = await governor.proposalSnapshot(proposalId);
        while (currentBlock <= snapshot) {
            await ethers.provider.send("evm_mine");
            currentBlock = await ethers.provider.getBlockNumber();
        }

        // Votes
        for (const voter of [proposer, voter1, voter2]) {
            await governor.connect(voter).castVote(proposalId, 1);
        }

        // Mine past deadline
        const deadline = await governor.proposalDeadline(proposalId);
        let now = await ethers.provider.getBlockNumber();
        while (now <= deadline) {
            await ethers.provider.send("evm_mine");
            now = await ethers.provider.getBlockNumber();
        }

        // Queue
        const descriptionHash = ethers.id(description);
        await governor.queue(
            [await token.getAddress()],
            [0],
            [mintCalldata],
            descriptionHash
        );

        // Timelock delay
        await ethers.provider.send("evm_increaseTime", [TIMELOCK_DELAY + 1]);
        await ethers.provider.send("evm_mine");

        // Execute
        await governor.execute(
            [await token.getAddress()],
            [0],
            [mintCalldata],
            descriptionHash
        );

        // Assert minted
        const ngoBal = await token.balanceOf(await ngo.getAddress());
        expect(ngoBal).to.equal(amount);
    });

    it("logs state transitions correctly", async function () {
        const tx = await governor.connect(proposer).propose(
            [await ngo.getAddress()],
            [0],
            ["0x"],
            "Dummy proposal"
        );
        const rc = await tx.wait();
        const proposalId = rc.logs.find(l => l.fragment?.name === "ProposalCreated").args.proposalId;

        await logAndAssert(governor, proposalId, "After propose", 0);

        // Mine to Active
        const snapshot = await governor.proposalSnapshot(proposalId);
        let current = await ethers.provider.getBlockNumber();
        while (current <= snapshot) {
            await ethers.provider.send("evm_mine");
            current = await ethers.provider.getBlockNumber();
        }

        await logAndAssert(governor, proposalId, "At snapshot (Active)", 1);

        await governor.connect(voter1).castVote(proposalId, 1);

        // Mine past deadline
        const deadline = await governor.proposalDeadline(proposalId);
        let now = await ethers.provider.getBlockNumber();
        while (now <= deadline) {
            await ethers.provider.send("evm_mine");
            now = await ethers.provider.getBlockNumber();
        }

        await logAndAssert(governor, proposalId, "After votingPeriod", 4);
    });
});
