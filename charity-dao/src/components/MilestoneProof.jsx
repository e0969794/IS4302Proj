import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { getContracts } from '../utils/contracts';
import UploadProof from './UploadProof';
import { ethers } from 'ethers';

function MilestoneProof({ proposal, milestoneIndex, milestone, onProofSubmitted }) {
  const { account } = useWallet();
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [checkingProof, setCheckingProof] = useState(true);

  // Check if proof has already been submitted to ProofOracle
  useEffect(() => {
    const checkProofSubmission = async () => {
      if (!account || !proposal || milestoneIndex === undefined) {
        setCheckingProof(false);
        return;
      }

      try {
        const { proofOracle } = await getContracts();

        // Create composite key matching ProofOracle's getKey function
        const key = ethers.solidityPackedKeccak256(
          ['uint256', 'uint256', 'address'],
          [proposal.id, milestoneIndex, account]
        );

        // Check if proofIndex has a non-zero value for this key
        const proofId = await proofOracle.proofIndex(key);

        if (proofId > 0) {
          // Fetch proof details to check if it was rejected
          const proof = await proofOracle.getProof(proofId);

          // Only hide if proof is pending or approved
          // If rejected (processed && !approved), allow resubmission
          if (proof.processed && !proof.approved) {
            // Proof was rejected, allow resubmission
            setProofSubmitted(false);
          } else {
            // Proof is pending or approved
            setProofSubmitted(true);
          }
        }
      } catch (error) {
        console.error('Error checking proof submission:', error);
      } finally {
        setCheckingProof(false);
      }
    };

    checkProofSubmission();
  }, [account, proposal, milestoneIndex]);

  // If proposal or required data is missing, do not render
  if (!proposal || !milestone || milestoneIndex === undefined) {
    return null;
  }

  // Still checking if proof was already submitted
  if (checkingProof) {
    return null;
  }

  // If proof has been submitted, hide the UI
  if (proofSubmitted) {
    return null;
  }

  // Check if current user is the NGO for this proposal
  const isProposalOwner = account && proposal.ngo && proposal.ngo.toLowerCase() === account.toLowerCase();

  if (!isProposalOwner) {
    return null; // Don't show anything if user is not the proposal owner
  }

  if (showUploadForm) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-orange-800">
            Upload Proof for Milestone {milestoneIndex + 1}
          </h4>
          <button
            onClick={() => setShowUploadForm(false)}
            className="text-orange-600 hover:text-orange-800 text-sm font-medium">
            ✕ Cancel
          </button>
        </div>
        <UploadProof
          proposalId={proposal.id}
          milestoneIndex={milestoneIndex}
          onUploadComplete={({ ipfsUrl, pending }) => {
            console.log("Proof uploaded:", ipfsUrl);
            setProofSubmitted(true);
            onProofSubmitted?.();
          }}
        />
      </div>
    );
  }

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
              Congratulations! Your milestone "{milestone.description}" has received enough votes.
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
