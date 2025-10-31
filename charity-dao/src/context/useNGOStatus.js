import { useState, useEffect } from "react";
import { getContracts } from "../utils/contracts";
import { useWallet } from "./WalletContext";

export function useNGOStatus() {
  const { account } = useWallet();
  const [isNGO, setIsNGO] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      if (!account) {
        setIsNGO(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { ngoOracle, treasury } = await getContracts();
        
        // Check if NGO
        const ngoStatus = await ngoOracle.approvedNGOs(account);
        setIsNGO(ngoStatus);
        
        // Check if admin (has DEFAULT_ADMIN_ROLE on treasury)
        const adminRole = await treasury.DEFAULT_ADMIN_ROLE();
        const adminStatus = await treasury.hasRole(adminRole, account);
        setIsAdmin(adminStatus);
        
      } catch (error) {
        console.error("Error checking user status:", error);
        setIsNGO(false);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [account]);

  return { isNGO, isAdmin, loading };
}