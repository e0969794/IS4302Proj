import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useMilestone } from "../context/MilestoneContext";

function VoteOnProposal({ proposal, onVoteSuccess, currentVoteCount, isNGO, isAdmin, statusLoading }) {
  const { account, balance, updateBalance } = useWallet();
  const { getCurrentMilestone } = useMilestone();
  const [votes, setVotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showVoteForm, setShowVoteForm] = useState(false);
  const [previousVotes, setPreviousVotes] = useState(null); // null = not loaded yet, 0 = loaded and is zero
  const [voteCost, setVoteCost] = useState("0");
  const [loadingCost, setLoadingCost] = useState(false);

  // Build verification status object from proposal milestone data
  const verificationStatus = {};
  if (proposal.milestones) {
    proposal.milestones.forEach((milestone, index) => {
      verificationStatus[index] = { verified: milestone.verified === true };
    });
  }

  // Check if voting is blocked due to milestone verification
  const currentMilestone = getCurrentMilestone(proposal.id, currentVoteCount || 0, proposal.milestones || []);

  // Check if project is fully complete (all milestones reached and verified)
  const isProjectComplete = currentMilestone >= (proposal.milestones?.length - 1) &&
                           proposal.milestones?.every((m) => m.verified);

  // Check if any reached milestone is unverified (including the current milestone)
  let votingBlocked = false;
  const milestonesNeedingVerification = [];

  // Check all milestones that have been reached (including current one)
  // If votes have reached a milestone threshold, it must be verified before voting can continue
  for (let i = 0; i <= currentMilestone; i++) {
    if (!verificationStatus[i]?.verified) {
      votingBlocked = true;
      milestonesNeedingVerification.push(i);
    }
  }

  const handleVoteInputChange = (e) => {
    const value = e.target.value;
    // Only allow positive numbers and empty string
    if (value === "" || (!isNaN(value) && Number(value) >= 0)) {
      setVotes(value);
    }
  };

  // Fetch vote cost from contract with reputation discount
  useEffect(() => {
    const fetchVoteCost = async () => {
      if (!account || !votes || votes === "" || isNaN(votes) || Number(votes) <= 0) {
        setVoteCost("0");
        return;
      }

      // Don't calculate cost until we know previousVotes
      if (previousVotes === undefined || previousVotes === null) {
        return;
      }

      setLoadingCost(true);
      try {
        const { votingManager } = await getContracts();
        const costInTokens = await votingManager.calculateVoteCost(proposal.id, Number(votes), account);
        // The contract returns cost in token units (not Wei), so just convert to string
        const costStr = costInTokens.toString();
        console.log("Vote cost calculation:", {
          votes,
          previousVotes,
          costInTokens: costStr,
          costDisplay: costStr
        });
        setVoteCost(costStr);
      } catch (err) {
        console.error("Failed to calculate vote cost:", err);
        // Fallback to basic calculation if contract call fails
        const basicCost = calculateVotingCost(votes);
        setVoteCost(basicCost);
      } finally {
        setLoadingCost(false);
      }
    };

    fetchVoteCost();
  }, [votes, account, proposal.id, previousVotes]);

  const calculateVotingCost = (additionalVotes) => {
    try {
      // Handle empty or invalid input gracefully
      if (!additionalVotes || additionalVotes === "" || isNaN(additionalVotes)) {
        return "0";
      }
      
      const add = Number(additionalVotes);
      if (add <= 0) return "0";
      
      const prev = Number(previousVotes || 0);
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

      if (isProjectComplete) {
        setError("This project is complete. All milestones have been reached and verified.");
        return;
      }

      if (votingBlocked) {
        setError("Voting is currently disabled. The NGO must submit proof for completed milestones before voting can continue.");
        return;
      }
      
      if (!votes || isNaN(votes) || Number(votes) <= 0) {
        setError("Please enter a valid number of votes");
        return;
      }

      const voteAmount = Number(votes);
      const costTokens = Number(voteCost); // voteCost is in token units
      const balanceTokens = Number(balance); // balance is also in token units (formatted with formatEther)
      
      // Both values are in token units, so we can compare directly
      if (balanceTokens < costTokens) {
        setError(`Insufficient GOV tokens. Need ${costTokens.toFixed(2)} GOV, you have ${balanceTokens.toFixed(2)} GOV`);
        return;
      }

      console.log("Voting details:", {
        proposalId: proposal.id,
        voteAmount,
        costTokens,
        balanceTokens,
        previousVotes,
        hasEnoughBalance: balanceTokens >= costTokens
      });

      const { votingManager, governanceToken } = await getContracts();
      
      // The VotingManager expects votes as regular numbers, not wei
      const tx = await votingManager.vote(proposal.id, voteAmount);
      console.log("Vote transaction sent:", tx.hash);
      await tx.wait();
      console.log("Vote transaction confirmed:", tx.hash);

      // Refresh balance after voting (tokens were burned)
      // Add a small delay to ensure blockchain state is updated
      await new Promise(resolve => setTimeout(resolve, 500));
      const balanceWei = await governanceToken.balanceOf(account);
      const newBalance = ethers.formatEther(balanceWei);
      updateBalance(newBalance);
      console.log("✅ Balance refreshed after vote:", {
        oldBalance: balance,
        newBalance,
        tokensBurned: (parseFloat(balance) - parseFloat(newBalance)).toFixed(2)
      });

      setSuccess(`Successfully cast ${votes} votes! Balance updated.`);
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

    if (isProjectComplete) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-700 text-sm">
            <strong>✅ Project Complete:</strong> All milestones have been reached and verified! No further voting is needed.
          </p>
          <p className="text-green-600 text-xs mt-2">
            This project has successfully completed all {proposal.milestones?.length} milestone(s).
          </p>
        </div>
      );
    }

    if (votingBlocked) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">
            <strong>🚫 Voting Temporarily Disabled:</strong> The NGO must submit proof before voting can continue.
          </p>
          {milestonesNeedingVerification.length > 0 && (
            <p className="text-red-600 text-xs mt-2">
              {milestonesNeedingVerification.length} milestone(s) awaiting verification: #{milestonesNeedingVerification.map(i => i + 1).join(", #")}
            </p>
          )}
        </div>
      );
    }
    
    return (
      <button
        onClick={() => setShowVoteForm(true)}
        className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
        disabled={!account || statusLoading || votingBlocked || isProjectComplete}
      >
        {statusLoading ? "Checking permissions..." :
         isProjectComplete ? "✅ Project Complete" :
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
          ✕ Cancel
        </button>
      </div>
      
      <form onSubmit={handleVote} className="space-y-4">
        <div>
          <label htmlFor="votes" className="block text-sm font-medium text-purple-700 mb-2">
            Number of Votes
          </label>
          {previousVotes === null ? (
            <p className="text-sm text-gray-500 mb-2 italic">
              Loading your voting history...
            </p>
          ) : previousVotes > 0 ? (
            <p className="text-sm text-blue-600 mb-2">
              You have already cast {previousVotes} votes on this proposal
            </p>
          ) : (
            <p className="text-sm text-gray-600 mb-2">
              This is your first vote on this proposal
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
          {votes && votes !== "" && !isNaN(votes) && Number(votes) > 0 && (
            <div className="mt-2 space-y-1">
              {loadingCost ? (
                <p className="text-sm text-gray-500 italic">
                  Calculating cost with reputation discount...
                </p>
              ) : (
                <>
                  <p className="text-sm text-purple-600 font-semibold">
                    Cost: {Number(voteCost).toFixed(2)} GOV tokens
                  </p>
                  {(() => {
                    const totalVotesCount = Number(previousVotes || 0) + Number(votes);
                    const prevVotes = Number(previousVotes || 0);
                    
                    // Calculate base cost (without any discount)
                    const baseCost = (totalVotesCount * totalVotesCount) - (prevVotes * prevVotes);
                    const actualCost = Number(voteCost);
                    
                    // Calculate savings
                    const savings = baseCost - actualCost;
                    
                    // Calculate the actual discount percentage
                    // If actualCost = baseCost * 0.96, then discount is 4%
                    // If actualCost = baseCost * 0.92, then discount is 8%
                    const discountPercent = baseCost > 0 ? ((savings / baseCost) * 100).toFixed(1) : "0.0";
                    
                    // Show discount info if there's a meaningful discount (>0.1%)
                    if (parseFloat(discountPercent) >= 0.1) {
                      return (
                        <>
                          <p className="text-xs text-gray-500">
                            Base cost: {baseCost.toFixed(2)} tokens
                          </p>
                          <p className="text-xs text-green-600">
                            💰 Saving {savings.toFixed(2)} tokens ({discountPercent}% discount) with your reputation!
                          </p>
                        </>
                      );
                    } else if (baseCost > 0) {
                      return (
                        <p className="text-xs text-gray-500">
                          No reputation discount applied
                        </p>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="flex space-x-3">
          <button
            type="submit"
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
              loading || !account || !votes || isNGO || isAdmin || votingBlocked || isProjectComplete
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white shadow-md hover:shadow-lg"
            }`}
            disabled={loading || !account || !votes || isNGO || isAdmin || votingBlocked || isProjectComplete}
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
            ) : isProjectComplete ? (
              "Project Complete"
            ) : votingBlocked ? (
              "Voting Disabled"
            ) : (
              "Cast Vote"
            )}
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
          💡 <strong>Quadratic Voting:</strong> Cost increases quadratically (votes²). Your balance: {parseFloat(balance).toFixed(2)} GOV
        </p>
      </div>
    </div>
  );
}

export default VoteOnProposal;