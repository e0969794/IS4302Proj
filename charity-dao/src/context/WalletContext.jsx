import { createContext, useContext, useState, useCallback } from "react";

const WalletContext = createContext();

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState("0");

  const updateAccount = useCallback((newAccount) => {
    setAccount(newAccount);
    if (!newAccount) setBalance("0");
  }, []);

  const updateBalance = useCallback((newBalance) => {
    setBalance(prevBalance => {
      console.log("🔄 WalletContext.updateBalance called:", {
        oldBalance: prevBalance,
        newBalance,
        changed: prevBalance !== newBalance,
        timestamp: new Date().toISOString()
      });
      return newBalance;
    });
  }, []);

  return (
    <WalletContext.Provider value={{ account, balance, updateAccount, updateBalance }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
