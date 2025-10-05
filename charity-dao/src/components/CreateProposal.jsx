import { useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";

function CreateProposal() {
  const { account } = useWallet();
  const [totalFunds, setTotalFunds] = useState("");
  const [milestones, setMilestones] = useState([{ description: "", amount: "" }]);
  const [error, setError] = useState(null);

  const handleAddMilestone = () => {
    setMilestones([...milestones, { description: "", amount: "" }]);
  };

  const handleMilestoneChange = (index, field, value) => {
    const newMilestones = [...milestones];
    newMilestones[index][field] = value;
    setMilestones(newMilestones);
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      if (!account) {
        setError("Please connect wallet first");
        return;
      }

      // Validate inputs
      if (!totalFunds || isNaN(totalFunds) || parseFloat(totalFunds) <= 0) {
        setError("Total funds must be a positive number");
        return;
      }
      for (const milestone of milestones) {
        if (!milestone.description) {
          setError("All milestone descriptions are required");
          return;
        }
        if (!milestone.amount || isNaN(milestone.amount) || parseFloat(milestone.amount) <= 0) {
          setError("All milestone amounts must be positive numbers");
          return;
        }
      }

      const { treasury, ngoOracle } = await getContracts();

      // Check if connected account is a verified NGO
      const isVerified = await ngoOracle.approvedNGOs(account);
      if (!isVerified) {
        setError("Only verified NGOs can create proposals");
        return;
      }

      const descriptions = milestones.map((m) => m.description);
      const amounts = milestones.map((m) => ethers.parseEther(m.amount));
      const totalFundsWei = ethers.parseEther(totalFunds);

      console.log("Creating proposal:", { totalFundsWei, descriptions, amounts });

      const tx = await treasury.createProposal(totalFundsWei, descriptions, amounts);
      console.log("Transaction sent:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed:", tx.hash);

      alert("Proposal created!");
      setTotalFunds("");
      setMilestones([{ description: "", amount: "" }]);
    } catch (error) {
      console.error("Proposal creation error:", error);
      setError(`Proposal creation failed: ${error.message || "Unknown error"}`);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl mb-2">Create Proposal</h2>
      <div className="space-y-4">
        <div>
          <input
            id="totalFunds"
            type="number"
            value={totalFunds}
            onChange={(e) => setTotalFunds(e.target.value)}
            placeholder="Total Funds (ETH)"
            className="border p-2 mr-2 w-full"
          />
        </div>
        {milestones.map((milestone, index) => (
          <div key={index} className="flex space-x-2">
            <input
              type="text"
              value={milestone.description}
              onChange={(e) => handleMilestoneChange(index, "description", e.target.value)}
              placeholder="Milestone description"
              className="border p-2 mr-2 w-full"
            />
            <input
              type="number"
              value={milestone.amount}
              onChange={(e) => handleMilestoneChange(index, "amount", e.target.value)}
              placeholder="Amount (ETH)"
              className="border p-2 mr-2 w-full"
            />
          </div>
        ))}
        <div className="space-y-2 space-x-20">
          <button
            type="button"
            onClick={handleAddMilestone}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Add Milestone
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Submit Proposal
          </button>
        </div>
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </div>
    </div>
  );
}

export default CreateProposal;