// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IGovToken {
    function mintOnDonation(address to, uint256 amount, bytes32 donationId) external;
    function MINTER_ROLE() external view returns (bytes32);
}

contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant DAO_ADMIN = DEFAULT_ADMIN_ROLE;
    IGovToken public immutable gov;

    uint256 public mintRate; // GOV tokens per wei (e.g. 1e18 => 1 ETH = 1 GOV)

    event DonationReceived(address indexed donor, uint256 amountETH, uint256 tokens, bytes32 donationId);
    event MintRateUpdated(uint256 newRate);

    constructor(address admin, address govToken, uint256 initialRate) {
        _grantRole(DAO_ADMIN, admin);
        gov = IGovToken(govToken);
        mintRate = initialRate;
    }

    function setMintRate(uint256 newRate) external onlyRole(DAO_ADMIN) {
        mintRate = newRate;
        emit MintRateUpdated(newRate);
    }

    receive() external payable {
        _donate();
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
}
