import { useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";

function DonateETH() {
  const { account, updateBalance } = useWallet();
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
    <div className="p-4">
      <h2 className="text-xl mb-2">Donate ETH</h2>
      <form onSubmit={handleDonate} className="space-y-4">
        <div>
          <input
            id="amount"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter ETH amount"
            className="border p-2 mr-2 w-full"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600 text-white disabled:bg-blue-300"
          disabled={loading || !account}
        >
          {loading ? "Processing..." : "Donate"}
        </button>
      </form>
      {error && <p className="text-red-500 mt-2">{error}</p>}
      {success && <p className="text-green-500 mt-2">{success}</p>}
    </div>
  );
}

export default DonateETH;