// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

// NGOOracle contract for managing and verifying approved NGOs in the charity DAO
contract NGOOracle is AccessControl {
    // Mapping to track whether an address is an approved NGO
    mapping(address => bool) public approvedNGOs;
    // Single IPFS URL (e.g., ipfs://<CID>) pointing to a JSON file with all NGO details
    // JSON format:
    // {"ngos":[{"address":"0xNGO1",
    // "name":"NGO1","description":"Charity","registrationId":"123"},...]}
    string public ngoDetailsURL;

    // Event emitted when the NGO whitelist is updated with a new IPFS JSON URL
    event NGOWhitelistUpdated(string ipfsURL, uint256 timestamp);
    // Event emitted when an NGO is approved during initialization
    event NGOApproved(address indexed ngo, uint256 timestamp);
    // Event emitted when an NGO is verified as approved
    event NGOVerified(address indexed ngo, uint256 timestamp);
    // Event emitted when an NGO is rejected (not approved)
    event NGORejected(address indexed ngo, uint256 timestamp);

    /**
     * @notice Initializes the NGOOracle with a list of approved NGOs
     * @dev Expects ipfsURL to point to a JSON file on IPFS
     *      Uploaded by the DAO admin via Pinata
     * @param ngoAddresses Array of NGO addresses to approve
     * @param ipfsURL IPFS URL pointing to the JSON file with NGO details
     */
    constructor(address[] memory ngoAddresses, string memory ipfsURL) {
        // Validate inputs
        require(bytes(ipfsURL).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsURL), "Invalid IPFS URL format");
        for (uint256 i = 0; i < ngoAddresses.length; i++) {
            require(ngoAddresses[i] != address(0), "Invalid NGO address");
        }

        // Temporary grant admin role to deployer (transfer to multi-sig post-deployment)
        // Admin who can approve/revoke NGOs and set IPFS URLs
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Approve NGOs and set IPFS URL
        for (uint256 i = 0; i < ngoAddresses.length; i++) {
            approvedNGOs[ngoAddresses[i]] = true;
            emit NGOApproved(ngoAddresses[i], block.timestamp);
        }
        ngoDetailsURL = ipfsURL;
        emit NGOWhitelistUpdated(ipfsURL, block.timestamp);
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
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     *      Admin must upload a new JSON file to Pinata including the new NGO
     * @param ngo Address of the NGO to approve
     * @param ipfsURL New IPFS URL for the updated JSON file
     */
    function approveNGO(address ngo, string memory ipfsURL) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(ngo != address(0), "Invalid NGO address");
        require(!approvedNGOs[ngo], "NGO already approved");
        require(bytes(ipfsURL).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsURL), "Invalid IPFS URL format");

        approvedNGOs[ngo] = true;
        ngoDetailsURL = ipfsURL;
        emit NGOApproved(ngo, block.timestamp);
        emit NGOWhitelistUpdated(ipfsURL, block.timestamp);
    }

    /**
     * @notice Revokes an NGO's approval and updates the IPFS JSON URL
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     *      Admin must upload a new JSON file to Pinata excluding the revoked NGO
     * @param ngo Address of the NGO to revoke
     * @param ipfsURL New IPFS URL for the updated JSON file
     */
    function revokeNGO(address ngo, string memory ipfsURL) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(ngo != address(0), "Invalid NGO address");
        require(approvedNGOs[ngo], "NGO not approved");
        require(bytes(ipfsURL).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsURL), "Invalid IPFS URL format");

        approvedNGOs[ngo] = false;
        ngoDetailsURL = ipfsURL;
        emit NGORejected(ngo, block.timestamp);
        emit NGOWhitelistUpdated(ipfsURL, block.timestamp);
    }

    /**
     * @notice Updates the IPFS JSON URL without changing approvals
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     *      Useful for updating NGO details without changing the whitelist
     * @param ipfsURL New IPFS URL for the JSON file
     */
    function updateNGODetailsURL(string memory ipfsURL) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(ipfsURL).length > 0, "Empty IPFS URL");
        require(isValidIPFSURL(ipfsURL), "Invalid IPFS URL format");
        ngoDetailsURL = ipfsURL;
        emit NGOWhitelistUpdated(ipfsURL, block.timestamp);
    }

    /**
     * @notice Retrieves the IPFS URL for the JSON file containing all NGO details
     * @return The IPFS URL (e.g., ipfs://<CID>)
     */
    function getNGODetailsURL() external view returns (string memory) {
        return ngoDetailsURL;
    }
}