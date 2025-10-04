// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// import "./oracle.sol"

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Proposal is AccessControl {
    uint256 public proposalID;
    address public ngo;
    address public treasury;
    uint256 public totalFunds;
    uint256 public fundsDisbursed;
    bool public isApproved;
    
    bytes32 public constant DAO_ADMIN = keccak256("DAO_ADMIN");


    struct Milestone {
            string description;
            uint256 amount;
            bool completed;
            bool released;
        }

    Milestone[] public milestones;

    modifier onlyNGO() {
        require(msg.sender == ngo, "Only the NGO is allowed");
        _;
    }

    modifier onlyVerified() {
        require(isApproved == true, "Proposal needs to be verified");
        _;
    }

    constructor(uint256 _proposalID, address _ngo, address _treasury, uint256 _totalFunds, string[] memory _milestoneDescriptions, uint256[] memory _milestoneAmounts, address admin, address proposalManager) {
        require(_milestoneDescriptions.length == _milestoneAmounts.length, "Mismatched milestones");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DAO_ADMIN, admin);
        _grantRole(DAO_ADMIN, proposalManager);
        proposalID = _proposalID;
        ngo = _ngo;
        treasury = _treasury;
        totalFunds = _totalFunds;
        fundsDisbursed = 0;
        isApproved = false;

        for (uint i = 0; i < _milestoneDescriptions.length; i++) {
        milestones.push(Milestone({
            description: _milestoneDescriptions[i],
            amount: _milestoneAmounts[i],
            completed: false,
            released: false
            }));
        }
    } 

    function approveProposal() external onlyRole(DAO_ADMIN) {
        require(!isApproved, "Already approved");
        //Include oracle verification here
        isApproved = true;
    }

    // function releaseFunds(uint _index) external onlyTreasury() onlyVerified() {
    //     Milestone storage m = milestones[_index];
    //     require(m.completed, "Milestone not completed");
    //     require(!m.released, "Funds already released");

    //     m.released = true;
    //     fundsDisbursed += m.amount;

    //     payable(ngo).transfer(m.amount);
    // }

    function getMilestone(uint _index) external view returns (
        string memory description,
        uint256 amount,
        bool completed,
        bool released
    ) {
        Milestone storage m = milestones[_index];
        return (m.description, m.amount, m.completed, m.released);
    }

    function verifyMilestone(uint index) external onlyVerified() { 
        require(index < milestones.length, "Invalid milestone");
        require(!milestones[index].completed, "Already verified");
       
        milestones[index].completed = true;
    }

    function milestoneCount() external view returns (uint) {
        return milestones.length;
    }

    receive() external payable {}
}