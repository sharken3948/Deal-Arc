import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_PATH = path.join(__dirname, 'node_modules');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack crashes on WSL2 when writing to Windows filesystem (NTFS via /mnt/c).
  // Redirect the build cache to the Linux filesystem to avoid ENOENT mkdir errors.
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '/tmp/circle-dapp-next',
  allowedDevOrigins: ['172.21.167.68'],
};

export default nextConfig;
