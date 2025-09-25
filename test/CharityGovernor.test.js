// test/CharityGovernor.coverage.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

// mine to "Active"
async function mineToActive(governor, proposalId) {
    const snap = await governor.proposalSnapshot(proposalId);
    let b = await ethers.provider.getBlockNumber();
    while (b <= snap) {
        await ethers.provider.send("evm_mine");
        b = await ethers.provider.getBlockNumber();
    }
}
// mine past "Deadline"
async function minePastDeadline(governor, proposalId) {
    const dl = await governor.proposalDeadline(proposalId);
    let b = await ethers.provider.getBlockNumber();
    while (b <= dl) {
        await ethers.provider.send("evm_mine");
        b = await ethers.provider.getBlockNumber();
    }
}

describe("CharityGovernor coverage (cancel / needsQueuing / supportsInterface)", function () {
    let owner, proposer, voter1, voter2;
    let token, timelock, governor;

    beforeEach(async function () {
        [owner, proposer, voter1, voter2] = await ethers.getSigners();

        // Token (bootstrap 10k to owner)
        const Token = await ethers.getContractFactory("CharityGovToken", owner);
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();

        // Distribute voting power via transfer (no pre-governance mint)
        const ONE_K = ethers.parseUnits("1000", 18);
        await (await token.connect(owner).transfer(await proposer.getAddress(), ONE_K)).wait();
        await (await token.connect(owner).transfer(await voter1.getAddress(), ONE_K)).wait();
        await (await token.connect(owner).delegate(await owner.getAddress())).wait();
        await (await token.connect(proposer).delegate(await proposer.getAddress())).wait();
        await (await token.connect(voter1).delegate(await voter1.getAddress())).wait();

        // Timelock + Governor
        const Timelock = await ethers.getContractFactory("CharityTimelock", owner);
        timelock = await Timelock.deploy(2, [], [], owner.address);
        await timelock.waitForDeployment();

        const Governor = await ethers.getContractFactory("CharityGovernor", owner);
        governor = await Governor.deploy(
            await token.getAddress(),
            await timelock.getAddress(),
            1, // voting delay
            5, // voting period
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

        // Link governance
        await (await token.connect(owner).setGovernance(await governor.getAddress())).wait();
        await (await token.transferOwnership(await governor.getAddress())).wait();
    });

    it("covers _cancel via governor.cancel()", async function () {
        const desc = "Cancel me please";
        // Dummy target/call (won’t execute; only need a valid proposal to cancel)
        const targets = [await voter2.getAddress()];
        const values = [0];
        const calldatas = ["0x"];

        const tx = await governor.connect(proposer).propose(targets, values, calldatas, desc);
        const rc = await tx.wait();
        const proposalId = rc.logs.find(l => l.fragment?.name === "ProposalCreated").args.proposalId;

        const descHash = ethers.keccak256(ethers.toUtf8Bytes(desc));
        // Cancel while Pending (hits super._cancel override)
        await governor.connect(proposer).cancel(targets, values, calldatas, descHash);

        const state = await governor.state(proposalId);
        expect(state).to.equal(2); // Canceled
    });

    it("covers proposalNeedsQueuing() (returns true after Succeeded)", async function () {
        const desc = "Needs queuing?";
        const amount = ethers.parseUnits("10", 18);
        const calldata = token.interface.encodeFunctionData("mint", [
            await voter2.getAddress(),
            amount,
        ]);

        const tx = await governor.connect(proposer).propose(
            [await token.getAddress()],
            [0],
            [calldata],
            desc
        );
        const rc = await tx.wait();
        const proposalId = rc.logs.find(l => l.fragment?.name === "ProposalCreated").args.proposalId;

        await mineToActive(governor, proposalId);
        await governor.connect(proposer).castVote(proposalId, 1);
        await governor.connect(voter1).castVote(proposalId, 1);
        await minePastDeadline(governor, proposalId);

        // Calls the override returning super.proposalNeedsQueuing(...)
        const needs = await governor.proposalNeedsQueuing(proposalId);
        expect(needs).to.equal(true);
    });

    it("covers supportsInterface()", async function () {
        // ERC165 interfaceId = 0x01ffc9a7
        const ERC165_ID = "0x01ffc9a7";
        const supported = await governor.supportsInterface(ERC165_ID);
        expect(supported).to.equal(true);

        const randomId = "0xffffffff";
        const notSupported = await governor.supportsInterface(randomId);
        expect(notSupported).to.equal(false);
    });
});
