import { ethers } from 'ethers';

/**
 * Utility functions for milestone status checking and voting calculations
 */

/**
 * Convert various vote count formats to a consistent ETH string format
 */
export const normalizeVoteCount = (voteCount) => {
  try {
    if (typeof voteCount === 'string') {
      // If it's already in ETH format (e.g., "5.0"), return as is
      if (!voteCount.includes('e') && parseFloat(voteCount) < 1000000) {
        return voteCount;
      }
      // If it's in wei format, convert to ETH
      return ethers.formatEther(voteCount);
    }
    if (typeof voteCount === 'number') {
      return voteCount.toString();
    }
    if (typeof voteCount === 'bigint') {
      return ethers.formatEther(voteCount);
    }
    return "0";
  } catch (error) {
    console.error('Error normalizing vote count:', error);
    return "0";
  }
};

/**
 * Calculate which milestone index is currently reached based on votes
 * Returns -1 if no milestone reached, otherwise returns the highest reached milestone index
 */
export const calculateCurrentMilestone = (voteCount, milestones) => {
  try {
    const normalizedVotes = normalizeVoteCount(voteCount);
    const votesInWei = ethers.parseEther(normalizedVotes);
    
    let lastReachedMilestone = -1;
    
    for (let i = 0; i < milestones.length; i++) {
      const milestoneAmount = ethers.parseEther(ethers.formatEther(milestones[i].amount));
      if (votesInWei >= milestoneAmount) {
        lastReachedMilestone = i;
      } else {
        break;
      }
    }
    
    return lastReachedMilestone;
  } catch (error) {
    console.error('Error calculating current milestone:', error);
    return -1;
  }
};

/**
 * Check if a specific milestone has been completed (vote threshold reached)
 */
export const isMilestoneCompleted = (voteCount, milestoneAmount) => {
  try {
    const normalizedVotes = normalizeVoteCount(voteCount);
    const votesInWei = ethers.parseEther(normalizedVotes);
    const milestoneInWei = ethers.parseEther(ethers.formatEther(milestoneAmount));
    
    return votesInWei >= milestoneInWei;
  } catch (error) {
    console.error('Error checking milestone completion:', error);
    return false;
  }
};

/**
 * Calculate progress percentage for a specific milestone
 */
export const calculateMilestoneProgress = (voteCount, milestoneAmount) => {
  try {
    const normalizedVotes = normalizeVoteCount(voteCount);
    const votesInWei = ethers.parseEther(normalizedVotes);
    const milestoneInWei = ethers.parseEther(ethers.formatEther(milestoneAmount));
    
    if (milestoneInWei === 0n) return 100;
    
    const progress = (Number(votesInWei) / Number(milestoneInWei)) * 100;
    return Math.min(progress, 100);
  } catch (error) {
    console.error('Error calculating milestone progress:', error);
    return 0;
  }
};

/**
 * Calculate overall project progress percentage
 */
export const calculateProjectProgress = (voteCount, totalFunds) => {
  try {
    const normalizedVotes = normalizeVoteCount(voteCount);
    const votesInWei = ethers.parseEther(normalizedVotes);
    const totalInWei = ethers.parseEther(ethers.formatEther(totalFunds));
    
    if (totalInWei === 0n) return 0;
    
    const progress = (Number(votesInWei) / Number(totalInWei)) * 100;
    return Math.min(progress, 100);
  } catch (error) {
    console.error('Error calculating project progress:', error);
    return 0;
  }
};

/**
 * Get the next milestone that voters should work towards
 */
export const getNextTargetMilestone = (voteCount, milestones) => {
  try {
    const currentMilestone = calculateCurrentMilestone(voteCount, milestones);
    
    // If no milestone reached yet, return the first one
    if (currentMilestone === -1) {
      return milestones.length > 0 ? 0 : null;
    }
    
    // Return the next milestone if there is one
    const nextMilestone = currentMilestone + 1;
    return nextMilestone < milestones.length ? nextMilestone : null;
  } catch (error) {
    console.error('Error getting next target milestone:', error);
    return null;
  }
};

/**
 * Check if voting should be blocked based on milestone verification status
 */
export const shouldBlockVoting = (voteCount, milestones, milestoneVerificationStatus) => {
  try {
    const currentMilestone = calculateCurrentMilestone(voteCount, milestones);
    
    // If no milestone reached, allow voting
    if (currentMilestone === -1) {
      return false;
    }
    
    // Check if any reached milestone is not verified
    for (let i = 0; i <= currentMilestone; i++) {
      const isVerified = milestoneVerificationStatus?.[i]?.verified || false;
      if (!isVerified) {
        return true; // Block voting if any completed milestone is unverified
      }
    }
    
    return false; // All completed milestones are verified, allow voting
  } catch (error) {
    console.error('Error checking if voting should be blocked:', error);
    return false;
  }
};

/**
 * Get milestones that need verification (completed but not verified)
 */
export const getMilestonesNeedingVerification = (voteCount, milestones, milestoneVerificationStatus) => {
  try {
    const currentMilestone = calculateCurrentMilestone(voteCount, milestones);
    const needingVerification = [];
    
    for (let i = 0; i <= currentMilestone; i++) {
      const isVerified = milestoneVerificationStatus?.[i]?.verified || false;
      if (!isVerified) {
        needingVerification.push(i);
      }
    }
    
    return needingVerification;
  } catch (error) {
    console.error('Error getting milestones needing verification:', error);
    return [];
  }
};

/**
 * Format vote count for display
 */
export const formatVoteCount = (voteCount) => {
  try {
    const normalized = normalizeVoteCount(voteCount);
    const number = parseFloat(normalized);
    
    if (number >= 1000) {
      return (number / 1000).toFixed(1) + 'K';
    }
    
    return number.toFixed(2);
  } catch (error) {
    console.error('Error formatting vote count:', error);
    return "0";
  }
};

/**
 * Check if a user can upload proof for a milestone
 */
export const canUploadProof = (userAddress, proposalNGO, milestoneIndex, voteCount, milestones, milestoneVerificationStatus) => {
  try {
    // Check if user is the NGO for this proposal
    if (!userAddress || !proposalNGO || userAddress.toLowerCase() !== proposalNGO.toLowerCase()) {
      return false;
    }
    
    // Check if milestone is completed
    if (milestoneIndex >= milestones.length) {
      return false;
    }
    
    const isMilestoneReached = isMilestoneCompleted(voteCount, milestones[milestoneIndex].amount);
    if (!isMilestoneReached) {
      return false;
    }
    
    // Check if milestone is already verified
    const isAlreadyVerified = milestoneVerificationStatus?.[milestoneIndex]?.verified || false;
    if (isAlreadyVerified) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking if user can upload proof:', error);
    return false;
  }
};