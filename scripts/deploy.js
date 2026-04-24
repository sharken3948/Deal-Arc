const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance    = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Deployer :", deployer.address);
  console.log("Balance  :", hre.ethers.formatEther(balance), "ARC");

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const AI_ORACLE    = deployer.address; // owner can update via setAiOracle()

  console.log("\nDeploying ArcEscrow...");
  const ArcEscrow = await hre.ethers.getContractFactory("ArcEscrow");
  const contract  = await ArcEscrow.deploy(USDC_ADDRESS, AI_ORACLE);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Deployed :", address);
  console.log("Explorer :", `https://testnet.arcscan.app/address/${address}`);

  // Write ESCROW_CONTRACT_ADDRESS to .env.local
  const envPath = path.join(__dirname, "../.env.local");
  let env = fs.readFileSync(envPath, "utf8");
  if (env.includes("ESCROW_CONTRACT_ADDRESS=")) {
    env = env.replace(/ESCROW_CONTRACT_ADDRESS=.*/g, `ESCROW_CONTRACT_ADDRESS=${address}`);
  } else {
    env = env.trimEnd() + `\nESCROW_CONTRACT_ADDRESS=${address}\n`;
  }
  fs.writeFileSync(envPath, env);
  console.log("\nSaved ESCROW_CONTRACT_ADDRESS to .env.local");
}

main().catch((e) => { console.error(e); process.exit(1); });
