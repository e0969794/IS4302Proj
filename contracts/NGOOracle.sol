// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


// Mock NGO Oracle
contract NGOOracle {
    mapping(address => bool) public approvedNGOs;
    mapping(address => string) public ngoDetails;

    event NGOApproved(address indexed ngo, string details);
    event NGOVerified(address indexed ngo, string details);
    event NGORejected(address indexed ngo);

    constructor() {
        // Simulate 3 verified NGOs 
        address ngo1 = 0x1111111111111111111111111111111111111111;
        address ngo2 = 0x2222222222222222222222222222222222222222;
        address ngo3 = 0x3333333333333333333333333333333333333333;

        approvedNGOs[ngo1] = true;
        approvedNGOs[ngo2] = true;
        approvedNGOs[ngo3] = true;

        ngoDetails[ngo1] = "Red Cross International - Humanitarian aid and disaster relief";
        ngoDetails[ngo2] = "Save the Children - Education and health programs for children";
        ngoDetails[ngo3] = "World Wildlife Fund - Environmental conservation and research";

        emit NGOApproved(ngo1, ngoDetails[ngo1]);
        emit NGOApproved(ngo2, ngoDetails[ngo2]);
        emit NGOApproved(ngo3, ngoDetails[ngo3]);
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