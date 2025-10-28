// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IGovToken {
    function mintOnDonation(address to, uint256 amount, bytes32 donationId) external;
    function balanceOf(address account) external view returns (uint256);
    function burn(address from, uint amount, bytes32 burnId) external;
}

contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant DISBURSER_ROLE = keccak256("DISBURSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    IGovToken public immutable token;

    uint256 public mintRate; // GOV tokens per wei (e.g. 1e18 => 1 ETH = 1 GOV)

    event DonationReceived(address indexed donor, uint256 amountETH, uint256 tokens, bytes32 donationId);
    event fundsDisbursed(address indexed ngo, uint256 amountETH, bytes32 disbursementId);
    event MintRateUpdated(uint256 newRate);

    constructor(address admin, address govToken, uint256 initialRate) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        token = IGovToken(govToken);
        mintRate = initialRate;
    }

    function getTokenBalance(address from) external view returns (uint256) {
        return token.balanceOf(from);
    }

    function setMintRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        mintRate = newRate;
        emit MintRateUpdated(newRate);
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

        token.mintOnDonation(msg.sender, mintAmount, donationId);

        emit DonationReceived(msg.sender, msg.value, mintAmount, donationId);
        // ETH stays in contract for later disbursement
    }

    function burnETH(address user, uint256 amount) external nonReentrant onlyRole(BURNER_ROLE) {
        bytes32 burnId = keccak256(abi.encode(msg.sender, block.number, amount));
        token.burn(user, amount, burnId);
    }

    function disburseMilestoneFunds(address payable ngo, uint256 tokenAmount) external onlyRole(DISBURSER_ROLE) {
        uint256 weiAmount = (tokenAmount * 1e18) / mintRate;
        require(address(this).balance  >= weiAmount, "Insufficient contract balance");

        (bool success, ) = ngo.call{value: weiAmount}("");
        require(success, "Ether transfer failed");

        bytes32 disbursementId = keccak256(abi.encode(ngo, block.number, tokenAmount));

        uint256 fundAmount = weiAmount/ 1e18; // Scale to get 1 GOV per 1 ETH
        emit fundsDisbursed(ngo, fundAmount, disbursementId);
    }

}
