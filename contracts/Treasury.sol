// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IGovToken {
    function mintOnDonation(address to, uint256 amount, bytes32 donationId) external;
    function MINTER_ROLE() external view returns (bytes32);
    function balanceOf(address account) external view returns (uint256);
}

contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY");
    bytes32 public constant DAO_ADMIN = keccak256("DAO_ADMIN");
    bytes32 public constant VOTING_MANAGER_ROLE = keccak256("VOTING_MANAGER");

    IGovToken public immutable gov;
    address public votingManager;

    uint256 public mintRate; // GOV tokens per wei (e.g. 1e18 => 1 ETH = 1 GOV)

    event DonationReceived(address indexed donor, uint256 amountETH, uint256 tokens, bytes32 donationId);
    event MintRateUpdated(uint256 newRate);
    event VotingManagerSet(address votingManager);
    event FundsTransferred(address recipient, uint256 amount);

    constructor(address admin, address govToken, uint256 initialRate) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DAO_ADMIN, admin);
        _grantRole(TREASURY_ROLE, admin);
        gov = IGovToken(govToken);
        mintRate = initialRate;
    }

    function getGovTokenBalance() external view returns (uint256) {
        return gov.balanceOf(msg.sender);
    }

    function setMintRate(uint256 newRate) external onlyRole(TREASURY_ROLE) {
        mintRate = newRate;
        emit MintRateUpdated(newRate);
    }

    function setVotingManager(address _votingManager) external onlyRole(DAO_ADMIN) {
        votingManager = _votingManager;
        _grantRole(VOTING_MANAGER_ROLE, _votingManager);
        emit VotingManagerSet(_votingManager);
    }

    receive() external payable {
        revert("rejecting direct ETH deposits, if making donation please call donateETH()");
    }

    function donateETH() external payable nonReentrant {
        _donate();
    }

    function _donate() internal {
        require(msg.value > 0, "zero ETH");
        require(mintRate > 0, "mintRate=0");

        uint256 mintAmount = msg.value * mintRate / 1e18; // Scale to get 1 GOV per 1 ETH
        bytes32 donationId = keccak256(abi.encode(msg.sender, block.number, msg.value));

        gov.mintOnDonation(msg.sender, mintAmount, donationId);

        emit DonationReceived(msg.sender, msg.value, mintAmount, donationId);
        // ETH stays in contract for later disbursement
    }

    /**
     * @dev Transfer funds to milestone recipients (called by VotingManager)
     */
    function transferFunds(address recipient, uint256 amount) external onlyRole(VOTING_MANAGER_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(address(this).balance >= amount, "Insufficient treasury balance");
        
        (bool success,) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit FundsTransferred(recipient, amount);
    }

    /**
     * @dev Get treasury balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // function disburseMilestoneFunds(uint256 proposalId, uint index) external onlyRole(DAO_ADMIN) {
    //     address proposalAddr = proposals[proposalId];
    //     Proposal proposal = Proposal(payable(proposalAddr));
    //     proposal.releaseFunds(index);
    // }   
}
