const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProposalManager", function () {
    let ProposalManager, proposalManager;
    let proposaltarget, proposalId;
    let admin, ngo;
    let initialMintRate = 1;
    const milestonesDesc = ["Build school", "Purchase books"];
    const milestonesAmt = [ethers.parseEther("1"), ethers.parseEther("2")];

    beforeEach(async function () {
        // Get signers
        [admin, ngo] = await ethers.getSigners();
        // Deploy GovernanceToken
        GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        govToken = await GovernanceToken.deploy(admin.address);
        await govToken.waitForDeployment();

        // Deploy Treasury
        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await Treasury.deploy(
            admin.address,
            govToken.target,
            initialMintRate //dont think we need this
        );
        await treasury.waitForDeployment();
        // console.log("Treasury deployed at:", treasury.target);

        // Now grant TREASURY_ROLE to Treasury
        const TREASURY_ROLE = await govToken.TREASURY_ROLE();
        await govToken.connect(admin).grantRole(TREASURY_ROLE, treasury.target);
     
        // Deploy ProposalManager
        ProposalManager = await ethers.getContractFactory("ProposalManager");
        proposalManager = await ProposalManager.deploy(treasury.target);
        await proposalManager.waitForDeployment();
        //console.log("ProposalManager deployed at:", proposalManager.target);
        const tx = await proposalManager
        .connect(ngo)
        .createProposal(milestonesDesc, milestonesAmt);
        const receipt = await tx.wait();

        const event = receipt.logs
        .map((log) => {
            try {
            return proposalManager.interface.parseLog(log);
            } catch {
            return null;
            }
        })
        .filter((e) => e && e.name === "ProposalCreated")[0];

        if (!event) throw new Error("ProposalCreated event not found");
        proposalId = event.args.proposalId;
    });

    it("Should create proposal given the correct details", async function () {
        const proposal = await proposalManager.getProposal(proposalId);

        expect(await proposal.ngo).to.equal(ngo.address);
        
        const milestones = proposal[2]
        expect(await milestones.length).to.equal(2);

        const milestone0 = await milestones[0];
        expect(milestone0[0]).to.equal("Build school");
        expect(milestone0[1]).to.equal(1);
    });
    // NGO should not be able to submit if not verified.
});