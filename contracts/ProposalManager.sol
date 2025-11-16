// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INGOOracle {
    function verifyNGO(address ngo) external returns (bool);
}

contract ProposalManager {
    INGOOracle public immutable ngoOracle;

    address public proofOracle;
    uint256 public nextProposalId;
    
    // NEW: NGO suspension system
    mapping(address => bool) public suspendedNGOs;
    mapping(address => uint256) public ngoStrikeCount;
    uint256 public constant MAX_STRIKES = 1; // Suspend after 1 invalid proof
    
    event NGOSuspended(address indexed ngo, uint256 totalStrikes, string reason);
    event NGOStrikeAdded(address indexed ngo, uint256 newStrikeCount, uint256 proposalId, uint256 milestoneIndex);

    struct Milestone {
        string description;
        uint256 amount; //should be cumulative, if milestone 1 is 100, milestone 2 >=101
        bool verified;
        bool released;
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

    constructor(address _ngoOracle) {
        ngoOracle = INGOOracle(_ngoOracle);
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

        require(!suspendedNGOs[msg.sender], "NGO is suspended from creating proposals");
        require(ngoOracle.verifyNGO(msg.sender), "NGO address not approved");
        
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
                    released: false,
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

    /**
     * @notice Gets the verification status of a specific milestone
     * @dev View function, returns true if verified, false otherwise
     * @param proposalId ID of the target proposal
     * @param milestoneIndex Index of the milestone within the proposal
     * @return bool True if the milestone is verified, false otherwise
     */
    function getMilestoneStatus(uint256 proposalId, uint256 milestoneIndex) 
        external 
        view 
        returns (bool) 
    {
        // 1. Check that the proposal ID is valid and the proposal is active
        // (proposalId >= nextProposalId means it never existed)
        // (proposals[proposalId].id == 0 means it was killed/inactive)
        require(
            proposalId < nextProposalId && proposals[proposalId].id != 0, 
            "Proposal not found or inactive"
        );

        // 2. Check that the milestone index is within the array's bounds
        require(
            milestoneIndex < proposals[proposalId].milestones.length, 
            "Invalid milestone index"
        );

        // 3. Return the 'verified' status
        return proposals[proposalId].milestones[milestoneIndex].verified;
    }

    function updateMilestoneReleaseStatus(uint256 proposalId, uint256 milestoneIndex) external {
        proposals[proposalId].milestones[milestoneIndex].released = true;
    }

    function getMilestoneReleaseStatus(uint256 proposalId, uint256 milestoneIndex) 
        external 
        view 
        returns (bool) 
    {
        // 1. Check that the proposal ID is valid and the proposal is active
        // (proposalId >= nextProposalId means it never existed)
        // (proposals[proposalId].id == 0 means it was killed/inactive)
        require(
            proposalId < nextProposalId && proposals[proposalId].id != 0, 
            "Proposal not found or inactive"
        );

        // 2. Check that the milestone index is within the array's bounds
        require(
            milestoneIndex < proposals[proposalId].milestones.length, 
            "Invalid milestone index"
        );

        // 3. Return the 'released' status
        return proposals[proposalId].milestones[milestoneIndex].released;
    }

    function proposalExists(uint256 proposalId) external view returns (bool) {
        // Checks if ID is in range (less than nextProposalId)
        // and if the proposal ID is not 0 (meaning it's active)
        return (proposalId < nextProposalId && proposals[proposalId].id != 0);
    }

    /**
     * @notice Add a strike to an NGO for submitting invalid proof
     * @dev Only callable by ProofOracle. NGO is immediately suspended after first invalid proof
     * @param ngo Address of the NGO to penalize
     * @param proposalId ID of the proposal with invalid proof
     * @param milestoneIndex Index of the milestone with invalid proof
     */
    function addNGOStrike(address ngo, uint256 proposalId, uint256 milestoneIndex) external {
        require(msg.sender == proofOracle, "Only ProofOracle can add strikes");
        
        ngoStrikeCount[ngo]++;
        emit NGOStrikeAdded(ngo, ngoStrikeCount[ngo], proposalId, milestoneIndex);
        
        // Immediately suspend NGO after first invalid proof
        suspendedNGOs[ngo] = true;
        
        // Kill all active proposals from this NGO
        _killAllNGOProposals(ngo);
        
        emit NGOSuspended(ngo, ngoStrikeCount[ngo], "Invalid proof submitted - zero tolerance policy");
    }

    /**
     * @notice Manually suspend an NGO (emergency function)
     * @dev Only callable by ProofOracle for severe violations
     * @param ngo Address of the NGO to suspend
     * @param reason Reason for the suspension
     */
    function suspendNGO(address ngo, string calldata reason) external {
        require(msg.sender == proofOracle, "Only ProofOracle can suspend NGOs");
        
        suspendedNGOs[ngo] = true;
        
        // Kill all active proposals from this NGO
        _killAllNGOProposals(ngo);
        
        emit NGOSuspended(ngo, ngoStrikeCount[ngo], reason);
    }

    /**
     * @notice Kill all active proposals from a specific NGO
     * @dev Internal function called when NGO is suspended
     * @param ngo Address of the NGO whose proposals to kill
     */
    function _killAllNGOProposals(address ngo) internal {
        for (uint256 i = 1; i < nextProposalId; i++) {
            if (proposals[i].id != 0 && proposals[i].ngo == ngo) {
                proposals[i].id = 0; // Mark as inactive
                emit ProposalKilled(i, ngo);
            }
        }
    }

    /**
     * @notice Check if an NGO is suspended
     * @param ngo Address of the NGO to check
     * @return True if NGO is suspended, false otherwise
     */
    function isNGOSuspended(address ngo) external view returns (bool) {
        return suspendedNGOs[ngo];
    }

    /**
     * @notice Get strike count for an NGO
     * @param ngo Address of the NGO
     * @return Number of strikes the NGO has
     */
    function getNGOStrikeCount(address ngo) external view returns (uint256) {
        return ngoStrikeCount[ngo];
    }
}