import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";
import { useMilestone } from "../context/MilestoneContext";

function WalletConnect() {
  const { account, balance, updateAccount, updateBalance } = useWallet();
  const { resetAllMilestones } = useMilestone();
  const [error, setError] = useState(null);
  const isConnecting = useRef(false);

  const refreshBalance = async (address) => {
    try {
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
    }
  };

  const connectWallet = async () => {
    if (isConnecting.current) {
      console.log("Already connecting, skipping...");
      return;
    }
    isConnecting.current = true;
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
      // const { governanceToken } = await getContracts();
      // governanceToken.on("MintedOnDonation", (to, amount, donationId) => {
      //   console.log("MintedOnDonation event:", { to, amount: ethers.formatEther(amount), donationId });
      //   if (to.toLowerCase() === address.toLowerCase()) {
      //     refreshBalance(address);
      //   }
      // });
    } catch (err) {
      console.error("Connection failed:", err);
      setError("Failed to connect: " + err.message);
    } finally {
      isConnecting.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    const checkConnection = async () => {
      if (isConnecting.current || !mounted) {
        console.log("Already checking connection, skipping...");
        return;
      }
      isConnecting.current = true;
      try {
        if (!window.ethereum) return;
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
    };
  }, []);

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
  }, []);

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
                <p className="text-lg font-semibold text-blue-600">{balance} GOV</p>
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