// One-time migration: copy escrows from data/escrows.json → Upstash KV
// Usage: node --env-file=.env.local scripts/migrate-escrows.js

const fs   = require('fs');
const path = require('path');

// @vercel/kv ships a CJS build; env vars must be loaded before this require.
const { kv } = require('@vercel/kv');

const IDS_KEY = 'escrow_ids';
const kvKey   = id => `escrow:${id}`;

async function main() {
  const jsonPath = path.join(__dirname, '..', 'data', 'escrows.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('data/escrows.json not found — nothing to migrate.');
    process.exit(1);
  }

  const { escrows } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${escrows.length} escrow(s) in data/escrows.json\n`);

  let migrated = 0;
  let skipped  = 0;

  for (const escrow of escrows) {
    const existing = await kv.get(kvKey(escrow.id));

    if (existing) {
      console.log(`  SKIP  ${escrow.id.slice(0, 8)}…  "${escrow.title}" (already in KV)`);
      skipped++;
      continue;
    }

    // Write the escrow object and register its ID in the list.
    await kv.set(kvKey(escrow.id), escrow);
    await kv.lpush(IDS_KEY, escrow.id);

    console.log(`  WRITE ${escrow.id.slice(0, 8)}…  "${escrow.title}" [${escrow.status}]`);
    migrated++;
  }

  console.log(`\nDone. Migrated: ${migrated}  |  Skipped (already existed): ${skipped}`);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
