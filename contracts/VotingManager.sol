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
        uint256 votes;
        uint256 creditsSpent;
    }

    struct ProposalVoting {
        uint256 totalVotes;
        mapping(address => Vote) userVotes;
        mapping(uint256 => bool) milestoneUnlocked;
        uint256 lastProcessedMilestone;
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

    function getAvailableCredits(address user) public view returns (uint256) {
        uint256 totalCredits = govToken.balanceOf(user);
        uint256 spent = totalCreditsSpent[user];
        return totalCredits >= spent ? totalCredits - spent : 0;
    }

    function getUserVotes(uint256 proposalId, address user) external view returns (uint256 votes, uint256 creditsSpent) {
        Vote memory userVote = proposalVotes[proposalId].userVotes[user];
        return (userVote.votes, userVote.creditsSpent);
    }

    function getProposalVotes(uint256 proposalId) external view returns (uint256) {
        return proposalVotes[proposalId].totalVotes;
    }

    function isMilestoneUnlocked(uint256 proposalId, uint256 milestoneIndex) external view returns (bool) {
        return proposalVotes[proposalId].milestoneUnlocked[milestoneIndex];
    }

    function vote(uint256 proposalId, uint256 additionalVotes) external nonReentrant {
        require(additionalVotes > 0, "Must cast at least 1 vote");

        address ngoAddress = proposalManager.getProposal(proposalId);
        require(ngoAddress != address(0), "Proposal does not exist");

        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        Vote storage userVote = proposalVoting.userVotes[msg.sender];

        uint256 newTotalVotes = userVote.votes + additionalVotes;
        uint256 newTotalCredits = newTotalVotes * newTotalVotes;
        uint256 additionalCredits = newTotalCredits - userVote.creditsSpent;

        require(getAvailableCredits(msg.sender) >= additionalCredits, "Insufficient credits");

        userVote.votes = newTotalVotes;
        userVote.creditsSpent = newTotalCredits;
        proposalVoting.totalVotes += additionalVotes;
        totalCreditsSpent[msg.sender] += additionalCredits;

        emit VoteCast(msg.sender, proposalId, additionalVotes, additionalCredits);

        _processMilestones(proposalId);
    }

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



    function _processMilestones(uint256 proposalId) internal {
        ProposalVoting storage proposalVoting = proposalVotes[proposalId];
        address ngoAddress = proposalManager.getProposal(proposalId);
        require(ngoAddress != address(0), "Invalid NGO address");

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

                uint256 requiredVotes = milestoneAmount / 1e14;
                if (proposalVoting.totalVotes >= requiredVotes) {
                    proposalVoting.milestoneUnlocked[milestoneIndex] = true;

                    uint256 eta = block.timestamp + treasury.getMinDelay();
                    uint256 timelockId = treasury.queueTransfer(ngoAddress, milestoneAmount, eta);

                    bytes32 key = keccak256(abi.encodePacked(proposalId, milestoneIndex));
                    milestoneTimelockId[key] = timelockId;

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
