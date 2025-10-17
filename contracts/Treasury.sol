// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "./Proposal.sol";

interface IGovToken {
    function mintOnDonation(address to, uint256 amount, bytes32 donationId) external;
    function MINTER_ROLE() external view returns (bytes32);
    function balanceOf(address account) external view returns (uint256);
}

contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant TREASURY_ADMIN = keccak256("TREASURY_ADMIN");
    bytes32 public constant VOTING_MANAGER_ROLE = keccak256("VOTING_MANAGER");

    IGovToken public immutable gov;
    address public votingManager;
    uint256 public mintRate;
    uint256 public minDelay; // seconds
    uint256 public gracePeriod; // seconds

    struct TimelockTx {
        uint256 id;
        address proposer;
        address recipient;
        uint256 amount;
        uint256 eta;
        bool executed;
        bool canceled;
    }

    mapping(uint256 => TimelockTx) public timelocks;
    uint256 public timelockCount;

    event DonationReceived(address indexed donor, uint256 amountETH, uint256 tokens, bytes32 donationId);
    event MintRateUpdated(uint256 newRate);
    event VotingManagerSet(address votingManager);
    event TimelockQueued(uint256 indexed id, address indexed proposer, address indexed recipient, uint256 amount, uint256 eta);
    event TimelockExecuted(uint256 indexed id, address indexed recipient, uint256 amount);
    event TimelockCanceled(uint256 indexed id, address indexed caller);
    event FundsTransferred(address recipient, uint256 amount);

    constructor(address admin, address govToken, uint256 initialRate, uint256 _minDelay, uint256 _gracePeriod) {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURY_ADMIN, admin);

        gov = IGovToken(govToken);
        mintRate = initialRate;
        minDelay = _minDelay;
        gracePeriod = _gracePeriod;
    }

    function getGovTokenBalance() external view returns (uint256) {
        return gov.balanceOf(msg.sender);
    }

    function setMintRate(uint256 newRate) external onlyRole(TREASURY_ADMIN) {
        mintRate = newRate;
        emit MintRateUpdated(newRate);
    }

    function setVotingManager(address _votingManager) external onlyRole(TREASURY_ADMIN) {
        require(_votingManager != address(0), "Invalid manager");
        votingManager = _votingManager;
        _grantRole(VOTING_MANAGER_ROLE, _votingManager);
        emit VotingManagerSet(_votingManager);
    }

    receive() external payable {
        revert("Direct ETH deposits not allowed; use donateETH()");
    }

    function donateETH() external payable nonReentrant {
        require(msg.value > 0, "Zero ETH");
        require(mintRate > 0, "mintRate=0");
        uint256 mintAmount = (msg.value * mintRate) / 1e18;
        bytes32 donationId = keccak256(abi.encode(msg.sender, block.number, msg.value));
        gov.mintOnDonation(msg.sender, mintAmount, donationId);
        emit DonationReceived(msg.sender, msg.value, mintAmount, donationId);
    }

    function queueTransfer(address recipient, uint256 amount, uint256 eta) external onlyRole(VOTING_MANAGER_ROLE) returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Zero Amount");
        require(eta >= block.timestamp + minDelay, "too soon");

        timelockCount++;
        timelocks[timelockCount] = TimelockTx({
            id: timelockCount,
            proposer: msg.sender,
            recipient: recipient,
            amount: amount,
            eta: eta,
            executed: false,
            canceled: false
        });

        emit TimelockQueued(timelockCount, msg.sender, recipient, amount, eta);
        return timelockCount;
    }

    function executeTimelock(uint256 id) external nonReentrant {
        TimelockTx storage txl = timelocks[id];
        require(txl.id == id, "Not found");
        require(!txl.executed, "Already executed");
        require(!txl.canceled, "Canceled");
        require(block.timestamp >= txl.eta, "Timelock not expired");
        require(block.timestamp <= txl.eta + gracePeriod, "Timelock expired");

        require(address(this).balance >= txl.amount, "Insufficient balance");

        txl.executed = true;
        (bool success, ) = txl.recipient.call{value: txl.amount}("");
        require(success, "Transfer failed");

        emit TimelockExecuted(id, txl.recipient, txl.amount);
        emit FundsTransferred(txl.recipient, txl.amount);
    }

    function cancelTimelock(uint256 id) external onlyRole(TREASURY_ADMIN) {
        TimelockTx storage txl = timelocks[id];
        require(txl.id == id, "Not found");
        require(!txl.executed, "Already executed");
        require(!txl.canceled, "Already canceled");
        txl.canceled = true;
        emit TimelockCanceled(id, msg.sender);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getMinDelay() external view returns (uint256) {
        return minDelay;
    }

    function getGracePeriod() external view returns (uint256) {
        return gracePeriod;
    }
}
