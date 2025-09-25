const { ethers } = require("hardhat");
const { expect } = require("chai");

// --- helpers: advance proposal state ---
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

describe("NGOOracleMock (via Governor)", function () {
    let owner, proposer, voter, ngo;
    let token, timelock, governor, ngoOracle;

    beforeEach(async function () {
        [owner, proposer, voter, ngo] = await ethers.getSigners();

        // Token (constructor mints 10_000 CGT to owner) — no direct minting in tests
        const Token = await ethers.getContractFactory("CharityGovToken", owner);
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();

        // Distribute voting power from bootstrap supply
        const ONE_K = ethers.parseUnits("1000", 18);
        for (const acct of [proposer, voter]) {
            await (await token.connect(owner).transfer(await acct.getAddress(), ONE_K)).wait();
            await (await token.connect(acct).delegate(await acct.getAddress())).wait();
        }
        await (await token.connect(owner).delegate(await owner.getAddress())).wait();

        // Timelock & Governor
        const Timelock = await ethers.getContractFactory("CharityTimelock", owner);
        timelock = await Timelock.deploy(2, [], [], owner.address);
        await timelock.waitForDeployment();

        const Governor = await ethers.getContractFactory("CharityGovernor", owner);
        governor = await Governor.deploy(
            await token.getAddress(),
            await timelock.getAddress(),
            1, 5, 0
        );
        await governor.waitForDeployment();

        // Roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
        await (await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress())).wait();

        // IMPORTANT: set governance first, then transfer ownership
        await (await token.connect(owner).setGovernance(await governor.getAddress())).wait();
        await (await token.transferOwnership(await governor.getAddress())).wait();

        // NGO Oracle (constructor needs IGovernance)
        const NGOOracle = await ethers.getContractFactory("NGOOracleMock", owner);
        ngoOracle = await NGOOracle.deploy(await governor.getAddress());
        await ngoOracle.waitForDeployment();
    });

    it("only governance can approve NGO", async function () {
        // direct call should revert
        await expect(
            ngoOracle.connect(owner).approveNGO(await ngo.getAddress(), "Org XYZ")
        ).to.be.revertedWith("Only governance");

        // propose approveNGO
        const description = "Approve NGO Org XYZ";
        const calldata = ngoOracle.interface.encodeFunctionData("approveNGO", [
            await ngo.getAddress(),
            "Org XYZ"
        ]);
        const tx = await governor.connect(proposer).propose(
            [await ngoOracle.getAddress()], [0], [calldata], description
        );
        const rc = await tx.wait();
        const proposalId = rc.logs[0].args.proposalId;

        await mineToActive(governor, proposalId);
        for (const acct of [proposer, voter]) {
            await governor.connect(acct).castVote(proposalId, 1);
        }
        await minePastDeadline(governor, proposalId);

        // use standardized descriptionHash
        const descHash = ethers.keccak256(ethers.toUtf8Bytes(description));
        await governor.queue([await ngoOracle.getAddress()], [0], [calldata], descHash);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");
        await governor.execute([await ngoOracle.getAddress()], [0], [calldata], descHash);

        expect(await ngoOracle.approvedNGOs(await ngo.getAddress())).to.equal(true);
        expect(await ngoOracle.ngoDetails(await ngo.getAddress())).to.equal("Org XYZ");
    });

    it("timelock can call approveNGO directly", async function () {
        const timelockAddr = await timelock.getAddress();

        // Impersonate timelock
        await ethers.provider.send("hardhat_impersonateAccount", [timelockAddr]);
        const timelockSigner = await ethers.getSigner(timelockAddr);

        // Fund timelock so it can pay gas
        await owner.sendTransaction({ to: timelockAddr, value: ethers.parseEther("1") });

        // Direct call as timelock
        await ngoOracle.connect(timelockSigner).approveNGO(await ngo.getAddress(), "Direct Approval");

        expect(await ngoOracle.approvedNGOs(await ngo.getAddress())).to.equal(true);
        expect(await ngoOracle.ngoDetails(await ngo.getAddress())).to.equal("Direct Approval");

        await ethers.provider.send("hardhat_stopImpersonatingAccount", [timelockAddr]);
    });

    it("should revert when approving NGO with zero address", async function () {
        const description = "Approve zero NGO";
        const calldata = ngoOracle.interface.encodeFunctionData("approveNGO", [
            ethers.ZeroAddress,
            "Invalid Org"
        ]);

        const tx = await governor.connect(proposer).propose(
            [await ngoOracle.getAddress()], [0], [calldata], description
        );
        const rc = await tx.wait();
        const proposalId = rc.logs[0].args.proposalId;

        await mineToActive(governor, proposalId);
        for (const acct of [proposer, voter]) {
            await governor.connect(acct).castVote(proposalId, 1);
        }
        await minePastDeadline(governor, proposalId);

        const descHash = ethers.keccak256(ethers.toUtf8Bytes(description));
        await governor.queue([await ngoOracle.getAddress()], [0], [calldata], descHash);
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");

        await expect(
            governor.execute([await ngoOracle.getAddress()], [0], [calldata], descHash)
        ).to.be.revertedWith("Invalid NGO address");
    });

    it("constructor accepts zero governance (mock scenario)", async function () {
        const NGOOracle = await ethers.getContractFactory("NGOOracleMock", owner);
        const dummy = await NGOOracle.deploy(ethers.ZeroAddress);
        await dummy.waitForDeployment();

        expect(await dummy.governance()).to.equal(ethers.ZeroAddress);
    });

    it("governor address can call approveNGO directly", async function () {
        const governorAddr = await governor.getAddress();

        // Impersonate governor
        await ethers.provider.send("hardhat_impersonateAccount", [governorAddr]);
        const govSigner = await ethers.getSigner(governorAddr);

        // Give it ETH balance for gas
        await ethers.provider.send("hardhat_setBalance", [
            governorAddr,
            "0x3635C9ADC5DEA00000" // 1000 ETH
        ]);

        // Direct call
        await ngoOracle.connect(govSigner).approveNGO(await ngo.getAddress(), "GovernorDirect");

        expect(await ngoOracle.approvedNGOs(await ngo.getAddress())).to.equal(true);
        expect(await ngoOracle.ngoDetails(await ngo.getAddress())).to.equal("GovernorDirect");

        await ethers.provider.send("hardhat_stopImpersonatingAccount", [governorAddr]);
    });
});
