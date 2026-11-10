const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

async function waitForDb(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      await pool.query('select 1');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('database never became reachable');
}

// All data below is synthetic. Nothing here is real health data.
async function seedIfEmpty() {
  const { rows } = await pool.query('select count(*)::int as n from users');
  if (rows[0].n > 0) return rows[0].n;
  const count = parseInt(process.env.SEED_USERS || '200', 10);
  const hash = hashPassword(process.env.DEMO_USER_PASSWORD || 'demo-password');
  await pool.query(
    `insert into users(email, password_hash, display_name)
     select 'user'||g||'@example.test', $1, 'Synthetic User '||g from generate_series(1, $2) g`,
    [hash, count]
  );
  await pool.query(
    `insert into readings(user_id, kind, value, unit, source, recorded_at)
     select u.id, 'glucose',
            round((4.5 + random() * (case when u.id % 17 = 0 then 8 else 3 end))::numeric, 1),
            'mmol/L', 'seed', now() - (d || ' days')::interval - (h || ' hours')::interval
     from users u, generate_series(0, 13) d, generate_series(1, 3) h`
  );
  await pool.query(
    `insert into readings(user_id, kind, value, unit, source, recorded_at)
     select u.id, 'sleep',
            round((6 + random() * 3 - case when u.id % 13 = 0 then 3 else 0 end)::numeric, 1),
            'h', 'seed', now() - (d || ' days')::interval
     from users u, generate_series(0, 13) d`
  );
  await pool.query(
    `insert into readings(user_id, kind, value, unit, source, recorded_at)
     select u.id, 'food', round((400 + random() * 500)::numeric, 0),
            'kcal', 'seed', now() - (d || ' days')::interval - (h || ' hours')::interval
     from users u, generate_series(0, 13) d, generate_series(1, 3) h`
  );
  return count;
}

module.exports = { pool, hashPassword, checkPassword, waitForDb, seedIfEmpty };
