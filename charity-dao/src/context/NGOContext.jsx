import { createContext, useContext, useState, useCallback, useRef } from 'react';

const NGOContext = createContext();

export const NGOProvider = ({ children }) => {
  const [activeTab, setActiveTab] = useState("create");
  const ngoPanelRef = useRef(null);

  // Function to switch to milestone proof tab and scroll to it
  const navigateToMilestoneProof = useCallback((proposalId = null, milestoneIndex = null) => {
    // Switch to milestone tab
    setActiveTab("upload");
    
    // Scroll to NGO panel after a short delay to allow tab switch
    setTimeout(() => {
      if (ngoPanelRef.current) {
        ngoPanelRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
    
    // Return proposal and milestone info for pre-selection
    return { proposalId, milestoneIndex };
  }, []);

  // Function to switch to create proposal tab
  const navigateToCreateProposal = useCallback(() => {
    setActiveTab("create");
    
    setTimeout(() => {
      if (ngoPanelRef.current) {
        ngoPanelRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
  }, []);

  const value = {
    activeTab,
    setActiveTab,
    ngoPanelRef,
    navigateToMilestoneProof,
    navigateToCreateProposal
  };

  return (
    <NGOContext.Provider value={value}>
      {children}
    </NGOContext.Provider>
  );
};

export const useNGONavigation = () => {
  const context = useContext(NGOContext);
  if (!context) {
    throw new Error('useNGONavigation must be used within NGOProvider');
  }
  return context;
};