// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGovernance {
    function timelock() external view returns (address);
}

interface IRoundManager {
    function rounds(uint256) external view returns (bool active, uint256);
    function projectVotes(uint256, uint256) external view returns (uint256);
    function startRound(uint256) external;
    function closeRound(uint256) external;
    function communityClose(uint256) external;
    function vote(uint256, uint256, uint256) external;
    function roundVoterCredits(uint256, address) external view returns (uint256);
    function spentCredits(uint256, address) external view returns (uint256);
}
