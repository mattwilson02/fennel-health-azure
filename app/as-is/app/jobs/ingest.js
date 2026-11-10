// Nightly bulk import of wearable files. Reads *.jsonl from the inbox, one reading per line.
// A late or missing file is not noticed by anything.
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const DATA = process.env.DATA_DIR || '/data';

async function run() {
  const inbox = path.join(DATA, 'inbox');
  const done = path.join(DATA, 'inbox-processed');
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(done, { recursive: true });
  const files = fs.readdirSync(inbox).filter((f) => f.endsWith('.jsonl'));
  let rows = 0;
  for (const file of files) {
    const lines = fs.readFileSync(path.join(inbox, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const r = JSON.parse(line);
      await pool.query(
        `insert into readings(user_id, kind, value, unit, source, recorded_at) values ($1, $2, $3, $4, 'wearable-bulk', $5)`,
        [r.user_id, r.kind, r.value, r.unit, r.recorded_at]
      );
      rows++;
    }
    fs.renameSync(path.join(inbox, file), path.join(done, file));
  }
  console.log(`ingest: ${files.length} file(s), ${rows} reading(s)`);
}

module.exports = { run };
if (require.main === module) run().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
