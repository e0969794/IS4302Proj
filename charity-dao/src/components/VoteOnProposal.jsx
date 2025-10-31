import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useNGOStatus } from "../context/useNGOStatus";
import { useMilestone } from "../context/MilestoneContext";

function VoteOnProposal({ proposal, onVoteSuccess, currentVoteCount }) {
  const { account, balance } = useWallet();
  const { isNGO, isAdmin, loading: statusLoading } = useNGOStatus();
  const { isVotingBlocked, getCurrentMilestone, getMilestonesNeedingVerification } = useMilestone();
  const [votes, setVotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showVoteForm, setShowVoteForm] = useState(false);
  const [previousVotes, setPreviousVotes] = useState(0);

  // Check if voting is blocked due to milestone verification
  const votingBlocked = isVotingBlocked(proposal.id, currentVoteCount || 0, proposal.milestones || []);
  const currentMilestone = getCurrentMilestone(proposal.id, currentVoteCount || 0, proposal.milestones || []);
  const milestonesNeedingVerification = getMilestonesNeedingVerification(proposal.id, currentVoteCount || 0, proposal.milestones || []);

  const handleVoteInputChange = (e) => {
    const value = e.target.value;
    // Only allow positive numbers and empty string
    if (value === "" || (!isNaN(value) && parseInt(value) >= 0)) {
      setVotes(value);
    }
  };

  const calculateVotingCost = (additionalVotes) => {
    try {
      // Handle empty or invalid input gracefully
      if (!additionalVotes || additionalVotes === "" || isNaN(additionalVotes)) {
        return "0";
      }
      
      const add = parseInt(additionalVotes);
      if (add <= 0) return "0";
      
      const prev = parseInt(previousVotes || 0);
      const total = prev + add;
      
      // Prevent negative costs and handle edge cases
      if (total < prev) return "0";
      
      // tokensRequired = total^2 - prev^2
      const tokensRequired = (total * total) - (prev * prev);
      
      // Return as string to avoid any conversion issues
      return Math.max(0, tokensRequired).toString();
    } catch (error) {
      console.error("Error calculating voting cost:", error);
      return "0";
    }
  };

  const handleVote = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!account) {
        setError("Please connect wallet first");
        return;
      }
      
      if (isNGO) {
        setError("NGOs cannot vote on proposals. Only regular users can vote.");
        return;
      }
      
      if (isAdmin) {
        setError("Admins cannot vote on proposals. Only regular users can vote.");
        return;
      }

      if (votingBlocked) {
        setError("Voting is currently disabled. The NGO must submit proof for completed milestones before voting can continue.");
        return;
      }
      
      if (!votes || isNaN(votes) || parseInt(votes) <= 0) {
        setError("Please enter a valid number of votes");
        return;
      }

      const voteAmount = parseInt(votes);
      const cost = calculateVotingCost(votes);
      
      // The balance is in formatted ETH (e.g., "5.0"), cost is raw number
      // Need to compare properly
      if (parseFloat(balance) < parseFloat(cost)) {
        setError(`Insufficient GOV tokens. Need ${cost} GOV, you have ${balance} GOV`);
        return;
      }

      console.log("Voting details:", {
        proposalId: proposal.id,
        voteAmount,
        cost,
        balance,
        previousVotes,
        hasEnoughBalance: parseFloat(balance) >= parseFloat(cost)
      });

      const { votingManager } = await getContracts();
      
      // The VotingManager expects votes as regular numbers, not wei
      const tx = await votingManager.vote(proposal.id, voteAmount);
      console.log("Vote transaction sent:", tx.hash);
      await tx.wait();
      console.log("Vote transaction confirmed:", tx.hash);

      setSuccess(`Successfully cast ${votes} votes!`);
      setVotes("");
      setShowVoteForm(false);
      
      // Refresh parent component if callback provided
      if (onVoteSuccess) {
        onVoteSuccess();
      }
    } catch (err) {
      console.error("Voting error details:", {
        error: err,
        message: err?.message,
        reason: err?.reason,
        code: err?.code,
        data: err?.data
      });
      
      let errorMessage = "Failed to vote: ";
      if (err?.reason) {
        errorMessage += err.reason;
      } else if (err?.message) {
        errorMessage += err.message;
      } else {
        errorMessage += "Unknown error";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Fetch previous votes for this user/proposal when form shown or account changes
  useEffect(() => {
    const fetchPrevious = async () => {
      if (!account) return;
      try {
        const { votingManager } = await getContracts();
        const prev = await votingManager.userVotes(proposal.id, account);
        const prevNum = Number(prev || 0);
        setPreviousVotes(prevNum);
      } catch (e) {
        console.error('Failed to fetch previous votes', e);
        setPreviousVotes(0);
      }
    };
    if (showVoteForm) fetchPrevious();
  }, [showVoteForm, account, proposal.id]);

  if (!showVoteForm) {
    // Show different messages based on user type
    if (isNGO) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-700 text-sm">
            <strong>🏢 NGO Account:</strong> NGOs cannot vote on proposals. Only regular users can vote.
          </p>
        </div>
      );
    }
    
    if (isAdmin) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 text-sm">
            <strong>👑 Admin Account:</strong> Admins cannot vote on proposals. Only regular users can vote.
          </p>
        </div>
      );
    }

    if (votingBlocked) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">
            <strong>🚫 Voting Temporarily Disabled:</strong> This proposal has reached milestone {currentMilestone + 1}. 
            The NGO must submit proof of completion before voting can continue for the next milestone.
          </p>
          {milestonesNeedingVerification.length > 0 && (
            <p className="text-red-600 text-xs mt-2">
              Milestones awaiting verification: {milestonesNeedingVerification.map(i => i + 1).join(", ")}
            </p>
          )}
        </div>
      );
    }
    
    return (
      <button
        onClick={() => setShowVoteForm(true)}
        className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
        disabled={!account || statusLoading || votingBlocked}
      >
        {statusLoading ? "Checking permissions..." : 
         votingBlocked ? "🚫 Voting Disabled (Awaiting Milestone Proof)" :
         "🗳️ Vote on This Proposal"}
      </button>
    );
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-purple-800">Cast Your Vote</h3>
        <button
          onClick={() => setShowVoteForm(false)}
          className="text-purple-600 hover:text-purple-800"
        >
          ✕
        </button>
      </div>
      
      <form onSubmit={handleVote} className="space-y-4">
        <div>
          <label htmlFor="votes" className="block text-sm font-medium text-purple-700 mb-2">
            Number of Votes
          </label>
          {previousVotes > 0 && (
            <p className="text-sm text-blue-600 mb-2">
              You have already cast {previousVotes} votes on this proposal
            </p>
          )}
          <input
            id="votes"
            type="number"
            min="1"
            value={votes}
            onChange={handleVoteInputChange}
            placeholder="Enter number of votes"
            className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={loading}
          />
          {votes && votes !== "" && !isNaN(votes) && parseInt(votes) > 0 && (
            <p className="text-sm text-purple-600 mt-1">
              Cost: {calculateVotingCost(votes)} GOV tokens
            </p>
          )}
        </div>
        
        <div className="flex space-x-3">
          <button
            type="submit"
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
              loading || !account || !votes || isNGO || isAdmin || votingBlocked
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white shadow-md hover:shadow-lg"
            }`}
            disabled={loading || !account || !votes || isNGO || isAdmin || votingBlocked}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Voting...
              </div>
            ) : isNGO ? (
              "NGOs Cannot Vote"
            ) : isAdmin ? (
              "Admins Cannot Vote"
            ) : votingBlocked ? (
              "Voting Disabled"
            ) : (
              "Cast Vote"
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowVoteForm(false)}
            className="px-4 py-2 text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </form>
      
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600 text-sm">{success}</p>
        </div>
      )}
      
      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-700 text-xs">
          💡 <strong>Quadratic Voting:</strong> Cost increases quadratically (votes²). Your balance: {balance} GOV
        </p>
      </div>
    </div>
  );
}

export default VoteOnProposal;