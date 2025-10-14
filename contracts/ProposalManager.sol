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
    event ProposalApproved(uint256 indexed proposalId, address approver);

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

    function approveProposal(uint256 proposalId) external onlyRole(treasury.DAO_ADMIN()) {
        address proposalAddr = proposals[proposalId];
        require(proposalAddr != address(0), "Proposal does not exist");

        Proposal(payable(proposalAddr)).approveProposal();

        emit ProposalApproved(proposalId, msg.sender);
    }

    function getApprovedProjects() external view returns (address[] memory) {
        uint256 count = nextProposalId - 1;
        uint256 approvedCount;
        for (uint256 i = 1; i <= count; i++) {
            if (Proposal(payable(proposals[i])).isApproved()) approvedCount++;
        }

        address[] memory approvedProjects = new address[](approvedCount);
        uint256 idx = 0;
        for (uint256 i = 1; i <= count; i++) {
            if (Proposal(payable(proposals[i])).isApproved()) {
                approvedProjects[idx++] = proposals[i];
            }
        }
        return approvedProjects;
    }

    function isProposalApproved(uint256 proposalId) external view returns (bool) {
        address proposalAddr = proposals[proposalId];
        if (proposalAddr == address(0)) return false;
        return Proposal(payable(proposalAddr)).isApproved();
    }

    function getProposal(uint256 proposalId) external view returns (address) {
        return proposals[proposalId];
    }
}
