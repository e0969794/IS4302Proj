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

  // Function to fetch JSON from IPFS URL
  const fetchIPFSJson = async (ipfsUrl) => {
    try {
      // Convert ipfs:// to https gateway if needed
      let fetchUrl = ipfsUrl;
      if (ipfsUrl.startsWith('ipfs://')) {
        const hash = ipfsUrl.replace('ipfs://', '');
        fetchUrl = `https://gateway.pinata.cloud/ipfs/${hash}`;
      }
      
      console.log("Fetching JSON from:", fetchUrl);
      const response = await fetch(fetchUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const jsonData = await response.json();
      console.log("Fetched JSON data:", jsonData);
      return jsonData;
    } catch (err) {
      console.error("Error fetching IPFS JSON:", err);
      throw err;
    }
  };

  const verifyNGO = async (e) => {
    e.preventDefault();
    setError(null);
    setVerificationStatus(null);
    setDetails(null);
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

      if (isVerified) {
        // Only fetch details if verified
        try {
          const ngoDetailsUrl = await ngoOracle.getNGODetailsURL();
          console.log("NGO Details URL:", ngoDetailsUrl);

          if (!ngoDetailsUrl || ngoDetailsUrl === "") {
            setDetails({ valid: false, message: "No details available" });
            return;
          }

          const jsonData = await fetchIPFSJson(ngoDetailsUrl);

          // Must have NGOs array
          if (!jsonData.ngos || !Array.isArray(jsonData.ngos)) {
            setDetails({ valid: false, message: "Invalid JSON format: missing 'ngos'" });
            return;
          }

          // Find NGO with matching address
          const ngo = jsonData.ngos.find(
            (item) => item.address && item.address.toLowerCase() === addressToVerify.toLowerCase()
          );

          if (ngo) {
            setDetails({
              valid: true,
              name: ngo.name || "N/A",
              description: ngo.description || "N/A",
              registrationId: ngo.registrationId || "N/A",
              address: ngo.address,
            });
          } else {
            setDetails({
              valid: false,
              message: "NGO not found: No entry matches this address",
            });
          }
        } catch (fetchError) {
          console.error("Error fetching IPFS details:", fetchError);
          setDetails({ valid: false, message: "Failed to fetch details from IPFS" });
        }
      } else {
        // Instant feedback — no IPFS
        setDetails({ valid: false, message: "NGO is not verified on-chain" });
      }
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
          <p className="text-gray-600 text-sm">Validates whether the address is a verified NGO</p>
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
              Loading...
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
            <div className="mt-3 space-y-1 text-sm">
              {details.valid ? (
                <>
                  <p><strong>Name:</strong> {details.name}</p>
                  <p><strong>Description:</strong> {details.description}</p>
                  <p><strong>Reg ID:</strong> {details.registrationId}</p>
                </>
              ) : (
                <p className="text-red-600">{details.message}</p>
              )}
            </div>
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
          💡 <strong>Note:</strong> Only admin accounts can verify NGO addresses. Verified NGOs can create funding proposals.
        </p>
      </div>
    </div>
  );
}

export default VerifyNGO;