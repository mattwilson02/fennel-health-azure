// Weekly report: one PDF per active user, written to local disk on this machine.
// Runs in a single process, one user after another.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pool } = require('../db');

const DATA = process.env.DATA_DIR || '/data';

async function run() {
  const started = Date.now();
  const { rows: users } = await pool.query(
    `select distinct u.id, u.display_name from users u
     join readings r on r.user_id = u.id where r.recorded_at > now() - interval '7 days'`
  );
  const day = new Date().toISOString().slice(0, 10);
  for (const user of users) {
    const { rows } = await pool.query(
      `select kind, round(avg(value)::numeric, 1) as average, min(unit) as unit, count(*)::int as n
       from readings where user_id = $1 and recorded_at > now() - interval '7 days' group by kind order by kind`,
      [user.id]
    );
    const dir = path.join(DATA, 'reports', String(user.id));
    fs.mkdirSync(dir, { recursive: true });
    const doc = new PDFDocument({ margin: 50 });
    const out = fs.createWriteStream(path.join(dir, `${day}.pdf`));
    doc.pipe(out);
    doc.fontSize(20).text('Fennel weekly insight (synthetic data)');
    doc.moveDown().fontSize(12).text(user.display_name);
    doc.moveDown();
    for (const r of rows) doc.text(`${r.kind}: average ${r.average} ${r.unit} over ${r.n} readings`);
    doc.end();
    await new Promise((resolve) => out.on('finish', resolve));
  }
  console.log(`report: ${users.length} PDF(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

module.exports = { run };
if (require.main === module) run().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
