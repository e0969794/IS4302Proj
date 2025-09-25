// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Interfaces.sol";
import "./ReputationOracleMock.sol";

contract RoundManager is IRoundManager {
    IGovernance public immutable governance;
    ReputationOracleMock public immutable repOracle;

    struct Round {
        bool active;
        uint256 endTime;
    }

    mapping(uint256 => Round) public override rounds;
    mapping(uint256 => mapping(uint256 => uint256)) public projectVotes; // roundId => projectId => votes
    mapping(uint256 => mapping(address => uint256)) public roundVoterCredits; // roundId => voter => credits
    mapping(uint256 => mapping(address => uint256)) public spentCredits; // roundId => voter => spent credits

    event RoundStarted(uint256 indexed roundId, uint256 endTime);
    event RoundClosed(uint256 indexed roundId);
    event Voted(uint256 indexed roundId, uint256 indexed projectId, address voter, uint256 amount);

    constructor(IGovernance _governance, ReputationOracleMock _repOracle) {
        governance = _governance;
        repOracle = _repOracle;
    }

    modifier onlyGovernance() {
        require(msg.sender == address(governance) || msg.sender == governance.timelock(), "Only governance");
        _;
    }

    function startRound(uint256 duration) external override onlyGovernance {
        uint256 roundId = block.timestamp;
        require(!rounds[roundId].active, "Round already active");
        rounds[roundId] = Round(true, block.timestamp + duration);
        emit RoundStarted(roundId, rounds[roundId].endTime);
    }

    function closeRound(uint256 roundId) external override onlyGovernance {
        require(rounds[roundId].active, "Round not active");
        rounds[roundId].active = false;
        emit RoundClosed(roundId);
    }

    function communityClose(uint256 roundId) external override {
        require(rounds[roundId].active, "Round not active");
        require(repOracle.reputation(msg.sender) > 0, "Insufficient reputation");
        rounds[roundId].active = false;
        emit RoundClosed(roundId);
    }

    function vote(uint256 roundId, uint256 projectId, uint256 amount) external override {
        require(rounds[roundId].active, "Round not active");
        require(!repOracle.isSybilSuspect(msg.sender), "Sybil suspect");
        uint256 availableCredits = repOracle.reputation(msg.sender);
        require(availableCredits >= spentCredits[roundId][msg.sender] + amount, "Insufficient voice credits");

        roundVoterCredits[roundId][msg.sender] += amount;
        spentCredits[roundId][msg.sender] += amount;
        projectVotes[roundId][projectId] += amount;
        emit Voted(roundId, projectId, msg.sender, amount);
    }
}
