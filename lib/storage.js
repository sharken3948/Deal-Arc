import { kv } from '@vercel/kv';

const IDS_KEY = 'escrow_ids';
const key     = id => `escrow:${id}`;

export const storage = {
  async getAll() {
    const ids = await kv.lrange(IDS_KEY, 0, -1);
    if (!ids.length) return [];
    const escrows = await kv.mget(...ids.map(key));
    return escrows.filter(Boolean);
  },

  async getById(id) {
    return kv.get(key(id));
  },

  async create(escrow) {
    await kv.set(key(escrow.id), escrow);
    await kv.lpush(IDS_KEY, escrow.id);
    return escrow;
  },

  async update(id, updates) {
    const existing = await kv.get(key(id));
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(key(id), updated);
    return updated;
  },
};
