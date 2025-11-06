import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const Cropt = await ethers.getContractFactory("Cropt");
  
  const cropt = await Cropt.deploy(
    deployer.address,
    deployer.address
  );

  await cropt.waitForDeployment();

  const contractAddress = await cropt.getAddress();
  console.log("Cropt token deployed to:", contractAddress);
  console.log("\nSave this address to your .env file as:");
  console.log(`CROPT_CONTRACT_ADDRESS=${contractAddress}`);
  
  console.log("\nVerify the contract on Polygonscan with:");
  console.log(`npx hardhat verify --network mumbai ${contractAddress} ${deployer.address} ${deployer.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
