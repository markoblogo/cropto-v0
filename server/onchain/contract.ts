import { ethers } from "ethers";

const CROPT_ABI = [
  "function mint(address to, uint256 amount) public",
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)",
  "function symbol() public view returns (string)",
  "function name() public view returns (string)",
];

export function getCroptContract() {
  if (!process.env.POLYGON_AMOY_RPC_URL) {
    throw new Error("POLYGON_AMOY_RPC_URL not configured");
  }
  
  if (!process.env.CROPT_CONTRACT_ADDRESS) {
    throw new Error("CROPT_CONTRACT_ADDRESS not configured");
  }

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  }

  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  const contract = new ethers.Contract(
    process.env.CROPT_CONTRACT_ADDRESS,
    CROPT_ABI,
    wallet
  );

  return { contract, provider, wallet };
}

export async function getBalance(address: string): Promise<string> {
  const { contract } = getCroptContract();
  const balance = await contract.balanceOf(address);
  return ethers.formatEther(balance);
}

export async function mintTokens(to: string, amount: string): Promise<string> {
  const { contract } = getCroptContract();
  
  const amountWei = ethers.parseEther(amount);
  
  const tx = await contract.mint(to, amountWei);
  
  return tx.hash;
}
