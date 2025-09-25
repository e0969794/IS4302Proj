// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Interfaces.sol";
import "./MilestoneOracleMock.sol";
import "./ProjectRegistry.sol";

contract Treasury is ReentrancyGuard {
    IGovernance public immutable governance;
    IRoundManager public immutable roundManager;
    MilestoneOracleMock public immutable milestoneOracle;
    ProjectRegistry public immutable projectRegistry;
    address public immutable reserve;

    mapping(uint256 => uint256) public allocations; // Project ID => allocated amount
    mapping(uint256 => uint256) public claimed; // Project ID => claimed amount

    uint256 public totalAllocatedAllRounds;
    uint256 public totalClaimedAllProjects;

    event Deposited(address indexed donor, uint256 amount);
    event RoundFinalized(uint256 indexed roundId, uint256 totalAllocated);
    event Claimed(uint256 indexed projectId, address indexed ngo, uint256 amount);

    constructor(
        IGovernance _governance,
        IRoundManager _roundManager,
        MilestoneOracleMock _milestoneOracle,
        ProjectRegistry _projectRegistry,
        address _reserve
    ) {
        governance = _governance;
        roundManager = _roundManager;
        milestoneOracle = _milestoneOracle;
        projectRegistry = _projectRegistry;
        reserve = _reserve;
    }

    modifier onlyGovernance() {
        require(msg.sender == address(governance) || msg.sender == governance.timelock(), "Only governance");
        _;
    }

    function deposit() external payable nonReentrant {
        require(msg.value > 0, "No funds sent");
        emit Deposited(msg.sender, msg.value);
    }

    function finalizeRound(uint256 roundId) external onlyGovernance nonReentrant {
        (bool isActive, ) = roundManager.rounds(roundId);
        require(!isActive, "Round still active");

        uint256[] memory projectIds = projectRegistry.getActiveProjects();

        uint256 totalVotes;
        uint256[] memory votes = new uint256[](projectIds.length);
        for (uint256 i = 0; i < projectIds.length; i++) {
            votes[i] = roundManager.projectVotes(roundId, projectIds[i]);
            totalVotes += votes[i];
        }

        uint256 reserved = totalAllocatedAllRounds - totalClaimedAllProjects;
        uint256 vault = address(this).balance;
        require(vault >= reserved, "vault underflow");
        uint256 free = vault - reserved;

        if (totalVotes == 0 || free == 0) {
            if (free > 0) {
                (bool sent, ) = reserve.call{value: free}("");
                require(sent, "Reserve transfer failed");
            }
            emit RoundFinalized(roundId, 0);
            return;
        }

        uint256 roundAllocated;
        for (uint256 i = 0; i < projectIds.length; i++) {
            if (votes[i] > 0) {
                uint256 allocation = (free * votes[i]) / totalVotes;
                if (allocation > 0) {
                    allocations[projectIds[i]] += allocation;
                    roundAllocated += allocation;
                }
            }
        }

        if (free > roundAllocated) {
            uint256 dust = free - roundAllocated;
            (bool sent, ) = reserve.call{value: dust}("");
            require(sent, "Dust transfer failed");
        }

        totalAllocatedAllRounds += roundAllocated;

        emit RoundFinalized(roundId, roundAllocated);
    }

    function claim(uint256 projectId) external nonReentrant {
        (address ngo, , ProjectRegistry.ProjectStatus status) = projectRegistry.projects(projectId);
        require(status == ProjectRegistry.ProjectStatus.Active, "Project not active");
        require(msg.sender == ngo, "Only project NGO can claim");

        uint256 alloc = allocations[projectId];
        require(alloc > 0, "No allocation");

        MilestoneOracleMock.Milestone[] memory milestones = milestoneOracle.getProjectMilestones(projectId);
        require(milestones.length > 0, "No milestones");

        uint256 verifiedPercent;
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].verified) {
                verifiedPercent += milestones[i].percentage;
            }
        }
        require(verifiedPercent <= 100, "Bad oracle data");

        uint256 entitled = (alloc * verifiedPercent) / 100;
        uint256 already = claimed[projectId];
        require(entitled > already, "No claimable funds");

        uint256 payout = entitled - already;
        claimed[projectId] = entitled;
        totalClaimedAllProjects += payout;

        (bool sent, ) = msg.sender.call{value: payout}("");
        require(sent, "Claim transfer failed");

        emit Claimed(projectId, msg.sender, payout);
    }

    receive() external payable {
        revert("Use deposit() instead of sending ETH directly");
    }
}
