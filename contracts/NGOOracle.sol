// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Mock NGO Oracle
contract NGOOracle {
    mapping(address => bool) public approvedNGOs;
    mapping(address => string) public ngoDetails;

    event NGOApproved(address indexed ngo, string details);
    event NGOVerified(address indexed ngo, string details);
    event NGORejected(address indexed ngo);

    constructor(address[] memory ngoAddresses, string[] memory ngoDetailsArray) {
        require(ngoAddresses.length == ngoDetailsArray.length, "Arrays length mismatch");
        for (uint256 i = 0; i < ngoAddresses.length; i++) {
            approvedNGOs[ngoAddresses[i]] = true;
            ngoDetails[ngoAddresses[i]] = ngoDetailsArray[i];
            emit NGOApproved(ngoAddresses[i], ngoDetailsArray[i]);
        }
    }

    function verifyNGO(address ngo) external returns (bool) {
        if (approvedNGOs[ngo]) {
            emit NGOVerified(ngo, ngoDetails[ngo]);
        } else {
            emit NGORejected(ngo);
        }
        return approvedNGOs[ngo];
    }
}