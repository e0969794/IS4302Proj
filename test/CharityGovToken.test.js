// test/CharityGovToken.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CharityGovToken", function () {
    let GovToken, govToken;
    let Governor, governor;
    let Timelock, timelock;
    let owner, user1, user2;

    const VOTING_DELAY = 1; // blocks
    const VOTING_PERIOD = 5; // blocks
    const PROPOSAL_THRESHOLD = 0;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy governance token
        GovToken = await ethers.getContractFactory("CharityGovToken");
        govToken = await GovToken.deploy(owner.address);
        await govToken.waitForDeployment();

        // Deploy timelock
        const minDelay = 2; // seconds
        Timelock = await ethers.getContractFactory("CharityTimelock");
        timelock = await Timelock.deploy(minDelay, [], [], owner.address);
        await timelock.waitForDeployment();

        // Deploy governor
        Governor = await ethers.getContractFactory("CharityGovernor");
        governor = await Governor.deploy(
            await govToken.getAddress(),
            await timelock.getAddress(),
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD
        );
        await governor.waitForDeployment();

        // Transfer timelock proposer & executor roles
        const proposerRole = await timelock.PROPOSER_ROLE();
        const executorRole = await timelock.EXECUTOR_ROLE();
        await timelock.grantRole(proposerRole, await governor.getAddress());
        await timelock.grantRole(executorRole, ethers.ZeroAddress); // anyone can execute

        // Link token to governance (governor address)
        await govToken.connect(owner).setGovernance(await governor.getAddress());

        // Delegate votes to owner
        await govToken.connect(owner).delegate(owner.address);
    });

    it("should fail to mint if called directly by non-governance", async function () {
        await expect(
            govToken.connect(user1).mint(user1.address, 1000n)
        ).to.be.revertedWith("Only governance");
    });

    it("should allow minting through governance proposal", async function () {
        const amount = ethers.parseEther("1000");

        // Propose mint tokens to user1
        const mintCalldata = govToken.interface.encodeFunctionData("mint", [
            user1.address,
            amount,
        ]);
        const proposalTx = await governor.propose(
            [await govToken.getAddress()],
            [0],
            [mintCalldata],
            "Proposal #1: Mint 1000 CGT to user1"
        );
        const proposalReceipt = await proposalTx.wait();
        const proposalId = proposalReceipt.logs[0].args.proposalId;

        // Move forward into voting
        await ethers.provider.send("evm_mine", []);
        await governor.connect(owner).castVote(proposalId, 1); // 1 = For

        // Advance beyond voting period
        for (let i = 0; i < VOTING_PERIOD; i++) {
            await ethers.provider.send("evm_mine", []);
        }

        // Queue the proposal
        const descriptionHash = ethers.keccak256(
            ethers.toUtf8Bytes("Proposal #1: Mint 1000 CGT to user1")
        );
        await governor.queue(
            [await govToken.getAddress()],
            [0],
            [mintCalldata],
            descriptionHash
        );

        // Advance timelock delay
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine", []);

        // Execute proposal
        await governor.execute(
            [await govToken.getAddress()],
            [0],
            [mintCalldata],
            descriptionHash
        );

        // Verify mint
        const balance = await govToken.balanceOf(user1.address);
        expect(balance).to.equal(amount);
    });

    it("should revert if setGovernance is called twice", async function () {
        await expect(
            govToken.connect(owner).setGovernance(await governor.getAddress())
        ).to.be.revertedWith("Governance already set");
    });

    it("should revert if non-governance tries to mint (coverage for onlyGovernance)", async function () {
        // Deploy a fresh token for isolation
        const GovToken2 = await ethers.getContractFactory("CharityGovToken");
        const govToken2 = await GovToken2.deploy(owner.address);
        await govToken2.waitForDeployment();

        // Deploy timelock + governor
        const Timelock2 = await ethers.getContractFactory("CharityTimelock");
        const timelock2 = await Timelock2.deploy(2, [], [], owner.address);
        await timelock2.waitForDeployment();

        const Governor2 = await ethers.getContractFactory("CharityGovernor");
        const governor2 = await Governor2.deploy(
            await govToken2.getAddress(),
            await timelock2.getAddress(),
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD
        );
        await governor2.waitForDeployment();

        // Properly set governance
        await govToken2.connect(owner).setGovernance(await governor2.getAddress());

        // Non-governance tries to mint
        await expect(
            govToken2.connect(user1).mint(user1.address, 100n)
        ).to.be.revertedWith("Only governance");
    });

    it("should allow Timelock to mint tokens (cover governance.timelock() branch)", async function () {
        const amount = ethers.parseEther("50");

        // Prepare calldata for CharityGovToken.mint(user2, amount)
        const mintCalldata = govToken.interface.encodeFunctionData("mint", [
            user2.address,
            amount,
        ]);

        const predecessor = ethers.ZeroHash;
        const salt = ethers.keccak256(ethers.toUtf8Bytes("Mint via timelock"));

        // Grant PROPOSER_ROLE and EXECUTOR_ROLE to owner for testing
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        await timelock.grantRole(PROPOSER_ROLE, owner.address);
        await timelock.grantRole(EXECUTOR_ROLE, owner.address);

        // Schedule operation
        await timelock.connect(owner).schedule(
            await govToken.getAddress(),
            0,
            mintCalldata,
            predecessor,
            salt,
            2
        );

        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");

        // Execute operation
        await timelock.connect(owner).execute(
            await govToken.getAddress(),
            0,
            mintCalldata,
            predecessor,
            salt
        );

        const balance = await govToken.balanceOf(user2.address);
        expect(balance).to.equal(amount);
    });

    it("should revert if governance is not yet set", async function () {
        const Token = await ethers.getContractFactory("CharityGovToken");
        const freshToken = await Token.deploy(owner.address);
        await freshToken.waitForDeployment();

        await expect(
            freshToken.connect(owner).mint(user1.address, 100)
        ).to.be.revertedWith("Governance not set yet");
    });

    it("returns correct nonce for account (cover nonces override)", async function () {
        const n0 = await govToken.nonces(owner.address);
        expect(n0).to.equal(0n);

        const value = ethers.parseUnits("1", 18);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Build the permit signature
        const sig = await owner.signTypedData(
            {
                name: "CharityGovToken",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await govToken.getAddress(),
            },
            {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            {
                owner: owner.address,
                spender: user1.address,
                value,
                nonce: n0,
                deadline,
            }
        );

        const { v, r, s } = ethers.Signature.from(sig);

        await govToken.permit(
            owner.address,
            user1.address,
            value,
            deadline,
            v,
            r,
            s
        );

        const n1 = await govToken.nonces(owner.address);
        expect(n1).to.equal(n0 + 1n);
    });

    it("should revert if governance address is zero", async function () {
        const Token = await ethers.getContractFactory("CharityGovToken");
        const freshToken = await Token.deploy(owner.address);
        await freshToken.waitForDeployment();

        await expect(
            freshToken.connect(owner).setGovernance(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid governance");
    });

    it("governor address can mint directly (cover onlyGovernance governor branch)", async function () {
        const governorAddr = await governor.getAddress();

        // impersonate governor
        await ethers.provider.send("hardhat_impersonateAccount", [governorAddr]);
        const govSigner = await ethers.getSigner(governorAddr);

        // give ETH for gas
        await ethers.provider.send("hardhat_setBalance", [
            governorAddr,
            "0x3635C9ADC5DEA00000" // 1000 ETH
        ]);

        // Deploy fresh token for isolation
        const Token = await ethers.getContractFactory("CharityGovToken");
        const token2 = await Token.deploy(owner.address);
        await token2.waitForDeployment();

        // Set governance to governor address
        await token2.connect(owner).setGovernance(governorAddr);
        await token2.transferOwnership(governorAddr);

        // Mint directly as governor
        await token2.connect(govSigner).mint(user1.address, 123n);
        expect(await token2.balanceOf(user1.address)).to.equal(123n);

        await ethers.provider.send("hardhat_stopImpersonatingAccount", [governorAddr]);
    });

    it("should revert if governance address is zero", async function () {
        const Token = await ethers.getContractFactory("CharityGovToken");
        const freshToken = await Token.deploy(owner.address);
        await freshToken.waitForDeployment();

        await expect(
            freshToken.connect(owner).setGovernance(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid governance");
    });

    it("should revert if non-owner calls setGovernance", async function () {
        const Token = await ethers.getContractFactory("CharityGovToken");
        const freshToken = await Token.deploy(owner.address);
        await freshToken.waitForDeployment();

        await expect(
            freshToken.connect(user1).setGovernance(await governor.getAddress())
        ).to.be.revertedWithCustomError(freshToken, "OwnableUnauthorizedAccount");
    });
});
