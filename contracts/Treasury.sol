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
<<<<<<< Updated upstream
    bytes32 public constant DAO_ADMIN = DEFAULT_ADMIN_ROLE;
    IGovToken public immutable gov;

    uint256 public mintRate; // GOV tokens per wei (e.g. 1e18 => 1 ETH = 1 GOV)
    uint256 public nextProposalId;

    mapping(uint256 => address) public proposals;
    mapping(address => uint256[]) public ngoProposals;

    event DonationReceived(address indexed donor, uint256 amountETH, uint256 tokens, bytes32 donationId);
    event MintRateUpdated(uint256 newRate);
    event ProposalCreated(uint256 indexed proposalId, address proposalAddress, address ngo);
    event ProposalApproved(uint256 indexed proposalId);

    constructor(address admin, address govToken, uint256 initialRate) {
        _grantRole(DAO_ADMIN, admin);
        gov = IGovToken(govToken);
        mintRate = initialRate;
        nextProposalId = 1;
=======
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
>>>>>>> Stashed changes
    }

    function getGovTokenBalance() external view returns (uint256) {
        return gov.balanceOf(msg.sender);
    }

<<<<<<< Updated upstream
    function setMintRate(uint256 newRate) external onlyRole(DAO_ADMIN) {
=======
    function setMintRate(uint256 newRate) external onlyRole(TREASURY_ADMIN) {
>>>>>>> Stashed changes
        mintRate = newRate;
        emit MintRateUpdated(newRate);
    }

<<<<<<< Updated upstream
=======
    function setVotingManager(address _votingManager) external onlyRole(TREASURY_ADMIN) {
        require(_votingManager != address(0), "Invalid manager");
        votingManager = _votingManager;
        _grantRole(VOTING_MANAGER_ROLE, _votingManager);
        emit VotingManagerSet(_votingManager);
    }

    receive() external payable {
        revert("Direct ETH deposits not allowed; use donateETH()");
    }

>>>>>>> Stashed changes
    function donateETH() external payable nonReentrant {
        require(msg.value > 0, "Zero ETH");
        require(mintRate > 0, "mintRate=0");
        uint256 mintAmount = (msg.value * mintRate) / 1e18;
        bytes32 donationId = keccak256(abi.encode(msg.sender, block.number, msg.value));
        gov.mintOnDonation(msg.sender, mintAmount, donationId);
        emit DonationReceived(msg.sender, msg.value, mintAmount, donationId);
    }

<<<<<<< Updated upstream
    function createProposal(uint256 totalFunds, string[] memory milestoneDescriptions, uint256[] memory milestoneAmounts)
    external returns (address) {
        require(milestoneDescriptions.length == milestoneAmounts.length, "Mismatched milestones");

        uint256 proposalId = nextProposalId;
        Proposal proposal = new Proposal(
            proposalId,
            msg.sender,       
            address(this),   
            totalFunds,      
            milestoneDescriptions,
            milestoneAmounts
        );

        proposals[proposalId] = address(proposal);
        ngoProposals[msg.sender].push(proposalId);

        emit ProposalCreated(proposalId, address(proposal), msg.sender);
        nextProposalId++;

        return address(proposal);
    }

    function getProposalsByNGO(address ngo) external view returns (uint256[] memory) {
        return ngoProposals[ngo];
    }

    function getAllProposals() external view returns (uint256[] memory) {
        if (nextProposalId == 1) {
            return new uint256[](0); // Return empty array if no proposals
        }
        uint256[] memory allProposals = new uint256[](nextProposalId - 1);
        for (uint256 i = 0; i < nextProposalId - 1; i++) {
            allProposals[i] = i + 1; // IDs start at 1
        }
        return allProposals;
    }

    function approveProposal(uint256 proposalId) external onlyRole(DAO_ADMIN) {
        address proposalAddr = proposals[proposalId];
        require(proposalAddr != address(0), "Proposal does not exist");
        Proposal(payable(proposalAddr)).approveProposal();

        emit ProposalApproved(proposalId);
=======
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
>>>>>>> Stashed changes
    }

    function getMinDelay() external view returns (uint256) {
        return minDelay;
    }

    function getGracePeriod() external view returns (uint256) {
        return gracePeriod;
    }
}
