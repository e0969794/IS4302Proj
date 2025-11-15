import { createContext, useContext, useState } from 'react';
import {
  calculateCurrentMilestone,
  shouldBlockVoting,
  getMilestonesNeedingVerification as utilGetMilestonesNeedingVerification,
} from '../utils/milestoneUtils';

const MilestoneContext = createContext();

export const MilestoneProvider = ({ children }) => {
  const [milestoneStatus, setMilestoneStatus] = useState({});

  const [milestoneCompletion, setMilestoneCompletion] = useState({});

  const resetAllMilestones = () => {
    console.log('Clearing all milestone data');
    setMilestoneStatus({});
    setMilestoneCompletion({});
  };

  const resetProposalMilestones = (proposalId) => {
    setMilestoneStatus((prev) => {
      const next = { ...prev };
      delete next[proposalId];
      return next;
    });

    setMilestoneCompletion((prev) => {
      const next = { ...prev };
      delete next[proposalId];
      return next;
    });
  };

  const getCurrentMilestone = (proposalId, currentVotes, milestones) => {
    return calculateCurrentMilestone(currentVotes, milestones);
  };

  const isVotingBlocked = (proposalId, currentVotes, milestones) => {
    const statusForProposal = milestoneStatus[proposalId] || {};
    return shouldBlockVoting(currentVotes, milestones, statusForProposal);
  };

  /**
   * Mark that an NGO has submitted proof for a milestone.
   * This does NOT verify it — admin still needs to call verifyMilestone.
   */
  const markProofSubmitted = (proposalId, milestoneIndex, proofData) => {
    setMilestoneStatus((prev) => ({
      ...prev,
      [proposalId]: {
        ...(prev[proposalId] || {}),
        [milestoneIndex]: {
          ...(prev[proposalId]?.[milestoneIndex] || {}),
          verified: prev[proposalId]?.[milestoneIndex]?.verified || false,
          proofUrl: proofData.proofUrl,
          proofText: proofData.proofText,
          submittedAt: new Date().toISOString(),
        },
      },
    }));
  };

  /**
   * Mark a milestone as verified by admin.
   * Keeps existing proofUrl/proofText if not overridden.
   */
  const verifyMilestone = (proposalId, milestoneIndex, proofData) => {
    setMilestoneStatus((prev) => ({
      ...prev,
      [proposalId]: {
        ...(prev[proposalId] || {}),
        [milestoneIndex]: {
          ...(prev[proposalId]?.[milestoneIndex] || {}),
          verified: true,
          proofUrl:
            proofData?.proofUrl ??
            prev[proposalId]?.[milestoneIndex]?.proofUrl,
          proofText:
            proofData?.proofText ??
            prev[proposalId]?.[milestoneIndex]?.proofText,
          verifiedAt: new Date().toISOString(),
        },
      },
    }));
  };

  /**
   * Milestones that are “reached” by votes but not verified yet.
   * Used mainly for admin dashboards.
   */
  const getMilestonesNeedingVerification = (
    proposalId,
    currentVotes,
    milestones
  ) => {
    const statusForProposal = milestoneStatus[proposalId] || {};
    const result = utilGetMilestonesNeedingVerification(
      currentVotes,
      milestones,
      statusForProposal
    );
    console.log(`Milestones needing verification for ${proposalId}:`, result);
    return result;
  };

  /**
   * Returns the next milestone index that can be worked on:
   * - If there are completed but unverified milestones, returns the first such index
   *   (NGO should focus on providing/clarifying proof for it).
   * - If all completed milestones are verified, returns the next future milestone index.
   * - If all milestones are completed & verified, returns null.
   */
  const getNextAvailableMilestone = (proposalId, currentVotes, milestones) => {
    const currentMilestone = getCurrentMilestone(
      proposalId,
      currentVotes,
      milestones
    );

    // Any completed milestone that is not verified blocks progress
    for (let i = 0; i <= currentMilestone; i++) {
      const isVerified = milestoneStatus[proposalId]?.[i]?.verified || false;
      if (!isVerified) {
        return i; // first unverified completed milestone
      }
    }

    // All completed milestones verified — move to the next one, if any
    const nextIndex = currentMilestone + 1;
    return nextIndex < milestones.length ? nextIndex : null;
  };
  
  const value = {
    milestoneStatus,
    milestoneCompletion,

    // derived/calculation helpers
    getCurrentMilestone,
    isVotingBlocked,
    getMilestonesNeedingVerification,
    getNextAvailableMilestone,

    // mutation helpers
    markProofSubmitted, // NGO calls this after submitProof tx
    verifyMilestone,    // Admin calls this after verify tx
    resetProposalMilestones,
    resetAllMilestones,
  };

  return (
    <MilestoneContext.Provider value={value}>
      {children}
    </MilestoneContext.Provider>
  );
};

export const useMilestone = () => {
  const context = useContext(MilestoneContext);
  if (!context) {
    throw new Error('useMilestone must be used within a MilestoneProvider');
  }
  return context;
};
