import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";

function WalletConnect() {
  const { account, balance, updateAccount, updateBalance } = useWallet();
  const [error, setError] = useState(null);
  const isConnecting = useRef(false);

  const refreshBalance = async (address) => {
    try {
      const { governanceToken } = await getContracts();
      const balanceWei = await governanceToken.balanceOf(address);
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

      // Listen for MintedOnDonation events
      const { governanceToken } = await getContracts();
      governanceToken.on("MintedOnDonation", (to, amount, donationId) => {
        console.log("MintedOnDonation event:", { to, amount: ethers.formatEther(amount), donationId });
        if (to.toLowerCase() === address.toLowerCase()) {
          refreshBalance(address);
        }
      });
    } catch (err) {
      console.error("Connect wallet error:", err);
      setError("Failed to connect: " + err.message);
    } finally {
      isConnecting.current = false;
    }
  };

  useEffect(() => {
    const checkConnection = async () => {
      if (isConnecting.current) {
        console.log("Already checking connection, skipping...");
        return;
      }
      isConnecting.current = true;
      try {
        if (!window.ethereum) return;
        console.log("Checking existing accounts...");
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        console.log("Existing accounts:", accounts);
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (err) {
        console.error("Initial connection check failed:", err);
        setError("Initial connection check failed: " + err.message);
      } finally {
        isConnecting.current = false;
      }
    };

    checkConnection();

    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        console.log("Accounts changed:", accounts);
        updateAccount(accounts[0] || null);
        if (accounts[0]) {
          await connectWallet();
        }
      };

      const handleChainChanged = (chainId) => {
        console.log("Chain changed:", chainId);
        updateAccount(null);
        checkConnection();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
          window.ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
    }
  }, [updateAccount]);

  return (
    <div className="p-4 bg-gray-800 text-white">
      {account ? (
        <div>
          <p className="text-lg">Connected: {account}</p>
          <p className="text-lg">GOV Balance: {balance} GOV</p>
        </div>
      ) : (
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          onClick={connectWallet}
        >
          Connect Wallet
        </button>
      )}
      {error && <p className="text-red-500 mt-2">{error}</p>}
    </div>
  );
}

export default WalletConnect;