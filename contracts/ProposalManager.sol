// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


contract ProposalManager {
    uint256 public nextProposalId;

    struct Milestone {
        string description;
        uint256 amount; //should be cumulative, if milestone 1 is 100, milestone 2 >=101
    }

    struct Proposal {
        uint256 id; //0 means not active (expired/completed)
        address ngo;
        Milestone[] milestones;
    }

    // proposalId -> proposalAddress
    mapping(uint256 => Proposal) public proposals;
    // NGO address -> proposalIds

    event ProposalCreated(uint256 indexed proposalId, address ngo);
    event MilestoneVerified(uint256 indexed proposalId, uint256 milestoneIndex);
    event MilestoneCompleted(uint256 indexed proposalId, uint256 milestoneIndex);

    //dont need to grant role because there isnt any permissions involved for this contract's operations. i dont think we need to grant admin
    constructor() {
        nextProposalId = 1;
    }

    function createProposal(
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) external returns (uint256) {
        require(
            milestoneDescriptions.length == milestoneAmounts.length,
            "Mismatched milestones"
        );

        //add check to verify that msg.sender is whitelisted

        uint256 proposalId = nextProposalId++;

        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.ngo = msg.sender;

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            p.milestones.push(
                Milestone({
                    description: milestoneDescriptions[i],
                    amount: milestoneAmounts[i]
                })
            );
        }

        emit ProposalCreated(proposalId, msg.sender);

        return proposalId;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposalId<nextProposalId, "proposal does not exist");
        require(proposals[proposalId].id != 0, "proposal no longer active");
        return proposals[proposalId];
    }

    function getAllProjects() external view returns (Proposal[] memory) {
        Proposal[] memory all = new Proposal[](nextProposalId - 1);
        for (uint256 i = 1; i < nextProposalId; i++) {
            all[i - 1] = proposals[i];
        }
        return all;
    }
}
