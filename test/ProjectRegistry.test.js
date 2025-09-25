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

describe("ProjectRegistry (via Governor)", function () {
    let owner, proposer, voter, ngo;
    let token, timelock, governor, ngoOracle, projectRegistry;

    beforeEach(async function () {
        [owner, proposer, voter, ngo] = await ethers.getSigners();

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

        // --- NGO Oracle ---
        const NGOOracle = await ethers.getContractFactory("NGOOracleMock", owner);
        ngoOracle = await NGOOracle.deploy(await governor.getAddress());
        await ngoOracle.waitForDeployment();

        // --- Project Registry ---
        const ProjectRegistry = await ethers.getContractFactory("ProjectRegistry", owner);
        projectRegistry = await ProjectRegistry.deploy(
            await governor.getAddress(),
            await ngoOracle.getAddress()
        );
        await projectRegistry.waitForDeployment();
    });

    it("governance can approve NGO and register project", async function () {
        // Step 1: Approve NGO via governance
        const desc1 = "Approve NGO for registry";
        const calldata1 = ngoOracle.interface.encodeFunctionData("approveNGO", [
            await ngo.getAddress(),
            "Water Aid"
        ]);

        const tx1 = await governor.connect(proposer).propose(
            [await ngoOracle.getAddress()], [0], [calldata1], desc1
        );
        const rc1 = await tx1.wait();
        const pid1 = rc1.logs[0].args.proposalId;

        await mineToActive(governor, pid1);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(pid1, 1);
        await minePastDeadline(governor, pid1);

        const hash1 = ethers.keccak256(ethers.toUtf8Bytes(desc1));
        await governor.queue([await ngoOracle.getAddress()], [0], [calldata1], hash1);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");
        await governor.execute([await ngoOracle.getAddress()], [0], [calldata1], hash1);

        expect(await ngoOracle.approvedNGOs(await ngo.getAddress())).to.equal(true);

        // Step 2: Register Project via governance
        const desc2 = "Register NGO project";
        const calldata2 = projectRegistry.interface.encodeFunctionData("registerProject", [
            await ngo.getAddress(),
            "Clean Water Project"
        ]);

        const tx2 = await governor.connect(proposer).propose(
            [await projectRegistry.getAddress()], [0], [calldata2], desc2
        );
        const rc2 = await tx2.wait();
        const pid2 = rc2.logs[0].args.proposalId;

        await mineToActive(governor, pid2);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(pid2, 1);
        await minePastDeadline(governor, pid2);

        const hash2 = ethers.keccak256(ethers.toUtf8Bytes(desc2));
        await governor.queue([await projectRegistry.getAddress()], [0], [calldata2], hash2);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");
        await governor.execute([await projectRegistry.getAddress()], [0], [calldata2], hash2);

        // Assert project is registered
        const project = await projectRegistry.projects(0);
        expect(project.ngo).to.equal(await ngo.getAddress());
        expect(project.description).to.equal("Clean Water Project");
        expect(project.status).to.equal(0); // Pending
    });
});
