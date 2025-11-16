import { useState } from "react";
import { getContracts } from "../utils/contracts";

function AdminPanel() {
  const [proposalId, setProposalId] = useState("");
  const [ngoAddress, setNgoAddress] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [proofApproval, setProofApproval] = useState(true);
  const [proofReason, setProofReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    try {
      setLoading(true);
      const { treasury } = await getContracts();
      const tx = await treasury.approveProposal(proposalId);
      await tx.wait();
      alert("Proposal approved!");
    } catch (error) {
      console.error(error);
      alert("Approval failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencySuspend = async () => {
    if (!ngoAddress || !suspendReason) {
      alert("Please provide both NGO address and suspend reason");
      return;
    }

    try {
      setLoading(true);
      const { proofOracle } = await getContracts();
      const tx = await proofOracle.emergencySuspendNGO(
        ngoAddress,
        suspendReason
      );
      await tx.wait();
      alert("NGO suspended successfully!");
      setNgoAddress("");
      setSuspendReason("");
    } catch (error) {
      console.error(error);
      alert("Suspend failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyProof = async () => {
    if (!submissionId || !proofReason) {
      alert("Please provide submission ID and reason");
      return;
    }

    try {
      setLoading(true);
      const { proofOracle } = await getContracts();
      const tx = await proofOracle.verifyProof(
        submissionId,
        proofApproval,
        proofReason
      );
      await tx.wait();

      if (proofApproval) {
        alert("Proof approved successfully!");
      } else {
        alert("Proof rejected - NGO has been suspended!");
      }

      setSubmissionId("");
      setProofReason("");
    } catch (error) {
      console.error(error);
      alert("Proof verification failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const checkNGOStatus = async () => {
    if (!ngoAddress) {
      alert("Please provide NGO address");
      return;
    }

    try {
      setLoading(true);
      const { proposalManager } = await getContracts();
      const isSuspended = await proposalManager.isNGOSuspended(ngoAddress);
      const strikeCount = await proposalManager.getNGOStrikeCount(ngoAddress);

      alert(
        `NGO Status:\nSuspended: ${isSuspended}\nStrike Count: ${strikeCount}`
      );
    } catch (error) {
      console.error(error);
      alert("Status check failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Admin Panel</h2>

      {loading && (
        <div className="mb-4 p-3 bg-blue-100 text-blue-800 rounded">
          Processing transaction...
        </div>
      )}

      {/* Proposal Approval Section */}
      <div className="mb-8 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Proposal Management</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="number"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            placeholder="Proposal ID"
            className="border p-2 rounded"
            disabled={loading}
          />
          <button
            onClick={handleApprove}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={loading}
          >
            Approve Proposal
          </button>
        </div>
      </div>

      {/* Proof Verification Section */}
      <div className="mb-8 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Proof Verification</h3>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="number"
              value={submissionId}
              onChange={(e) => setSubmissionId(e.target.value)}
              placeholder="Submission ID"
              className="border p-2 rounded"
              disabled={loading}
            />
            <select
              value={proofApproval}
              onChange={(e) => setProofApproval(e.target.value === "true")}
              className="border p-2 rounded"
              disabled={loading}
            >
              <option value="true">Approve</option>
              <option value="false">Reject (Suspends NGO)</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={proofReason}
              onChange={(e) => setProofReason(e.target.value)}
              placeholder="Verification reason"
              className="border p-2 rounded flex-1 min-w-[200px]"
              disabled={loading}
            />
            <button
              onClick={handleVerifyProof}
              className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
                proofApproval
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
              disabled={loading}
            >
              {proofApproval ? "Approve Proof" : "Reject Proof"}
            </button>
          </div>
        </div>
      </div>

      {/* NGO Management Section */}
      <div className="mb-8 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-3">NGO Management</h3>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={ngoAddress}
              onChange={(e) => setNgoAddress(e.target.value)}
              placeholder="NGO Address (0x...)"
              className="border p-2 rounded flex-1 min-w-[300px]"
              disabled={loading}
            />
            <button
              onClick={checkNGOStatus}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={loading}
            >
              Check Status
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Suspend reason (for emergency suspend)"
              className="border p-2 rounded flex-1 min-w-[200px]"
              disabled={loading}
            />
            <button
              onClick={handleEmergencySuspend}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={loading}
            >
              Emergency Suspend NGO
            </button>
          </div>
        </div>
      </div>

      {/* Information Section */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold mb-2">Important Notes:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            • Rejecting a proof will automatically suspend the NGO (zero
            tolerance policy)
          </li>
          <li>
            • Emergency suspend should only be used for severe violations
            (fraud, illegal activity)
          </li>
          <li>
            • Suspended NGOs cannot create new proposals and all their active
            proposals are terminated
          </li>
          <li>
            • Check NGO status to see current suspension status and strike count
          </li>
        </ul>
      </div>
    </div>
  );
}

export default AdminPanel;
