// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProposalManager {

    address public proofOracle;
    uint256 public nextProposalId;

    struct Milestone {
        string description;
        uint256 amount; //should be cumulative, if milestone 1 is 100, milestone 2 >=101
        bool verified;
        bytes32 proofHash;
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


    // Event emitted when a milestone is verified
    event MilestoneVerified(
        uint256 indexed proposalId,
        uint256 indexed milestoneIndex,
        bytes32 proofHash,
        string proofURL,
        address ngo
    );
    // Event emitted when a milestone is rejected
    event MilestoneRejected(
        uint256 indexed proposalId,
        uint256 indexed milestoneIndex,
        address ngo,
        string reason
    );

    constructor() {
        nextProposalId = 1;
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
                    amount: milestoneAmounts[i],
                    verified: false,
                    proofHash: bytes32(0)
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
     * @notice Checks if an address owns a specific proposal
     * @dev View function used by ProofOracle to enforce ownership during proof submission
     *      Returns false if proposal doesn't exist or is inactive
     * @param proposalId ID of the proposal to check
     * @param ngo Address claiming ownership
     * @return bool True if ngo is the owner of the proposal, false otherwise
     */
    function isProposalOwner(uint256 proposalId, address ngo)
        external view returns (bool) {
        if (proposalId >= nextProposalId) return false;
        if (proposals[proposalId].id == 0) return false;

        return proposals[proposalId].ngo == ngo;
    }

    function killProposal(uint proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalId < nextProposalId && proposalId > 0, "Invalid proposalId");
        require(p.id != 0, "Already inactive");
        p.id = 0;
        emit ProposalKilled(proposalId, p.ngo);
    }

    /**
     * @notice Verifies a milestone and marks it as complete with proof
     * @dev Only callable by the ProofOracle contract (enforced via onlyProofOracle modifier)
     *      Returns false on any validation failure, emitting a rejection event
     *      On success: stores keccak256 hash of proofURL and sets verified = true
     * @param proposalId ID of the target proposal
     * @param milestoneIndex Index of the milestone within the proposal
     * @param proofURL Full IPFS URL (e.g., ipfs://Qm...) of the uploaded proof
     * @return success True if milestone was successfully verified, false otherwise
     */
    function verifyMilestone(uint256 proposalId, uint256 milestoneIndex,
        string calldata proofURL) external onlyProofOracle() returns (bool) {
        // Check proposal exists
        if (proposals[proposalId].id == 0) {
            emit MilestoneRejected(proposalId, milestoneIndex,
                proposals[proposalId].ngo, "Proposal does not exist");
            return false;
        }
        // Check milestone index
        if (milestoneIndex >= proposals[proposalId].milestones.length) {
            emit MilestoneRejected(proposalId, milestoneIndex,
                proposals[proposalId].ngo, "Invalid milestone index");
            return false;
        }
        // Check if already verified
        if (proposals[proposalId].milestones[milestoneIndex].verified) {
            emit MilestoneRejected(proposalId, milestoneIndex,
                proposals[proposalId].ngo, "Already verified");
            return false;
        }

        // Hash the full proof URL for immutability and gas-efficient storage
        bytes32 proofHash = keccak256(abi.encodePacked(proofURL));

        Milestone storage m = proposals[proposalId].milestones[milestoneIndex];
        m.proofHash = proofHash;
        m.verified = true;

        emit MilestoneVerified(proposalId, milestoneIndex, proofHash,
            proofURL, proposals[proposalId].ngo);

        return true;
    }
}
