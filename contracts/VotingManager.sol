// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

//import "hardhat/console.sol";

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
        uint256 creation_date;
    }
    function getProposal(uint256 proposalId) external view returns (Proposal memory);
    function getAllProposals() external view returns (Proposal[] memory);
    function killProposal(uint256 proposalId) external;
    function proposalExists(uint256 proposalId) external view returns (bool);
    function getMilestoneStatus(uint256 proposalId, uint256 milestoneIndex) external view returns (bool);
    function getMilestoneReleaseStatus(uint256 proposalId, uint256 milestoneIndex) external view returns (bool);
    function updateMilestoneReleaseStatus(uint256 proposalId, uint256 milestoneIndex) external;
}

interface ITreasury {
    function disburseMilestoneFunds(address payable ngo, uint256 tokenAmount) external;

    function getTokenBalance(address from) external view returns (uint256);

    function burnETH(address user, uint256 amount) external;
    
    function mintRate() external view returns (uint256);
}

contract VotingManager is AccessControl, ReentrancyGuard {
    IProposalManager public immutable proposalManager;
    ITreasury public immutable treasury;

    mapping(uint256 => uint256) public proposalVotesMapping; //maps proposalId to the number of votes it has
    mapping(uint256 => uint) public nextMilestoneMapping; //maps proposalId to its next milestone
    mapping(uint256 => mapping(address => uint256)) public userVotes;

    // Voter reputation tracking
    mapping(address => uint256) public voterTotalSessions; // Total number of voting sessions
    mapping(address => uint256) public voterUniqueProposals; // Number of unique proposals voted on
    mapping(address => mapping(uint256 => bool)) public voterProposalHistory; // Track which proposals a voter has voted on
    mapping(address => uint256) public voterLastVoteTimestamp; // Last time voter participated
    mapping(address => uint256) public voterFirstVoteTimestamp; // First time voter participated
    mapping(address => uint256) public voterTotalVotesCast; // Total votes cast across all proposals (to detect whales)

    event VoteCast(address indexed voter, uint256 indexed proposalId, bytes32 voteId, uint256 votes, uint256 tokensCost);
    event DisburseMilestone(uint256 indexed proposalId, uint256 milestoneIndex, uint256 amountReleased);
    event MilestoneUnlocked(uint256 indexed proposalId, uint256 milestoneIndex);
    event VoterReputationUpdated(address indexed voter, uint256 totalSessions, uint256 uniqueProposals);

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

    /**
     * @notice Get voter reputation information
     * @param voter The address of the voter
     * @return tier The reputation tier (0 = none, 1 = good, 2 = very good)
     * @return sessions Total voting sessions
     * @return uniqueProposals Number of unique proposals voted on
     * @return daysActive Number of days between first and last vote
     * @return avgVotesPerSession Average votes per session (whale detection)
     */
    function getVoterReputation(address voter) external view returns (
        uint256 tier, 
        uint256 sessions, 
        uint256 uniqueProposals,
        uint256 daysActive,
        uint256 avgVotesPerSession
    ) {
        tier = _getVoterReputationTier(voter);
        sessions = voterTotalSessions[voter];
        uniqueProposals = voterUniqueProposals[voter];
        
        // Calculate days active
        if (voterFirstVoteTimestamp[voter] > 0) {
            daysActive = (voterLastVoteTimestamp[voter] - voterFirstVoteTimestamp[voter]) / 1 days;
        }
        
        // Calculate average votes per session (whale indicator)
        if (sessions > 0) {
            avgVotesPerSession = voterTotalVotesCast[voter] / sessions;
        }
    }

    /**
     * @notice Calculate the cost for a voter to cast votes on a proposal
     * @param proposalId The proposal to vote on
     * @param newVotes The number of votes to cast
     * @param voter The address of the voter
     * @return The token cost with any applicable reputation discount
     */
    function calculateVoteCost(uint256 proposalId, uint256 newVotes, address voter) external view returns (uint256) {
        uint256 previousVotes = userVotes[proposalId][voter];
        return _calculateVoteCost(previousVotes, newVotes, voter);
    }

    function _updateProposalAfterVote(uint256 proposalId) internal {
        uint256 currVotes = proposalVotesMapping[proposalId]; // Total votes
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);
        uint256 nextMilestone = nextMilestoneMapping[proposalId];

        uint256 nextMilestoneVotes;
        for (uint256 i = 0; i <= nextMilestone; i++) {
            nextMilestoneVotes += p.milestones[i].amount;
        }

        if (currVotes >= nextMilestoneVotes) { //strict assumption that there milestones are hit one at a time 
            uint256 tokenAmount;
            tokenAmount = p.milestones[nextMilestone].amount;

            nextMilestoneMapping[proposalId]++;
            _disburseMilestoneFunds(payable (p.ngo), tokenAmount);
            proposalManager.updateMilestoneReleaseStatus(proposalId, nextMilestone);
            emit DisburseMilestone(proposalId, nextMilestone, tokenAmount);
        }   
    }

    /**
     * @notice Modifier to check all voting conditions for the *next* milestone
     * @dev Checks proposal validity, completion, and the rule:
     * CANNOT VOTE if (prev milestone is released AND prev milestone is not verified)
     */
    modifier canVoteOnMilestone(uint256 proposalId) {
        // 1. Get the current milestone index we are voting for.
        uint256 nextMilestone = nextMilestoneMapping[proposalId];

        // 2. Check if the proposal is valid (active)
        require(_isProposalValid(proposalId), "Proposal not valid");

        // 3. Check if the proposal is already complete
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);
        require(nextMilestone < p.milestones.length, "Proposal already fully funded");

        // 4. Apply logic (only if we're past milestone 0)
        if (nextMilestone > 0) {
            uint256 prevMilestone = nextMilestone - 1;
            
            bool prevReleased = proposalManager.getMilestoneReleaseStatus(proposalId, prevMilestone);
            bool prevVerified = proposalManager.getMilestoneStatus(proposalId, prevMilestone);

            // This is the rule:
            // Revert if: (Previous is Released) AND (Previous is NOT Verified)
            require( !(prevReleased && !prevVerified), "Previous milestone released but not verified");
        }
        
        // All checks passed, allow the function to execute
        _;
    }

    function getNextMilestone(uint256 proposalId, uint256 currVotes) external view returns (uint) {

        require(_isProposalValid(proposalId), "proposal not valid");
        IProposalManager.Proposal memory p = proposalManager.getProposal(proposalId);

        uint256 cumulative = 0;
        for (uint256 i = 0; i < p.milestones.length; ) {
            cumulative += p.milestones[i].amount;
            if (currVotes < cumulative) {
                return i;
            }
        unchecked { ++i; }
        }
        return p.milestones.length;
    }
    /**
     * @notice Calculate the modified quadratic cost with reputation-based discount
     * @param previousVotes The number of votes the user has already cast on this proposal
     * @param newVotes The number of new votes to cast
     * @param voter The address of the voter
     * @return The token cost with reputation discount applied
     */
    function _calculateVoteCost(uint256 previousVotes, uint256 newVotes, address voter) internal view returns (uint256) {
        uint256 totalVotes = previousVotes + newVotes;
        
        // Standard quadratic cost without discount
        uint256 baseCost = totalVotes * totalVotes - previousVotes * previousVotes;
        
        // For single votes, no discount applies (maintains standard cost)
        if (totalVotes == 1) {
            return baseCost;
        }
        
        // Get voter reputation tier (0 = no reputation, 1 = good, 2 = very good)
        uint256 reputationTier = _getVoterReputationTier(voter);
        
        // No discount for voters without reputation
        if (reputationTier == 0) {
            return baseCost;
        }
        
        // Calculate discount factor based on reputation
        // Tier 1 (good voter): ~96% of base cost
        // Tier 2 (very good voter): ~92% of base cost
        uint256 discountedCost;
        
        if (reputationTier == 1) {
            // Good voter: reduce cost by ~4%
            // This makes n^2 effectively ~0.96*n^2
            discountedCost = (baseCost * 96) / 100;
        } else {
            // Very good voter: reduce cost by ~8%
            // This makes n^2 effectively ~0.92*n^2
            discountedCost = (baseCost * 92) / 100;
        }
        
        return discountedCost;
    }

    /**
     * @notice Determine voter reputation tier based on voting history AND time-based consistency
     * @param voter The address of the voter
     * @return 0 = no reputation, 1 = good voter, 2 = very good voter
     * 
     * Anti-whale measures:
     * - Requires minimum time span between first and last vote
     * - Penalizes users who cast too many votes per session (whale behavior)
     * - Rewards consistent participation over time
     * - Thresholds scale with mint rate (higher mint rate = higher vote thresholds)
     */
    function _getVoterReputationTier(address voter) internal view returns (uint256) {
        uint256 sessions = voterTotalSessions[voter];
        uint256 uniqueProposals = voterUniqueProposals[voter];
        uint256 totalVotes = voterTotalVotesCast[voter];
        
        // No reputation if no voting history
        if (sessions == 0) {
            return 0;
        }
        
        // Calculate time-based metrics
        uint256 firstVote = voterFirstVoteTimestamp[voter];
        uint256 lastVote = voterLastVoteTimestamp[voter];
        uint256 daysActive = firstVote > 0 ? (lastVote - firstVote) / 1 days : 0;
        
        // Calculate average votes per session (whale detection)
        uint256 avgVotesPerSession = totalVotes / sessions;
        
        // Get mint rate to scale thresholds
        // mintRate = tokens per ETH (e.g., 1 means 1 ETH = 1 token, 1000 means 1 ETH = 1000 tokens)
        uint256 mintRate = treasury.mintRate();
        
        // Scale thresholds based on mint rate
        // Base thresholds are for mintRate = 1
        // At mintRate = 1: whale = 10, tier2 = 5, tier1 = 7
        // At mintRate = 1000: whale = 10000, tier2 = 5000, tier1 = 7000
        uint256 whaleThreshold = 10 * mintRate;
        uint256 tier2MaxAvg = 5 * mintRate;
        uint256 tier1MaxAvg = 7 * mintRate;
        
        // WHALE DETECTION: If average votes per session is too high, likely a whale
        // Genuine users typically vote 1-5x mintRate votes per session
        // Whales dump 10x+ mintRate votes per session
        if (avgVotesPerSession > whaleThreshold) {
            return 0; // No discount for whale behavior
        }
        
        // TIER 2 Requirements (Very Good Voter - Not a Whale)
        // - 5+ sessions (frequency)
        // - 4+ unique proposals (diversity)
        // - Active for 7+ days (consistency over time)
        // - Average ≤ 5x mintRate votes per session (not whale dumping)
        if (sessions >= 5 && 
            uniqueProposals >= 4 && 
            daysActive >= 7 &&
            avgVotesPerSession <= tier2MaxAvg) {
            return 2;
        }
        
        // TIER 1 Requirements (Good Voter - Probably Not a Whale)
        // - 3+ sessions (frequency)
        // - 3+ unique proposals (diversity)
        // - Active for 3+ days (some consistency)
        // - Average ≤ 7x mintRate votes per session (moderate use)
        if (sessions >= 3 && 
            uniqueProposals >= 3 && 
            daysActive >= 3 &&
            avgVotesPerSession <= tier1MaxAvg) {
            return 1;
        }
        
        return 0;
    }

    /**
     * @notice Update voter reputation tracking after a vote
     * @param voter The address of the voter
     * @param proposalId The proposal being voted on
     * @param votesCast Number of votes cast in this session
     */
    function _updateVoterReputation(address voter, uint256 proposalId, uint256 votesCast) internal {
        // Set first vote timestamp if this is their first vote ever
        if (voterFirstVoteTimestamp[voter] == 0) {
            voterFirstVoteTimestamp[voter] = block.timestamp;
        }
        
        // Increment total sessions
        voterTotalSessions[voter]++;
        
        // Track total votes cast (for whale detection)
        voterTotalVotesCast[voter] += votesCast;
        
        // Track unique proposal if this is first time voting on it
        if (!voterProposalHistory[voter][proposalId]) {
            voterProposalHistory[voter][proposalId] = true;
            voterUniqueProposals[voter]++;
        }
        
        // Update last vote timestamp
        voterLastVoteTimestamp[voter] = block.timestamp;
        
        emit VoterReputationUpdated(voter, voterTotalSessions[voter], voterUniqueProposals[voter]);
    }

    function vote(uint256 proposalId, uint256 newVotes) external nonReentrant canVoteOnMilestone(proposalId) {
        require(newVotes > 0, "Must cast at least 1 vote");

        bytes32 voteId = keccak256(abi.encode(msg.sender, block.number, newVotes)); 
        uint256 previousVotes = userVotes[proposalId][msg.sender];
        uint256 totalVotes = previousVotes + newVotes;

        // Calculate token cost with reputation-based discount (returns plain number)
        uint256 tokensRequired = _calculateVoteCost(previousVotes, newVotes, msg.sender);
        
        // Convert tokens to Wei (multiply by 10^18) for burning
        uint256 tokensRequiredInWei = tokensRequired * 1e18;

        require(treasury.getTokenBalance(msg.sender) >= tokensRequiredInWei, "Insufficient credits");

        treasury.burnETH(msg.sender, tokensRequiredInWei);

        userVotes[proposalId][msg.sender] = totalVotes;
        
        // Update voter reputation (pass newVotes for whale detection)
        _updateVoterReputation(msg.sender, proposalId, newVotes);
        
        //dont need to check if it doesnt exist because by default it is 0
        proposalVotesMapping[proposalId] += newVotes;
        emit VoteCast(msg.sender, proposalId, voteId, newVotes, tokensRequiredInWei);
        _updateProposalAfterVote(proposalId);
    }   


    function _disburseMilestoneFunds(address payable ngo, uint256 tokenAmount) internal {
        treasury.disburseMilestoneFunds(ngo, tokenAmount);
    }

    function cleanInvalidProposals() external {
        uint256[] memory ps = _getValidProposals();
        for (uint256 i = 0; i < ps.length; i++) {
            // Get milestone index
            uint256 nextMilestone = nextMilestoneMapping[ps[i]];
            if (nextMilestone == 0) nextMilestone = 1;

            IProposalManager.Proposal memory p = proposalManager.getProposal(ps[i]);

            uint256 sevenDaysLater = p.creation_date + (nextMilestone * 7 days);

            // Calculate end of that day (23:59:59 UTC)
            uint256 endOfDay = (sevenDaysLater / 1 days + 1) * 1 days - 1;

            if (block.timestamp > endOfDay) {
                proposalManager.killProposal(ps[i]);
            }
        }
    }

    function getValidProposals() external view returns (uint256[] memory){
        return _getValidProposals();
    }

    function _getValidProposals() internal view returns (uint256[] memory) {
        IProposalManager.Proposal[] memory ps = proposalManager.getAllProposals();
        
        // First pass: count valid proposals
        uint256 count = 0;
        for (uint256 i = 0; i < ps.length; i++) {
            if (ps[i].id != 0) {
                count++;
            }
        }
        
        // Second pass: fill array with valid proposal indices
        uint256[] memory validProposalIndexes = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < ps.length; i++) {

            if (ps[i].id != 0) {
                validProposalIndexes[index] = ps[i].id;
                index++;
            }
        }
        return validProposalIndexes;
    }


    function _isProposalValid(uint256 id) internal view returns (bool) {
        return (proposalManager.proposalExists(id));
    }
}