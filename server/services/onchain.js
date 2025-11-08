import { ethers } from 'ethers';

const CROPT_DECIMALS = 18;

const CROPT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function mint(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

let provider;
let signer;
let contract;

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

export function humanToWei(amountHuman) {
  return ethers.parseUnits(amountHuman.toString(), CROPT_DECIMALS);
}

export function weiToHuman(amountWei) {
  return ethers.formatUnits(amountWei.toString(), CROPT_DECIMALS);
}

export async function getBalance(address) {
  if (!contract) initializeProvider();
  const balance = await contract.balanceOf(address);
  return weiToHuman(balance);
}

export async function mintTo(address, amountHuman) {
  if (!contract) initializeProvider();
  const amountWei = humanToWei(amountHuman);
  const tx = await contract.mint(address, amountWei);
  await tx.wait();
  return tx.hash;
}

export function getProvider() {
  if (!provider) initializeProvider();
  return provider;
}

export function getSigner() {
  if (!signer) initializeProvider();
  return signer;
}

export function getContract() {
  if (!contract) initializeProvider();
  return contract;
}
