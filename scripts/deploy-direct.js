import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🚀 Deploying CROPT token to Polygon Amoy testnet...\n');

  // Check environment variables
  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl) {
    console.error('❌ POLYGON_AMOY_RPC_URL not set in environment');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not set in environment');
    process.exit(1);
  }

  // Connect to network
  console.log('📡 Connecting to Polygon Amoy...');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log('Deployer address:', wallet.address);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Account balance:', ethers.formatEther(balance), 'MATIC');

  if (balance === 0n) {
    console.error('\n❌ ERROR: Deployer account has zero balance!');
    console.error('Please fund your account with Amoy testnet MATIC first.');
    console.error('\n📋 Get test MATIC from:');
    console.error('   https://faucet.polygon.technology/');
    console.error('   OR');
    console.error('   https://www.alchemy.com/faucets/polygon-amoy');
    process.exit(1);
  }

  // Read compiled contract
  console.log('\n📦 Loading contract artifacts...');
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Cropt.sol', 'Cropt.json');
  
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Contract not compiled! Run: npx hardhat compile');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  
  // Deploy contract
  console.log('📤 Deploying contract...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  const contract = await factory.deploy(
    wallet.address, // defaultAdmin
    wallet.address  // minter
  );

  console.log('⏳ Waiting for deployment confirmation...');
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log('\n✅ CROPT token deployed successfully!');
  console.log('='.repeat(60));
  console.log('Contract Address:', contractAddress);
  console.log('Network: Polygon Amoy (Chain ID: 80002)');
  console.log('Deployer:', wallet.address);
  console.log('='.repeat(60));

  console.log('\n📝 Next Steps:');
  console.log('1. Add this address to your Replit Secrets:');
  console.log(`   CROPT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log('\n2. View on Polygonscan:');
  console.log(`   https://amoy.polygonscan.com/address/${contractAddress}`);
  console.log('\n3. Verify the contract (optional):');
  console.log(`   npx hardhat verify --network amoy ${contractAddress} ${wallet.address} ${wallet.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Deployment failed:');
    console.error(error);
    process.exit(1);
  });
