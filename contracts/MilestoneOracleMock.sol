// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Interfaces.sol";

contract MilestoneOracleMock {
    IGovernance public immutable governance;

    struct Milestone {
        uint256 percentage;
        bool verified;
    }

    mapping(uint256 => Milestone[]) public projectMilestones;

    event MilestonesSet(uint256 indexed projectId, uint256[] percentages);
    event MilestoneVerified(uint256 indexed projectId, uint256 index);

    constructor(IGovernance _governance) {
        governance = _governance;
    }

    modifier onlyGovernance() {
        require(
            msg.sender == address(governance) || msg.sender == governance.timelock(),
            "Only governance"
        );
        _;
    }

    function setMilestones(uint256 projectId, uint256[] memory percentages)
        external
        onlyGovernance
    {
        require(percentages.length > 0, "At least one milestone required");
        require(percentages.length <= 10, "Too many milestones");
        uint256 totalPercentage = 0;
        for (uint256 i = 0; i < percentages.length; i++) {
            totalPercentage += percentages[i];
        }
        require(totalPercentage == 100, "Percentages must sum to 100");

        delete projectMilestones[projectId];
        for (uint256 i = 0; i < percentages.length; i++) {
            projectMilestones[projectId].push(Milestone(percentages[i], false));
        }
        emit MilestonesSet(projectId, percentages);
    }

    function verifyMilestone(uint256 projectId, uint256 index)
        external
        onlyGovernance
    {
        require(index < projectMilestones[projectId].length, "Invalid milestone index");
        require(!projectMilestones[projectId][index].verified, "Milestone already verified");
        
        projectMilestones[projectId][index].verified = true;
        emit MilestoneVerified(projectId, index);
    }

    function getProjectMilestones(uint256 projectId)
        external
        view
        returns (Milestone[] memory)
    {
        return projectMilestones[projectId];
    }
}
