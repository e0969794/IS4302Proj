// test/MilestoneOracleMock.test.js
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

// helper: impersonate governor signer, directly fund with hardhat_setBalance
async function impersonateGovernor(governor) {
    const governorAddr = await governor.getAddress();
    await ethers.provider.send("hardhat_impersonateAccount", [governorAddr]);

    // Set a large balance so governor account can pay gas
    await ethers.provider.send("hardhat_setBalance", [
        governorAddr,
        "0x3635C9ADC5DEA00000" // 1000 ETH
    ]);

    const govSigner = await ethers.getSigner(governorAddr);
    return { govSigner, governorAddr };
}

async function stopImpersonate(addr) {
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [addr]);
}

describe("MilestoneOracleMock (via Governor)", function () {
    let owner, proposer, voter;
    let token, timelock, governor, milestoneOracle;

    beforeEach(async function () {
        [owner, proposer, voter] = await ethers.getSigners();

        // --- Token ---
        const Token = await ethers.getContractFactory("CharityGovToken", owner);
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();

        const ONE_K = ethers.parseUnits("1000", 18);
        for (const acct of [proposer, voter]) {
            await (await token.connect(owner).transfer(await acct.getAddress(), ONE_K)).wait();
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
            1,
            5,
            0
        );
        await governor.waitForDeployment();

        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
        await (await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress())).wait();

        await (await token.connect(owner).setGovernance(await governor.getAddress())).wait();
        await (await token.transferOwnership(await governor.getAddress())).wait();

        // --- Milestone Oracle ---
        const MilestoneOracle = await ethers.getContractFactory("MilestoneOracleMock", owner);
        milestoneOracle = await MilestoneOracle.deploy(await governor.getAddress());
        await milestoneOracle.waitForDeployment();
    });

    // ----------------- Existing Tests -----------------

    it("constructor sets governance correctly", async function () {
        expect(await milestoneOracle.governance()).to.equal(await governor.getAddress());
    });

    it("should revert if non-governance calls setMilestones directly", async function () {
        await expect(
            milestoneOracle.connect(owner).setMilestones(1, [100])
        ).to.be.revertedWith("Only governance");
    });

    it("should revert if non-governance calls verifyMilestone directly", async function () {
        await expect(
            milestoneOracle.connect(owner).verifyMilestone(1, 0)
        ).to.be.revertedWith("Only governance");
    });

    it("governance can set and verify milestones", async function () {
        const projectId = 1;
        const percentages = [50, 30, 20];
        const desc1 = "Set milestones";
        const calldata1 = milestoneOracle.interface.encodeFunctionData("setMilestones", [
            projectId, percentages
        ]);

        const tx1 = await governor.connect(proposer).propose(
            [await milestoneOracle.getAddress()], [0], [calldata1], desc1
        );
        const rc1 = await tx1.wait();
        const prop1 = rc1.logs[0].args.proposalId;

        await mineToActive(governor, prop1);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(prop1, 1);
        await minePastDeadline(governor, prop1);

        const h1 = ethers.keccak256(ethers.toUtf8Bytes(desc1));
        await governor.queue([await milestoneOracle.getAddress()], [0], [calldata1], h1);
        await ethers.provider.send("evm_increaseTime", [3]); await ethers.provider.send("evm_mine");
        await governor.execute([await milestoneOracle.getAddress()], [0], [calldata1], h1);

        const ms = await milestoneOracle.getProjectMilestones(projectId);
        expect(ms.length).to.equal(3);
        expect(ms[0].percentage).to.equal(50);

        // Verify milestone 0
        const desc2 = "Verify milestone 0";
        const calldata2 = milestoneOracle.interface.encodeFunctionData("verifyMilestone", [
            projectId, 0
        ]);
        const tx2 = await governor.connect(proposer).propose(
            [await milestoneOracle.getAddress()], [0], [calldata2], desc2
        );
        const rc2 = await tx2.wait();
        const prop2 = rc2.logs[0].args.proposalId;

        await mineToActive(governor, prop2);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(prop2, 1);
        await minePastDeadline(governor, prop2);

        const h2 = ethers.keccak256(ethers.toUtf8Bytes(desc2));
        await governor.queue([await milestoneOracle.getAddress()], [0], [calldata2], h2);
        await ethers.provider.send("evm_increaseTime", [3]); await ethers.provider.send("evm_mine");
        await governor.execute([await milestoneOracle.getAddress()], [0], [calldata2], h2);

        const msAfter = await milestoneOracle.getProjectMilestones(projectId);
        expect(msAfter[0].verified).to.equal(true);
    });

    it("should revert if no milestones are provided (via governance)", async function () {
        const desc = "Empty milestones";
        const calldata = milestoneOracle.interface.encodeFunctionData("setMilestones", [1, []]);

        const tx = await governor.connect(proposer).propose(
            [await milestoneOracle.getAddress()], [0], [calldata], desc
        );
        const rc = await tx.wait();
        const proposalId = rc.logs[0].args.proposalId;

        await mineToActive(governor, proposalId);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(proposalId, 1);
        await minePastDeadline(governor, proposalId);

        const h = ethers.keccak256(ethers.toUtf8Bytes(desc));
        await governor.queue([await milestoneOracle.getAddress()], [0], [calldata], h);
        await ethers.provider.send("evm_increaseTime", [3]); await ethers.provider.send("evm_mine");

        await expect(
            governor.execute([await milestoneOracle.getAddress()], [0], [calldata], h)
        ).to.be.revertedWith("At least one milestone required");
    });

    it("should revert if more than 10 milestones are provided (via governance)", async function () {
        const bigArray = Array(11).fill(10);
        const desc = "Too many milestones";
        const calldata = milestoneOracle.interface.encodeFunctionData("setMilestones", [1, bigArray]);

        const tx = await governor.connect(proposer).propose(
            [await milestoneOracle.getAddress()], [0], [calldata], desc
        );
        const rc = await tx.wait();
        const proposalId = rc.logs[0].args.proposalId;

        await mineToActive(governor, proposalId);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(proposalId, 1);
        await minePastDeadline(governor, proposalId);

        const h = ethers.keccak256(ethers.toUtf8Bytes(desc));
        await governor.queue([await milestoneOracle.getAddress()], [0], [calldata], h);
        await ethers.provider.send("evm_increaseTime", [3]); await ethers.provider.send("evm_mine");

        await expect(
            governor.execute([await milestoneOracle.getAddress()], [0], [calldata], h)
        ).to.be.revertedWith("Too many milestones");
    });

    it("should revert if percentages do not sum to 100 (via governance)", async function () {
        const desc = "Invalid percentages";
        const calldata = milestoneOracle.interface.encodeFunctionData("setMilestones", [1, [40, 40]]);

        const tx = await governor.connect(proposer).propose(
            [await milestoneOracle.getAddress()], [0], [calldata], desc
        );
        const rc = await tx.wait();
        const proposalId = rc.logs[0].args.proposalId;

        await mineToActive(governor, proposalId);
        for (const acct of [proposer, voter]) await governor.connect(acct).castVote(proposalId, 1);
        await minePastDeadline(governor, proposalId);

        const h = ethers.keccak256(ethers.toUtf8Bytes(desc));
        await governor.queue([await milestoneOracle.getAddress()], [0], [calldata], h);
        await ethers.provider.send("evm_increaseTime", [3]); await ethers.provider.send("evm_mine");

        await expect(
            governor.execute([await milestoneOracle.getAddress()], [0], [calldata], h)
        ).to.be.revertedWith("Percentages must sum to 100");
    });

    it("allows timelock (not governor) to set milestones", async function () {
        const MilestoneOracle = await ethers.getContractFactory("MilestoneOracleMock", owner);
        const dummyOracle = await MilestoneOracle.deploy(await timelock.getAddress());
        await dummyOracle.waitForDeployment();

        const timelockAddr = await timelock.getAddress();

        // Impersonate timelock
        await ethers.provider.send("hardhat_impersonateAccount", [timelockAddr]);
        const timelockSigner = await ethers.getSigner(timelockAddr);

        // Fund timelock so it can send tx
        await owner.sendTransaction({
            to: timelockAddr,
            value: ethers.parseEther("1")
        });

        // Now timelock can call setMilestones
        await dummyOracle.connect(timelockSigner).setMilestones(99, [100]);

        const ms = await dummyOracle.getProjectMilestones(99);
        expect(ms[0].percentage).to.equal(100);

        // Stop impersonating
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [timelockAddr]);
    });

    it("emits MilestoneVerified and updates struct", async function () {
        const MilestoneOracle = await ethers.getContractFactory("MilestoneOracleMock", owner);
        const dummyOracle = await MilestoneOracle.deploy(owner.address);
        await dummyOracle.waitForDeployment();

        await dummyOracle.setMilestones(42, [100]);

        await expect(dummyOracle.verifyMilestone(42, 0))
            .to.emit(dummyOracle, "MilestoneVerified")
            .withArgs(42, 0);

        const ms = await dummyOracle.getProjectMilestones(42);
        expect(ms[0].verified).to.equal(true);
    });

    // ----------------- Added Tests for Coverage -----------------

    it("allows direct governor address (not timelock) to set milestones", async function () {
        const { govSigner, governorAddr } = await impersonateGovernor(governor);

        await milestoneOracle.connect(govSigner).setMilestones(200, [100]);
        const ms = await milestoneOracle.getProjectMilestones(200);
        expect(ms[0].percentage).to.equal(100);

        await stopImpersonate(governorAddr);
    });

    it("should revert when verifying non-existent project milestones", async function () {
        const { govSigner, governorAddr } = await impersonateGovernor(governor);

        await expect(
            milestoneOracle.connect(govSigner).verifyMilestone(300, 0)
        ).to.be.revertedWith("Invalid milestone index");

        await stopImpersonate(governorAddr);
    });

    it("should revert when verifying with out-of-bounds index", async function () {
        const { govSigner, governorAddr } = await impersonateGovernor(governor);

        await milestoneOracle.connect(govSigner).setMilestones(400, [100]);
        await expect(
            milestoneOracle.connect(govSigner).verifyMilestone(400, 1)
        ).to.be.revertedWith("Invalid milestone index");

        await stopImpersonate(governorAddr);
    });

    it("should revert when verifying already verified milestone", async function () {
        const { govSigner, governorAddr } = await impersonateGovernor(governor);

        await milestoneOracle.connect(govSigner).setMilestones(500, [100]);
        await milestoneOracle.connect(govSigner).verifyMilestone(500, 0);
        await expect(
            milestoneOracle.connect(govSigner).verifyMilestone(500, 0)
        ).to.be.revertedWith("Milestone already verified");

        await stopImpersonate(governorAddr);
    });

    it("emits MilestonesSet on successful milestone creation", async function () {
        const { govSigner, governorAddr } = await impersonateGovernor(governor);

        await expect(milestoneOracle.connect(govSigner).setMilestones(600, [100]))
            .to.emit(milestoneOracle, "MilestonesSet")
            .withArgs(600, [100]);

        await stopImpersonate(governorAddr);
    });
});
