import { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  calculateCurrentMilestone, 
  shouldBlockVoting, 
  getMilestonesNeedingVerification as utilGetMilestonesNeedingVerification,
  normalizeVoteCount 
} from '../utils/milestoneUtils';

const MilestoneContext = createContext();

export const MilestoneProvider = ({ children }) => {
  // Store milestone verification status: proposalId -> milestoneIndex -> { verified: boolean, proofUrl?: string, proofText?: string }
  const [milestoneStatus, setMilestoneStatus] = useState({});
  
  // Store milestone completion status: proposalId -> milestoneIndex -> boolean
  const [milestoneCompletion, setMilestoneCompletion] = useState({});

  // Clear all milestone data
  const resetAllMilestones = () => {
    console.log("Clearing all milestone data");
    setMilestoneStatus({});
    setMilestoneCompletion({});
  };

  // Calculate which milestone is currently reached based on votes
  const getCurrentMilestone = (proposalId, currentVotes, milestones) => {
    return calculateCurrentMilestone(currentVotes, milestones);
  };

  // Check if voting should be blocked for a proposal
  const isVotingBlocked = (proposalId, currentVotes, milestones) => {
    return shouldBlockVoting(currentVotes, milestones, milestoneStatus[proposalId] || {});
  };

  // Mark a milestone as verified
  const verifyMilestone = (proposalId, milestoneIndex, proofData) => {
    setMilestoneStatus(prev => ({
      ...prev,
      [proposalId]: {
        ...prev[proposalId],
        [milestoneIndex]: {
          verified: true,
          proofUrl: proofData.proofUrl,
          proofText: proofData.proofText,
          verifiedAt: new Date().toISOString()
        }
      }
    }));
  };

  // Get milestones that need verification (completed but not verified)
  const getMilestonesNeedingVerification = (proposalId, currentVotes, milestones) => {
    const result = utilGetMilestonesNeedingVerification(currentVotes, milestones, milestoneStatus[proposalId] || {});
    console.log(`Milestones needing verification for ${proposalId}:`, result);
    return result;
  };

  // Get the next milestone that can be worked on (all previous milestones verified)
  const getNextAvailableMilestone = (proposalId, currentVotes, milestones) => {
    const currentMilestone = getCurrentMilestone(proposalId, currentVotes, milestones);
    
    // Check if all completed milestones are verified
    for (let i = 0; i <= currentMilestone; i++) {
      const isVerified = milestoneStatus[proposalId]?.[i]?.verified || false;
      if (!isVerified) {
        return i; // This is the first unverified milestone
      }
    }
    
    // All completed milestones are verified, return next milestone to work towards
    return currentMilestone + 1 < milestones.length ? currentMilestone + 1 : null;
  };

  // Reset milestone data for a proposal (useful when refreshing data)
  const resetProposalMilestones = (proposalId) => {
    setMilestoneStatus(prev => {
      const newState = { ...prev };
      delete newState[proposalId];
      return newState;
    });
    setMilestoneCompletion(prev => {
      const newState = { ...prev };
      delete newState[proposalId];
      return newState;
    });
  };

  const value = {
    milestoneStatus,
    milestoneCompletion,
    getCurrentMilestone,
    isVotingBlocked,
    verifyMilestone,
    getMilestonesNeedingVerification,
    getNextAvailableMilestone,
    resetProposalMilestones,
    resetAllMilestones
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