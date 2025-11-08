import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Test script for NFT minting functionality
 * This validates the contract interaction without deploying
 */
async function main() {
  console.log("🧪 Testing NFT Mint Logic\n");

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const nftAddress = process.env.CROPT_NFT_CONTRACT_ADDRESS;

  if (!rpcUrl || !privateKey || !nftAddress) {
    console.error("❌ ERROR: Missing environment variables!");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Wallet address:", wallet.address);
  console.log("NFT Contract:", nftAddress);

  // Load contract ABI
  const artifactPath = join(
    process.cwd(),
    "artifacts",
    "contracts",
    "CroptOptionNFT.sol",
    "CroptOptionNFT.json"
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const contract = new ethers.Contract(nftAddress, artifact.abi, wallet);

  // Test 1: Check if first option is already minted
  console.log("\n📋 Test 1: Check contract state");
  const testOptionId = "test-option-001";
  
  try {
    const isMinted = await contract.isOptionMinted(testOptionId);
    console.log(`  Option "${testOptionId}" minted: ${isMinted}`);
    
    if (isMinted) {
      const tokenId = await contract.getTokenIdByOptionId(testOptionId);
      console.log(`  Token ID: ${tokenId}`);
    }
  } catch (error: any) {
    console.error(`  Error checking mint status: ${error.message}`);
  }

  // Test 2: Estimate gas for minting
  console.log("\n💰 Test 2: Estimate gas costs");
  const testAddress = wallet.address;
  const testMetadataURI = "ipfs://test-metadata";
  
  try {
    const gasEstimate = await contract.safeMint.estimateGas(
      testAddress,
      testOptionId,
      testMetadataURI
    );
    
    const gasPrice = await provider.getFeeData();
    const estimatedCost = gasEstimate * (gasPrice.gasPrice || 0n);
    
    console.log(`  Estimated gas: ${gasEstimate.toString()}`);
    console.log(`  Gas price: ${ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei")} gwei`);
    console.log(`  Estimated cost: ${ethers.formatEther(estimatedCost)} MATIC`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`  Wallet balance: ${ethers.formatEther(balance)} MATIC`);
    
    if (balance < estimatedCost) {
      console.log(`  ⚠️  Insufficient balance for minting`);
    } else {
      console.log(`  ✅ Sufficient balance for minting`);
    }
  } catch (error: any) {
    console.error(`  Error estimating gas: ${error.message}`);
  }

  // Test 3: Validate ABI matches expected interface
  console.log("\n🔍 Test 3: Validate contract interface");
  const expectedFunctions = [
    "safeMint",
    "isOptionMinted",
    "getTokenIdByOptionId",
    "getOptionIdByTokenId",
  ];
  
  for (const funcName of expectedFunctions) {
    const hasFunc = contract.interface.hasFunction(funcName);
    console.log(`  ${hasFunc ? "✅" : "❌"} ${funcName}`);
  }

  console.log("\n✅ Test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  });
