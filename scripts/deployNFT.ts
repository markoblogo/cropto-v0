import hre from "hardhat";
const { ethers } = hre;

async function main() {
  console.log("🚀 Deploying CroptOptionNFT contract...\n");

  const [deployer] = await ethers.getSigners();
  
  console.log("Deployer address:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MATIC");
  
  if (balance === 0n) {
    console.error("\n❌ ERROR: Deployer account has zero balance!");
    console.error("Please fund your account with Amoy testnet MATIC first.");
    console.error("\n📋 Get test MATIC from:");
    console.error("   https://faucet.polygon.technology/");
    process.exit(1);
  }

  console.log("\n📦 Deploying CroptOptionNFT contract...");
  
  // Deploy CroptOptionNFT
  const CroptOptionNFT = await ethers.getContractFactory("CroptOptionNFT");
  const nft = await CroptOptionNFT.deploy();
  
  console.log("⏳ Waiting for deployment confirmation...");
  await nft.waitForDeployment();
  
  const nftAddress = await nft.getAddress();

  console.log("\n✅ CroptOptionNFT deployed successfully!");
  console.log("=".repeat(60));
  console.log("Contract Address:", nftAddress);
  console.log("Name: Cropto Option NFT");
  console.log("Symbol: CROPTNFT");
  console.log("Network: Polygon Amoy (Chain ID: 80002)");
  console.log("Deployer:", deployer.address);
  console.log("=".repeat(60));
  
  console.log("\n📝 Next Steps:");
  console.log("1. Add this address to your Replit Secrets:");
  console.log(`   CROPT_NFT_CONTRACT_ADDRESS=${nftAddress}`);
  
  console.log("\n2. View on Polygonscan:");
  console.log(`   https://amoy.polygonscan.com/address/${nftAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
