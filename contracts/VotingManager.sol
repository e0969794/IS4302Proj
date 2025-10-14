// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// System Flow:
// 1. Donors receive GOV tokens when donating ETH
// 2. Users vote on approved proposals using quadratic cost
// 3. Milestones unlock automatically when vote thresholds are met
// 4. Funds transfer directly from Treasury to NGO addresses
// 5. Credits are spent and tracked across all proposals

interface IGovToken {
    function balanceOf(address account) external view returns (uint256);
}

interface IProposalManager {
    function isProposalApproved(uint256 proposalId) external view returns (bool);
    function getProposal(uint256 proposalId) external view returns (address);
}

interface IProposal {
    function getNgoAddress() external view returns (address);
    function getMilestone(uint256 index) external view returns (string memory description, uint256 amount, bool completed, bool released);
    function getMilestoneCount() external view returns (uint256);
    function markMilestoneCompleted(uint256 index) external;
}

interface ITreasury {
    function transferFunds(address recipient, uint256 amount) external;
}

contract VotingManager is AccessControl, ReentrancyGuard {
    bytes32 public constant DAO_ADMIN = keccak256("DAO_ADMIN");
    
    IGovToken public immutable govToken;
    IProposalManager public immutable proposalManager;
    ITreasury public immutable treasury;

    struct Vote {
        uint256 votes;           // Number of votes cast
        uint256 creditsSpent;    // Quadratic credits spent
    }

    struct ProposalVoting {
        uint256 totalVotes;                                    // Total votes received
        mapping(address => Vote) userVotes;                    // User's votes on this proposal
        mapping(uint256 => bool) milestoneUnlocked;           // Which milestones are unlocked
        uint256 lastProcessedMilestone;                       // Last milestone we checked
    }

    // proposalId => ProposalVoting
    mapping(uint256 => ProposalVoting) public proposalVotes;
    
    // user => total credits spent across all proposals
    mapping(address => uint256) public totalCreditsSpent;

    event VoteCast(address indexed voter, uint256 indexed proposalId, uint256 votes, uint256 creditsSpent);
    event MilestoneUnlocked(uint256 indexed proposalId, uint256 milestoneIndex, uint256 amountReleased);
    event FundsReleased(uint256 indexed proposalId, uint256 milestoneIndex, address indexed ngo, uint256 amount);

    constructor(
        address admin,
        address _govToken,
        address _proposalManager,
        address _treasury
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DAO_ADMIN, admin);
        
        govToken = IGovToken(_govToken);
        proposalManager = IProposalManager(_proposalManager);
        treasury = ITreasury(_treasury);
    }

    /**
     * @dev Calculate available voting credits for a user
     * Credits = current GOV token balance - credits already spent
     */
    function getAvailableCredits(address user) public view returns (uint256) {
        uint256 totalCredits = govToken.balanceOf(user);
        uint256 spent = totalCreditsSpent[user];
        return totalCredits >= spent ? totalCredits - spent : 0;
    }

    /**
     * @dev Get user's current votes on a proposal
     */
    function getUserVotes(uint256 proposalId, address user) external view returns (uint256 votes, uint256 creditsSpent) {
        Vote memory userVote = proposalVotes[proposalId].userVotes[user];
        return (userVote.votes, userVote.creditsSpent);
    }

    /**
     * @dev Get total votes for a proposal
     */
    function getProposalVotes(uint256 proposalId) external view returns (uint256) {
        return proposalVotes[proposalId].totalVotes;
    }

    /**
     * @dev Check if a milestone is unlocked
     */
    function isMilestoneUnlocked(uint256 proposalId, uint256 milestoneIndex) external view returns (bool) {
        return proposalVotes[proposalId].milestoneUnlocked[milestoneIndex];
    }

    /**
     * @dev Cast votes on a proposal using quadratic voting
     * @param proposalId The proposal to vote on
     * @param additionalVotes Additional votes to cast (on top of existing votes)
     */
    function vote(uint256 proposalId, uint256 additionalVotes) external nonReentrant {
        require(additionalVotes > 0, "Must cast at least 1 vote");
        require(proposalManager.getProposal(proposalId) != address(0), "Proposal does not exist");
        
        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        Vote storage userVote = proposalVoting.userVotes[msg.sender];
        
        // Calculate new total votes for this user on this proposal
        uint256 newTotalVotes = userVote.votes + additionalVotes;
        
        // Calculate quadratic cost for new total votes
        uint256 newTotalCredits = newTotalVotes * newTotalVotes;
        uint256 additionalCredits = newTotalCredits - userVote.creditsSpent;
        
        // Check if user has enough available credits
        require(getAvailableCredits(msg.sender) >= additionalCredits, "Insufficient credits");
        
        // Update user's vote and credits
        userVote.votes = newTotalVotes;
        userVote.creditsSpent = newTotalCredits;
        
        // Update total votes for proposal
        proposalVotes[proposalId].totalVotes += additionalVotes;
        
        // Update user's total credits spent
        totalCreditsSpent[msg.sender] += additionalCredits;
        
        emit VoteCast(msg.sender, proposalId, additionalVotes, additionalCredits);
        
        // Check and process any newly unlocked milestones
        _processMilestones(proposalId);
    }

    /**
     * @dev Internal function to check and unlock milestones based on vote thresholds
     */ 
    function _processMilestones(uint256 proposalId) internal {
        address proposalAddr = proposalManager.getProposal(proposalId);
        require(proposalAddr != address(0), "Proposal not found");
        
        IProposal proposal = IProposal(proposalAddr);
        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        
        uint256 milestoneCount = proposal.getMilestoneCount();
        uint256 currentVotes = proposalVoting.totalVotes;
        
        // Check milestones starting from the last processed one
        for (uint256 i = proposalVoting.lastProcessedMilestone; i < milestoneCount; i++) {
            if (proposalVoting.milestoneUnlocked[i]) {
                continue; // Skip already unlocked milestones
            }
            
            (, uint256 milestoneAmount,,) = proposal.getMilestone(i);
            
            // Simple threshold: each milestone requires votes equal to its funding amount in wei / 1e14
            // This creates reasonable thresholds (e.g., 100k funding = 1e18 wei = 10,000 votes needed)
            uint256 requiredVotes = milestoneAmount / 1e14;
            
            if (currentVotes >= requiredVotes) {
                // Unlock milestone
                proposalVoting.milestoneUnlocked[i] = true;
                
                // Mark milestone as completed in the proposal
                proposal.markMilestoneCompleted(i);
                
                // Release funds directly to NGO via Treasury
                address ngoAddress = proposal.getNgoAddress();
                require(ngoAddress != address(0), "Invalid NGO address");
                
                // Transfer funds from treasury
                treasury.transferFunds(ngoAddress, milestoneAmount);
                
                emit MilestoneUnlocked(proposalId, i, milestoneAmount);
                emit FundsReleased(proposalId, i, ngoAddress, milestoneAmount);
                
                proposalVoting.lastProcessedMilestone = i + 1;
            } else {
                // If this milestone isn't unlocked, later ones won't be either
                break;
            }
        }
    }

    /**
     * @dev Emergency function to manually process milestones (admin only)
     */
    function processMilestones(uint256 proposalId) external onlyRole(DAO_ADMIN) {
        _processMilestones(proposalId);
    }

    /**
     * @dev Get milestone unlock status for a proposal
     */
    function getMilestoneStatus(uint256 proposalId) external view returns (
        uint256 totalVotes,
        uint256 milestonesUnlocked,
        uint256 totalMilestones
    ) {
        address proposalAddr = proposalManager.getProposal(proposalId);
        if (proposalAddr == address(0)) {
            return (0, 0, 0);
        }
        
        IProposal proposal = IProposal(proposalAddr);
        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        
        totalVotes = proposalVoting.totalVotes;
        totalMilestones = proposal.getMilestoneCount();
        
        for (uint256 i = 0; i < totalMilestones; i++) {
            if (proposalVoting.milestoneUnlocked[i]) {
                milestonesUnlocked++;
            }
        }
    }

    /**
     * @dev Get detailed voting information for a proposal
     */
    function getVotingDetails(uint256 proposalId) external view returns (
        uint256 totalVotes,
        uint256 totalMilestones,
        uint256[] memory milestoneThresholds,
        bool[] memory milestoneUnlocked
    ) {
        address proposalAddr = proposalManager.getProposal(proposalId);
        require(proposalAddr != address(0), "Proposal not found");
        
        IProposal proposal = IProposal(proposalAddr);
        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        
        totalVotes = proposalVoting.totalVotes;
        totalMilestones = proposal.getMilestoneCount();
        
        milestoneThresholds = new uint256[](totalMilestones);
        milestoneUnlocked = new bool[](totalMilestones);
        
        for (uint256 i = 0; i < totalMilestones; i++) {
            (, uint256 milestoneAmount,,) = proposal.getMilestone(i);
            milestoneThresholds[i] = milestoneAmount / 1e14;
            milestoneUnlocked[i] = proposalVoting.milestoneUnlocked[i];
        }
    }
}