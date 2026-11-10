const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, checkPassword, waitForDb, seedIfEmpty } = require('./db');

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATA = process.env.DATA_DIR || '/data';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'demo-webhook-secret';
const COACH_USER = process.env.COACH_USER || 'coach';
const COACH_PASSWORD = process.env.COACH_PASSWORD || 'coach-demo';
const MAX_UPLOAD = 5 * 1024 * 1024;

// Sessions live in this process's memory, so a restart signs everyone out.
const sessions = new Map();

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sessionUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  return sessions.get(token) || null;
}

function coachAuthorised(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const [user, pass] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  return user === COACH_USER && pass === COACH_PASSWORD;
}

const FLAGGED_SQL = `
  select u.id, u.display_name,
         round(avg(r.value) filter (where r.kind = 'glucose')::numeric, 1) as glucose_avg,
         round(avg(r.value) filter (where r.kind = 'sleep')::numeric, 1) as sleep_avg
  from users u join readings r on r.user_id = u.id
  where r.recorded_at > now() - interval '3 days'
  group by u.id
  having avg(r.value) filter (where r.kind = 'glucose') > 8
      or avg(r.value) filter (where r.kind = 'sleep') < 5.5
  order by u.id limit 100`;

function page(file) {
  return fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === 'GET /health') return send(res, 200, { ok: true });
    if (route === 'GET /') return send(res, 200, page('index.html'), 'text/html');

    // Consumer sign-in
    if (route === 'POST /api/login') {
      const { email, password } = JSON.parse((await readBody(req)).toString() || '{}');
      const { rows } = await pool.query('select * from users where email = $1', [email]);
      if (!rows[0] || !checkPassword(password || '', rows[0].password_hash)) {
        return send(res, 401, { error: 'wrong email or password' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { id: rows[0].id, name: rows[0].display_name });
      return send(res, 200, { token, name: rows[0].display_name });
    }

    // Consumer data
    if (route === 'GET /api/readings') {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { error: 'sign in first' });
      const { rows } = await pool.query(
        'select kind, value, unit, source, recorded_at from readings where user_id = $1 order by recorded_at desc limit 50',
        [user.id]
      );
      return send(res, 200, rows);
    }
    if (route === 'POST /api/readings') {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { error: 'sign in first' });
      const { kind, value, unit } = JSON.parse((await readBody(req)).toString() || '{}');
      await pool.query(
        `insert into readings(user_id, kind, value, unit, source, recorded_at) values ($1, $2, $3, $4, 'app', now())`,
        [user.id, kind, value, unit]
      );
      return send(res, 201, { ok: true });
    }

    // Weekly report download, from local disk
    if (route === 'GET /api/reports/latest') {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { error: 'sign in first' });
      const dir = path.join(DATA, 'reports', String(user.id));
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
      if (!files.length) return send(res, 404, { error: 'no report yet' });
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      return fs.createReadStream(path.join(dir, files[files.length - 1])).pipe(res);
    }

    // Meal photos and exports, written to local disk
    if (route === 'POST /api/uploads') {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { error: 'sign in first' });
      const name = (url.searchParams.get('name') || 'upload.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
      const body = await readBody(req, MAX_UPLOAD);
      const dir = path.join(DATA, 'uploads', String(user.id));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${Date.now()}-${name}`), body);
      return send(res, 201, { ok: true, bytes: body.length });
    }

    // Wearable webhook. If the database is down, the event is lost.
    if (route === 'POST /webhooks/wearable') {
      const raw = await readBody(req);
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
      if (req.headers['x-signature'] !== expected) return send(res, 401, { error: 'bad signature' });
      const evt = JSON.parse(raw.toString());
      await pool.query('insert into webhook_events(raw) values ($1)', [evt]);
      await pool.query(
        `insert into readings(user_id, kind, value, unit, source, recorded_at) values ($1, $2, $3, $4, 'wearable-webhook', $5)`,
        [evt.user_id, evt.kind, evt.value, evt.unit, evt.recorded_at || new Date().toISOString()]
      );
      return send(res, 202, { ok: true });
    }

    // Coach dashboard: served by this same process, protected only by a login.
    if (route === 'GET /coach') return send(res, 200, page('coach.html'), 'text/html');
    if (route === 'GET /coach/api/flagged') {
      if (!coachAuthorised(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="coach"' });
        return res.end();
      }
      const { rows } = await pool.query(FLAGGED_SQL);
      return send(res, 200, rows);
    }

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(`${route} failed:`, err.message);
    return send(res, 500, { error: 'server error' });
  }
});

(async () => {
  await waitForDb();
  const n = await seedIfEmpty();
  console.log(`database ready, ${n} synthetic users`);
  server.listen(PORT, () => console.log(`fennel-as-is listening on ${PORT}`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
