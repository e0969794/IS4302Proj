// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface ITreasury {
    function TREASURY_ADMIN() external view returns (bytes32);
}

contract ProposalManager is AccessControl {
    ITreasury public immutable treasury;
    bytes32 public constant PROPOSAL_MANAGER_ADMIN = keccak256("PROPOSAL_MANAGER_ADMIN");
    bytes32 public constant PROOF_ORACLE = keccak256("PROOF_ORACLE");
    address public admin;
    uint256 public nextProposalId;

    struct Milestone {
        string description;
        uint256 amount;
        bool completed;
        bool released;
        bytes32 proofHash;
    }

    struct Proposal {
        uint256 id;
        address ngo;
        uint256 totalFunds;
        uint256 fundsDisbursed;
        Milestone[] milestones;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256[]) public ngoProposals;

    event ProposalCreated(uint256 indexed proposalId, address indexed ngo);
    event MilestoneVerified(uint256 indexed proposalId, uint256 milestoneIndex);
    event MilestoneCompleted(uint256 indexed proposalId, uint256 milestoneIndex);

    constructor(address _admin, address _treasury) {
        require(_admin != address(0), "Invalid admin address");
        admin = _admin;
        treasury = ITreasury(_treasury);
        nextProposalId = 1;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PROPOSAL_MANAGER_ADMIN, _admin);
    }

    function createProposal(
        uint256 totalFunds,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) external returns (uint256) {
        require(
            milestoneDescriptions.length == milestoneAmounts.length,
            "Mismatched milestones"
        );

        uint256 proposalId = nextProposalId++;

        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.ngo = msg.sender;
        p.totalFunds = totalFunds;

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            p.milestones.push(
                Milestone({
                    description: milestoneDescriptions[i],
                    amount: milestoneAmounts[i],
                    completed: false,
                    released: false,
                    proofHash: bytes32(0)
                })
            );
        }

        ngoProposals[msg.sender].push(proposalId);
        emit ProposalCreated(proposalId, msg.sender);

        return proposalId;
    }

    function getMilestone(uint256 proposalId, uint256 index)
        external
        view
        returns (string memory, uint256, bool, bool)
    {
        Milestone storage m = proposals[proposalId].milestones[index];
        return (m.description, m.amount, m.completed, m.released);
    }

    function _verifyMilestone(uint256 proposalId, uint256 index, bytes32 proofHash) 
        external
        onlyRole(PROOF_ORACLE) {
            Proposal storage p = proposals[proposalId]; 
            require(index < p.milestones.length, "Invalid milestone index");

            Milestone storage m = p.milestones[index]; 
            require(!m.completed, "Already verified");
            require(m.proofHash == bytes32(0), "Already contains a proof");

            m.proofHash = proofHash;
            m.completed = true;

            emit MilestoneVerified(proposalId, index);
        }

    function getAllProjects() external view returns (Proposal[] memory) {
        Proposal[] memory all = new Proposal[](nextProposalId - 1);
        for (uint256 i = 1; i < nextProposalId; i++) {
            all[i - 1] = proposals[i];
        }
        return all;
    }

    function getProposalsByNGO(address ngo)
        external
        view
        returns (uint256[] memory)
    {
        return ngoProposals[ngo];
    }

    //Edit this
    function getProposal(uint256 proposalId) external view returns (address) {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "Proposal does not exist");
        return p.ngo;
    }

    function getDAOAdmin() external view returns (bytes32) {
        require(address(treasury) != address(0), "Treasury not set");
        return treasury.TREASURY_ADMIN();
    }
}
