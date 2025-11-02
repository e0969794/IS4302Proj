import { ethers } from "ethers";
import contractAddresses from "../../config.json";
import GovernanceTokenArtifact from "../../../artifacts/contracts/GovernanceToken.sol/GovernanceToken.json";
import TreasuryArtifact from "../../../artifacts/contracts/Treasury.sol/Treasury.json";
import NGOOracleArtifact from "../../../artifacts/contracts/NGOOracle.sol/NGOOracle.json";
import ProposalArtifact from "../../../artifacts/contracts/ProposalManager.sol/ProposalManager.json";
import ProofOracleArtifact from "../../../artifacts/contracts/ProofOracle.sol/ProofOracle.json";
import VotingManagerArtifact from "../../../artifacts/contracts/VotingManager.sol/VotingManager.json";

export async function getContracts() {
  if (!window.ethereum) {
    console.warn("MetaMask not installed, using fallback provider");
  }

  // console.log("Initializing provider...");
  const provider = new ethers.BrowserProvider(window.ethereum);
  // console.log("Provider initialized:", provider);
  await provider.getNetwork(); // Ensure the provider is ready
  // console.log("Network connected:", await provider.getNetwork());
  const signer = await provider.getSigner();
  // console.log("Signer address:", await signer.getAddress());

  const governanceToken = new ethers.Contract(
    contractAddresses.GovernanceToken,
    GovernanceTokenArtifact.abi,
    signer || provider
  );
  const treasury = new ethers.Contract(
    contractAddresses.Treasury,
    TreasuryArtifact.abi,
    signer || provider
  );
  const ngoOracle = new ethers.Contract(
    contractAddresses.NGOOracle,
    NGOOracleArtifact.abi,
    signer || provider
  );
  const proposalManager = new ethers.Contract(
    contractAddresses.ProposalManager,
    ProposalArtifact.abi,
    signer || provider
  );
  const proofOracle = new ethers.Contract(
    contractAddresses.ProofOracle,
    ProofOracleArtifact.abi,
    signer || provider
  );
  const votingManager = new ethers.Contract(
    contractAddresses.VotingManager,
    VotingManagerArtifact.abi,
    signer || provider
  );

  const NGO_IPFS_URL = contractAddresses.NGO_IPFS_URL;
  const Pinata_API_Key = contractAddresses.Pinata_API_Key;
  const Pinata_Secret_Key = contractAddresses.Pinata_Secret_Key;
  const Pinata_Group_ID = contractAddresses.Pinata_Group_ID;

  return { governanceToken, treasury, ngoOracle, proposalManager, proofOracle, votingManager,
    provider, signer, NGO_IPFS_URL, Pinata_API_Key, Pinata_Secret_Key, Pinata_Group_ID};
}

export function getProposalContract(proposalAddress, signer) {
  return new ethers.Contract(proposalAddress, ProposalArtifact.abi, signer);
}
