import { useState, useEffect } from "react";
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

      const { proposalManager, ngoOracle } = await getContracts();

      // Check if connected account is a verified NGO
      const isVerified = await ngoOracle.approvedNGOs(account);
      if (!isVerified) {
        setError("Only verified NGOs can create proposals");
        return;
      }

      const descriptions = milestones.map((m) => m.description);
      const amounts = milestones.map((m) => ethers.parseEther(m.amount));

      console.log("Creating proposal:", { descriptions, amounts });

      const tx = await proposalManager.createProposal(descriptions, amounts);
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

  const [isVerifiedNGO, setIsVerifiedNGO] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkVerified = async () => {
      if (!account) return;
      try {
        const { ngoOracle } = await getContracts();
        const v = await ngoOracle.approvedNGOs(account);
        if (mounted) setIsVerifiedNGO(!!v);
      } catch (e) {
        console.error('Failed to check NGO verification', e);
      }
    };
    checkVerified();
    return () => { mounted = false };
  }, [account]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow duration-300">
      <div className="flex items-center mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-500 rounded-lg flex items-center justify-center mr-3">
          <span className="text-white font-bold">📝</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Create Proposal</h2>
          <p className="text-gray-600 text-sm">Submit your charity project for community voting</p>
        </div>
      </div>
      
      <div className="space-y-6">
        <div>
          <label htmlFor="totalFunds" className="block text-sm font-medium text-gray-700 mb-2">
            Total Project Budget (ETH)
          </label>
          <div className="relative">
            <input
              id="totalFunds"
              type="number"
              step="0.01"
              value={totalFunds}
              onChange={(e) => setTotalFunds(e.target.value)}
              placeholder="10.0"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors duration-200"
            />
            <span className="absolute right-3 top-3 text-gray-500 text-sm">ETH</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Project Milestones
            </label>
            <button
              type="button"
              onClick={handleAddMilestone}
              className="text-purple-600 hover:text-purple-800 text-sm font-medium flex items-center"
            >
              <span className="mr-1">+</span> Add Milestone
            </button>
          </div>
          
          <div className="space-y-4">
            {milestones.map((milestone, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center mb-3">
                  <span className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-700">Milestone {index + 1}</span>
                </div>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={milestone.description}
                    onChange={(e) => handleMilestoneChange(index, "description", e.target.value)}
                    placeholder="Describe this milestone (e.g., 'Purchase medical supplies')"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={milestone.amount}
                      onChange={(e) => handleMilestoneChange(index, "amount", e.target.value)}
                      placeholder="Cumulative amount needed (ETH)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <span className="absolute right-3 top-2 text-gray-500 text-sm">ETH</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex space-x-4">
          {isVerifiedNGO ? (
            <button
              type="button"
              onClick={handleSubmit}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                !account
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              }`}
              disabled={!account}
            >
              {!account ? "Connect Wallet to Create Proposal" : "Submit Proposal"}
            </button>
          ) : (
            <div className="flex-1 p-4 bg-yellow-50 border border-yellow-100 rounded-lg text-sm text-yellow-800">
              <strong>Notice:</strong> Your wallet is not a verified NGO. Only verified NGOs can submit proposals.
            </div>
          )}
        </div>
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-700 text-xs">
            💡 <strong>Note:</strong> Only verified NGOs can create proposals. Proposals are automatically approved once submitted.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CreateProposal;