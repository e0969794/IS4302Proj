import { useState } from "react";
import { getContracts } from "../utils/contracts";

function AdminPanel() {
  const [proposalId, setProposalId] = useState("");

  const handleApprove = async () => {
    try {
      const { treasury } = await getContracts();
      const tx = await treasury.approveProposal(proposalId);
      await tx.wait();
      alert("Proposal approved!");
    } catch (error) {
      console.error(error);
      alert("Approval failed");
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl mb-2">Admin Panel</h2>
      <input
        type="number"
        value={proposalId}
        onChange={(e) => setProposalId(e.target.value)}
        placeholder="Proposal ID"
        className="border p-2 mr-2"
      />
      <button onClick={handleApprove} className="bg-green-500 text-white p-2">
        Approve Proposal
      </button>
    </div>
  );
}

export default AdminPanel;
