const { ethers } = require("hardhat");
const { expect } = require("chai");

async function mineToActive(governor, proposalId) {
    const snapshot = await governor.proposalSnapshot(proposalId);
    let block = await ethers.provider.getBlockNumber();
    while (block <= snapshot) {
        await ethers.provider.send("evm_mine");
        block = await ethers.provider.getBlockNumber();
    }
}
async function minePastDeadline(governor, proposalId) {
    const deadline = await governor.proposalDeadline(proposalId);
    let block = await ethers.provider.getBlockNumber();
    while (block <= deadline) {
        await ethers.provider.send("evm_mine");
        block = await ethers.provider.getBlockNumber();
    }
}

describe("ReputationOracleMock (via Governor)", function () {
    let owner, proposer, voter, user;
    let token, timelock, governor, repOracle;

    beforeEach(async function () {
        [owner, proposer, voter, user] = await ethers.getSigners();

        // --- Token ---
        const Token = await ethers.getContractFactory("CharityGovToken", owner);
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();

        // distribute tokens for voting power using transfer (not mint)
        for (const acct of [proposer, voter]) {
            await (await token.connect(owner).transfer(await acct.getAddress(), ethers.parseEther("1000"))).wait();
            await (await token.connect(acct).delegate(await acct.getAddress())).wait();
        }

        // --- Timelock ---
        const Timelock = await ethers.getContractFactory("CharityTimelock", owner);
        timelock = await Timelock.deploy(2, [], [], owner.address);
        await timelock.waitForDeployment();

        // --- Governor ---
        const Governor = await ethers.getContractFactory("CharityGovernor", owner);
        governor = await Governor.deploy(
            await token.getAddress(),
            await timelock.getAddress(),
            1, // voting delay
            5, // voting period
            0
        );
        await governor.waitForDeployment();

        // grant governor timelock roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
        await (await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress())).wait();

        // governance link for token
        await (await token.connect(owner).setGovernance(await governor.getAddress())).wait();
        await (await token.transferOwnership(await governor.getAddress())).wait();

        // --- Reputation Oracle ---
        const RepOracle = await ethers.getContractFactory("ReputationOracleMock", owner);
        repOracle = await RepOracle.deploy(await governor.getAddress(), await token.getAddress());
        await repOracle.waitForDeployment();
    });

    it("only governance can update reputation", async function () {
        // direct call should revert
        await expect(
            repOracle.connect(owner).updateReputation(await user.getAddress(), 10)
        ).to.be.revertedWith("Only governance");

        // propose updateReputation
        const description = "Give rep=10";
        const calldata = repOracle.interface.encodeFunctionData("updateReputation", [
            await user.getAddress(),
            10
        ]);

        const tx = await governor.connect(proposer).propose(
            [await repOracle.getAddress()], [0], [calldata], description
        );
        const rc = await tx.wait();
        const proposalId = rc.logs[0].args.proposalId;

        await mineToActive(governor, proposalId);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(proposalId, 1);
        await minePastDeadline(governor, proposalId);

        const hash = ethers.keccak256(ethers.toUtf8Bytes(description));
        await governor.queue([await repOracle.getAddress()], [0], [calldata], hash);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");
        await governor.execute([await repOracle.getAddress()], [0], [calldata], hash);

        // check result
        expect(await repOracle.reputation(await user.getAddress())).to.equal(10);
    });
});
