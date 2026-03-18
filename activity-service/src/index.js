require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway.app') ? { rejectUnauthorized: false } : false,
  }
  : {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'activitydb',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'secret123',
  };

const pool = new Pool(poolConfig);

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// ── Middleware: JWT ทั่วไป ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Middleware: Admin only ─────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    req.user = user; next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ══════════════════════════════════════════════════════════════════════
// POST /api/activity/internal — รับ event จาก services อื่น
// ไม่ต้องมี JWT เพราะเรียกจาก internal Docker network
// (บน Railway ต้อง set ACTIVITY_SERVICE_URL ให้ถูก)
// ══════════════════════════════════════════════════════════════════════
app.post('/api/activity/internal', async (req, res) => {
  const { user_id, username, event_type, entity_type,
    entity_id, summary, meta } = req.body;

  if (!user_id || !event_type)
    return res.status(400).json({ error: 'user_id and event_type are required' });

  try {
    await pool.query(
      `INSERT INTO activities
         (user_id, username, event_type, entity_type, entity_id, summary, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [user_id, username || null, event_type,
        entity_type || null, entity_id || null,
        summary || null, meta ? JSON.stringify(meta) : null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[activity] Insert error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/activity/me — ดู activities ของตัวเอง (JWT required)
// Query params: ?event_type=TASK_CREATED&limit=50&offset=0
// ══════════════════════════════════════════════════════════════════════
app.get('/api/activity/me', requireAuth, async (req, res) => {
  const { event_type, limit = 50, offset = 0 } = req.query;

  const conditions = ['user_id = $1'];
  const values = [req.user.sub];
  let idx = 2;

  if (event_type) { conditions.push(`event_type = $${idx++}`); values.push(event_type); }

  const where = 'WHERE ' + conditions.join(' AND ');

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM activities ${where}`, values
    );
    const total = parseInt(countRes.rows[0].count);

    values.push(parseInt(limit));
    values.push(parseInt(offset));
    const result = await pool.query(
      `SELECT * FROM activities ${where}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );
    res.json({ activities: result.rows, total, limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/activity/all — ดู activities ทั้งหมด (admin only)
// Query params: ?event_type=USER_LOGIN&username=alice&limit=100
// ══════════════════════════════════════════════════════════════════════
app.get('/api/activity/all', requireAdmin, async (req, res) => {
  const { event_type, username, limit = 100, offset = 0 } = req.query;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (event_type) { conditions.push(`event_type = $${idx++}`); values.push(event_type); }
  if (username) { conditions.push(`username = $${idx++}`); values.push(username); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM activities ${where}`, values
    );
    const total = parseInt(countRes.rows[0].count);

    values.push(parseInt(limit));
    values.push(parseInt(offset));
    const result = await pool.query(
      `SELECT * FROM activities ${where}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );
    res.json({ activities: result.rows, total, limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/activity/health
app.get('/api/activity/health', (_, res) =>
  res.json({ status: 'ok', service: 'activity-service', time: new Date() })
);

// ── Start ──────────────────────────────────────────────────────────────
// ── Start ──────────────────────────────────────────────────────────────
async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      // 1. ตรวจสอบการเชื่อมต่อ
      await pool.query('SELECT 1');
      console.log('✅ [activity-db] Connected successfully.');

      // 2. Fallback: สร้าง Table และ Index (ถ้ายังไม่มี)
      // ใช้ Schema เดียวกับที่คุณออกแบบไว้
      const initSql = `
        CREATE TABLE IF NOT EXISTS activities (
          id          SERIAL       PRIMARY KEY,
          user_id     INTEGER      NOT NULL,
          username    VARCHAR(50),
          event_type  VARCHAR(50)  NOT NULL,
          entity_type VARCHAR(20),
          entity_id   INTEGER,
          summary     TEXT,
          meta        JSONB,
          created_at  TIMESTAMP    DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_activities_user_id    ON activities(user_id);
        CREATE INDEX IF NOT EXISTS idx_activities_event_type ON activities(event_type);
        CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
      `;

      await pool.query(initSql);
      console.log('✅ [activity-db] Tables and Indexes are ready.');

      break; // เชื่อมต่อและสร้าง Table สำเร็จ ให้หลุดจาก loop
    } catch (e) {
      console.error(`❌ [activity] DB Connection failed: ${e.message}`);
      retries--;
      console.log(`[activity] Retrying in 5 seconds... (${retries} retries left)`);

      if (retries === 0) {
        console.error('💥 [activity] Could not connect to DB after multiple retries. Exiting...');
        process.exit(1);
      }

      await new Promise(r => setTimeout(r, 5000)); // รอ 5 วินาทีก่อนลองใหม่
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 [activity-service] Server is running on port ${PORT}`);
  });
}

start();
