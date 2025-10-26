// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Interface to interact with the ProposalManager contract
interface IProposalManager {
  function verifyMilestone(uint256 proposalId, uint256 index, bytes32 proofHash) external;
}

// ProofOracle contract for verifying milestones using off-chain proofs stored on IPFS
contract ProofOracle is Ownable {
  IProposalManager public proposalManager;

  // Event emitted when a milestone is verified
  event MilestoneVerified(
    uint256 indexed proposalId,
    uint256 indexed milestoneIndex,
    bytes32 proofHash,
    string proofURL
  );

  /**
   * @notice Constructor to initialize the ProofOracle with the ProposalManager address
   * @param _proposalManagerAddress Address of the deployed ProposalManager contract
   */
  constructor(address _proposalManagerAddress) Ownable(msg.sender) {
    require(_proposalManagerAddress != address(0), "Invalid ProposalManager address");
    proposalManager = IProposalManager(_proposalManagerAddress);
  }

  /**
   * @notice Internal function to validate if a URL is a valid IPFS URL
   * @param url The URL to validate
   * @return bool True if the URL starts with "ipfs://", false otherwise
   */
  function isValidIPFSURL(string memory url) internal pure returns (bool) {
      bytes memory urlBytes = bytes(url);
      bytes memory prefix = bytes("ipfs://");
      // Check if URL is shorter than prefix
      if (urlBytes.length < prefix.length) return false;
      // Compare each character of the prefix
      for (uint256 i = 0; i < prefix.length; i++) {
          if (urlBytes[i] != prefix[i]) return false;
      }
      return true;
  }

  /**
   * @notice Verifies a milestone by hashing the full IPFS URL and calling ProposalManager
   * @param proposalId ID of the proposal
   * @param milestoneIndex Index of the milestone
   * @param proofURL Full IPFS URL (e.g. ipfs://<CID>) of the milestone proof
   */
  function verifyMilestone(
      uint256 proposalId,
      uint256 milestoneIndex,
      string memory proofURL
  ) external onlyOwner {
    // Ensure the proof URL is not empty
    require(bytes(proofURL).length > 0, "Proof URL cannot be empty");
    // Validate that the proof URL starts with "ipfs://"
    require(isValidIPFSURL(proofURL), "Invalid IPFS URL format");
    
    // Hash the full proof URL for immutability and gas-efficient storage
    bytes32 proofHash = keccak256(abi.encodePacked(proofURL));

    // Call the verification function in ProposalManager
    proposalManager.verifyMilestone(proposalId, milestoneIndex, proofHash);

    // Call ProposalManager to verify the milestone, handle potential failures
    try proposalManager.verifyMilestone(proposalId, milestoneIndex, proofHash) {
        // Emit event with proofHash and proofURL for DAO transparency
        emit MilestoneVerified(proposalId, milestoneIndex, proofHash, proofURL);
    } catch {
        revert("Failed to verify milestone in ProposalManager");
    }
  }
}
