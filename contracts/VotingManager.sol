// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGovToken {
    function balanceOf(address account) external view returns (uint256);
}

interface IProposalManager {
    struct Milestone {
        string description;
        uint256 amount;
    }
    struct Proposal {
        uint256 id; //0 means not active (expired/completed)
        address ngo;
        Milestone[] milestones;
    }
    function getProposal(uint256 proposalId) external view returns (Proposal memory);
}

interface ITreasury {
    function disburseMilestoneFunds(address payable ngo, uint256 amountWei) external;

    function getTokenBalance(address from) external view returns (uint256);

    function burnETH(address user, uint256 amount) external;
}

contract VotingManager is AccessControl, ReentrancyGuard {
    IProposalManager public immutable proposalManager;
    ITreasury public immutable treasury;

    mapping(uint256 => uint256) public proposalVotesMapping; //maps proposalId to the number of votes it has
    mapping(uint256 => uint) public nextMilestoneMapping; //maps proposalId to its next milestone
    mapping(uint256 => mapping(address => uint256)) public userVotes;

    event VoteCast(address indexed voter, uint256 indexed proposalId, bytes32 voteId, uint256 votes);
    event MilestoneUnlocked(uint256 indexed proposalId, uint256 milestoneIndex, uint256 amountReleased);

    constructor(
        address admin,
        address _proposalManager,
        address _treasury
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        proposalManager = IProposalManager(_proposalManager);
        treasury = ITreasury(_treasury);
    }

    function getProposalVotes(uint256 proposalId) external view returns (uint256) {
        return proposalVotesMapping[proposalId];
    }

    //called by anyone or called by vote function
    function _processProposal(uint256 proposalId) internal {
        uint256 currVotes = proposalVotesMapping[proposalId];
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);
        uint nextMilestone = nextMilestoneMapping[proposalId];
        if (currVotes >= p.milestones[nextMilestone].amount) { //strict assumption that there milestones are hit one at a time 
            //calculate tokens needed (curr amount - prev amount)
            uint256 tokenAmount;
            if (nextMilestone > 0) {
                tokenAmount = p.milestones[nextMilestone].amount - p.milestones[nextMilestone-1].amount;
            } else {
                tokenAmount = p.milestones[nextMilestone].amount;
            }
            _disburseMilestoneFunds(payable (p.ngo), tokenAmount);

            emit MilestoneUnlocked(
            proposalId,
            nextMilestone,
            tokenAmount);

            nextMilestoneMapping[proposalId]++;     


            emit MilestoneUnlocked(proposalId, nextMilestone, tokenAmount);
        }
        
    }

    function getNextMilestone(uint256 proposalId, uint256 currVotes) external view returns (uint) {
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);

        uint currIndex = 0;
        while (currIndex < p.milestones.length) {
            if (currVotes > p.milestones[currIndex].amount) {
                currIndex++;
            } else {
                return currIndex;
            }
        }
        return currIndex;
    }
    function vote(uint256 proposalId, uint256 newVotes) external nonReentrant {
        require(newVotes > 0, "Must cast at least 1 vote");

        bytes32 voteId = keccak256(abi.encode(msg.sender, block.number, newVotes)); 
        uint256 previousVotes = userVotes[proposalId][msg.sender];
        uint256 totalVotes = previousVotes + newVotes;

        uint256 tokensRequired = totalVotes * totalVotes - previousVotes * previousVotes;

        require(treasury.getTokenBalance(msg.sender) >= tokensRequired, "Insufficient credits");

        treasury.burnETH(msg.sender, tokensRequired);

        userVotes[proposalId][msg.sender] = totalVotes;
        //dont need to check if it doesnt exist because by default it is 0
        proposalVotesMapping[proposalId] += newVotes;
        emit VoteCast(msg.sender, proposalId, voteId, newVotes);
        _processProposal(proposalId);
    }   


    function _disburseMilestoneFunds(address payable ngo, uint256 tokenAmount) internal {
        treasury.disburseMilestoneFunds(ngo, tokenAmount);
    }

}