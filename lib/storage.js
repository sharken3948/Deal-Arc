import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ESCROWS_FILE = path.join(DATA_DIR, 'escrows.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ESCROWS_FILE)) fs.writeFileSync(ESCROWS_FILE, JSON.stringify({ escrows: [] }, null, 2));
}

function readStorage() {
  ensureStorage();
  try { return JSON.parse(fs.readFileSync(ESCROWS_FILE, 'utf-8')); }
  catch { return { escrows: [] }; }
}

function writeStorage(data) {
  ensureStorage();
  fs.writeFileSync(ESCROWS_FILE, JSON.stringify(data, null, 2));
}

export const storage = {
  getAll: () => readStorage().escrows,
  getById: (id) => readStorage().escrows.find(e => e.id === id) || null,
  create: (escrow) => {
    const data = readStorage();
    data.escrows.unshift(escrow);
    writeStorage(data);
    return escrow;
  },
  update: (id, updates) => {
    const data = readStorage();
    const idx = data.escrows.findIndex(e => e.id === id);
    if (idx === -1) return null;
    data.escrows[idx] = { ...data.escrows[idx], ...updates, updatedAt: new Date().toISOString() };
    writeStorage(data);
    return data.escrows[idx];
  },
};
