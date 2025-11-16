import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useNGOStatus } from "../context/useNGOStatus";

function ReputationBadge() {
  const { account } = useWallet();
  const { isNGO, isAdmin, loading: statusLoading } = useNGOStatus();
  const [reputation, setReputation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const tierNames = ["No Reputation", "Good Voter", "Very Good Voter"];
  const tierDiscounts = ["0%", "~4%", "~8%"];
  const tierColors = {
    0: { 
      bg: "bg-gray-50", 
      text: "text-gray-700", 
      border: "border-gray-300", 
      badge: "bg-white border-2 border-gray-300 text-gray-700 hover:border-gray-400" 
    },
    1: { 
      bg: "bg-blue-50", 
      text: "text-blue-700", 
      border: "border-blue-300", 
      badge: "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700" 
    },
    2: { 
      bg: "bg-purple-50", 
      text: "text-purple-700", 
      border: "border-purple-300", 
      badge: "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700" 
    }
  };

  const tierEmojis = ["🆕", "⭐", "🏆"];

  const fetchReputation = async () => {
    if (!account) {
      setReputation(null);
      return;
    }

    // Don't show reputation for NGOs or admins - only for donors
    if (isNGO || isAdmin) {
      console.log("Skipping reputation fetch - user is NGO or admin");
      setReputation(null);
      return;
    }

    console.log("Fetching reputation for account:", account);
    setLoading(true);
    setError(null);

    try {
      const { votingManager, treasury, provider } = await getContracts();
      console.log("VotingManager address:", votingManager.address || votingManager.target);
      
      // Fetch voter reputation
      const [tier, sessions, uniqueProposals, daysActive, avgVotesPerSession] = 
        await votingManager.getVoterReputation(account);

      console.log("Raw reputation data:", { tier, sessions, uniqueProposals, daysActive, avgVotesPerSession });

      const reputationData = {
        tier: Number(tier),
        sessions: Number(sessions),
        uniqueProposals: Number(uniqueProposals),
        daysActive: Number(daysActive),
        avgVotesPerSession: Number(avgVotesPerSession)
      };
      
      console.log("Processed reputation data:", reputationData);
      setReputation(reputationData);

      // No donor statistics here — only reputation data is needed for the badge

      setError(null);
    } catch (err) {
      console.error("Failed to fetch reputation:", err);
      console.error("Error details:", {
        message: err.message,
        code: err.code,
        data: err.data
      });
      // Set default tier 0 reputation on error instead of failing
      setReputation({
        tier: 0,
        sessions: 0,
        uniqueProposals: 0,
        daysActive: 0,
        avgVotesPerSession: 0
      });
  // keep only reputation defaults
      setError(null); // Don't show error, just use defaults
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and when account changes
  useEffect(() => {
    if (!statusLoading) {
      fetchReputation();
    }
  }, [account, isNGO, isAdmin, statusLoading]);

  // Listen for vote events to refresh reputation in real-time
  useEffect(() => {
    if (!account || isNGO || isAdmin || statusLoading) return;

  let cleanupVoteCast;
  let cleanupReputationUpdated;
    
    const setupListeners = async () => {
      try {
        const { votingManager, treasury } = await getContracts();
        
        // Listen for VoterReputationUpdated events (better indicator)
        const handleReputationUpdated = (voter, totalSessions, uniqueProposals) => {
          console.log("VoterReputationUpdated event received:", { 
            voter, 
            totalSessions: totalSessions.toString(), 
            uniqueProposals: uniqueProposals.toString() 
          });
          
          // Only refresh if it's this user's reputation update
          if (voter.toLowerCase() === account.toLowerCase()) {
            console.log("Reputation update detected for current user!");
            // Add small delay to ensure blockchain state is fully updated
            setTimeout(() => {
              console.log("Fetching updated reputation...");
              fetchReputation();
            }, 500);
          }
        };

        // Also listen for ALL VoteCast events as backup
        const handleVoteCast = (voter, proposalId, voteId, votes, tokensCost) => {
          if (voter.toLowerCase() === account.toLowerCase()) {
            console.log("VoteCast detected for current user");
          }
        };

        votingManager.on("VoterReputationUpdated", handleReputationUpdated);
        votingManager.on("VoteCast", handleVoteCast);

        // Cleanup functions
        cleanupReputationUpdated = () => {
          votingManager.off("VoterReputationUpdated", handleReputationUpdated);
        };
        cleanupVoteCast = () => {
          votingManager.off("VoteCast", handleVoteCast);
        };
      } catch (err) {
        console.error("Failed to setup vote listeners:", err);
      }
    };

    setupListeners();
    
    return () => {
  if (cleanupReputationUpdated) cleanupReputationUpdated();
  if (cleanupVoteCast) cleanupVoteCast();
    };
  }, [account, isNGO, isAdmin, statusLoading]);

  if (!account) {
    return null;
  }

  // Don't show badge for NGOs or admins - reputation is only for donors
  if (isNGO || isAdmin) {
    return null;
  }

  if (statusLoading || loading) {
    return (
      <div className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
        <span className="text-xs text-gray-600">Loading reputation...</span>
      </div>
    );
  }

  // Always show badge - either with actual data or default tier 0
  const displayReputation = reputation || {
    tier: 0,
    sessions: 0,
    uniqueProposals: 0,
    daysActive: 0,
    avgVotesPerSession: 0
  };

  const colors = tierColors[displayReputation.tier];
  
  const getDisplayProgress = () => {
    const { tier, sessions, uniqueProposals, daysActive, avgVotesPerSession } = displayReputation;

    if (tier === 2) {
      return { message: "Maximum tier reached! 🎉", type: "success" };
    }

    // Check for whale behavior
    if (avgVotesPerSession > 10) {
      return { 
        message: "⚠️ High voting frequency detected. Spread your votes over more sessions to build reputation.",
        type: "warning"
      };
    }

    if (tier === 0) {
      if (sessions === 0) {
        return {
          message: "Start voting to build your reputation and earn discounts!",
          type: "info"
        };
      }
      const needSessions = Math.max(0, 3 - sessions);
      const needUnique = Math.max(0, 3 - uniqueProposals);
      const needDays = Math.max(0, 3 - daysActive);
      const avgVotesOk = avgVotesPerSession <= 7;
      
      return {
        message: `To reach Tier 1: ${needSessions} more session${needSessions !== 1 ? 's' : ''}, ${needUnique} more unique proposal${needUnique !== 1 ? 's' : ''}, ${needDays} more day${needDays !== 1 ? 's' : ''} active${!avgVotesOk ? ', reduce avg votes/session to ≤7' : ''}`,
        type: "info"
      };
    }

    if (tier === 1) {
      const needSessions = Math.max(0, 5 - sessions);
      const needUnique = Math.max(0, 4 - uniqueProposals);
      const needDays = Math.max(0, 7 - daysActive);
      const avgVotesOk = avgVotesPerSession <= 5;
      
      return {
        message: `To reach Tier 2: ${needSessions} more session${needSessions !== 1 ? 's' : ''}, ${needUnique} more unique proposal${needUnique !== 1 ? 's' : ''}, ${needDays} more day${needDays !== 1 ? 's' : ''} active${!avgVotesOk ? ', reduce avg votes/session to ≤5' : ''}`,
        type: "info"
      };
    }
  };
  
  const progress = getDisplayProgress();

  return (
    <>
      {/* Compact Badge - Click to open details */}
      <button
        onClick={() => setShowModal(true)}
        className={`${colors.badge} px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center space-x-2`}
      >
        <span className="text-xl">{tierEmojis[displayReputation.tier]}</span>
        <div className="text-left">
          <div className="text-xs opacity-75">Reputation</div>
          <div className="text-sm font-bold">
            Tier {displayReputation.tier}{displayReputation.tier > 0 ? ` • ${tierDiscounts[displayReputation.tier]}` : ''}
          </div>
        </div>
      </button>

      {/* Detailed Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={`${colors.bg} ${colors.border} border-b px-6 py-4 flex items-center justify-between`}>
              <div className="flex items-center space-x-3">
                <span className="text-4xl">{tierEmojis[displayReputation.tier]}</span>
                <div>
                  <h2 className={`text-2xl font-bold ${colors.text}`}>
                    {tierNames[displayReputation.tier]}
                  </h2>
                  <p className={`text-sm ${colors.text} opacity-75`}>
                    {displayReputation.tier === 0 ? 'No discount yet' : `${tierDiscounts[displayReputation.tier]} discount on voting costs`}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => fetchReputation()}
                  className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
                  title="Refresh reputation data"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800">Your Voting Stats</h3>
                {loading && (
                  <span className="text-xs text-gray-500 italic">Refreshing...</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-2xl">📊</span>
                    <span className="text-sm text-gray-600">Voting Sessions</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">{displayReputation.sessions}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-2xl">📝</span>
                    <span className="text-sm text-gray-600">Unique Proposals</span>
                  </div>
                  <p className="text-3xl font-bold text-green-700">{displayReputation.uniqueProposals}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-2xl">📅</span>
                    <span className="text-sm text-gray-600">Days Active</span>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">{displayReputation.daysActive}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-2xl">⚖️</span>
                    <span className="text-sm text-gray-600">Avg Votes/Session</span>
                  </div>
                  <p className="text-3xl font-bold text-orange-700">{displayReputation.avgVotesPerSession}</p>
                </div>
              </div>
            </div>

            {/* Donation stats removed — only reputation data shown */}

            {/* Progress Section */}
            {progress && (
              <div className={`px-6 py-4 border-b border-gray-200 ${
                progress.type === 'success' ? 'bg-green-50' :
                progress.type === 'warning' ? 'bg-yellow-50' :
                'bg-blue-50'
              }`}>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {displayReputation.tier === 2 ? "🎉 You've Reached the Top!" : "📈 Progress to Next Tier"}
                </h3>
                <p className={`text-sm ${
                  progress.type === 'success' ? 'text-green-700' :
                  progress.type === 'warning' ? 'text-yellow-700' :
                  'text-blue-700'
                }`}>
                  {progress.message}
                </p>
              </div>
            )}

            {/* Tier System Explanation */}
            <div className="px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Understanding Reputation Tiers</h3>
              <div className="space-y-3">
                {/* Tier 0 */}
                <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-gray-400">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">🆕</span>
                      <span className="font-semibold text-gray-800">Tier 0 - New Voter</span>
                    </div>
                    <span className="text-sm font-medium text-gray-600">0% discount</span>
                  </div>
                  <p className="text-sm text-gray-600">Everyone starts here. Begin voting to build your reputation!</p>
                </div>

                {/* Tier 1 */}
                <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">⭐</span>
                      <span className="font-semibold text-blue-800">Tier 1 - Good Voter</span>
                    </div>
                    <span className="text-sm font-medium text-blue-600">~4% discount</span>
                  </div>
                  <p className="text-sm text-blue-700 mb-2">Requirements:</p>
                  <ul className="text-sm text-blue-600 space-y-1 ml-4">
                    <li>• 3+ voting sessions</li>
                    <li>• 3+ unique proposals voted on</li>
                    <li>• 3+ days of voting activity</li>
                    <li>• Average ≤100 votes per session</li>
                  </ul>
                </div>

                {/* Tier 2 */}
                <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">🏆</span>
                      <span className="font-semibold text-purple-800">Tier 2 - Very Good Voter</span>
                    </div>
                    <span className="text-sm font-medium text-purple-600">~8% discount</span>
                  </div>
                  <p className="text-sm text-purple-700 mb-2">Requirements:</p>
                  <ul className="text-sm text-purple-600 space-y-1 ml-4">
                    <li>• 5+ voting sessions</li>
                    <li>• 5+ unique proposals voted on</li>
                    <li>• 7+ days of voting activity</li>
                    <li>• Average ≤100 votes per session</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Tips Section */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-purple-50 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">💡 Tips for Building Reputation</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>✅ Vote regularly over multiple days to show consistent engagement</li>
                <li>✅ Participate in diverse proposals to demonstrate broad interest</li>
                <li>✅ Cast smaller votes across multiple sessions (avoid whale behavior)</li>
                <li>✅ Your reputation builds trust and earns you better voting rates!</li>
              </ul>
            </div>

            {/* Close Button */}
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-3 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ReputationBadge;
