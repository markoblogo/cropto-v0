import { ethers } from 'ethers';

const CROPT_DECIMALS = 18;

const CROPT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function mint(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

const CROPT_NFT_ABI = [
  'function mintOptionNFT(address to, uint256 optionId) returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let contract: ethers.Contract | null = null;
let nftContract: ethers.Contract | null = null;

function initializeProvider() {
  if (!process.env.POLYGON_AMOY_RPC_URL) {
    throw new Error('POLYGON_AMOY_RPC_URL not configured');
  }
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error('DEPLOYER_PRIVATE_KEY not configured');
  }
  if (!process.env.CROPT_CONTRACT_ADDRESS) {
    throw new Error('CROPT_CONTRACT_ADDRESS not configured');
  }

  provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
  signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  contract = new ethers.Contract(process.env.CROPT_CONTRACT_ADDRESS, CROPT_ABI, signer);
}

function initializeNFTContract() {
  if (!provider || !signer) {
    initializeProvider();
  }
  if (!process.env.CROPT_NFT_CONTRACT_ADDRESS) {
    throw new Error('CROPT_NFT_CONTRACT_ADDRESS not configured');
  }
  
  nftContract = new ethers.Contract(
    process.env.CROPT_NFT_CONTRACT_ADDRESS,
    CROPT_NFT_ABI,
    signer!
  );
}

export function humanToWei(amountHuman: string | number): bigint {
  return ethers.parseUnits(amountHuman.toString(), CROPT_DECIMALS);
}

export function weiToHuman(amountWei: bigint | string): string {
  return ethers.formatUnits(amountWei.toString(), CROPT_DECIMALS);
}

export async function getBalance(address: string): Promise<string> {
  if (!contract) initializeProvider();
  const balance = await contract!.balanceOf(address);
  return weiToHuman(balance);
}

export async function mintTo(address: string, amountHuman: string | number): Promise<string> {
  if (!contract) initializeProvider();
  const amountWei = humanToWei(amountHuman);
  const tx = await contract!.mint(address, amountWei);
  await tx.wait();
  return tx.hash;
}

export async function mintOptionNFT(toAddress: string, optionId: string): Promise<{ txHash: string; tokenId: number }> {
  if (!nftContract) initializeNFTContract();
  
  // Convert optionId (UUID string) to a numeric value for blockchain
  // Use a simple hash function to convert UUID to uint256
  const optionIdHash = BigInt('0x' + optionId.replace(/-/g, '').slice(0, 16));
  
  console.log(`Minting NFT for option ${optionId} to ${toAddress}...`);
  console.log(`Option ID hash: ${optionIdHash.toString()}`);
  
  const tx = await nftContract!.mintOptionNFT(toAddress, optionIdHash);
  console.log(`Transaction sent: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  
  // Extract tokenId from the Transfer event
  // Transfer event signature: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
  const transferEvent = receipt.logs.find((log: any) => {
    try {
      const parsed = nftContract!.interface.parseLog(log);
      return parsed?.name === 'Transfer';
    } catch {
      return false;
    }
  });
  
  if (!transferEvent) {
    throw new Error('Transfer event not found in transaction receipt');
  }
  
  const parsedLog = nftContract!.interface.parseLog(transferEvent);
  const tokenId = Number(parsedLog!.args.tokenId);
  
  console.log(`NFT minted successfully! Token ID: ${tokenId}`);
  
  return {
    txHash: tx.hash,
    tokenId
  };
}

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) initializeProvider();
  return provider!;
}

export function getSigner(): ethers.Wallet {
  if (!signer) initializeProvider();
  return signer!;
}

export function getContract(): ethers.Contract {
  if (!contract) initializeProvider();
  return contract!;
}

export function getNFTContract(): ethers.Contract {
  if (!nftContract) initializeNFTContract();
  return nftContract!;
}
