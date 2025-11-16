import { useState, useEffect } from 'react';
import { getContracts } from '../utils/contracts';

function ProofReview({ proofId, onReviewComplete }) {
  const [proofDetails, setProofDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [message, setMessage] = useState(null);
  const [proofProcessed, setProofProcessed] = useState(false);
  const [checkingProof, setCheckingProof] = useState(true);

  // Check if proof has already been processed (approved or rejected)	
  useEffect(() => {
    const checkProofStatus = async () => {
      if (proofId === undefined || proofId === null) {
        setCheckingProof(false);
        return;
      }

      try {
        const { proofOracle } = await getContracts();
        const proof = await proofOracle.getSubmission(proofId);
	
	// If proof is already processed, hide the UI
        if (proof.processed) {
          setProofProcessed(true);
        }
      } catch (error) {
        console.error('Error checking proof status:', error);
      } finally {
        setCheckingProof(false);
      }
    };

    checkProofStatus();
  }, [proofId]);

  const fetchProofDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const { proofOracle } = await getContracts();
      const proof = await proofOracle.getSubmission(proofId);

      setProofDetails({
        proposalId: proof.proposalId.toString(),
        milestoneIndex: Number(proof.milestoneIndex),
        proofURL: proof.proofURL,
        ngo: proof.ngo,
        submittedAt: new Date(Number(proof.submittedAt) * 1000).toLocaleString(),
        processed: proof.processed,
        approved: proof.approved,
        reason: proof.reason
      });
      setShowReviewForm(true);
    } catch (err) {
      console.error('Error fetching proof details:', err);
      setError('Failed to load proof details');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setReviewing(true);
      setMessage({ type: 'info', text: 'Approving proof...' });

      const { proofOracle } = await getContracts();
      const tx = await proofOracle.verifyProof(proofId, true, 'Approved by admin');
      await tx.wait();

      setMessage({ type: 'success', text: 'Proof approved successfully!' });
      setProofProcessed(true);
      setTimeout(() => {
        onReviewComplete?.();
      }, 1500);
    } catch (err) {
      console.error('Error approving proof:', err);
      setMessage({
        type: 'error',
        text: `Failed to approve: ${err.reason || err.message}`
      });
    } finally {
      setReviewing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setMessage({ type: 'error', text: 'Please provide a reason for rejection' });
      return;
    }

    try {
      setReviewing(true);
      setMessage({ type: 'info', text: 'Rejecting proof...' });

      const { proofOracle } = await getContracts();
      const tx = await proofOracle.verifyProof(proofId, false, rejectReason);
      await tx.wait();

      setMessage({ type: 'success', text: 'Proof rejected successfully!' });
      setProofProcessed(true);
      setTimeout(() => {
        onReviewComplete?.();
      }, 1500);
    } catch (err) {
      console.error('Error rejecting proof:', err);
      setMessage({
        type: 'error',
        text: `Failed to reject: ${err.reason || err.message}`
      });
    } finally {
      setReviewing(false);
    }
  };

  // Still checking if proof was already processed
  if (checkingProof) {
	return null;
  }
  
  // If proof has been processed (approved or rejected), hide the UI	
  if (proofProcessed) {
	return null;
  }

  // Show the review button if form is not open
  if (!showReviewForm) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-purple-600 text-sm">👑</span>
            </div>
            <div>
              <h4 className="font-semibold text-purple-800 mb-1">
                Admin Review Required
              </h4>
              <p className="text-purple-700 text-sm mb-2">
                A proof has been submitted for this milestone and requires admin verification.
              </p>
              <p className="text-purple-600 text-xs">
                Click the button to review the proof and approve or reject it.
              </p>
            </div>
          </div>
          <button
            onClick={fetchProofDetails}
            disabled={loading}
            className={`bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Loading...' : 'Review Proof'}
          </button>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-purple-800 flex items-center">
          <span className="text-lg mr-2">👑</span>
          Review Proof Submission
        </h4>
        <button
          onClick={() => {
            setShowReviewForm(false);
            setShowRejectForm(false);
            setRejectReason('');
            setMessage(null);
          }}
          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
        >
          ✕ Cancel
        </button>
      </div>

      {proofDetails && (
        <>
          <div className="mb-4 space-y-2 text-sm text-purple-700 bg-white p-3 rounded-lg border border-purple-200">
            <p><strong>Proposal ID:</strong> #{proofDetails.proposalId}</p>
            <p><strong>Milestone:</strong> #{proofDetails.milestoneIndex + 1}</p>
            <p><strong>NGO:</strong> {proofDetails.ngo.slice(0, 6)}...{proofDetails.ngo.slice(-4)}</p>
            <p><strong>Submitted:</strong> {proofDetails.submittedAt}</p>
          </div>
        </>
      )}

      {/* Proof URL */}
      {proofDetails && (
        <div className="mb-4 p-3 bg-white rounded-lg border border-purple-200">
          <p className="text-sm font-medium text-purple-800 mb-2">Proof Document:</p>
          <div className="relative">
            <code className="text-xs text-purple-700 break-all block bg-purple-50 p-2 rounded">
              {proofDetails.proofURL}
            </code>
          </div>
          <a
            href={`https://gateway.pinata.cloud/ipfs/${proofDetails.proofURL.replace('ipfs://', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sm text-purple-600 hover:text-purple-800 underline font-medium"
          >
            View Proof on Pinata
          </a>
        </div>
      )}

      {/* Review Actions */}
      {!showRejectForm ? (
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={reviewing}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              reviewing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {reviewing ? 'Processing...' : 'Approve Proof'}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={reviewing}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              reviewing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            Reject Proof
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Provide a clear reason for rejecting this proof..."
              className="w-full border border-purple-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={reviewing || !rejectReason.trim()}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                reviewing || !rejectReason.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {reviewing ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
            <button
              onClick={() => {
                setShowRejectForm(false);
                setRejectReason('');
              }}
              disabled={reviewing}
              className="flex-1 py-2 rounded-lg font-medium bg-gray-200 hover:bg-gray-300 text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
	
      {/* Message Box */}
      {message && (
        <div
          className={`mt-4 p-3 rounded-md border ${
            message.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}
        >
          <p className="text-sm">{message.text}</p>
        </div>
      )}
    </div>
  );
}

export default ProofReview;
