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
    function disburseMilestoneFunds(address payable ngo, uint256 tokenAmount) external;

    function getTokenBalance(address from) external view returns (uint256);

    function burnETH(address user, uint256 amount) external;
}

contract VotingManager is AccessControl, ReentrancyGuard {
    IProposalManager public immutable proposalManager;
    ITreasury public immutable treasury;

    mapping(uint256 => uint256) public proposalVotesMapping; //maps proposalId to the number of votes it has
    mapping(uint256 => uint) public nextMilestoneMapping; //maps proposalId to its next milestone
    mapping(uint256 => mapping(address => uint256)) public userVotes;

    // Reputation system storage
    struct UserReputation {
        uint256 totalVotes;              // Lifetime votes cast
        uint256 proposalsVotedOn;        // Number of unique proposals voted on
        uint256 firstVoteTimestamp;      // When user first participated
        uint256 lastVoteTimestamp;       // Most recent activity
        uint256 consecutiveActivePeriods; // Consecutive active periods
    }

    mapping(address => UserReputation) public userReputation;
    mapping(address => mapping(uint256 => bool)) public hasVotedOnProposal; // user -> proposalId -> voted
    
    // Reputation constants
    uint256 public constant ACTIVE_PERIOD = 30 days; // Define active period
    uint256 public constant MIN_PARTICIPATION_PERIOD = 90 days; // Minimum time for reputation
    uint256 public constant MAX_REPUTATION_DISCOUNT = 25; // Maximum 25% discount

    event VoteCast(address indexed voter, uint256 indexed proposalId, bytes32 voteId, uint256 votes);
    event MilestoneUnlocked(uint256 indexed proposalId, uint256 milestoneIndex, uint256 amountReleased);
    event ReputationUpdated(address indexed user, uint256 newReputationDiscount);

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

    // Reputation calculation functions
    function _getReputationDiscount(address user) internal view returns (uint256) {
        UserReputation memory rep = userReputation[user];
        
        // No discount for new users (less than 90 days participation)
        if (rep.firstVoteTimestamp == 0 || 
            block.timestamp - rep.firstVoteTimestamp < MIN_PARTICIPATION_PERIOD) {
            return 0;
        }
        
        uint256 discount = 0;
        
        // 1. Long-term participation reward (max 10% discount)
        // Based on time since first vote (linear growth up to 12 months)
        uint256 participationMonths = (block.timestamp - rep.firstVoteTimestamp) / (30 days);
        uint256 timeDiscount = participationMonths >= 12 ? 10 : (participationMonths * 10) / 12;
        discount += timeDiscount;
        
        // 2. Diversity incentive (max 10% discount) 
        // Rewards voting on many different proposals
        uint256 diversityDiscount = rep.proposalsVotedOn >= 20 ? 10 : (rep.proposalsVotedOn * 10) / 20;
        discount += diversityDiscount;
        
        // 3. Consistency reward (max 5% discount)
        // Rewards consecutive active periods
        uint256 consistencyDiscount = rep.consecutiveActivePeriods >= 10 ? 5 : (rep.consecutiveActivePeriods * 5) / 10;
        discount += consistencyDiscount;
        
        // Penalty for recent inactivity (halve discount if inactive for 2+ periods)
        if (block.timestamp - rep.lastVoteTimestamp > ACTIVE_PERIOD * 2) {
            discount = discount / 2;
        }
        
        // Cap at maximum discount
        return discount > MAX_REPUTATION_DISCOUNT ? MAX_REPUTATION_DISCOUNT : discount;
    }

    function _updateReputation(address user, uint256 proposalId, uint256 newVotes) internal {
        UserReputation storage rep = userReputation[user];
        
        // Initialize first vote timestamp
        if (rep.firstVoteTimestamp == 0) {
            rep.firstVoteTimestamp = block.timestamp;
        }
        
        // Track unique proposals voted on
        if (!hasVotedOnProposal[user][proposalId]) {
            hasVotedOnProposal[user][proposalId] = true;
            rep.proposalsVotedOn++;
        }
        
        // Update consecutive active periods
        bool wasRecentlyActive = rep.lastVoteTimestamp > 0 && 
            (block.timestamp - rep.lastVoteTimestamp) <= ACTIVE_PERIOD;
        
        if (wasRecentlyActive || rep.lastVoteTimestamp == 0) {
            rep.consecutiveActivePeriods++;
        } else {
            rep.consecutiveActivePeriods = 1; // Reset if there was a gap
        }
        
        // Update activity tracking
        rep.totalVotes += newVotes;
        rep.lastVoteTimestamp = block.timestamp;
        
        // Emit reputation update event
        uint256 currentDiscount = _getReputationDiscount(user);
        emit ReputationUpdated(user, currentDiscount);
    }

    // Public view functions for reputation system
    function getReputationDiscount(address user) external view returns (uint256) {
        return _getReputationDiscount(user);
    }

    function getUserReputation(address user) external view returns (UserReputation memory) {
        return userReputation[user];
    }

    //called by anyone or called by vote function
    function _processProposal(uint256 proposalId) internal {
        uint256 currVotes = proposalVotesMapping[proposalId];
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);
        uint nextMilestone = nextMilestoneMapping[proposalId];
        
        // Add boundary check to prevent array out of bounds
        if (nextMilestone >= p.milestones.length) {
            return; // All milestones completed
        }
        
        if (currVotes >= p.milestones[nextMilestone].amount) { //strict assumption that there milestones are hit one at a time 
            //calculate tokens needed (curr amount - prev amount)
            uint256 tokenAmount;
            if (nextMilestone > 0) {
                tokenAmount = p.milestones[nextMilestone].amount - p.milestones[nextMilestone-1].amount;
            } else {
                tokenAmount = p.milestones[nextMilestone].amount;
            }
            _disburseMilestoneFunds(payable (p.ngo), tokenAmount);
            nextMilestoneMapping[proposalId]++;     

            emit MilestoneUnlocked(proposalId, nextMilestone, tokenAmount);
        }
        
    }

    function getNextMilestone(uint256 proposalId, uint256 currVotes) external view returns (uint) {
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);

        uint currIndex = 0;
        while (currIndex < p.milestones.length) {
            if (currVotes >= p.milestones[currIndex].amount) {
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

        // Calculate base quadratic cost
        uint256 baseTokensRequired = totalVotes * totalVotes - previousVotes * previousVotes;
        
        // Apply reputation discount
        uint256 reputationDiscount = _getReputationDiscount(msg.sender);
        uint256 tokensRequired = (baseTokensRequired * (100 - reputationDiscount)) / 100;

        require(treasury.getTokenBalance(msg.sender) >= tokensRequired, "Insufficient credits");

        treasury.burnETH(msg.sender, tokensRequired);

        // Update reputation tracking
        _updateReputation(msg.sender, proposalId, newVotes);

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