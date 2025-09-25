// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "./Interfaces.sol";

contract ReputationOracleMock {
    IGovernance public immutable governance;
    IVotes public immutable govToken;

    mapping(address => uint256) public reputation;
    mapping(address => uint256) public lastUpdate;
    mapping(address => uint256) public updateCount;

    uint256 public constant SYBIL_WINDOW = 1 days;
    uint256 public constant SYBIL_THRESHOLD = 2;

    event ReputationUpdated(address indexed account, uint256 amount);

    constructor(IGovernance _governance, IVotes _govToken) {
        governance = _governance;
        govToken = _govToken;
    }

    modifier onlyGovernance() {
        require(msg.sender == address(governance) || msg.sender == governance.timelock(), "Only governance");
        _;
    }

    function updateReputation(address account, uint256 amount) external onlyGovernance {
        require(account != address(0), "Invalid account");
        require(amount > 0, "Invalid amount");

        reputation[account] += amount;
        updateCount[account] += 1;
        uint256 currentTime = block.timestamp;

        if (currentTime - lastUpdate[account] < SYBIL_WINDOW) {
            if (updateCount[account] > SYBIL_THRESHOLD) {
                updateCount[account] = SYBIL_THRESHOLD + 1;
            }
        } else {
            updateCount[account] = 1;
        }
        lastUpdate[account] = currentTime;

        emit ReputationUpdated(account, amount);
    }

    function isSybilSuspect(address account) external view returns (bool) {
        return updateCount[account] > SYBIL_THRESHOLD;
    }
}
