// test/CharityTimelock.test.js
const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("CharityTimelock", function () {
    let owner, proposer, executor;
    let timelock;

    beforeEach(async function () {
        [owner, proposer, executor] = await ethers.getSigners();

        const Timelock = await ethers.getContractFactory("CharityTimelock", owner);
        timelock = await Timelock.deploy(
            2,                     // minDelay
            [proposer.address],    // proposers
            [executor.address],    // executors
            owner.address          // admin
        );
        await timelock.waitForDeployment();
    });

    it("sets roles correctly", async function () {
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

        expect(await timelock.hasRole(PROPOSER_ROLE, proposer.address)).to.be.true;
        expect(await timelock.hasRole(EXECUTOR_ROLE, executor.address)).to.be.true;
    });

    it("only admin can grant roles", async function () {
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        await expect(
            timelock.connect(proposer).grantRole(PROPOSER_ROLE, executor.address)
        ).to.be.reverted;
    });
});
