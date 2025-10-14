// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "./Proposal.sol";

interface ITreasury {
    function DAO_ADMIN() external view returns (bytes32);
}

contract ProposalManager is AccessControl {
    ITreasury public immutable treasury;
    uint256 public nextProposalId;
    address public admin;

    // proposalId -> proposalAddress
    mapping(uint256 => address) public proposals;
    // NGO address -> proposalIds
    mapping(address => uint256[]) public ngoProposals;

    event ProposalCreated(uint256 indexed proposalId, address proposalAddress, address ngo);

    constructor(address _admin, address treasury_) {
        admin = _admin;
        treasury = ITreasury(treasury_);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(treasury.DAO_ADMIN(), _admin);
        nextProposalId = 1;
    }

    function createProposal(
        uint256 totalFunds,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) external returns (address) {
        require(
            milestoneDescriptions.length == milestoneAmounts.length,
            "Mismatched milestones"
        );

        uint256 proposalId = nextProposalId;

        Proposal proposal = new Proposal(
            proposalId,
            msg.sender,
            address(treasury),
            totalFunds,
            milestoneDescriptions,
            milestoneAmounts,
            admin,
            address(this)
        );

        proposals[proposalId] = address(proposal);
        ngoProposals[msg.sender].push(proposalId);

        emit ProposalCreated(proposalId, address(proposal), msg.sender);
        nextProposalId++;

        return address(proposal);
    }

    function getProposalsByNGO(address ngo) external view returns (uint256[] memory) {
        return ngoProposals[ngo];
    }



    function getAllProjects() external view returns (address[] memory) {
        uint256 count = nextProposalId - 1;
        
        address[] memory allProjects = new address[](count);
        for (uint256 i = 1; i <= count; i++) {
            allProjects[i-1] = proposals[i];
        }
        return allProjects;
    }

    function isProposalApproved(uint256 proposalId) external view returns (bool) {
        address proposalAddr = proposals[proposalId];
        if (proposalAddr == address(0)) return false;
        return true; // All proposals are automatically approved for voting
    }

    function getProposal(uint256 proposalId) external view returns (address) {
        return proposals[proposalId];
    }
}
