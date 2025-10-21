// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Interface to interact with the ProposalManager contract
interface IProposalManager {
    function _verifyMilestone(uint256 proposalId, uint256 index, bytes32 proofHash) external;
}

contract ProofOracle is Ownable {
    IProposalManager public proposalManager;

    /**
     * @param _proposalManagerAddress The address of the deployed ProposalManager contract.
     */
    constructor(address _proposalManagerAddress)
        Ownable(msg.sender)
    {
        require(_proposalManagerAddress != address(0), "Invalid ProposalManager address");
        proposalManager = IProposalManager(_proposalManagerAddress);
    }

    /**
     * @notice Called by the owner (off-chain oracle service) to verify milestone proof.
     * @param proposalId ID of the proposal
     * @param milestoneIndex Index of the milestone
     * @param proofURL The URL or string data representing the off-chain proof
     */
    function verifyMilestone(
        uint256 proposalId,
        uint256 milestoneIndex,
        string memory proofURL
    ) external onlyOwner {
        // Hash the proof URL for immutability
        bytes32 proofHash = keccak256(abi.encodePacked(proofURL));

        // Call the verification function in ProposalManager
        proposalManager._verifyMilestone(proposalId, milestoneIndex, proofHash);
    }
}