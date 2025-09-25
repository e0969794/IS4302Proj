// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Interfaces.sol";

contract NGOOracleMock {
    IGovernance public immutable governance;

    mapping(address => bool) public approvedNGOs;
    mapping(address => string) public ngoDetails;

    event NGOApproved(address indexed ngo, string details);

    constructor(IGovernance _governance) {
        governance = _governance;
    }

    modifier onlyGovernance() {
        require(msg.sender == address(governance) || msg.sender == governance.timelock(), "Only governance");
        _;
    }

    function approveNGO(address ngo, string memory details) external onlyGovernance {
        require(ngo != address(0), "Invalid NGO address");
        approvedNGOs[ngo] = true;
        ngoDetails[ngo] = details;
        emit NGOApproved(ngo, details);
    }
}
