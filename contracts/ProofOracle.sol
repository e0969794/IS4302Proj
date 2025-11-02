// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

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
    // Composite key → proofId
    mapping(bytes32 => uint256) public proofIndex;
    // Counter for generating next submission IDs (starts at 0)
    uint256 public nextProofId;

    // Emitted when an NGO submits a new proof
    event ProofSubmitted(
        uint256 indexed id,
        uint256 indexed proposalId,
        uint256 milestoneIndex,
        address indexed ngo
    );

    // Emitted when admin records its decision
    event ProofAprroved(
        uint256 indexed proofId,
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
        nextProofId = 1;

        // Temporary grant admin role to deployer (transfer to multi-sig in future works)
        // Admin who can approve/reject proofs for milestones
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Create a hash to act as a composite key
    function getKey(uint256 proposalId, uint256 milestoneIndex, address ngo)
    internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(proposalId, milestoneIndex, ngo));
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

        bytes32 key = getKey(proposalId, milestoneIndex, msg.sender);

        // Check if there's an existing proof
        uint256 existingProofId = proofIndex[key];
        if (existingProofId != 0) {
            ProofSubmission storage existingProof = proofs[existingProofId];
            // Allow resubmission only if previous proof was rejected
            require(
                existingProof.processed && !existingProof.approved,
                "Proof already submitted or approved"
            );
        }

        uint256 proofId = nextProofId++;
        proofs[proofId] = ProofSubmission({
            proposalId: proposalId,
            milestoneIndex: milestoneIndex,
            proofURL: proofURL,
            ngo: msg.sender,
            submittedAt: block.timestamp,
            processed: false,
            approved: false,
            reason: ""
        });

        proofIndex[key] = proofId;
        emit ProofSubmitted(proofId, proposalId, milestoneIndex, msg.sender);

        return proofId;
    }

     /**
     * @notice Verifies a milestone by hashing the full IPFS URL and calling ProposalManager
     * @dev Only ORACLE_ADMIN can call
     *      If approved, calls ProposalManager to verify milestone
     * @param proofId ID of the submission to process
     * @param approved Admin's decision on proof validity
     * @param reason Human-readable explanation
     */
    function verifyProof(uint256 proofId, bool approved, string calldata reason)
        external onlyRole(DEFAULT_ADMIN_ROLE) {
        ProofSubmission storage sub = proofs[proofId];
        require(sub.submittedAt != 0, "Not found");
        require(!sub.processed, "Processed");

        // Save approval and reason
        sub.approved = approved;
        sub.reason = reason;

        emit ProofAprroved(proofId, approved, reason);
        
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
     * @notice Returns full details of a proof
     * @param proofId ID to query
     * @return ProofSubmission struct
     */
    function getProof(uint256 proofId) external view
        returns (ProofSubmission memory) {
        require(proofId != 0 && proofId < nextProofId, "proof does not exist");
        return proofs[proofId];
    }

    /**
     * @notice Counts pending (unprocessed) submissions
     * @return count Number of submissions awaiting verification
     */
    function pendingCount() external view returns (uint256 count) {
        for (uint256 i = 1; i < nextProofId; i++) {
            if (!proofs[i].processed) count++;
        }
    }
}