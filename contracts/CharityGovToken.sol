// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Interfaces.sol";

contract CharityGovToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    IGovernance public governance;

    constructor(address initialOwner)
        ERC20("CharityGovToken", "CGT")
        ERC20Permit("CharityGovToken")
        Ownable(initialOwner)
    {
        // Bootstrap supply: deployer holds initial voting power
        _mint(initialOwner, 10_000 ether);
    }

    /// One-time setter to link token to Governor (and its Timelock)
    function setGovernance(address governanceAddr) external onlyOwner {
        require(address(governance) == address(0), "Governance already set");
        require(governanceAddr != address(0), "Invalid governance");
        governance = IGovernance(governanceAddr);
    }

    modifier onlyGovernance() {
        require(address(governance) != address(0), "Governance not set yet");
        require(
            msg.sender == address(governance) ||
                msg.sender == governance.timelock(),
            "Only governance"
        );
        _;
    }

    /// All new minting must come via governance proposals
    function mint(address to, uint256 amount) external onlyGovernance {
        _mint(to, amount);
    }

    // --- ERC20Votes overrides ---
    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, amount);
    }

    function _maxSupply() internal pure override returns (uint256) {
        return type(uint256).max;
    }

    function nonces(address _owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(_owner);
    }
}
