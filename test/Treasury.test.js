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

describe("Treasury (via Governor)", function () {
    let owner, proposer, voter, reserve;
    let token, timelock, governor, repOracle, roundManager, milestoneOracle, projectRegistry, treasury;

    beforeEach(async function () {
        [owner, proposer, voter, reserve] = await ethers.getSigners();

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
            0  // proposal threshold
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

        // --- Oracles + Managers ---
        const RepOracle = await ethers.getContractFactory("ReputationOracleMock", owner);
        repOracle = await RepOracle.deploy(await governor.getAddress(), await token.getAddress());
        await repOracle.waitForDeployment();

        const RoundManager = await ethers.getContractFactory("RoundManager", owner);
        roundManager = await RoundManager.deploy(await governor.getAddress(), await repOracle.getAddress());
        await roundManager.waitForDeployment();

        const MilestoneOracle = await ethers.getContractFactory("MilestoneOracleMock", owner);
        milestoneOracle = await MilestoneOracle.deploy(await governor.getAddress());
        await milestoneOracle.waitForDeployment();

        const NGOOracle = await ethers.getContractFactory("NGOOracleMock", owner);
        const ngoOracle = await NGOOracle.deploy(await governor.getAddress());
        await ngoOracle.waitForDeployment();

        const ProjectRegistry = await ethers.getContractFactory("ProjectRegistry", owner);
        projectRegistry = await ProjectRegistry.deploy(
            await governor.getAddress(),
            await ngoOracle.getAddress()
        );
        await projectRegistry.waitForDeployment();

        const Treasury = await ethers.getContractFactory("Treasury", owner);
        treasury = await Treasury.deploy(
            await governor.getAddress(),
            await roundManager.getAddress(),
            await milestoneOracle.getAddress(),
            await projectRegistry.getAddress(),
            await reserve.getAddress()
        );
        await treasury.waitForDeployment();
    });

    it("accepts deposits and finalizeRound sends funds to reserve when no votes/projects", async function () {
        // deposit explicitly (cannot use receive)
        await (await treasury.connect(owner).deposit({ value: ethers.parseEther("1.5") })).wait();

        const before = await ethers.provider.getBalance(await reserve.getAddress());

        // finalizeRound via governance
        const roundId = 0;
        const desc = "Finalize round with no votes";
        const calldata = treasury.interface.encodeFunctionData("finalizeRound", [roundId]);

        const tx = await governor.connect(proposer).propose(
            [await treasury.getAddress()], [0], [calldata], desc
        );
        const rc = await tx.wait();
        const pid = rc.logs[0].args.proposalId;

        await mineToActive(governor, pid);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(pid, 1);
        await minePastDeadline(governor, pid);

        const hash = ethers.keccak256(ethers.toUtf8Bytes(desc));
        await governor.queue([await treasury.getAddress()], [0], [calldata], hash);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");
        await governor.execute([await treasury.getAddress()], [0], [calldata], hash);

        const after = await ethers.provider.getBalance(await reserve.getAddress());
        expect(after - before).to.equal(ethers.parseEther("1.5"));
    });
});
