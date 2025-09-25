// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Interfaces.sol";
import "./NGOOracleMock.sol";

contract ProjectRegistry {
    IGovernance public immutable governance;
    NGOOracleMock public immutable ngoOracle;

    enum ProjectStatus { Pending, Active, Inactive }

    struct Project {
        address ngo;
        string description;
        ProjectStatus status;
    }

    Project[] public projects;
    uint256[] public activeProjects;

    event ProjectRegistered(uint256 indexed projectId, address ngo, string description);
    event ProjectStatusUpdated(uint256 indexed projectId, ProjectStatus status);

    constructor(IGovernance _governance, NGOOracleMock _ngoOracle) {
        governance = _governance;
        ngoOracle = _ngoOracle;
    }

    modifier onlyGovernance() {
        require(
            msg.sender == address(governance) || msg.sender == governance.timelock(),
            "Only governance"
        );
        _;
    }

    function registerProject(address ngo, string memory description)
        external
        onlyGovernance
    {
        require(ngoOracle.approvedNGOs(ngo), "NGO not approved");
        uint256 projectId = projects.length;
        projects.push(Project(ngo, description, ProjectStatus.Pending));
        emit ProjectRegistered(projectId, ngo, description);
    }

    function updateProjectStatus(uint256 projectId, ProjectStatus status)
        external
        onlyGovernance
    {
        require(projectId < projects.length, "Invalid project ID");
        projects[projectId].status = status;
        if (status == ProjectStatus.Active) {
            activeProjects.push(projectId);
        } else {
            for (uint256 i = 0; i < activeProjects.length; i++) {
                if (activeProjects[i] == projectId) {
                    activeProjects[i] = activeProjects[activeProjects.length - 1];
                    activeProjects.pop();
                    break;
                }
            }
        }
        emit ProjectStatusUpdated(projectId, status);
    }

    function getActiveProjects() external view returns (uint256[] memory) {
        return activeProjects;
    }
}
