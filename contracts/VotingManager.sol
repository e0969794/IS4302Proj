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
}

contract VotingManager is AccessControl, ReentrancyGuard {
    IProposalManager public immutable proposalManager;
    ITreasury public immutable treasury;

    mapping(uint256 => uint256) public proposalVotesMapping; //maps proposalId to the number of votes it has
    mapping(uint256 => uint) public nextMilestoneMapping; //maps proposalId to its next milestone
    mapping(uint256 => mapping(address => uint256)) public userVotes;

    event VoteCast(address indexed voter, uint256 indexed proposalId, bytes32 voteId, uint256 votes);
    event DisburseMilestone(uint256 indexed proposalId, uint256 milestoneIndex, uint256 amountReleased);
    event MilestoneUnlocked(uint256 indexed proposalId, uint256 milestoneIndex);

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

    function _updateProposalAfterVote(uint256 proposalId) internal {
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
    function vote(uint256 proposalId, uint256 newVotes) external nonReentrant canVoteOnMilestone(proposalId) {
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