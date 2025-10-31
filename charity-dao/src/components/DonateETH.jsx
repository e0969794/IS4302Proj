import { useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useNGOStatus } from "../context/useNGOStatus";

function DonateETH() {
  const { account, updateBalance } = useWallet();
  const { isNGO, isAdmin, loading: statusLoading } = useNGOStatus();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleDonate = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!window.ethereum) {
        setError("MetaMask not installed");
        return;
      }
      if (!account) {
        setError("Please connect wallet first");
        return;
      }
      if (isNGO) {
        setError("NGOs cannot donate ETH. Only regular users can donate.");
        return;
      }
      if (isAdmin) {
        setError("Admins cannot donate ETH. Only regular users can donate.");
        return;
      }
      if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        setError("Please enter a valid ETH amount");
        return;
      }

      const { treasury, signer } = await getContracts();
      const donationAmount = ethers.parseEther(amount);
      console.log("Donation amount (wei):", donationAmount.toString());

      const tx = await treasury.donateETH({ value: donationAmount });
      console.log("Transaction sent:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed:", tx.hash);

      // Refresh balance
      const { governanceToken } = await getContracts();
      const balanceWei = await governanceToken.balanceOf(account);
      updateBalance(ethers.formatEther(balanceWei));

      setSuccess(`Donated ${amount} ETH successfully!`);
      setAmount("");
    } catch (err) {
      console.error("Donation error:", err);
      setError("Failed to donate: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow duration-300">
      <div className="flex items-center mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center mr-3">
          <span className="text-white font-bold">💝</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Donate ETH</h2>
          <p className="text-gray-600 text-sm">Support charity projects and earn GOV tokens</p>
        </div>
      </div>
      
      <form onSubmit={handleDonate} className="space-y-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
            Donation Amount (ETH)
          </label>
          <div className="relative">
            <input
              id="amount"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.1"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
              disabled={loading}
            />
            <span className="absolute right-3 top-3 text-gray-500 text-sm">ETH</span>
          </div>
        </div>
        
        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
            loading || !account || isNGO || isAdmin || statusLoading
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          }`}
          disabled={loading || !account || isNGO || isAdmin || statusLoading}
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Processing...
            </div>
          ) : !account ? (
            "Connect Wallet to Donate"
          ) : statusLoading ? (
            "Checking permissions..."
          ) : isNGO ? (
            "NGOs Cannot Donate"
          ) : isAdmin ? (
            "Admins Cannot Donate"
          ) : (
            "Donate ETH"
          )}
        </button>
      </form>
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600 text-sm">{success}</p>
        </div>
      )}
      
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-700 text-xs">
          💡 <strong>Tip:</strong> Only regular users can donate ETH to earn GOV tokens for voting on proposals!
        </p>
      </div>
    </div>
  );
}

export default DonateETH;