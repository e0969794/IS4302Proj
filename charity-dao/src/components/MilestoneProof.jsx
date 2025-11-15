import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import UploadProof from './UploadProof';

function MilestoneProof({ proposal, milestoneIndex, milestone, onProofSubmitted }) {
  const { account } = useWallet();

  // Local UI state only – on-chain state is handled in ProposalList via fetchProposals
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [proofJustSubmitted, setProofJustSubmitted] = useState(false);

  // Guard: missing data → render nothing
  if (!proposal || !milestone || milestoneIndex === undefined) {
    return null;
  }

  // Only show for the NGO that owns this proposal
  const isProposalOwner =
    account &&
    proposal.ngo &&
    proposal.ngo.toLowerCase() === account.toLowerCase();

  if (!isProposalOwner) {
    return null;
  }

  // After upload, show a small success / awaiting-approval message
  if (proofJustSubmitted) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-purple-600 text-sm">⏳</span>
          </div>
          <div>
            <h4 className="font-semibold text-purple-800 mb-1">
              Proof Submitted for Milestone {milestoneIndex + 1}
            </h4>
            <p className="text-purple-700 text-sm mb-1">
              Your proof for &quot;{milestone.description}&quot; has been submitted successfully.
            </p>
            <p className="text-purple-600 text-xs">
              An admin will review and approve it. Once approved, voting for the next milestone will be unlocked.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Upload form visible
  if (showUploadForm) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-orange-800">
            Upload Proof for Milestone {milestoneIndex + 1}
          </h4>
          <button
            onClick={() => setShowUploadForm(false)}
            className="text-orange-600 hover:text-orange-800 text-sm font-medium"
          >
            ✕ Cancel
          </button>
        </div>

        <UploadProof
          proposalId={proposal.id}
          milestoneIndex={milestoneIndex}
          onUploadComplete={({ ipfsUrl, pending }) => {
            console.log('Proof uploaded:', ipfsUrl, 'pending:', pending);
            // Locally show “awaiting admin approval”
            setProofJustSubmitted(true);
            // Ask parent to refetch proposals so global state (submittedProofs, etc.) updates
            onProofSubmitted?.();
          }}
        />
      </div>
    );
  }

  // Default “Milestone reached – prompt to upload proof” card
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-orange-600 text-sm">📋</span>
          </div>
          <div>
            <h4 className="font-semibold text-orange-800 mb-1">
              Milestone {milestoneIndex + 1} Reached!
            </h4>
            <p className="text-orange-700 text-sm mb-2">
              Congratulations! Your milestone &quot;{milestone.description}&quot; has received enough votes.
            </p>
            <p className="text-orange-600 text-xs">
              Please upload proof of completion to unlock voting for the next milestone.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowUploadForm(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap"
        >
          Upload Proof
        </button>
      </div>
    </div>
  );
}

export default MilestoneProof;
