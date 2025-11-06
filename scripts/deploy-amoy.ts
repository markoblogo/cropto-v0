import hre from "hardhat";
const { ethers } = hre;

async function main() {
  console.log("🚀 Deploying CROPT token to Polygon Amoy testnet...\n");

  const [deployer] = await ethers.getSigners();

  console.log("Deployer address:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MATIC");
  
  if (balance === 0n) {
    console.error("\n❌ ERROR: Deployer account has zero balance!");
    console.error("Please fund your account with Amoy testnet MATIC first.");
    console.error("\n📋 Get test MATIC from:");
    console.error("   https://faucet.polygon.technology/");
    console.error("   OR");
    console.error("   https://www.alchemy.com/faucets/polygon-amoy");
    process.exit(1);
  }

  console.log("\n📦 Deploying Cropt contract...");
  const Cropt = await ethers.getContractFactory("Cropt");
  
  const cropt = await Cropt.deploy(
    deployer.address, // defaultAdmin
    deployer.address  // minter
  );

  console.log("⏳ Waiting for deployment confirmation...");
  await cropt.waitForDeployment();

  const contractAddress = await cropt.getAddress();
  
  console.log("\n✅ CROPT token deployed successfully!");
  console.log("=" .repeat(60));
  console.log("Contract Address:", contractAddress);
  console.log("Network: Polygon Amoy (Chain ID: 80002)");
  console.log("Deployer:", deployer.address);
  console.log("=" .repeat(60));
  
  console.log("\n📝 Next Steps:");
  console.log("1. Add this address to your Replit Secrets:");
  console.log(`   CROPT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("\n2. Verify the contract on Polygonscan Amoy:");
  console.log(`   npx hardhat verify --network amoy ${contractAddress} ${deployer.address} ${deployer.address}`);
  console.log("\n3. View on Polygonscan:");
  console.log(`   https://amoy.polygonscan.com/address/${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
