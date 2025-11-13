import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getContracts, getProposalContract } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useMilestone } from "../context/MilestoneContext";
import VoteOnProposal from "./VoteOnProposal";
import MilestoneProof from "./MilestoneProof";
import ProofReview from "./ProofReview";
import ErrorBoundary from "./ErrorBoundary";

function ProposalList({ isNGO, isAdmin, statusLoading }) {
  const { account } = useWallet();
  const { getCurrentMilestone, milestoneStatus } = useMilestone();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [voteCounts, setVoteCounts] = useState({});
  const [submittedProofs, setSubmittedProofs] = useState({}); // Track submitted proofs: {proposalId: {milestoneIndex: proofId}}
  const [rejectedProofs, setRejectedProofs] = useState({}); // Track rejected proofs: {proposalId: {milestoneIndex: {rejected: bool, reason: string}}}

  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { proposalManager, votingManager, proofOracle } = await getContracts();
      const proposals = await proposalManager.getAllProposals().catch(err => {
        console.error("Failed to fetch proposals:", err);
        throw new Error("Failed to fetch proposals: " + err.message);
      });
      console.log("Proposals:", proposals);

      const proposalData = [];
      const voteData = {};
      const proofData = {};
      const rejectedProofsData = {};

      for (let proposal of proposals) {
        console.log(`Processing proposal ${proposal.id}: NGO=${proposal.ngo}`);

        // Filter proposals based on user type
        // If user is NGO, only show their own proposals
        // If user is regular user or admin, show all proposals
        if (isNGO && proposal.ngo.toLowerCase() !== account.toLowerCase()) {
          console.log(`Skipping proposal ${proposal.id} - NGO can only see own proposals`);
          continue;
        }

        // Get vote count for this proposal
        const votes = await votingManager.getProposalVotes(proposal.id).catch(err => {
          console.error(`Failed to fetch votes for proposal ${proposal.id}:`, err);
          return 0n; // Fallback to 0 votes
        });
        voteData[proposal.id.toString()] = votes.toString();

        // Check for submitted proofs for each milestone
        proofData[proposal.id.toString()] = {};
        const rejectionData = {};
        for (let index = 0; index < proposal.milestones.length; index++) {
          try {
            const key = ethers.solidityPackedKeccak256(
              ['uint256', 'uint256', 'address'],
              [proposal.id, index, proposal.ngo]
            );
            const proofId = await proofOracle.proofIndex(key);

              if (proofId > 0) {
              // Fetch proof details to check if it was rejected or needs review
              const proof = await proofOracle.getProof(proofId);

              if (proof.processed && !proof.approved) {
                // Proof was rejected
                rejectionData[index] = {
                  rejected: true,
                  reason: proof.reason || "No reason provided"
                };
                proofData[proposal.id.toString()][index] = 0; // Don't show as submitted
              } else if (!proof.processed) {
                // Proof is submitted but not yet processed - show for admin review
                proofData[proposal.id.toString()][index] = Number(proofId);
                rejectionData[index] = { rejected: false };
              } else {
                // Proof was approved (processed && approved)
                proofData[proposal.id.toString()][index] = 0; // Hide review UI after approval
                rejectionData[index] = { rejected: false };
              }
            } else {
              proofData[proposal.id.toString()][index] = 0;
              rejectionData[index] = { rejected: false };
            }
          } catch (error) {
            console.error(`Error checking proof for proposal ${proposal.id} milestone ${index}:`, error);
            proofData[proposal.id.toString()][index] = 0;
            rejectionData[index] = { rejected: false };
          }
        }

        // Store rejection data for this proposal
        if (!rejectedProofsData[proposal.id.toString()]) {
          rejectedProofsData[proposal.id.toString()] = {};
        }
        rejectedProofsData[proposal.id.toString()] = rejectionData;

        const proposalInfo = {
          id: proposal.id.toString(),
          ngo: proposal.ngo,
          milestones: proposal.milestones.map((milestone, index) => ({
            index,
            description: milestone.description,
            amount: milestone.amount.toString(),
            verified: milestone.verified, // Read directly from contract
            proofHash: milestone.proofHash,
            completed: false // Will be calculated based on current votes
          })),
          totalFunds: proposal.milestones.length > 0 ?
            proposal.milestones[proposal.milestones.length - 1].amount.toString() : "0"
          // Removed approved status since proposals are auto-approved when created
        };

        proposalData.push(proposalInfo);
      }

      setProposals(proposalData);
      setVoteCounts(voteData);
      setSubmittedProofs(proofData);
      setRejectedProofs(rejectedProofsData);
    } catch (err) {
      console.error("Failed to fetch proposals:", err);
      setError(`Failed to fetch proposals: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [account, isNGO, milestoneStatus]);

  useEffect(() => {
    // Wait for status loading to complete before fetching proposals
    if (!account || statusLoading) return;
    fetchProposals(); // Fetch on mount or account change

    // Event listener for ProposalCreated
    let proposalManager;
    const setupEventListener = async () => {
      try {
        const { proposalManager: contract } = await getContracts();
        proposalManager = contract;
        proposalManager.on("ProposalCreated", (proposalId, ngo) => {
          console.log(`ProposalCreated event: ID=${proposalId}, NGO=${ngo}`);
          if (!statusLoading) {
            fetchProposals();
          }
        });
        // Removed ProposalApproved event listener since proposals are auto-approved
      } catch (error) {
        console.error("Failed to set up event listener:", error);
      }
    };
    
    if (!statusLoading) {
      setupEventListener();
    }

    return () => {
      if (proposalManager) {
        proposalManager.removeAllListeners("ProposalCreated");
        // Removed ProposalApproved listener cleanup since we don't listen for it anymore
      }
    };
  }, [account, isNGO, isAdmin, statusLoading]);

  if (!account) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔒</span>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">Connect Your Wallet</h3>
        <p className="text-gray-600">Please connect your wallet to view and vote on proposals.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading proposals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h3 className="text-xl font-semibold text-red-800 mb-2">Error Loading Proposals</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (proposals.length === 0) {
    const emptyMessage = isNGO 
      ? "You haven't created any proposals yet"
      : "No proposals available yet";
    const emptySubMessage = isNGO
      ? "Create your first charity proposal to get started!"
      : "Be the first to create a charity proposal!";
      
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">📋</span>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">{emptyMessage}</h3>
        <p className="text-gray-600">{emptySubMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-4 mb-2">
          <h2 className="text-3xl font-bold text-gray-800">
            {isNGO ? "Your Proposals" : "Active Proposals"}
          </h2>
          <button
            onClick={fetchProposals}
            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2"
            title="Refresh proposals"
          >
            <span className="text-lg">🔄</span>
            Refresh
          </button>
        </div>
        <p className="text-gray-600">
          {isNGO 
            ? "Manage and track your charity project proposals" 
            : isAdmin
            ? "Review all charity projects and their progress"
            : "Vote on charity projects and help fund meaningful initiatives"
          }
        </p>
      </div>
      
      <div className="w-full grid gap-6">
        {proposals.map((p) => (
          <div key={p.id.toString()} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300">
            {/* Proposal Header */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    Proposal #{p.id.toString()}
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    {(() => {
                      const allMilestonesVerified = p.milestones?.every((m) => m.verified);
                      const currentVotes = voteCounts[p.id] || "0";
                      const currentMilestone = getCurrentMilestone(p.id, currentVotes, p.milestones);
                      const isProjectComplete = currentMilestone >= (p.milestones?.length - 1) && allMilestonesVerified;

                      if (isProjectComplete) {
                        return (
                          <span className="flex items-center">
                            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                            Complete
                          </span>
                        );
                      } else {
                        return (
                          <span className="flex items-center">
                            <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                            Active
                          </span>
                        );
                      }
                    })()}
                    <span>NGO: {p.ngo.slice(0, 6)}...{p.ngo.slice(-4)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Total Funding Goal</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {ethers.formatEther(p.totalFunds)} ETH
                  </p>
                </div>
              </div>
              
              {/* Vote Count */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Current Votes:</span>
                  <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                    {(() => {
                      try {
                        return (voteCounts[p.id] || "0") + " votes";
                      } catch (error) {
                        console.error("Error formatting vote count:", error);
                        return "0 votes";
                      }
                    })()}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="flex-1 mx-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(() => {
                          try {
                            return Math.min(
                              (parseFloat(voteCounts[p.id] || "0") / 
                               parseFloat(ethers.formatEther(p.totalFunds))) * 100,
                              100
                            );
                          } catch (error) {
                            console.error("Error calculating progress:", error);
                            return 0;
                          }
                        })()}%`
                      }}
                    ></div>
                  </div>
                </div>
                
                <span className="text-sm text-gray-600">
                  {(() => {
                    try {
                      return ((parseFloat(voteCounts[p.id] || "0") / 
                               parseFloat(ethers.formatEther(p.totalFunds))) * 100).toFixed(1) + "%";
                    } catch (error) {
                      console.error("Error calculating percentage:", error);
                      return "0%";
                    }
                  })()}
                </span>
              </div>
            </div>

            {/* Milestones */}
            <div className="p-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <span className="w-5 h-5 bg-blue-100 rounded mr-2 flex items-center justify-center">
                  🎯
                </span>
                Project Milestones
              </h4>
              <div className="space-y-3">
                {p.milestones.map((m, index) => {
                  const currentVotes = voteCounts[p.id] || "0";
                  const currentMilestone = getCurrentMilestone(p.id, currentVotes, p.milestones);
                  const isCompleted = index <= currentMilestone;
                  const proofId = submittedProofs[p.id]?.[index] || 0;
                  const proofSubmitted = proofId > 0;
                  const isRejected = rejectedProofs[p.id]?.[index]?.rejected || false;
                  const rejectionReason = rejectedProofs[p.id]?.[index]?.reason || "";
                  const needsVerification = isCompleted && !m.verified && !proofSubmitted && !isRejected;

                  return (
                    <div key={index}>
                      <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 mb-1">{m.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">
                              Target: {ethers.formatEther(m.amount)} ETH
                            </span>
                            <div className="flex space-x-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                isCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {isCompleted ? 'Completed' : 'Pending'}
                              </span>
                              {(m.verified || proofSubmitted || needsVerification || isRejected) && (
                                <span
                                  className={`px-2 py-1 rounded-full text-xs ${
                                    m.verified ? 'bg-blue-100 text-blue-800'
                                      : proofSubmitted ? 'bg-purple-100 text-purple-800'
                                      : isRejected ? 'bg-red-100 text-red-800'
                                      : 'bg-orange-100 text-orange-800'
                                  }`}
                                >
                                  {m.verified ? 'Verified' : proofSubmitted ? 'Pending Review' : isRejected ? 'Proof Rejected' : 'Needs Proof'}
                                </span>
                              )}
                            </div>
                          </div>
                        
                          {/* Show proof details if verified */}
                          {m.verified && milestoneStatus[p.id]?.[index] && (
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                              <p className="text-blue-800 font-medium">Proof submitted:</p>
                              <p className="text-blue-700">{milestoneStatus[p.id][index].proofText}</p>
                              {milestoneStatus[p.id][index].proofUrl && (
                                <a
                                  href={milestoneStatus[p.id][index].proofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 underline"
                                >
                                  View supporting link
                                </a>
                              )}
                            </div>
                          )}

                          {/* Show rejection reason if proof was rejected */}
                          {isRejected && (
                            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs">
                              <p className="text-red-800 font-semibold mb-1">⚠️ Proof Rejected by Admin</p>
                              <p className="text-red-700"><strong>Reason:</strong> {rejectionReason}</p>
                              <p className="text-red-600 mt-1 italic">Please submit a new proof addressing the feedback above.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Show "Awaiting Admin Approval" message for NGOs when proof is submitted */}
                      {isNGO && account && p.ngo.toLowerCase() === account.toLowerCase() && proofSubmitted && !m.verified && !isRejected && (
                        <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <span className="text-purple-600 text-lg">⏳</span>
                            <div>
                              <p className="text-purple-800 font-semibold text-sm">Proof Submitted - Awaiting Admin Approval</p>
                              <p className="text-purple-700 text-xs mt-1">
                                Your proof has been submitted successfully. An administrator will review and approve it shortly.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Show milestone proof upload for NGOs when THIS specific milestone needs verification OR was rejected */}
                      {isNGO && account && p.ngo.toLowerCase() === account.toLowerCase() && (needsVerification || isRejected) && (
                        <ErrorBoundary>
                          <MilestoneProof
                            proposal={p}
                            milestoneIndex={index}
                            milestone={m}
                            onProofSubmitted={fetchProposals}
                          />
                        </ErrorBoundary>
                      )}

                      {/* Show proof review for admins when proof is submitted but not yet verified */}
                      {isAdmin && proofSubmitted && !m.verified && (
                        <ErrorBoundary>
                          <ProofReview
                            proofId={proofId}
                            onReviewComplete={fetchProposals}
                          />
                        </ErrorBoundary>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Voting Section - Only show for regular users, not NGOs or admins */}
              {!isNGO && !isAdmin && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <ErrorBoundary>
                    <VoteOnProposal
                      proposal={p}
                      onVoteSuccess={fetchProposals}
                      currentVoteCount={voteCounts[p.id] || "0"}
                      isNGO={isNGO}
                      isAdmin={isAdmin}
                      statusLoading={loading}
                    />
                  </ErrorBoundary>
                </div>
              )}
              
              {/* Information section for NGOs and Admins */}
              {(isNGO || isAdmin) && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-700 text-sm">
                      {isNGO && (
                        <>
                          <strong>📋 Your Proposal:</strong> This is one of your charity project proposals. 
                          Only regular users can vote on proposals.
                        </>
                      )}
                      {isAdmin && (
                        <>
                          <strong>👑 Admin View:</strong> You can view all proposals but cannot vote. 
                          Only regular users can vote on proposals.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProposalList;
