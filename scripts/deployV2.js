const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // .env.local is already loaded by hardhat.config.js
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  if (!usdcAddress) throw new Error("NEXT_PUBLIC_USDC_ADDRESS not set");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const Factory = await ethers.getContractFactory("ArcEscrowV2");
  const contract = await Factory.deploy(
    usdcAddress,       // usdc
    deployer.address,  // aiOracle (update later via setAiOracle)
    deployer.address   // platformWallet (update later via setPlatformWallet)
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("ArcEscrowV2 deployed to:", address);

  const out = { ArcEscrowV2: address, network: "arc_testnet", deployedAt: new Date().toISOString() };
  fs.writeFileSync(
    path.join(__dirname, "../deployed.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("Address saved to deployed.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
