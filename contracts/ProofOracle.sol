// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

// Interface to interact with the ProposalManager contract
interface IProposalManager {
    function verifyMilestone(uint256 proposalId, uint256 index, bytes32 proofHash) external;
}

interface INGOOracle {
    function verifyNGO(address ngo) external returns (bool);
}

// ProofOracle contract for verifying milestones using IPFS proofs uploaded via Pinata
contract ProofOracle is AccessControl {
    // Admin who can approve/revoke NGOs and set IPFS URLs
    // Assign to a multi-sig wallet (e.g. Gnosis Safe) for decentralized control
    bytes32 public constant ORACLE_ADMIN = keccak256("ORACLE_ADMIN");

    // Reference to the ProposalManager contract
    IProposalManager public proposalManager;

    // Reference to the NGOOracle contract
    INGOOracle public immutable ngoOracle;

    // Event emitted when a milestone is verified
    event MilestoneVerified(
        uint256 indexed proposalId,
        uint256 indexed milestoneIndex,
        bytes32 proofHash,
        string proofURL,
        address ngo
    );

    // Event emitted when ORACLE_ADMIN is transferred
    event AdminRoleTransferred(address indexed oldAdmin, address indexed newAdmin);

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

        // Temporary grant admin role to deployer (transfer to multi-sig post-deployment)
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
     * @notice Verifies a milestone by hashing the full IPFS URL and calling ProposalManager
     * @dev Only callable by ORACLE_ADMIN and checks NGO approval
     * @param proposalId ID of the proposal
     * @param milestoneIndex Index of the milestone
     * @param proofURL Full IPFS URL (e.g. ipfs://<CID>) of the milestone proof
     * @param ngo Address of the NGO
     */
    function verifyMilestone(
        uint256 proposalId,
        uint256 milestoneIndex,
        string memory proofURL,
        address ngo
    ) external onlyRole(ORACLE_ADMIN) {
        // Validate inputs
        require(bytes(proofURL).length > 0, "Proof URL cannot be empty");
        require(isValidIPFSURL(proofURL), "Invalid IPFS URL format");
        require(ngo != address(0), "Invalid NGO address");

        // Verify NGO is approved if ngoOracle is set
        if (address(ngoOracle) != address(0)) {
            require(ngoOracle.verifyNGO(ngo), "NGO not approved");
        }
        
        // Hash the full proof URL for immutability and gas-efficient storage
        bytes32 proofHash = keccak256(abi.encodePacked(proofURL));

        // Call ProposalManager to verify the milestone
        try proposalManager.verifyMilestone(proposalId, milestoneIndex, proofHash) {
            // Emit event with proofHash and proofURL for DAO transparency
            emit MilestoneVerified(proposalId, milestoneIndex, proofHash, proofURL, ngo);
        } catch {
            revert("Failed to verify milestone in ProposalManager");
        }
    }

    /**
     * @notice Transfers ORACLE_ADMIN role to a multi-sig wallet
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param newAdmin Address of the multi-sig wallet
     */
    function transferAdminRole(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAdmin != address(0), "Invalid admin address");
        _grantRole(ORACLE_ADMIN, newAdmin);
        _revokeRole(ORACLE_ADMIN, msg.sender);
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        emit AdminRoleTransferred(msg.sender, newAdmin);
    }
}
