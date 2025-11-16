import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
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

      const { proposalManager, votingManager, proofOracle } =
        await getContracts();

      // 1) Fetch all proposals
      const proposalsRaw = await proposalManager
        .getAllProposals()
        .catch((err) => {
          console.error("Failed to fetch proposals:", err);
          throw new Error("Failed to fetch proposals: " + err.message);
        });
      console.log("Proposals:", proposalsRaw);

      const proposalData = [];
      const voteData = {};

      // Build proposal & votes first
      for (let proposal of proposalsRaw) {
        console.log(`Processing proposal ${proposal.id}: NGO=${proposal.ngo}`);

        // NGO only sees own proposals
        if (isNGO && proposal.ngo.toLowerCase() !== account.toLowerCase()) {
          console.log(
            `Skipping proposal ${proposal.id} - NGO can only see own proposals`
          );
          continue;
        }

        // Check if NGO is suspended
        let isSuspended = false;
        try {
          isSuspended = await proposalManager.isNGOSuspended(proposal.ngo);
          console.log(`NGO ${proposal.ngo} suspended status: ${isSuspended}`);
        } catch (err) {
          console.error(
            `Failed to check suspension status for NGO ${proposal.ngo}:`,
            err
          );
          // Continue processing but assume not suspended if check fails
        }

        // Votes for this proposal
        const votes = await votingManager
          .getProposalVotes(proposal.id)
          .catch((err) => {
            console.error(
              `Failed to fetch votes for proposal ${proposal.id}:`,
              err
            );
            return 0n; // fallback
          });
        voteData[proposal.id.toString()] = votes.toString();

        const totalFundsBigInt = proposal.milestones.reduce(
          (acc, m) => acc + m.amount,
          0n
        );

        // Basic proposal info
        const pInfo = {
          id: proposal.id.toString(),
          ngo: proposal.ngo,
          isSuspended: isSuspended, // Add suspended status
          milestones: proposal.milestones.map((milestone, index) => ({
            index,
            description: milestone.description,
            amount: milestone.amount.toString(),
            verified: milestone.verified, // from ProposalManager
            proofHash: milestone.proofHash,
            completed: false, // derived later if you want
          })),
          totalFunds: totalFundsBigInt,
        };

        proposalData.push(pInfo);
      }

      // 2) Now build proof state for ALL proposals/milestones from ProofOracle
      const proofData = {}; // { [proposalId]: { [milestoneIndex]: submissionId } }
      const rejectedProofsData = {}; // { [proposalId]: { [milestoneIndex]: { rejected, reason } } }

      const totalProofs = await proofOracle.proofCount(); // public uint256 -> BigInt
      const total = Number(totalProofs);

      for (let submissionId = 0; submissionId < total; submissionId++) {
        try {
          const sub = await proofOracle.getSubmission(submissionId);
          // sub has fields: proposalId, milestoneIndex, proofURL, ngo,
          // submittedAt, processed, approved, reason

          // Skip empty slots (shouldn't really happen, but safe)
          if (!sub.submittedAt || sub.submittedAt === 0n) continue;

          const propIdStr = sub.proposalId.toString();
          const mIndex = Number(sub.milestoneIndex);

          if (!proofData[propIdStr]) proofData[propIdStr] = {};
          if (!rejectedProofsData[propIdStr])
            rejectedProofsData[propIdStr] = {};

          if (sub.processed && !sub.approved) {
            // Rejected proof
            rejectedProofsData[propIdStr][mIndex] = {
              rejected: true,
              reason: sub.reason || "No reason provided",
            };
            // No pending proof for review
            if (proofData[propIdStr][mIndex] !== undefined) {
              delete proofData[propIdStr][mIndex];
            }
          } else if (!sub.processed) {
            // Submitted, pending admin review
            proofData[propIdStr][mIndex] = submissionId;
            rejectedProofsData[propIdStr][mIndex] = { rejected: false };
          } else if (sub.processed && sub.approved) {
            // Approved – milestone.verified should be true via ProposalManager
            rejectedProofsData[propIdStr][mIndex] = { rejected: false };
            if (proofData[propIdStr][mIndex] !== undefined) {
              delete proofData[propIdStr][mIndex];
            }
          }
        } catch (err) {
          console.error(`Error reading submission ${submissionId}:`, err);
        }
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
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          Connect Your Wallet
        </h3>
        <p className="text-gray-600">
          Please connect your wallet to view and vote on proposals.
        </p>
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
        <h3 className="text-xl font-semibold text-red-800 mb-2">
          Error Loading Proposals
        </h3>
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
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          {emptyMessage}
        </h3>
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
            : "Vote on charity projects and help fund meaningful initiatives"}
        </p>
      </div>

      <div className="w-full grid gap-6">
        {proposals.map((p) => (
          <div
            key={p.id.toString()}
            className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300"
          >
            {/* Proposal Header */}
            <div
              className={`p-6 border-b border-gray-100 ${
                p.isSuspended
                  ? "bg-gradient-to-r from-red-50 to-red-100"
                  : "bg-gradient-to-r from-blue-50 to-purple-50"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <h3
                      className={`text-2xl font-bold ${
                        p.isSuspended ? "text-red-800" : "text-gray-800"
                      }`}
                    >
                      Proposal #{p.id.toString()}
                    </h3>
                    {p.isSuspended && (
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                        🚫 INVALIDATED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    {(() => {
                      if (p.isSuspended) {
                        return (
                          <span className="flex items-center">
                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                            NGO Suspended - Proposal Invalidated
                          </span>
                        );
                      }

                      const allMilestonesVerified = p.milestones?.every(
                        (m) => m.verified
                      );
                      const currentVotes = voteCounts[p.id] || "0";
                      const currentMilestone = getCurrentMilestone(
                        p.id,
                        currentVotes,
                        p.milestones
                      );
                      const isProjectComplete =
                        currentMilestone >= p.milestones?.length - 1 &&
                        allMilestonesVerified;

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
                    <span
                      className={
                        p.isSuspended ? "text-red-700 font-semibold" : ""
                      }
                    >
                      NGO: {p.ngo.slice(0, 6)}...{p.ngo.slice(-4)}
                      {p.isSuspended && " (SUSPENDED)"}
                    </span>
                  </div>
                  {p.isSuspended && (
                    <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs">
                      <p className="text-red-800 font-semibold">
                        ⚠️ This proposal has been invalidated
                      </p>
                      <p className="text-red-700">
                        The NGO has been suspended for submitting invalid proof.
                        No further votes will be accepted, and any remaining
                        funds will be returned to the treasury.
                      </p>
                    </div>
                  )}
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
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      p.isSuspended
                        ? "bg-red-100 text-red-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {(() => {
                      try {
                        const voteText = (voteCounts[p.id] || "0") + " votes";
                        return p.isSuspended
                          ? `${voteText} (FROZEN)`
                          : voteText;
                      } catch (error) {
                        console.error("Error formatting vote count:", error);
                        return p.isSuspended ? "0 votes (FROZEN)" : "0 votes";
                      }
                    })()}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="flex-1 mx-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        p.isSuspended
                          ? "bg-gradient-to-r from-red-400 to-red-500"
                          : "bg-gradient-to-r from-blue-500 to-purple-600"
                      }`}
                      style={{
                        width: `${(() => {
                          try {
                            return Math.min(
                              (parseFloat(voteCounts[p.id] || "0") /
                                parseFloat(ethers.formatEther(p.totalFunds))) *
                                100,
                              100
                            );
                          } catch (error) {
                            console.error("Error calculating progress:", error);
                            return 0;
                          }
                        })()}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <span
                  className={`text-sm ${
                    p.isSuspended
                      ? "text-red-600 font-semibold"
                      : "text-gray-600"
                  }`}
                >
                  {(() => {
                    try {
                      const percentage =
                        (
                          (parseFloat(voteCounts[p.id] || "0") /
                            parseFloat(ethers.formatEther(p.totalFunds))) *
                          100
                        ).toFixed(1) + "%";
                      return p.isSuspended
                        ? `${percentage} (STOPPED)`
                        : percentage;
                    } catch (error) {
                      console.error("Error calculating percentage:", error);
                      return p.isSuspended ? "0% (STOPPED)" : "0%";
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
                  const currentMilestone = getCurrentMilestone(
                    p.id,
                    currentVotes,
                    p.milestones
                  );
                  const isCompleted = index <= currentMilestone;
                  const proofId = submittedProofs[p.id]?.[index];
                  const proofSubmitted =
                    proofId !== undefined && proofId !== null;
                  const isRejected =
                    rejectedProofs[p.id]?.[index]?.rejected || false;
                  const rejectionReason =
                    rejectedProofs[p.id]?.[index]?.reason || "";
                  const needsVerification =
                    isCompleted &&
                    !m.verified &&
                    !proofSubmitted &&
                    !isRejected;

                  return (
                    <div key={index}>
                      <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 mb-1">
                            {m.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">
                              Target: {ethers.formatEther(m.amount)} ETH
                            </span>
                            <div className="flex space-x-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  isCompleted
                                    ? "bg-green-100 text-green-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {isCompleted ? "Completed" : "Pending"}
                              </span>
                              {(m.verified ||
                                proofSubmitted ||
                                needsVerification ||
                                isRejected) && (
                                <span
                                  className={`px-2 py-1 rounded-full text-xs ${
                                    m.verified
                                      ? "bg-blue-100 text-blue-800"
                                      : proofSubmitted
                                      ? "bg-purple-100 text-purple-800"
                                      : isRejected
                                      ? "bg-red-100 text-red-800"
                                      : "bg-orange-100 text-orange-800"
                                  }`}
                                >
                                  {m.verified
                                    ? "Verified"
                                    : proofSubmitted
                                    ? "Pending Review"
                                    : isRejected
                                    ? "Proof Rejected"
                                    : "Needs Proof"}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Show proof details if verified */}
                          {m.verified && milestoneStatus[p.id]?.[index] && (
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                              <p className="text-blue-800 font-medium">
                                Proof submitted:
                              </p>
                              <p className="text-blue-700">
                                {milestoneStatus[p.id][index].proofText}
                              </p>
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
                              <p className="text-red-800 font-semibold mb-1">
                                ⚠️ Proof Rejected by Admin
                              </p>
                              <p className="text-red-700">
                                <strong>Reason:</strong> {rejectionReason}
                              </p>
                              <p className="text-red-600 mt-1 italic">
                                Please submit a new proof addressing the
                                feedback above.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Show "Awaiting Admin Approval" message for NGOs when proof is submitted */}
                      {isNGO &&
                        account &&
                        p.ngo.toLowerCase() === account.toLowerCase() &&
                        proofSubmitted &&
                        !m.verified &&
                        !isRejected && (
                          <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="flex items-start space-x-2">
                              <span className="text-purple-600 text-lg">
                                ⏳
                              </span>
                              <div>
                                <p className="text-purple-800 font-semibold text-sm">
                                  Proof Submitted - Awaiting Admin Approval
                                </p>
                                <p className="text-purple-700 text-xs mt-1">
                                  Your proof has been submitted successfully. An
                                  administrator will review and approve it
                                  shortly.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Show milestone proof upload for NGOs when THIS specific milestone needs verification OR was rejected - but not if suspended */}
                      {isNGO &&
                        account &&
                        p.ngo.toLowerCase() === account.toLowerCase() &&
                        (needsVerification || isRejected) &&
                        !p.isSuspended && (
                          <ErrorBoundary>
                            <MilestoneProof
                              proposal={p}
                              milestoneIndex={index}
                              milestone={m}
                              onProofSubmitted={fetchProposals}
                            />
                          </ErrorBoundary>
                        )}

                      {/* Show message for suspended NGO trying to upload proof */}
                      {isNGO &&
                        account &&
                        p.ngo.toLowerCase() === account.toLowerCase() &&
                        (needsVerification || isRejected) &&
                        p.isSuspended && (
                          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-start space-x-2">
                              <span className="text-red-600 text-lg">🚫</span>
                              <div>
                                <p className="text-red-800 font-semibold text-sm">
                                  NGO Account Suspended
                                </p>
                                <p className="text-red-700 text-xs mt-1">
                                  Your NGO has been suspended for submitting
                                  invalid proof. You can no longer upload proofs
                                  or interact with proposals.
                                </p>
                              </div>
                            </div>
                          </div>
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

              {/* Voting Section - Only show for regular users, not NGOs or admins, and not for suspended NGOs */}
              {!isNGO && !isAdmin && !p.isSuspended && (
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

              {/* Show message for suspended proposal voting */}
              {!isNGO && !isAdmin && p.isSuspended && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-700 text-sm">
                      <strong>🚫 Voting Disabled:</strong> This proposal has
                      been invalidated due to NGO suspension. Voting is no
                      longer possible for this project.
                    </p>
                  </div>
                </div>
              )}

              {/* Information section for NGOs and Admins */}
              {(isNGO || isAdmin) && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div
                    className={`border rounded-lg p-4 ${
                      p.isSuspended
                        ? "bg-red-50 border-red-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <p
                      className={`text-sm ${
                        p.isSuspended ? "text-red-700" : "text-blue-700"
                      }`}
                    >
                      {isNGO && p.isSuspended && (
                        <>
                          <strong>🚫 Suspended NGO:</strong> Your NGO has been
                          suspended for submitting invalid proof. This proposal
                          is invalidated and you cannot create new proposals or
                          upload proofs.
                        </>
                      )}
                      {isNGO && !p.isSuspended && (
                        <>
                          <strong>📋 Your Proposal:</strong> This is one of your
                          charity project proposals. Only regular users can vote
                          on proposals.
                        </>
                      )}
                      {isAdmin && p.isSuspended && (
                        <>
                          <strong>👑 Admin View - Suspended NGO:</strong> This
                          NGO has been suspended for invalid proof submission.
                          The proposal is invalidated and no further
                          interactions are allowed.
                        </>
                      )}
                      {isAdmin && !p.isSuspended && (
                        <>
                          <strong>👑 Admin View:</strong> You can view all
                          proposals but cannot vote. Only regular users can vote
                          on proposals.
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
