// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

// NGOOracle contract for managing and verifying approved NGOs in the charity DAO
contract NGOOracle is AccessControl {
    // Admin who can approve/revoke NGOs and set IPFS URLs
    // Assign to a multi-sig wallet (e.g. Gnosis Safe) for decentralized control
    bytes32 public constant ORACLE_ADMIN = keccak256("ORACLE_ADMIN");

    // Mapping to track whether an address is an approved NGO
    mapping(address => bool) public approvedNGOs;
    // Single IPFS URL (e.g., ipfs://<CID>) pointing to a JSON file with all NGO details
    // JSON format:
    // {"ngos":[{"address":"0xNGO1",
    // "name":"NGO1","description":"Charity","registrationId":"123"},...]}
    string public ngoDetailsUrl;

    // Event emitted when the NGO whitelist is updated with a new IPFS JSON URL
    event NGOWhitelistUpdated(string ipfsUrl, uint256 timestamp);
    // Event emitted when an NGO is approved during initialization
    event NGOApproved(address indexed ngo, uint256 timestamp);
    // Event emitted when an NGO is verified as approved
    event NGOVerified(address indexed ngo, uint256 timestamp);
    // Event emitted when an NGO is rejected (not approved)
    event NGORejected(address indexed ngo, uint256 timestamp);

    // Event emitted when ORACLE_ADMIN is transferred
    event AdminRoleTransferred(address indexed oldAdmin, address indexed newAdmin);

    /**
     * @notice Initializes the NGOOracle with a list of approved NGOs
     * @dev Expects ipfsUrl to point to a JSON file on IPFS
     *      Uploaded by the DAO admin via Pinata
     * @param ngoAddresses Array of NGO addresses to approve
     * @param ipfsUrl IPFS URL pointing to the JSON file with NGO details
     */
    constructor(address[] memory ngoAddresses, string memory ipfsUrl) {
        // Validate inputs
        require(bytes(ipfsUrl).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsUrl), "Invalid IPFS URL format");
        for (uint256 i = 0; i < ngoAddresses.length; i++) {
            require(ngoAddresses[i] != address(0), "Invalid NGO address");
        }

        // Temporary grant admin role to deployer (transfer to multi-sig post-deployment)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ADMIN, msg.sender);

        // Approve NGOs and set IPFS URL
        for (uint256 i = 0; i < ngoAddresses.length; i++) {
            approvedNGOs[ngoAddresses[i]] = true;
            emit NGOApproved(ngoAddresses[i], block.timestamp);
        }
        ngoDetailsUrl = ipfsUrl;
        emit NGOWhitelistUpdated(ipfsUrl, block.timestamp);
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
     * @notice Verifies if an address is an approved NGO
     * @param ngo The address to verify
     * @return bool True if the NGO is approved, false otherwise
     */
    function verifyNGO(address ngo) external returns (bool) {
        require(ngo != address(0), "Invalid NGO address");

        bool isApproved = approvedNGOs[ngo];
        if (isApproved) {
            emit NGOVerified(ngo, block.timestamp);
        } else {
            emit NGORejected(ngo, block.timestamp);
        }
        return isApproved;
    }

    /**
     * @notice Approves a new NGO and updates the IPFS JSON URL
     * @dev Only callable by ORACLE_ADMIN (recommended: multi-sig wallet)
     *      Admin must upload a new JSON file to Pinata including the new NGO
     * @param ngo Address of the NGO to approve
     * @param ipfsUrl New IPFS URL for the updated JSON file
     */
    function approveNGO(address ngo, string memory ipfsUrl) external onlyRole(ORACLE_ADMIN) {
        require(ngo != address(0), "Invalid NGO address");
        require(!approvedNGOs[ngo], "NGO already approved");
        require(bytes(ipfsUrl).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsUrl), "Invalid IPFS URL format");

        approvedNGOs[ngo] = true;
        ngoDetailsUrl = ipfsUrl;
        emit NGOApproved(ngo, block.timestamp);
        emit NGOWhitelistUpdated(ipfsUrl, block.timestamp);
    }

    /**
     * @notice Revokes an NGO's approval and updates the IPFS JSON URL
     * @dev Only callable by ORACLE_ADMIN (recommended: multi-sig wallet)
     *      Admin must upload a new JSON file to Pinata excluding the revoked NGO
     * @param ngo Address of the NGO to revoke
     * @param ipfsUrl New IPFS URL for the updated JSON file
     */
    function revokeNGO(address ngo, string memory ipfsUrl) external onlyRole(ORACLE_ADMIN) {
        require(ngo != address(0), "Invalid NGO address");
        require(approvedNGOs[ngo], "NGO not approved");
        require(bytes(ipfsUrl).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsUrl), "Invalid IPFS URL format");

        approvedNGOs[ngo] = false;
        ngoDetailsUrl = ipfsUrl;
        emit NGORejected(ngo, block.timestamp);
        emit NGOWhitelistUpdated(ipfsUrl, block.timestamp);
    }

    /**
     * @notice Updates the IPFS JSON URL without changing approvals
     * @dev Only callable by ORACLE_ADMIN (recommended: multi-sig wallet)
     *      Useful for updating NGO details without changing the whitelist
     * @param ipfsUrl New IPFS URL for the JSON file
     */
    function updateNGODetailsUrl(string memory ipfsUrl) external onlyRole(ORACLE_ADMIN) {
        require(bytes(ipfsUrl).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsUrl), "Invalid IPFS URL format");
        ngoDetailsUrl = ipfsUrl;
        emit NGOWhitelistUpdated(ipfsUrl, block.timestamp);
    }

    /**
     * @notice Retrieves the IPFS URL for the JSON file containing all NGO details
     * @return The IPFS URL (e.g., ipfs://<CID>)
     */
    function getNGODetailsUrl() external view returns (string memory) {
        return ngoDetailsUrl;
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
    }
}