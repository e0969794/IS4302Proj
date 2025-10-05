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
    <div className="p-4">
      <h2 className="text-xl mb-2">Verify NGO</h2>
      <form onSubmit={verifyNGO} className="space-y-4">
        <div>
          <input
            id="ngoAddress"
            type="text"
            value={ngoAddress}
            onChange={(e) => setNgoAddress(e.target.value)}
            placeholder="Enter NGO address or leave blank"
            className="border p-2 mr-2 w-full"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
          disabled={loading || !account}
        >
          {loading ? "Verifying..." : "Verify NGO"}
        </button>
      </form>
      {verificationStatus !== null && (
        <div className="mt-4">
          <p className={verificationStatus ? "text-green-500" : "text-red-500"}>
            {verificationStatus ? "NGO is verified" : "NGO is not verified"}
          </p>
          <p>{details}</p>
        </div>
      )}
      {error && <p className="text-red-500 mt-2">{error}</p>}
    </div>
  );
}

export default VerifyNGO;