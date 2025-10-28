// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, AccessControl, Pausable {
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    constructor(address admin)
        ERC20("CharityDAO Governance", "GOV")
        ERC20Permit("CharityDAO Governance")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    event MintedOnDonation(address indexed to, uint256 amount, bytes32 donationId);
    event Burned(address indexed from, uint256 amount, bytes32 burnId);

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function mintOnDonation(address to, uint256 amount, bytes32 donationId)
        external
        onlyRole(TREASURY_ROLE)
    {
        require(to != address(0) && amount > 0, "bad params");
        _mint(to, amount);
        emit MintedOnDonation(to, amount, donationId);
    }

 function burn(address from, uint256 amount, bytes32 burnId) external onlyRole(TREASURY_ROLE) {
        _burn(from, amount);
        emit Burned(from, amount, burnId);
    }

    // Override nonces to resolve conflict between ERC20Permit and Nonces
    function nonces(address owner)
        public view override(ERC20Permit, Nonces)
        returns (uint256)
    { return super.nonces(owner); } // Delegates to ERC20Permit.nonces

    // --- OZ hooks
    function _update(address from, address to, uint256 value)
        internal override(ERC20, ERC20Votes)
        whenNotPaused
    { super._update(from, to, value); }
}
