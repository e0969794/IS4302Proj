import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useMilestone } from "../context/MilestoneContext";

function WalletConnect() {
  const { account, balance, updateAccount, updateBalance } = useWallet();
  const { resetAllMilestones } = useMilestone();
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isConnecting = useRef(false);

  const refreshBalance = async (address) => {
    try {
      setIsSyncing(true);
      const { governanceToken } = await getContracts();
      const balanceWei = await governanceToken.balanceOf(address).catch(err => {
        console.error("Contract call failed:", err);
        return 0n; // Fallback to 0 on failure
      });
      console.log("Balance refreshed:", balanceWei.toString());
      updateBalance(ethers.formatEther(balanceWei));
    } catch (err) {
      console.error("Balance refresh error:", err);
      setError("Failed to refresh balance: " + err.message);
    } finally {
      // Add a short artificial delay so the animation is visible
      setTimeout(() => setIsSyncing(false), 1000); // 1s spinner visibility
    }
  };

  const connectWallet = async () => {
    if (isConnecting.current) {
      console.log("Already connecting, skipping...");
      return;
    }
    isConnecting.current = true;

    const { NGO_IPFS_URL } = await getContracts();

    console.log(NGO_IPFS_URL);
    
    try {
      if (!window.ethereum) {
        setError("MetaMask not installed");
        console.log("MetaMask not detected");
        return;
      }

      console.log("MetaMask detected:", !!window.ethereum);
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      console.log("Current chainId:", chainId);
      if (chainId !== "0x7a69") {
        console.log("Switching to Hardhat network (chainId: 0x7a69)");
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x7a69" }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "0x7a69",
                chainName: "Hardhat",
                rpcUrls: ["http://127.0.0.1:8545"],
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              }],
            });
          } else {
            throw switchError;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      console.log("Requesting accounts...");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      console.log("Connected accounts:", accounts);
      const address = accounts[0];
      updateAccount(address);

      await refreshBalance(address);
      resetAllMilestones(); // Clear milestones on connect

      // Listen for MintedOnDonation events
      const { provider, governanceToken, votingManager } = await getContracts();

      // Clean stale listeners (avoid duplicates on reconnect)
      if (governanceToken) governanceToken.removeAllListeners("MintedOnDonation");
      if (votingManager) votingManager.removeAllListeners("VoteCast");

      // Also clear block listener if it exists
      if (provider) provider.removeAllListeners("block");

      // Refresh balance when GOV tokens are minted (donation)
      governanceToken.on("MintedOnDonation", (to, amount, donationId) => {
        console.log("MintedOnDonation event:", { to, amount: ethers.formatEther(amount), donationId });
        if (to.toLowerCase() === address.toLowerCase()) {
          refreshBalance(address);
        }
      });
      
      // Refresh balance when user votes (GOV tokens are spent)
      votingManager.on("VoteCast", async (voter, proposalId, voteId, votes) => {
        console.log("🔔 VoteCast event detected:", {
          voter,
          proposalId: proposalId.toString(),
          votes: votes.toString(),
        });
        console.log("Voter:", voter.toLowerCase());
        console.log("Address: ", address.toLowerCase());
        if (voter.toLowerCase() === address.toLowerCase()) {
          console.log("✅ Detected vote by current user, refreshing GOV balance...");
          // wait a bit for the block to finalize
          setTimeout(() => refreshBalance(address), 500);
        }
      });

      // Block-based fallback for reliability
      provider.on("block", async () => {
        if (!address) return;
        const bal = await governanceToken.balanceOf(address);
        const formatted = ethers.formatEther(bal);
        if (formatted !== balance) updateBalance(formatted);
      });
    } catch (err) {
      console.error("Connection failed:", err);
      setError("Failed to connect: " + err.message);
    } finally {
      isConnecting.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const ensureHardhatChain = async () => {
      if (!window.ethereum) return;
      try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== "0x7a69") {
          console.log("Auto-switching to Hardhat (0x7a69)...");
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x7a69" }],
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: "0x7a69",
                  chainName: "Hardhat",
                  rpcUrls: ["http://127.0.0.1:8545"],
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                }],
              });
            } else {
              console.error("Failed to switch network:", switchError);
            }
          }
        }
      } catch (err) {
        console.error("Chain check failed:", err);
      }
    };

    const checkConnection = async () => {
      if (isConnecting.current || !mounted) {
        console.log("Already checking connection, skipping...");
        return;
      }
      isConnecting.current = true;
      try {
        if (!window.ethereum) return;

        // Ensure Hardhat chain before checking accounts
        await ensureHardhatChain();

        console.log("Checking existing accounts...");
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        console.log("Existing accounts:", accounts);
        if (accounts.length > 0 && mounted) {
          const address = accounts[0];
          updateAccount(address);
          await refreshBalance(address);
          resetAllMilestones(); // Clear on initial check
        }
      } catch (err) {
        console.error("Initial connection check failed:", err);
        setError("Initial connection check failed: " + err.message);
      } finally {
        isConnecting.current = false;
      }
    };

    if (window.ethereum) {
      checkConnection(); // Run once on mount
    }

    return () => {
      mounted = false; // Prevent updates after unmount
      // Remove blockchain listeners on unmount
      getContracts().then(({ votingManager, governanceToken, provider }) => {
        votingManager.removeAllListeners("VoteCast");
        governanceToken.removeAllListeners("MintedOnDonation");
        provider.removeAllListeners("block");
      }).catch(() => {});
    };
  }, [updateAccount]);

  useEffect(() => {
    if (!window.ethereum) return;

      const handleAccountsChanged = async (accounts) => {
        console.log("Accounts changed:", accounts);
        if (accounts.length > 0) {
          updateAccount(accounts[0]);
          await refreshBalance(accounts[0]);
          resetAllMilestones();
        } else {
          updateAccount(null);
          updateBalance("0");
        }
      };

      const handleChainChanged = (chainId) => {
        console.log("Chain changed:", chainId);
        updateAccount(null);
        updateBalance("0");
        setError(null);
        resetAllMilestones();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
          window.ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
  }, [updateAccount]);

  return (
    <div className="bg-white border-b border-gray-200 w-full">
      <div className="w-full px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-xl font-semibold text-gray-800">Charity DAO</span>
          </div>
          
          {account ? (
            <div className="flex items-center space-x-4 bg-gray-50 px-4 py-2 rounded-lg">
              <div className="text-right">
                <p className="text-sm text-gray-600">Connected Wallet</p>
                <p className="font-mono text-sm text-gray-800">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">GOV Balance</p>
                {isSyncing ? (
                  <div className="flex items-center justify-end space-x-2 text-gray-500 animate-pulse transition-opacity duration-300">
                    <svg
                      className="w-4 h-4 animate-spin text-gray-400"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <p className="text-lg">Sync…</p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold text-blue-600">{balance} GOV</p>
                )}
              </div>
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
          ) : (
            <button
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
              onClick={connectWallet}
            >
              Connect Wallet
            </button>
          )}
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default WalletConnect;