import { useWallet } from '../context/WalletContext';
import { useNGONavigation } from '../context/NGOContext';

function MilestoneProof({ proposal, milestoneIndex, milestone, onProofSubmitted }) {
  const { account } = useWallet();
  const { navigateToMilestoneProof } = useNGONavigation();

  // If proposal or required data is missing, do not render
  if (!proposal || !milestone || milestoneIndex === undefined) {
    return null;
  }

  // Check if current user is the NGO for this proposal
  const isProposalOwner = account && proposal.ngo && proposal.ngo.toLowerCase() === account.toLowerCase();

  const handleUploadClick = () => {
    console.log('Navigating to upload proof submission for proposal', proposal.id, 'milestone', milestoneIndex + 1);
    // Navigate to the upload proof tab and scroll to NGO panel
    navigateToMilestoneProof(proposal.id, milestoneIndex);
  };

  if (!isProposalOwner) {
    return null; // Don't show anything if user is not the proposal owner
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
          onClick={handleUploadClick}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
        >
          Upload Proof
        </button>
      </div>
    </div>
  );
}

export default MilestoneProof;