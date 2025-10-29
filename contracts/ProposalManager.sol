// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITreasury {
    function weiToToken(uint256 weiAmount) external view returns (uint256);
    function tokenToWei(uint256 tokenAmount) external view returns (uint256);
}


contract ProposalManager {
    ITreasury public treasury;

    address public proofOracle;
    uint256 public nextProposalId;

    struct Milestone {
        string description;
        uint256 amount; //should be cumulative, if milestone 1 is 100, milestone 2 >=101
        bool verified;
    }

    struct Proposal {
        uint256 id; //0 means not active (expired/completed)
        address ngo;
        Milestone[] milestones;
        uint256 creation_date;
    }

    // proposalId -> proposalAddress
    mapping(uint256 => Proposal) public proposals;
    // NGO address -> proposalIds

    event ProposalCreated(uint256 indexed proposalId, address ngo);
    event ProposalKilled(uint256 indexed proposalId, address ngo);


    constructor(address _treasuryAddress) {
        nextProposalId = 1;
        treasury = ITreasury(_treasuryAddress);
    }

    modifier onlyProofOracle() {
        require(msg.sender == proofOracle, "Caller is not the ProofOracle");
        _;
    }

    function setProofOracle(address _proofOracle) external {
        require(proofOracle == address(0), "ProofOracle address already set");
        require(_proofOracle != address(0), "Invalid address");
        proofOracle = _proofOracle;
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
        p.creation_date = block.timestamp;

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            p.milestones.push(
                Milestone({
                    description: milestoneDescriptions[i],
                    amount: treasury.weiToToken(milestoneAmounts[i]),
                    verified: false
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

    function getAllProposals() external view returns (Proposal[] memory) {
        Proposal[] memory all = new Proposal[](nextProposalId - 1);
        for (uint256 i = 1; i < nextProposalId; i++) {
            all[i - 1] = proposals[i];
        }
        return all;
    }

    /**
     * @notice Verifies a milestone, callable ONLY by the ProofOracle
     * @param proposalId ID of the proposal
     * @param index Index of the milestone
     */
    function _verifyMilestone(uint256 proposalId, uint256 index)
        external 
        onlyProofOracle()
    {
        require(proposals[proposalId].id != 0, "Proposal does not exist");
        require(index < proposals[proposalId].milestones.length, "Invalid milestone index");

        Milestone storage m = proposals[proposalId].milestones[index];
        m.verified = true;
    }

    function killProposal(uint proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalId < nextProposalId && proposalId > 0, "Invalid proposalId");
        require(p.id != 0, "Already inactive");
        p.id = 0;
        emit ProposalKilled(proposalId, p.ngo);
    }

}
