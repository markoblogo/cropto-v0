import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  console.log("🚀 Deploying CroptOptionNFT contract...\n");

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("❌ ERROR: Missing environment variables!");
    console.error("   POLYGON_AMOY_RPC_URL:", rpcUrl ? "✓" : "✗");
    console.error("   DEPLOYER_PRIVATE_KEY:", privateKey ? "✓" : "✗");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deployer address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Account balance:", ethers.formatEther(balance), "MATIC");

  if (balance === 0n) {
    console.error("\n❌ ERROR: Deployer account has zero balance!");
    console.error("Please fund your account with Amoy testnet MATIC first.");
    console.error("\n📋 Get test MATIC from:");
    console.error("   https://faucet.polygon.technology/");
    process.exit(1);
  }

  console.log("\n📦 Loading contract artifacts...");
  
  // Load compiled contract
  const artifactPath = join(process.cwd(), "artifacts", "contracts", "CroptOptionNFT.sol", "CroptOptionNFT.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log("📦 Deploying CroptOptionNFT contract...");
  
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();

  console.log("⏳ Waiting for deployment confirmation...");
  await contract.waitForDeployment();

  const nftAddress = await contract.getAddress();

  console.log("\n✅ CroptOptionNFT deployed successfully!");
  console.log("=".repeat(60));
  console.log("Contract Address:", nftAddress);
  console.log("Name: Cropto Option NFT");
  console.log("Symbol: CROPTNFT");
  console.log("Network: Polygon Amoy (Chain ID: 80002)");
  console.log("Deployer:", wallet.address);
  console.log("=".repeat(60));

  console.log("\n📝 Next Steps:");
  console.log("1. Add this address to your Replit Secrets:");
  console.log(`   CROPT_NFT_CONTRACT_ADDRESS=${nftAddress}`);

  console.log("\n2. View on Polygonscan:");
  console.log(`   https://amoy.polygonscan.com/address/${nftAddress}`);
  
  console.log("\n🎉 Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
