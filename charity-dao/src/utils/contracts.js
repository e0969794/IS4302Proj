import { ethers } from "ethers";
import GovernanceTokenArtifact from "../../../artifacts/contracts/GovernanceToken.sol/GovernanceToken.json";
import TreasuryArtifact from "../../../artifacts/contracts/Treasury.sol/Treasury.json";
import NGOOracleArtifact from "../../../artifacts/contracts/NGOOracle.sol/NGOOracle.json";
import ProposalArtifact from "../../../artifacts/contracts/ProposalManager.sol/ProposalManager.json";
import VotingManagerArtifact from "../../../artifacts/contracts/VotingManager.sol/VotingManager.json";

const CONTRACT_ADDRESSES = {
  GovernanceToken: import.meta.env.VITE_GOVTOKEN_ADDRESS,
  Treasury: import.meta.env.VITE_TREASURY_ADDRESS,
  NGOOracle: import.meta.env.VITE_NGO_ORACLE_ADDRESS,
  ProposalManager: import.meta.env.VITE_PROPOSAL_MANAGER_ADDRESS,
  VotingManager: import.meta.env.VITE_VOTING_MANAGER_ADDRESS,
};

export async function getContracts() {
  if (!window.ethereum) {
    console.warn("MetaMask not installed, using fallback provider");
  }

  console.log("Initializing provider...");
  const provider = new ethers.BrowserProvider(window.ethereum);
  console.log("Provider initialized:", provider);
  await provider.getNetwork(); // Ensure the provider is ready
  console.log("Network connected:", await provider.getNetwork());
  const signer = await provider.getSigner();
  console.log("Signer address:", await signer.getAddress());

  const governanceToken = new ethers.Contract(
    CONTRACT_ADDRESSES.GovernanceToken,
    GovernanceTokenArtifact.abi,
    signer || provider
  );
  const treasury = new ethers.Contract(
    CONTRACT_ADDRESSES.Treasury,
    TreasuryArtifact.abi,
    signer || provider
  );
  const ngoOracle = new ethers.Contract(
    CONTRACT_ADDRESSES.NGOOracle,
    NGOOracleArtifact.abi,
    signer || provider
  );
  const proposalManager = new ethers.Contract(
    CONTRACT_ADDRESSES.ProposalManager,
    ProposalArtifact.abi,
    signer || provider
  );
  const votingManager = new ethers.Contract(
    CONTRACT_ADDRESSES.VotingManager,
    VotingManagerArtifact.abi,
    signer || provider
  );

  return { governanceToken, treasury, ngoOracle, proposalManager, votingManager, provider, signer };
}

export function getProposalContract(proposalAddress, signer) {
  return new ethers.Contract(proposalAddress, ProposalArtifact.abi, signer);
}
