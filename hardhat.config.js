require("@nomicfoundation/hardhat-ethers");
const fs = require("fs");

// Parse .env.local without requiring dotenv
function loadEnvLocal() {
  try {
    const lines = fs.readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([^#][^=]*)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
}
loadEnvLocal();

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    arc_testnet: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
  },
};
