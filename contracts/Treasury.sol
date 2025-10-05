// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "./Proposal.sol";

interface IGovToken {
    function mintOnDonation(address to, uint256 amount, bytes32 donationId) external;
    function MINTER_ROLE() external view returns (bytes32);
    function balanceOf(address account) external view returns (uint256);
}

contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant DAO_ADMIN = DEFAULT_ADMIN_ROLE;
    IGovToken public immutable gov;

    uint256 public mintRate; // GOV tokens per wei (e.g. 1e18 => 1 ETH = 1 GOV)
    uint256 public nextProposalId;

    mapping(uint256 => address) public proposals;
    mapping(address => uint256[]) public ngoProposals;

    event DonationReceived(address indexed donor, uint256 amountETH, uint256 tokens, bytes32 donationId);
    event MintRateUpdated(uint256 newRate);
    event ProposalCreated(uint256 indexed proposalId, address proposalAddress, address ngo);
    event ProposalApproved(uint256 indexed proposalId);

    constructor(address admin, address govToken, uint256 initialRate) {
        _grantRole(DAO_ADMIN, admin);
        gov = IGovToken(govToken);
        mintRate = initialRate;
        nextProposalId = 1;
    }

    function getGovTokenBalance() external view returns (uint256) {
        return gov.balanceOf(msg.sender);
    }

    function setMintRate(uint256 newRate) external onlyRole(DAO_ADMIN) {
        mintRate = newRate;
        emit MintRateUpdated(newRate);
    }

    function donateETH() external payable nonReentrant {
        _donate();
    }

    function _donate() internal {
        require(msg.value > 0, "zero ETH");
        require(mintRate > 0, "mintRate=0");

        uint256 mintAmount = msg.value * mintRate / 1e18; // Scale to get 1 GOV per 1 ETH
        bytes32 donationId = keccak256(abi.encode(msg.sender, block.number, msg.value));

        gov.mintOnDonation(msg.sender, mintAmount, donationId);

        emit DonationReceived(msg.sender, msg.value, mintAmount, donationId);
        // ETH stays in contract for later disbursement
    }

    function createProposal(uint256 totalFunds, string[] memory milestoneDescriptions, uint256[] memory milestoneAmounts)
    external returns (address) {
        require(milestoneDescriptions.length == milestoneAmounts.length, "Mismatched milestones");

        uint256 proposalId = nextProposalId;
        Proposal proposal = new Proposal(
            proposalId,
            msg.sender,       
            address(this),   
            totalFunds,      
            milestoneDescriptions,
            milestoneAmounts
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

    function getAllProposals() external view returns (uint256[] memory) {
        if (nextProposalId == 1) {
            return new uint256[](0); // Return empty array if no proposals
        }
        uint256[] memory allProposals = new uint256[](nextProposalId - 1);
        for (uint256 i = 0; i < nextProposalId - 1; i++) {
            allProposals[i] = i + 1; // IDs start at 1
        }
        return allProposals;
    }

    function approveProposal(uint256 proposalId) external onlyRole(DAO_ADMIN) {
        address proposalAddr = proposals[proposalId];
        require(proposalAddr != address(0), "Proposal does not exist");
        Proposal(payable(proposalAddr)).approveProposal();

        emit ProposalApproved(proposalId);
    }

    // function disburseMilestoneFunds(uint256 proposalId, uint index) external onlyRole(DAO_ADMIN) {
    //     address proposalAddr = proposals[proposalId];
    //     Proposal proposal = Proposal(payable(proposalAddr));
    //     proposal.releaseFunds(index);
    // }   
}
