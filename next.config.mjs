import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_PATH = path.join(__dirname, 'node_modules');

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
