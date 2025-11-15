// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IProposalManager {
    function verifyMilestone(uint256 proposalId, uint256 milestoneIndex,
        string calldata proofURL) external returns (bool);
    function isProposalOwner(uint256 proposalId, address ngo) external view returns (bool);
}

interface INGOOracle {
    function verifyNGO(address ngo) external returns (bool);
}

// ProofOracle contract for verifying milestones using IPFS proofs uploaded via Pinata
contract ProofOracle is AccessControl {
    // Admin who can approve/revoke NGOs and set IPFS URLs
    bytes32 public constant ORACLE_ADMIN = keccak256("ORACLE_ADMIN");

    // Immutable references to core contracts
    IProposalManager public immutable proposalManager;
    INGOOracle public immutable ngoOracle;

    // Represents a proof submission in the verification queue
    struct ProofSubmission {
        uint256 proposalId;
        uint256 milestoneIndex;
        string proofURL;
        address ngo;
        uint256 submittedAt;
        bool processed;
        bool approved;
        string reason;
    }

    // Mapping of submission ID → proof data
    mapping(uint256 => ProofSubmission) public proofs;
    // Counter for generating next submission IDs (starts at 0)
    uint256 public proofCount;

    // Emitted when an NGO submits a new proof
    event ProofSubmitted(
        uint256 indexed id,
        uint256 indexed proposalId,
        uint256 milestoneIndex,
        address indexed ngo
    );

    // Emitted when admin records its decision
    event ProofApproved(
        uint256 indexed submissionId,
        bool approved,
        string reason
    );

    /**
     * @notice Initializes the ProofOracle with ProposalManager and NGOOracle addresses
     * @dev Assigns ORACLE_ROLE to the deployer (transfer to multi-sig post-deployment)
     * @param _proposalManager Address of the ProposalManager contract
     * @param _ngoOracle Address of the NGOOracle contract
     */
    constructor(address _proposalManager, address _ngoOracle) {
        require(_proposalManager != address(0), "Invalid ProposalManager address");
        require(_ngoOracle != address(0), "Invalid NGOOracle address");
        proposalManager = IProposalManager(_proposalManager);
        ngoOracle = INGOOracle(_ngoOracle);

        // Temporary grant admin role to deployer (transfer to multi-sig in future works)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ADMIN, msg.sender);
    }

    /**
     * @notice Internal function to validate if a URL is a valid IPFS URL
     * @dev Checks for "ipfs://" prefix
     * @param url The URL to validate
     * @return bool True if the URL starts with "ipfs://", false otherwise
     */
    function isValidIPFSURL(string memory url) internal pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        bytes memory prefix = bytes("ipfs://");
        // Check if URL is shorter than prefix
        if (urlBytes.length < prefix.length) return false;
        // Compare each character of the prefix
        for (uint256 i = 0; i < prefix.length; i++) {
                if (urlBytes[i] != prefix[i]) return false;
        }
        return true;
    }

    /**
     * @notice NGO submits a proof for milestone verification via frontend
     * @dev Only the NGO that owns the proposal can submit proof
     * @param proposalId ID of the proposal
     * @param milestoneIndex Index of the milestone
     * @param proofURL Full IPFS URL (e.g. ipfs://<CID>) of the milestone proof
     */
    function submitProof(uint256 proposalId, uint256 milestoneIndex,
        string calldata proofURL) external
        returns (uint256) {
        require(bytes(proofURL).length > 0, "Empty URL");
        require(isValidIPFSURL(proofURL), "Invalid IPFS URL");
        require(ngoOracle.verifyNGO(msg.sender), "NGO not approved");
        require(
            proposalManager.isProposalOwner(proposalId, msg.sender),
            "NGO does not own this proposal"
        );

        uint256 submissionId = proofCount++;
        proofs[submissionId] = ProofSubmission({
            proposalId: proposalId,
            milestoneIndex: milestoneIndex,
            proofURL: proofURL,
            ngo: msg.sender,
            submittedAt: block.timestamp,
            processed: false,
            approved: false,
            reason: ""
        });

        emit ProofSubmitted(submissionId, proposalId, milestoneIndex, msg.sender);

        return submissionId;
    }

     /**
     * @notice Verifies a milestone by hashing the full IPFS URL and calling ProposalManager
     * @dev Only ORACLE_ADMIN can call
     *      If approved, calls ProposalManager to verify milestone
     * @param submissionId ID of the submission to process
     * @param approved Admin's decision on proof validity
     * @param reason Human-readable explanation
     */
    function verifyProof(uint256 submissionId, bool approved, string calldata reason)
        external onlyRole(ORACLE_ADMIN) {
        ProofSubmission storage sub = proofs[submissionId];
        require(sub.submittedAt != 0, "Not found");
        require(!sub.processed, "Processed");

        // Save approval and reason
        sub.approved = approved;
        sub.reason = reason;

        emit ProofApproved(submissionId, approved, reason);
        
        if (approved) {
            // Call ProposalManager to verify the milestone
            bool success = proposalManager.verifyMilestone(
                sub.proposalId,
                sub.milestoneIndex,
                sub.proofURL
            );

            sub.processed = success;
        } else {
            // Admin rejected
            sub.processed = true;
        }
    }

    /**
     * @notice Returns full details of a submission
     * @param submissionId ID to query
     * @return ProofSubmission struct
     */
    function getSubmission(uint256 submissionId) external view
        returns (ProofSubmission memory) {
        return proofs[submissionId];
    }

    /**
     * @notice Counts pending (unprocessed) submissions
     * @return count Number of submissions awaiting verification
     */
    function pendingCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < proofCount; i++) {
            if (!proofs[i].processed) count++;
        }
    }
}