// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGovToken {
    function balanceOf(address account) external view returns (uint256);
}

interface IProposalManager {
    function getProposal(uint256 proposalId) external view returns (address);
    function getMilestone(uint256 proposalId, uint256 index)
        external
        view
        returns (
            string memory description,
            uint256 amount,
            bool completed,
            bool released
        );
}

interface ITreasury {
    function queueTransfer(address recipient, uint256 amount, uint256 eta) external returns (uint256);
    function getMinDelay() external view returns (uint256);
}

contract VotingManager is AccessControl, ReentrancyGuard {
    bytes32 public constant VOTING_ADMIN = keccak256("VOTING_ADMIN");

    address public immutable timelock;
    IGovToken public immutable govToken;
    IProposalManager public immutable proposalManager;
    ITreasury public immutable treasury;

    struct Vote {
        uint256 votes;          // Number of votes cast
        uint256 creditsSpent;   // Quadratic credits spent
    }

    struct ProposalVoting {
        uint256 totalVotes;                             // Total votes received
        mapping(address => Vote) userVotes;             // User's votes on this proposal
        mapping(uint256 => bool) milestoneUnlocked;     // Which milestones are unlocked
        uint256 lastProcessedMilestone;                 // Last milestone we checked
    }

    mapping(uint256 => ProposalVoting) public proposalVotes;
    mapping(address => uint256) public totalCreditsSpent;
    mapping(bytes32 => uint256) public milestoneTimelockId;

    event VoteCast(address indexed voter, uint256 indexed proposalId, uint256 votes, uint256 creditsSpent);
    event MilestoneUnlocked(uint256 indexed proposalId, uint256 milestoneIndex, uint256 amountReleased, uint256 timelockId);
    event FundsQueued(uint256 indexed timelockId, uint256 indexed proposalId, uint256 milestoneIndex, address indexed ngo, uint256 amount);
    //event FundsReleased(uint256 indexed proposalId, uint256 milestoneIndex, address indexed ngo, uint256 amount);

    constructor(
        address admin,
        address _govToken,
        address _proposalManager,
        address _treasury,
        address _timelock
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VOTING_ADMIN, admin);

        govToken = IGovToken(_govToken);
        proposalManager = IProposalManager(_proposalManager);
        treasury = ITreasury(_treasury);
        timelock = _timelock;
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

        address ngoAddress = proposalManager.getProposal(proposalId);
        require(ngoAddress != address(0), "Proposal does not exist");

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
        proposalVoting.totalVotes += additionalVotes;

        // Update user's total credits spent
        totalCreditsSpent[msg.sender] += additionalCredits;

        emit VoteCast(msg.sender, proposalId, additionalVotes, additionalCredits);

        // Check and process any newly unlocked milestones
        _processMilestones(proposalId);
    }

    /**
     * @dev Get detailed voting information for a proposal
     */
    function getVotingDetails(uint256 proposalId)
        external
        view
        returns (
            uint256 totalVotes,
            uint256 totalMilestones,
            uint256[] memory milestoneThresholds,
            bool[] memory milestoneUnlocked,
            uint256[] memory milestoneTimelockIds
        )
    {
        address proposalAddr = proposalManager.getProposal(proposalId);
        require(proposalAddr != address(0), "Proposal not found");

        ProposalVoting storage proposalVoting = proposalVotes[proposalId];

        uint256 index = 0;
        while (true) {
            try proposalManager.getMilestone(proposalId, index) returns (
                string memory,
                uint256,
                bool,
                bool
            ) {
                index++;
            } catch {
                break;
            }
        }

        totalVotes = proposalVoting.totalVotes;
        totalMilestones = index;

        milestoneThresholds = new uint256[](totalMilestones);
        milestoneUnlocked = new bool[](totalMilestones);
        milestoneTimelockIds = new uint256[](totalMilestones);

        for (uint256 i = 0; i < totalMilestones; i++) {
            (, uint256 milestoneAmount,,) = proposalManager.getMilestone(proposalId, i);
            milestoneThresholds[i] = milestoneAmount / 1e14;
            milestoneUnlocked[i] = proposalVoting.milestoneUnlocked[i];
            milestoneTimelockIds[i] = milestoneTimelockId[keccak256(abi.encodePacked(proposalId, i))];
        }
    }

    /**
     * @dev Internal function to check and unlock milestones based on vote thresholds
     */ 
    function _processMilestones(uint256 proposalId) internal {
        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        address ngoAddress = proposalManager.getProposal(proposalId);
        require(ngoAddress != address(0), "Invalid NGO address");

        // get milestones starting from the last processed one
        uint256 milestoneIndex = proposalVoting.lastProcessedMilestone;

        while (true) {
            try proposalManager.getMilestone(proposalId, milestoneIndex) returns (
                string memory,
                uint256 milestoneAmount,
                bool,
                bool
            ) {
                if (proposalVoting.milestoneUnlocked[milestoneIndex]) {
                    milestoneIndex++;
                    continue;
                }

                // Simple threshold: each milestone requires votes equal to its funding amount in wei / 1e14
                // This creates reasonable thresholds (e.g., 100k funding = 1e18 wei = 10,000 votes needed)
                uint256 requiredVotes = milestoneAmount / 1e14;
                if (proposalVoting.totalVotes >= requiredVotes) {
                    // Unlock milestone
                    proposalVoting.milestoneUnlocked[milestoneIndex] = true;

                    uint256 eta = block.timestamp + treasury.getMinDelay();
                    uint256 timelockId = treasury.queueTransfer(ngoAddress, milestoneAmount, eta);

                    bytes32 key = keccak256(abi.encodePacked(proposalId, milestoneIndex));
                    milestoneTimelockId[key] = timelockId;

                    //If milestones unlocked load funds transfer into the TimeLock
                    emit MilestoneUnlocked(proposalId, milestoneIndex, milestoneAmount, timelockId);
                    emit FundsQueued(timelockId, proposalId, milestoneIndex, ngoAddress, milestoneAmount);

                    milestoneIndex++;
                } else {
                    break;
                }
            } catch {
                break;
            }
        }

        proposalVoting.lastProcessedMilestone = milestoneIndex;
    }

    function processMilestones(uint256 proposalId) external onlyRole(VOTING_ADMIN) {
        _processMilestones(proposalId);
    }

    /**
     * @dev Get milestone unlock status for a proposal
     */
    function getMilestoneStatus(uint256 proposalId)
        external
        view
        returns (
            uint256 totalVotes,
            uint256 milestonesUnlocked,
            uint256 totalMilestones
        )
    {
        address proposalAddr = proposalManager.getProposal(proposalId);
        if (proposalAddr == address(0)) {
            return (0, 0, 0);
        }

        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        totalVotes = proposalVoting.totalVotes;

        uint256 i = 0;
        while (true) {
            try proposalManager.getMilestone(proposalId, i) returns (
                string memory,
                uint256,
                bool,
                bool
            ) {
                if (proposalVoting.milestoneUnlocked[i]) {
                    milestonesUnlocked++;
                }
                i++;
            } catch {
                break; 
            }
        }

        totalMilestones = i;
    }
}
