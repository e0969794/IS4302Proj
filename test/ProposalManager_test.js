const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProposalManager", function () {
    let ProposalManager, proposalManager;
    let proposaltarget, proposalId;
    let admin, ngo;
    let initialMintRate = 1;
    const milestonesDesc = ["Build school", "Purchase books"];
    const milestonesAmt = [1, 2];

    beforeEach(async function () {
        // Get signers
        [admin, ngo] = await ethers.getSigners();
     
        // Deploy ProposalManager
        ProposalManager = await ethers.getContractFactory("ProposalManager");
        proposalManager = await ProposalManager.deploy();
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