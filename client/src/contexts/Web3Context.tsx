import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers, BrowserProvider, Contract } from "ethers";

const CROPT_ABI = [
  "function mint(address to, uint256 amount) public",
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)",
  "function symbol() public view returns (string)",
  "function name() public view returns (string)",
];

interface Web3ContextType {
  provider: BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  address: string | null;
  balance: string | null;
  croptBalance: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  refreshBalances: () => Promise<void>;
  isConnecting: boolean;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [croptBalance, setCroptBalance] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const refreshBalances = useCallback(async () => {
    if (!provider || !address) return;

    try {
      const ethBalance = await provider.getBalance(address);
      setBalance(ethers.formatEther(ethBalance));

      const contractAddress = import.meta.env.VITE_CROPT_CONTRACT_ADDRESS;
      if (contractAddress) {
        const croptContract = new Contract(contractAddress, CROPT_ABI, provider);
        const tokenBalance = await croptContract.balanceOf(address);
        setCroptBalance(ethers.formatEther(tokenBalance));
      }
    } catch (error) {
      console.error("Error refreshing balances:", error);
    }
  }, [provider, address]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install MetaMask to connect your wallet.");
      return;
    }

    try {
      setIsConnecting(true);
      
      const web3Provider = new BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ 
        method: "eth_requestAccounts" 
      });
      
      const web3Signer = await web3Provider.getSigner();
      const userAddress = accounts[0];

      setProvider(web3Provider);
      setSigner(web3Signer);
      setAddress(userAddress);

      const ethBalance = await web3Provider.getBalance(userAddress);
      setBalance(ethers.formatEther(ethBalance));

      const contractAddress = import.meta.env.VITE_CROPT_CONTRACT_ADDRESS;
      if (contractAddress) {
        const croptContract = new Contract(contractAddress, CROPT_ABI, web3Provider);
        const tokenBalance = await croptContract.balanceOf(userAddress);
        setCroptBalance(ethers.formatEther(tokenBalance));
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setBalance(null);
    setCroptBalance(null);
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          setAddress(accounts[0]);
          refreshBalances();
        }
      });

      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    }
  }, [refreshBalances]);

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        address,
        balance,
        croptBalance,
        connectWallet,
        disconnectWallet,
        refreshBalances,
        isConnecting,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within Web3Provider");
  }
  return context;
}
