import { ethers } from 'ethers';

const CROPT_DECIMALS = 18;

const CROPT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function mint(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

const CROPT_NFT_ABI = [
  'function safeMint(address to, string memory optionId, string memory uri) returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isOptionMinted(string memory optionId) view returns (bool)',
  'event OptionNFTMinted(address indexed to, uint256 indexed tokenId, string optionId, string tokenURI)'
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
  
  // Generate metadata URI for the NFT
  // In production, this would point to IPFS or a proper metadata server
  const metadata = {
    name: `Cropto Option #${optionId.slice(0, 8)}`,
    description: `Tokenized option contract for Cropto platform`,
    image: `https://cropto.repl.co/api/nft/${optionId}/image`,
    attributes: [
      { trait_type: "Option ID", value: optionId },
      { trait_type: "Platform", value: "Cropto" }
    ]
  };
  
  // For now, use a data URI or placeholder
  const metadataURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
  
  console.log(`Minting NFT for option ${optionId} to ${toAddress}...`);
  
  const tx = await nftContract!.safeMint(toAddress, optionId, metadataURI);
  console.log(`Transaction sent: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  console.log(`Receipt has ${receipt.logs.length} logs`);
  
  // Extract tokenId from the OptionNFTMinted event
  let tokenId: number | null = null;
  
  for (const log of receipt.logs) {
    try {
      const parsed = nftContract!.interface.parseLog({
        topics: [...log.topics],
        data: log.data
      });
      
      console.log(`Found event: ${parsed?.name}`);
      
      if (parsed?.name === 'OptionNFTMinted') {
        tokenId = Number(parsed.args.tokenId);
        console.log(`NFT minted successfully! Token ID: ${tokenId}`);
        break;
      }
    } catch (error) {
      // Not a log from our contract, skip it
      continue;
    }
  }
  
  if (tokenId === null) {
    console.error('OptionNFTMinted event not found. Dumping all logs for debugging:');
    receipt.logs.forEach((log: any, i: number) => {
      console.log(`Log ${i}:`, JSON.stringify({
        address: log.address,
        topics: log.topics,
        data: log.data
      }, null, 2));
    });
    throw new Error('OptionNFTMinted event not found in transaction receipt');
  }
  
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
