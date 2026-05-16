import { kv } from '@vercel/kv';

export async function incrementCompleted(address) {
  await kv.incr(`agent:${address.toLowerCase()}:completed`);
}

export async function incrementDisputed(address) {
  await kv.incr(`agent:${address.toLowerCase()}:disputed`);
}

export async function incrementWon(address) {
  await kv.incr(`agent:${address.toLowerCase()}:won`);
}

// Sets type to "person" only if no type is stored yet (registered agents keep "agent").
export async function setPersonType(address) {
  await kv.setnx(`agent:${address.toLowerCase()}:type`, 'person');
}

export async function getReputation(address) {
  const key = address.toLowerCase();
  const [completed, disputed, won, type] = await Promise.all([
    kv.get(`agent:${key}:completed`),
    kv.get(`agent:${key}:disputed`),
    kv.get(`agent:${key}:won`),
    kv.get(`agent:${key}:type`),
  ]);
  const c = Number(completed ?? 0);
  const d = Number(disputed  ?? 0);
  const w = Number(won       ?? 0);

  const successRate = (c + d) === 0
    ? 'N/A'
    : `${Math.round((c / (c + d)) * 100)}%`;

  const disputeRate = c === 0
    ? 'N/A'
    : `${Math.round((d / c) * 100)}%`;

  return {
    completed:   c,
    disputed:    d,
    won:         w,
    successRate,
    disputeRate,
    type:        type ?? null,
  };
}
