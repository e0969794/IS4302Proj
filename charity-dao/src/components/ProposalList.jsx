import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContracts, getProposalContract } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";

function ProposalList() {
  const { account } = useWallet();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchProposals = async () => {
    if (!account) return; // Skip if no wallet connected
    try {
      setLoading(true);
      setError(null);
      const { treasury, signer } = await getContracts();
      const proposalIds = await treasury.getAllProposals();
      console.log("Proposal IDs:", proposalIds.map(id => id.toString()));
      const proposalData = [];

      for (let id of proposalIds) {
        const proposalAddr = await treasury.proposals(id);
        console.log(`Fetching proposal ${id}: Address=${proposalAddr}`);
        const proposalContract = getProposalContract(proposalAddr, signer);
        const ngo = await proposalContract.ngo();
        const totalFunds = await proposalContract.totalFunds();
        const milestoneCount = await proposalContract.milestoneCount();
        const milestones = [];
        for (let i = 0; i < milestoneCount; i++) {
          const [description, amount, completed, released] = await proposalContract.getMilestone(i);
          milestones.push({
            description,
            amount: ethers.formatEther(amount),
            completed,
            released,
          });
        }
        const isApproved = await proposalContract.isApproved();
        proposalData.push({ id, ngo, totalFunds: ethers.formatEther(totalFunds), milestones, isApproved });
      }
      setProposals(proposalData);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch proposals:", error, { reason: error.reason, data: error.data });
      setError(`Failed to fetch proposals: ${error.message || "Unknown error"}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals(); // Fetch on mount or account change

    // Event listener for ProposalCreated
    let treasury;
    const setupEventListener = async () => {
      try {
        const { treasury: contract } = await getContracts();
        treasury = contract;
        treasury.on("ProposalCreated", (proposalId, proposalAddress, ngo) => {
          console.log(`ProposalCreated event: ID=${proposalId}, Address=${proposalAddress}, NGO=${ngo}`);
          fetchProposals();
        });
        treasury.on("ProposalApproved", (proposalId) => {
          console.log(`ProposalApproved event: ID=${proposalId}`);
          fetchProposals();
        });
      } catch (error) {
        console.error("Failed to set up event listener:", error);
      }
    };
    setupEventListener();

    return () => {
      if (treasury) {
        treasury.removeAllListeners("ProposalCreated");
        treasury.removeAllListeners("ProposalApproved");
      }
    };
  }, [account]);

  if (!account) {
    return <p className="text-center text-gray-500">Please connect wallet to view proposals.</p>;
  }

  if (loading) {
    return <p className="text-center text-gray-500">Loading proposals...</p>;
  }

  if (error) {
    return <p className="text-center text-red-500">{error}</p>;
  }

  if (proposals.length === 0) {
    return <p className="text-center text-gray-500">No proposals found.</p>;
  }

  return (
    <div className="p-4 text-left">
      <h2 className="text-2xl font-bold mb-4">Proposals</h2>
      <div className="space-y-4">
        {proposals.map((p) => (
          <div key={p.id.toString()} className="border p-2 mr-2 w-full">
            <p className="text-lg font-medium">Proposal ID: {p.id.toString()}</p>
            <p>NGO: {p.ngo}</p>
            <p>Total Funds: {p.totalFunds} ETH</p>
            <p>Approved: {p.isApproved ? "Yes" : "No"}</p>
            <h3 className="text-lg font-medium mt-2">Milestones:</h3>
            <ul>
              {p.milestones.map((m, index) => (
                <li key={index} className="mt-1">
                  <p>Description: {m.description}</p>
                  <p>Amount: {m.amount} ETH</p>
                  <p>Completed: {m.completed ? "Yes" : "No"}</p>
                  <p>Released: {m.released ? "Yes" : "No"}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProposalList;
