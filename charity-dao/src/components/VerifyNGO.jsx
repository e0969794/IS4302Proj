import { useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";

function VerifyNGO() {
  const { account } = useWallet();
  const [ngoAddress, setNgoAddress] = useState("");
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const verifyNGO = async (e) => {
    e.preventDefault();
    setError(null);
    setVerificationStatus(null);
    setDetails("");
    setLoading(true);

    try {
      if (!account) {
        setError("Please connect wallet first");
        return;
      }
      const addressToVerify = ngoAddress || account;
      if (!ethers.isAddress(addressToVerify)) {
        setError("Invalid address");
        return;
      }

      const { ngoOracle } = await getContracts();
      console.log("Verifying NGO:", addressToVerify);

      // Send verifyNGO transaction
      const tx = await ngoOracle.verifyNGO(addressToVerify);
      console.log("Transaction sent:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed:", tx.hash);

      // Check approvedNGOs directly
      const isVerified = await ngoOracle.approvedNGOs(addressToVerify);
      console.log("Verification result:", isVerified);
      setVerificationStatus(isVerified);

      // Fetch details
      const ngoDetails = await ngoOracle.ngoDetails(addressToVerify);
      setDetails(ngoDetails || "No details available");
    } catch (err) {
      console.error("Verification error:", err);
      setError("Failed to verify: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow duration-300">
      <div className="flex items-center mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center mr-3">
          <span className="text-white font-bold">✅</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Verify NGO</h2>
          <p className="text-gray-600 text-sm">Verify NGO addresses to enable proposal creation</p>
        </div>
      </div>
      
      <form onSubmit={verifyNGO} className="space-y-4">
        <div>
          <label htmlFor="ngoAddress" className="block text-sm font-medium text-gray-700 mb-2">
            NGO Wallet Address
          </label>
          <input
            id="ngoAddress"
            type="text"
            value={ngoAddress}
            onChange={(e) => setNgoAddress(e.target.value)}
            placeholder="0x... or leave blank to verify your own address"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors duration-200 font-mono text-sm"
            disabled={loading}
          />
        </div>
        
        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
            loading || !account
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          }`}
          disabled={loading || !account}
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Verifying...
            </div>
          ) : !account ? (
            "Connect Wallet to Verify NGO"
          ) : (
            "Verify NGO Status"
          )}
        </button>
      </form>
      
      {verificationStatus !== null && (
        <div className="mt-4 p-4 rounded-lg border">
          <div className={`flex items-center mb-2 ${
            verificationStatus ? "text-green-600" : "text-red-600"
          }`}>
            <span className="mr-2">
              {verificationStatus ? "✅" : "❌"}
            </span>
            <span className="font-medium">
              {verificationStatus ? "NGO is verified" : "NGO is not verified"}
            </span>
          </div>
          {details && (
            <p className="text-gray-600 text-sm">{details}</p>
          )}
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-700 text-xs">
          💡 <strong>Admin Only:</strong> Only admin accounts can verify NGO addresses. Verified NGOs can create funding proposals.
        </p>
      </div>
    </div>
  );
}

export default VerifyNGO;