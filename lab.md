# ENGSE207 Software Architecture
# Final Lab (Sec2) — ชุดที่ 2 (Section 2): Microservices + Activity Tracking + Cloud (Railway)

---

## สารบัญ

1. [ภาพรวมและสิ่งที่ต้องพัฒนาเพิ่ม](#1-ภาพรวมและสิ่งที่ต้องพัฒนาเพิ่ม)
2. [สถาปัตยกรรม Set 2](#2-สถาปัตยกรรม-set-2)
3. [Phase 1: ปรับ Codebase ให้พร้อม Deploy](#3-phase-1-ปรับ-codebase-ให้พร้อม-deploy)
4. [Phase 2: Deploy Auth Service บน Railway](#4-phase-2-deploy-auth-service-บน-railway)
5. [Phase 3: Deploy Task Service บน Railway](#5-phase-3-deploy-task-service-บน-railway)
6. [Phase 4: Deploy Activity Service บน Railway](#6-phase-4-deploy-activity-service-บน-railway)
7. [Phase 5: Frontend + Gateway Strategy](#7-phase-5-frontend--gateway-strategy)

---

## 1. ภาพรวมและสิ่งที่ต้องพัฒนาเพิ่ม

Final Lab Set 2 ต่อยอดจาก Set 1 มีเป้าหมายหลัก 3 ประการ:

1. **เพิ่ม Register API** ใน Auth Service (Set 1 ไม่มี)
2. **เพิ่ม Activity Service** — service ใหม่ที่บันทึก events ทุกอย่างที่เกิดในระบบ
3. **Deploy ทุก Service ขึ้น Railway Cloud**

### สิ่งที่เปลี่ยนจาก Set 1

| Set 1 | Set 2 |
|---|---|
| 4 services: auth, task, log, frontend | 3 services บน Cloud: auth, task, activity |
| Shared PostgreSQL (1 DB) | Database-per-Service (3 DB แยก) |
| Log Service แยก | แต่ละ service log ลง DB ของตัวเอง + ส่ง event ไป Activity Service |
| ไม่มี Register | มี Register API ใน Auth Service |
| Local-only (HTTPS + Nginx) | Deploy บน Railway (HTTPS อัตโนมัติ) |

> **หมายเหตุ:** Nginx + HTTPS + Log Service จาก Set 1 ไม่ได้ deploy ขึ้น Railway  
> Railway จัดการ HTTPS ให้อัตโนมัติ  
> Activity Service ทำหน้าที่แตกต่างจาก Log Service — บันทึก **events ที่มีความหมายต่อ user** ไม่ใช่ technical log

### แนวคิดสำคัญที่ Set 2 เพิ่มขึ้น: Service-to-Service Call

ใน Set 1 services ไม่ได้คุยกันเอง แต่ใน Set 2 **Auth Service และ Task Service จะส่ง event ไปหา Activity Service** เมื่อมี action สำคัญเกิดขึ้น

```
ผู้ใช้ login
    │
    ▼
Auth Service ──── POST /api/activity/internal ────▶ Activity Service
(บันทึกลง auth-db)                                  (บันทึกลง activity-db)

ผู้ใช้ create task
    │
    ▼
Task Service ──── POST /api/activity/internal ────▶ Activity Service
(บันทึกลง task-db)                                  (บันทึกลง activity-db)
```

> **สำคัญ:** การส่ง event ไป Activity Service เป็นแบบ **fire-and-forget** (ใช้ `.catch(() => {})`)  
> หมายความว่า ถ้า Activity Service ล่ม — auth-service และ task-service **ยังทำงานได้ปกติ**  
> เพียงแต่ activities จะไม่ถูกบันทึกชั่วคราว

---

## 2. สถาปัตยกรรม Set 2

### สถาปัตยกรรม Local (Docker Compose สำหรับทดสอบ)

```
Browser / Postman
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│   Docker Compose (Local Test)                                              │
│                                                                            │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ 🔑 Auth Svc     │  │ 📋 Task Svc       │  │ 📅 Activity Svc          │   │
│  │   :3001         │  │   :3002          │  │   :3003                  │   │
│  │                 │  │                  │  │                          │   │
│  │ • POST /register│  │ • CRUD Tasks     │  │ • POST /internal         │   │
│  │ • POST /login   │  │ • JWT Guard      │  │   (รับ event จาก services)│   │
│  │ • GET  /me      │  │ • logActivity()→ │  │ • GET /me (JWT)          │   │
│  │ • logActivity() │  │   activity-svc   │  │ • GET /all (admin)       │   │
│  └──────┬──────────┘  └────────┬─────────┘  └──────────────────────────┘   │
│         │                      │                          ▲                │
│         │  POST /internal ─────┴───────────────────────── │                │
│         │                      │                          │                │
│         ▼                      ▼                          ▼                │
│  ┌──────────────┐  ┌──────────────────────┐  ┌────────────────────────┐    │
│  │  🗄️ auth-db  │  │  🗄️ task-db           │  │  🗄️ activity-db        │    │
│  │  users table │  │  tasks table         │  │  activities table      │    │
│  │  logs table  │  │  logs table          │  │                        │    │
│  └──────────────┘  └──────────────────────┘  └────────────────────────┘    │
│                                                                            │
│  JWT_SECRET ใช้ร่วมกันทุก service                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

### สถาปัตยกรรม Cloud (Railway)

```
Browser / Postman
        │
        │ HTTPS (Railway จัดการให้อัตโนมัติ)
        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Railway Project                                   │
│                                                                           │
│  Auth Service              Task Service         Activity Service          │
│  https://auth-xxx…          https://task-xxx…    https://activity-xxx…    │
│       │                          │                       ▲                │
│       │                          │  POST /internal       │                │
│       └──────────────────────────┴───────────────────────┘                │
│       │                          │                       │                │
│       ▼                          ▼                       ▼                │
│   auth-db                    task-db              activity-db             │
│   [PostgreSQL Plugin]        [PostgreSQL Plugin]  [PostgreSQL Plugin]     │
│                                                                           │
│   Frontend เรียกแต่ละ service โดยตรงผ่าน config.js                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Activity Events ที่ระบบต้องบันทึก (บังคับ)

| event_type | ส่งมาจาก | เกิดขึ้นเมื่อ |
|---|---|---|
| `USER_REGISTERED` | auth-service | POST /register สำเร็จ |
| `USER_LOGIN` | auth-service | POST /login สำเร็จ |
| `TASK_CREATED` | task-service | POST /tasks สำเร็จ |
| `TASK_STATUS_CHANGED` | task-service | PUT /tasks/:id เปลี่ยน status |
| `TASK_DELETED` | task-service | DELETE /tasks/:id |

---

## 3. Phase 1: ปรับ Codebase ให้พร้อม Deploy

### 3.1 โครงสร้าง Repository

```
final-lab-sec2-set2-[student1]-[student2]/
├── README.md
├── TEAM_SPLIT.md
├── INDIVIDUAL_REPORT_[studentid].md
├── docker-compose.yml
├── .env.example
│
├── auth-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql                    ← auth-db schema + seed users
│   └── src/
│       ├── index.js
│       ├── db/db.js
│       ├── middleware/jwtUtils.js
│       └── routes/auth.js          ← เพิ่ม /register + logActivity()
│
├── task-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql                    ← task-db schema
│   └── src/
│       ├── index.js
│       ├── db/db.js
│       ├── middleware/authMiddleware.js
│       ├── middleware/jwtUtils.js
│       └── routes/tasks.js         ← เพิ่ม logActivity() ทุก CRUD
│
├── activity-service/               ← service ใหม่ทั้งหมด
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql                    ← activity-db schema
│   └── src/
│       ├── index.js
│       └── routes/activity.js
│
├── frontend/
│   ├── index.html                  ← ปรับจาก Set 1: เพิ่ม Register + ใช้ config.js
│   ├── activity.html               ← หน้าใหม่: ดู Activity Timeline
│   └── config.js                   ← Railway Service URLs
│
└── screenshots/
```

### 3.2 DB Schema สำหรับ Set 2

**`auth-service/init.sql`:**
```sql
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  DEFAULT 'member',
  created_at    TIMESTAMP    DEFAULT NOW(),
  last_login    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
  id         SERIAL       PRIMARY KEY,
  level      VARCHAR(10)  NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
  event      VARCHAR(100) NOT NULL,
  user_id    INTEGER,
  ip_address VARCHAR(45),
  message    TEXT,
  meta       JSONB,
  created_at TIMESTAMP    DEFAULT NOW()
);

-- Seed users สำหรับทดสอบ
INSERT INTO users (username, email, password_hash, role) VALUES
  ('alice', 'alice@lab.local',
   '$2b$10$PjnT4Aw1VHdFD89uFMsbtOunaa8XXNtp.8aGFlC4Rf2F1zAp3V.KC',
   'member'),
  ('admin', 'admin@lab.local',
   '$2b$10$ZFSu9jujm16MjmDzk3fIYO36TyW7tNXJl3MGQuDkWBoiaiNJ2iFca',
   'admin')
ON CONFLICT (username) DO NOTHING;
```

**`task-service/init.sql`:**
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  status      VARCHAR(20)  DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','DONE')),
  priority    VARCHAR(10)  DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id         SERIAL       PRIMARY KEY,
  level      VARCHAR(10)  NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
  event      VARCHAR(100) NOT NULL,
  user_id    INTEGER,
  message    TEXT,
  meta       JSONB,
  created_at TIMESTAMP    DEFAULT NOW()
);
```

**`activity-service/init.sql`:**
```sql
-- ═══════════════════════════════════════════════════════
--  ACTIVITIES TABLE
--  บันทึก event ทุกอย่างที่เกิดในระบบ
--  user_id และ username เก็บไว้เพื่อ query ได้โดยไม่ต้อง
--  JOIN ข้าม database (Denormalization pattern)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL       PRIMARY KEY,
  user_id     INTEGER      NOT NULL,
  username    VARCHAR(50),             -- ← denormalized: เก็บจาก JWT ณ เวลาที่เกิด event
  event_type  VARCHAR(50)  NOT NULL,   -- 'USER_LOGIN', 'TASK_CREATED', ...
  entity_type VARCHAR(20),             -- 'user', 'task'
  entity_id   INTEGER,                 -- id ของสิ่งที่ถูก act on
  summary     TEXT,                    -- 'alice created task "Deploy to Railway"'
  meta        JSONB,                   -- { old_status: 'TODO', new_status: 'DONE' }
  created_at  TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_user_id   ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_event_type ON activities(event_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
```

> **ทำไม `username` ถึงต้องเก็บไว้ใน `activities` table?**
>
> เพราะ `activity-db` ไม่มี `users` table — ข้อมูล username อยู่ใน `auth-db`  
> ถ้าไม่ denormalize จะต้อง query ข้าม 2 databases ซึ่งทำไม่ได้ใน Database-per-Service  
> จึงเก็บ `username` ไว้ ณ เวลาที่ event เกิดขึ้นเลย

### 3.3 JWT Payload ที่ทุก Service ใช้ร่วมกัน

```json
{
  "sub": 1,
  "email": "alice@lab.local",
  "username": "alice",
  "role": "member"
}
```

`JWT_SECRET` ต้องมีค่าเดียวกันทุก service

### 3.4 เพิ่ม Register API ใน Auth Service

เพิ่มใน **`auth-service/src/routes/auth.js`:**

```javascript
// ── Helper: บันทึก log ลง auth-db ──────────────────────────────────────
async function logToDB({ level, event, userId, ip, message, meta }) {
  try {
    await pool.query(
      `INSERT INTO logs (level, event, user_id, ip_address, message, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [level, event, userId || null, ip || null, message || null,
       meta ? JSON.stringify(meta) : null]
    );
  } catch (e) { console.error('[auth-log]', e.message); }
}

// ── Helper: ส่ง activity event ไปหา Activity Service (fire-and-forget) ──
async function logActivity({ userId, username, eventType, entityType,
                              entityId, summary, meta }) {
  const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL
    || 'http://activity-service:3003';
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId, username, event_type: eventType,
      entity_type: entityType || null,
      entity_id:   entityId   || null,
      summary, meta: meta || null
    })
  }).catch(() => {
    // ถ้า activity-service ไม่ตอบ ไม่หยุดการทำงาน
    console.warn('[auth] activity-service unreachable — skipping event log');
  });
}

// ── POST /api/auth/register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email, password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'password ต้องมีอย่างน้อย 6 ตัวอักษร' });

  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase().trim(), username.trim()]
    );
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Email หรือ Username ถูกใช้งานแล้ว' });

    const bcrypt = require('bcryptjs');
    const hash   = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1,$2,$3,'member') RETURNING id, username, email, role, created_at`,
      [username.trim(), email.toLowerCase().trim(), hash]
    );
    const user = result.rows[0];

    await logToDB({
      level: 'INFO', event: 'REGISTER_SUCCESS', userId: user.id, ip,
      message: `New user registered: ${user.username}`
    });

    // ส่ง activity event (fire-and-forget)
    logActivity({
      userId: user.id, username: user.username,
      eventType: 'USER_REGISTERED', entityType: 'user', entityId: user.id,
      summary: `${user.username} สมัครสมาชิกใหม่`
    });

    res.status(201).json({
      message: 'สมัครสมาชิกสำเร็จ',
      user: { id: user.id, username: user.username,
              email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('[auth] Register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});
```

**ปรับ Login route** — เพิ่ม `logActivity()` หลัง login สำเร็จ:

```javascript
// ใน POST /api/auth/login หลัง res.json({ token, user })
// เพิ่ม (fire-and-forget):
logActivity({
  userId: user.id, username: user.username,
  eventType: 'USER_LOGIN', entityType: 'user', entityId: user.id,
  summary: `${user.username} เข้าสู่ระบบ`
});
```

### 3.5 ปรับ Task Service — เพิ่ม `logActivity()`

เพิ่ม helper ใน **`task-service/src/routes/tasks.js`:**

```javascript
// ── Helper: log ลง task-db ────────────────────────────────────────────
async function logToDB({ level, event, userId, message, meta }) {
  try {
    await pool.query(
      `INSERT INTO logs (level, event, user_id, message, meta) VALUES ($1,$2,$3,$4,$5)`,
      [level, event, userId || null, message || null,
       meta ? JSON.stringify(meta) : null]
    );
  } catch (e) { console.error('[task-log]', e.message); }
}

// ── Helper: ส่ง activity event (fire-and-forget) ──────────────────────
async function logActivity({ userId, username, eventType, entityId,
                              summary, meta }) {
  const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL
    || 'http://activity-service:3003';
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId, username, event_type: eventType,
      entity_type: 'task', entity_id: entityId || null,
      summary, meta: meta || null
    })
  }).catch(() => {
    console.warn('[task] activity-service unreachable — skipping event log');
  });
}
```

**เพิ่ม `logActivity()` ใน CRUD routes:**

```javascript
// POST /api/tasks/ — หลัง insert สำเร็จ
logActivity({
  userId: req.user.sub, username: req.user.username,
  eventType: 'TASK_CREATED', entityId: task.id,
  summary: `${req.user.username} สร้าง task "${title}"`,
  meta: { task_id: task.id, title, priority }
});

// PUT /api/tasks/:id — หลัง update สำเร็จ (ถ้า status เปลี่ยน)
if (status && status !== check.rows[0].status) {
  logActivity({
    userId: req.user.sub, username: req.user.username,
    eventType: 'TASK_STATUS_CHANGED', entityId: parseInt(id),
    summary: `${req.user.username} เปลี่ยนสถานะ task #${id} เป็น ${status}`,
    meta: { task_id: parseInt(id), old_status: check.rows[0].status, new_status: status }
  });
}

// DELETE /api/tasks/:id — หลัง delete สำเร็จ
logActivity({
  userId: req.user.sub, username: req.user.username,
  eventType: 'TASK_DELETED', entityId: parseInt(id),
  summary: `${req.user.username} ลบ task #${id}`,
  meta: { task_id: parseInt(id) }
});
```

### 3.6 Activity Service — สร้างใหม่ทั้งหมด

**`activity-service/package.json`:**
```json
{
  "name": "activity-service",
  "version": "1.0.0",
  "scripts": { "start": "node src/index.js" },
  "dependencies": {
    "cors":         "^2.8.5",
    "dotenv":       "^16.3.1",
    "express":      "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "pg":           "^8.11.3"
  }
}
```

**`activity-service/Dockerfile`:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3003/api/activity/health || exit 1
CMD ["node", "src/index.js"]
```

**`activity-service/src/index.js`:**
```javascript
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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
  const values     = [req.user.sub];
  let   idx = 2;

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
  const values     = [];
  let   idx = 1;

  if (event_type) { conditions.push(`event_type = $${idx++}`); values.push(event_type); }
  if (username)   { conditions.push(`username = $${idx++}`);   values.push(username); }

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
async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      // Fallback: สร้าง table ถ้ายังไม่มี (สำหรับ Railway ที่ init.sql อาจไม่รันอัตโนมัติ)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS activities (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          username VARCHAR(50),
          event_type VARCHAR(50) NOT NULL,
          entity_type VARCHAR(20),
          entity_id INTEGER,
          summary TEXT,
          meta JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_act_user
          ON activities(user_id);
        CREATE INDEX IF NOT EXISTS idx_act_event
          ON activities(event_type);
        CREATE INDEX IF NOT EXISTS idx_act_time
          ON activities(created_at DESC);
      `);
      break;
    } catch (e) {
      console.log(`[activity] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`[activity-service] Running on :${PORT}`));
}
start();
```

### 3.7 Docker Compose สำหรับทดสอบ Local

**`docker-compose.yml`:**
```yaml
services:

  # ── Databases ──────────────────────────────────────────────────────
  auth-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: authdb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret123
    ports:
      - "5433:5432"
    volumes:
      - auth_data:/var/lib/postgresql/data
      - ./auth-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d authdb"]
      interval: 10s
      timeout: 5s
      retries: 5

  task-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: taskdb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret123
    ports:
      - "5434:5432"
    volumes:
      - task_data:/var/lib/postgresql/data
      - ./task-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d taskdb"]
      interval: 10s
      timeout: 5s
      retries: 5

  activity-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: activitydb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret123
    ports:
      - "5435:5432"
    volumes:
      - activity_data:/var/lib/postgresql/data
      - ./activity-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d activitydb"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Services ───────────────────────────────────────────────────────
  auth-service:
    build: ./auth-service
    environment:
      DATABASE_URL:         postgres://admin:secret123@auth-db:5432/authdb
      JWT_SECRET:           ${JWT_SECRET:-dev-shared-secret}
      JWT_EXPIRES:          1h
      PORT:                 3001
      NODE_ENV:             development
      ACTIVITY_SERVICE_URL: http://activity-service:3003
    ports:
      - "3001:3001"
    depends_on:
      auth-db:      { condition: service_healthy }
      activity-service: { condition: service_started }
    restart: unless-stopped

  task-service:
    build: ./task-service
    environment:
      DATABASE_URL:         postgres://admin:secret123@task-db:5432/taskdb
      JWT_SECRET:           ${JWT_SECRET:-dev-shared-secret}
      PORT:                 3002
      NODE_ENV:             development
      ACTIVITY_SERVICE_URL: http://activity-service:3003
    ports:
      - "3002:3002"
    depends_on:
      task-db:          { condition: service_healthy }
      activity-service: { condition: service_started }
    restart: unless-stopped

  activity-service:
    build: ./activity-service
    environment:
      DATABASE_URL: postgres://admin:secret123@activity-db:5432/activitydb
      JWT_SECRET:   ${JWT_SECRET:-dev-shared-secret}
      PORT:         3003
      NODE_ENV:     development
    ports:
      - "3003:3003"
    depends_on:
      activity-db: { condition: service_healthy }
    restart: unless-stopped

volumes:
  auth_data:
  task_data:
  activity_data:
```

**`.env.example`:**
```env
JWT_SECRET=engse207-sec2-shared-secret-change-this
```

### 3.8 Checklist ก่อนขึ้น Cloud

```bash
docker compose up --build

# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@sec2.local","password":"123456"}'

# Login → เก็บ token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@sec2.local","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# ตรวจสอบว่า Register สร้าง activity ไหม
curl http://localhost:3003/api/activity/me \
  -H "Authorization: Bearer $TOKEN"
# ต้องเห็น USER_REGISTERED event

# Create Task
curl -X POST http://localhost:3002/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test activity tracking","priority":"high"}'

# ตรวจสอบ TASK_CREATED event
curl http://localhost:3003/api/activity/me \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] Register สำเร็จ → เห็น `USER_REGISTERED` ใน `/api/activity/me`
- [ ] Login สำเร็จ → เห็น `USER_LOGIN` ใน `/api/activity/me`
- [ ] Create task → เห็น `TASK_CREATED` ใน `/api/activity/me`
- [ ] Update task status → เห็น `TASK_STATUS_CHANGED` ใน `/api/activity/me`
- [ ] Delete task → เห็น `TASK_DELETED` ใน `/api/activity/me`
- [ ] Admin เรียก `/api/activity/all` → เห็น activities ของทุกคน
- [ ] Member เรียก `/api/activity/all` → ได้ 403

---

## 4. Phase 2: Deploy Auth Service บน Railway

> อ้างอิงขั้นตอนจาก **Week 7 Lab** (Deploy TaskBoard บน Railway)

1. ไปที่ [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. เลือก Repository → กำหนด **Root Directory** = `auth-service`
3. เพิ่ม **PostgreSQL Plugin** → ตั้งชื่อ `auth-db`
4. ตั้งค่า **Environment Variables:**

```env
DATABASE_URL=${{auth-db.DATABASE_URL}}
JWT_SECRET=your-sec2-shared-secret-here
JWT_EXPIRES=1h
PORT=3001
NODE_ENV=production
ACTIVITY_SERVICE_URL=https://your-activity-service.up.railway.app
```

> ⚠️ `ACTIVITY_SERVICE_URL` ต้องอัปเดตหลัง deploy Activity Service เสร็จ

5. Deploy และตรวจสอบ Logs
6. ทดสอบ endpoint บน Cloud:

```bash
AUTH_URL="https://your-auth-service.up.railway.app"

curl -X POST $AUTH_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"clouduser","email":"cloud@sec2.local","password":"123456"}'

curl -X POST $AUTH_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cloud@sec2.local","password":"123456"}'

curl $AUTH_URL/api/auth/health
```

---

## 5. Phase 3: Deploy Task Service บน Railway

1. **New Service** ใน Project เดียวกัน → **Root Directory** = `task-service`
2. เพิ่ม **PostgreSQL Plugin** → ตั้งชื่อ `task-db`
3. ตั้งค่า **Environment Variables:**

```env
DATABASE_URL=${{task-db.DATABASE_URL}}
JWT_SECRET=your-sec2-shared-secret-here
PORT=3002
NODE_ENV=production
ACTIVITY_SERVICE_URL=https://your-activity-service.up.railway.app
```

4. ทดสอบ:

```bash
TASK_URL="https://your-task-service.up.railway.app"
TOKEN="<JWT จาก Auth Service>"

curl $TASK_URL/api/tasks/health
curl -X POST $TASK_URL/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Cloud task","priority":"high"}'
curl $TASK_URL/api/tasks -H "Authorization: Bearer $TOKEN"
curl $TASK_URL/api/tasks   # ไม่มี JWT → ต้องได้ 401
```

---

## 6. Phase 4: Deploy Activity Service บน Railway

1. **New Service** → **Root Directory** = `activity-service`
2. เพิ่ม **PostgreSQL Plugin** → ตั้งชื่อ `activity-db`
3. ตั้งค่า **Environment Variables:**

```env
DATABASE_URL=${{activity-db.DATABASE_URL}}
JWT_SECRET=your-sec2-shared-secret-here
PORT=3003
NODE_ENV=production
```

4. หลัง Deploy เสร็จ — **กลับไปอัปเดต `ACTIVITY_SERVICE_URL`** ใน Auth Service และ Task Service ให้ตรงกับ URL จริง

5. ทดสอบ:

```bash
ACTIVITY_URL="https://your-activity-service.up.railway.app"
TOKEN="<JWT จาก Auth Service>"

curl $ACTIVITY_URL/api/activity/health
curl $ACTIVITY_URL/api/activity/me -H "Authorization: Bearer $TOKEN"
curl $ACTIVITY_URL/api/activity/all -H "Authorization: Bearer $TOKEN"  # member → 403

ADMIN_TOKEN="<JWT ของ admin>"
curl $ACTIVITY_URL/api/activity/all -H "Authorization: Bearer $ADMIN_TOKEN"  # → 200
```

> **หมายเหตุสำคัญ:** หลังอัปเดต `ACTIVITY_SERVICE_URL` ต้อง Redeploy Auth Service และ Task Service  
> เพื่อให้ใช้ URL ใหม่ (Railway จะ restart service อัตโนมัติเมื่อ env เปลี่ยน)

---

## 7. Phase 5: Frontend + Gateway Strategy

### Gateway Strategy

เลือก **Option A** (แนะนำ): Frontend เรียก URL ของแต่ละ service โดยตรง

**`frontend/config.js`:**
```javascript
window.APP_CONFIG = {
  AUTH_URL:     'https://your-auth-service.up.railway.app',
  TASK_URL:     'https://your-task-service.up.railway.app',
  ACTIVITY_URL: 'https://your-activity-service.up.railway.app'
};
```

### index.html — สิ่งที่เปลี่ยนจาก Set 1

| ส่วน | Set 1 | Sec2 Set 2 |
|---|---|---|
| Register tab | ❌ ลบออก | ✅ เพิ่มกลับมา |
| Profile & JWT tab | ✅ มี | ❌ **ลบออก** |
| Log Dashboard link | ✅ มี | ❌ ลบออก |
| Activity Timeline link | ❌ ไม่มี | ✅ **เพิ่มเข้ามา** |
| URL ทุก fetch | relative `${API}` | ใช้ `AUTH`, `TASK` จาก `config.js` |

> **สาเหตุที่ลบ Profile tab:** Sec2 Set 2 ไม่มี User Service จึงไม่มี endpoint `/api/users/me`  
> ไม่ควรมี tab ที่เรียก endpoint ที่ไม่มีอยู่ในระบบ

**Sidebar ที่ถูกต้องสำหรับ Sec2 Set 2:**

```html
<!-- ✅ Sidebar Sec2 Set 2 — Tasks + Activity link เท่านั้น -->
<nav class="sidebar">
  <div class="sidebar-logo">📋 Task Board</div>
  <div class="sidebar-nav">

    <!-- Tasks tab — เหมือน Set 1 -->
    <button class="nav-item active" data-page="tasks" onclick="showPage('tasks')">
      <span class="nav-icon">✅</span> Tasks
      <span class="badge-count" id="task-count">0</span>
    </button>

    <!-- ❌ ลบออก: Profile & JWT tab (ไม่มี User Service) -->
    <!-- ❌ ลบออก: Log Dashboard link (ไม่มี Log Service) -->

    <!-- ✅ เพิ่มใหม่: Activity Timeline link -->
    <a href="activity.html" target="_blank" class="nav-item" style="text-decoration:none">
      <span class="nav-icon">📅</span> Activity Timeline
      <span style="margin-left:auto;font-size:.7rem;color:var(--muted)">↗</span>
    </a>

  </div>
  <div class="sidebar-footer">
    <div class="user-chip">
      <div class="user-avatar" id="sidebar-avatar">?</div>
      <div>
        <div id="sidebar-name">—</div>
        <span class="role-badge" id="sidebar-role-badge">—</span>
      </div>
      <button onclick="doLogout()">✕</button>
    </div>
  </div>
</nav>
```

**`showPage()` ที่แก้แล้ว — เหลือเฉพาะ tasks:**

```javascript
// ✅ Sec2 Set 2: มีแค่ tasks page เดียว (ไม่มี profile)
function showPage(page) {
  ['tasks'].forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('hidden', p !== page);
    const btn = document.querySelector(`[data-page="${p}"]`);
    if (btn) btn.classList.toggle('active', p === page);
  });
  if (page === 'tasks') loadTasks();
}
```

**`initApp()` ที่แก้แล้ว:**

```javascript
function initApp(user) {
  currentUser = user;
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app-page').classList.remove('hidden');

  const initials = (user.username || user.email || '?').charAt(0).toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent   = user.username || user.email;
  const rb = document.getElementById('sidebar-role-badge');
  rb.textContent = user.role;
  rb.className   = `role-badge role-${user.role}`;

  // ✅ ไม่มี nav-users, ไม่มี Users tab, ไม่มี Profile tab
  showPage('tasks');
}
```

```javascript
// config และ URL
const AUTH     = window.APP_CONFIG.AUTH_URL;
const TASK     = window.APP_CONFIG.TASK_URL;
const ACTIVITY = window.APP_CONFIG.ACTIVITY_URL;  // ใช้ใน activity.html เท่านั้น
```

### activity.html — หน้า Activity Timeline

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📅 Activity — Final Lab Sec2</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f172a; --surface: #1e293b; --border: #334155;
      --text: #e2e8f0; --muted: #94a3b8;
      --blue: #3b82f6; --green: #22c55e; --yellow: #f59e0b;
      --red: #ef4444; --purple: #a855f7; --teal: #14b8a6;
    }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; }
    .header { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center; }
    .header h1 { font-size:1.1rem; font-weight:700; }
    .container { max-width:900px; margin:0 auto; padding:1.5rem; }

    /* Stats */
    .stats { display:grid; grid-template-columns:repeat(5,1fr); gap:.75rem; margin-bottom:1.5rem; }
    .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:.75rem; padding:.85rem 1rem; text-align:center; }
    .stat-label { color:var(--muted); font-size:.72rem; text-transform:uppercase; }
    .stat-value { font-size:1.5rem; font-weight:700; margin-top:.2rem; }

    /* Filter */
    .filter-bar { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:1.25rem; }
    .filter-bar select, .filter-bar input {
      background:var(--surface); border:1px solid var(--border); color:var(--text);
      padding:.45rem .75rem; border-radius:.5rem; font-size:.85rem; outline:none;
    }
    .btn { padding:.45rem 1rem; border-radius:.5rem; border:none; cursor:pointer; font-size:.85rem; font-weight:600; }
    .btn-primary { background:var(--blue); color:#fff; }
    .btn-secondary { background:var(--surface); color:var(--text); border:1px solid var(--border); }

    /* Timeline */
    .timeline { position:relative; padding-left:2rem; }
    .timeline::before { content:''; position:absolute; left:.6rem; top:0; bottom:0; width:2px; background:var(--border); }
    .activity-item { position:relative; margin-bottom:1.25rem; padding:.85rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:.75rem; }
    .activity-item::before { content:''; position:absolute; left:-1.6rem; top:1rem; width:10px; height:10px; border-radius:50%; background:var(--blue); border:2px solid var(--bg); }
    .activity-item.USER_REGISTERED::before { background:var(--green); }
    .activity-item.USER_LOGIN::before      { background:var(--blue); }
    .activity-item.TASK_CREATED::before    { background:var(--teal); }
    .activity-item.TASK_STATUS_CHANGED::before { background:var(--yellow); }
    .activity-item.TASK_DELETED::before    { background:var(--red); }

    .activity-header { display:flex; align-items:center; gap:.6rem; margin-bottom:.35rem; }
    .event-badge { font-size:.7rem; font-weight:700; padding:.15rem .5rem; border-radius:.3rem; white-space:nowrap; }
    .badge-REGISTERED { background:rgba(34,197,94,.15);  color:#4ade80; }
    .badge-LOGIN      { background:rgba(59,130,246,.15); color:#93c5fd; }
    .badge-CREATED    { background:rgba(20,184,166,.15); color:#5eead4; }
    .badge-STATUS     { background:rgba(245,158,11,.15); color:#fbbf24; }
    .badge-DELETED    { background:rgba(239,68,68,.15);  color:#f87171; }
    .activity-user { font-size:.78rem; color:var(--muted); }
    .activity-summary { font-size:.88rem; color:var(--text); }
    .activity-time { font-size:.75rem; color:var(--muted); font-family:'Courier New',monospace; margin-top:.3rem; }
    .meta-tag { font-size:.72rem; color:var(--muted); background:rgba(255,255,255,.05); padding:.1rem .45rem; border-radius:.3rem; display:inline-block; margin-top:.3rem; }

    .empty { text-align:center; padding:3rem; color:var(--muted); }
    .tabs { display:flex; gap:.5rem; margin-bottom:1.25rem; }
    .tab { padding:.45rem 1.1rem; border-radius:.5rem; border:1px solid var(--border); cursor:pointer; font-size:.85rem; background:var(--surface); color:var(--muted); }
    .tab.active { background:var(--blue); color:#fff; border-color:var(--blue); }

    #login-overlay { position:fixed; inset:0; background:var(--bg); display:flex; align-items:center; justify-content:center; z-index:100; }
    .login-box { background:var(--surface); border:1px solid var(--border); border-radius:1rem; padding:2rem; width:340px; }
    .login-box h2 { margin-bottom:1.25rem; font-size:1.1rem; }
    .form-group { margin-bottom:1rem; }
    .form-group label { display:block; font-size:.82rem; color:var(--muted); margin-bottom:.35rem; }
    .form-group input { width:100%; background:#0f172a; border:1px solid var(--border); color:var(--text); padding:.6rem .75rem; border-radius:.5rem; font-size:.9rem; outline:none; }
  </style>
</head>
<body>
<script src="config.js"></script>

<!-- Login overlay -->
<div id="login-overlay">
  <div class="login-box">
    <h2>📅 Activity Timeline</h2>
    <p style="font-size:.82rem;color:var(--muted);margin-bottom:1rem">กรุณา login เพื่อดู activities ของคุณ</p>
    <div class="form-group">
      <label>Email</label>
      <input id="l-email" type="email" placeholder="email@example.com">
    </div>
    <div class="form-group">
      <label>Password</label>
      <input id="l-pass" type="password" placeholder="password">
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="doLogin()">เข้าสู่ระบบ</button>
    <p id="l-err" style="color:var(--red);font-size:.82rem;margin-top:.5rem"></p>
  </div>
</div>

<!-- Main -->
<div class="header">
  <h1>📅 Activity Timeline</h1>
  <div style="display:flex;gap:1rem;align-items:center">
    <span id="logged-as" style="font-size:.82rem;color:var(--muted)"></span>
    <a href="index.html" style="color:var(--blue);font-size:.85rem;text-decoration:none">← Task Board</a>
  </div>
</div>

<div class="container">
  <!-- Stats -->
  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">ทั้งหมด</div>
      <div class="stat-value" id="stat-total">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label" style="color:var(--green)">Registered</div>
      <div class="stat-value" style="color:var(--green)" id="stat-reg">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label" style="color:var(--blue)">Logins</div>
      <div class="stat-value" style="color:var(--blue)" id="stat-login">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label" style="color:var(--teal)">Tasks Created</div>
      <div class="stat-value" style="color:var(--teal)" id="stat-tasks">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label" style="color:var(--yellow)">Status Changes</div>
      <div class="stat-value" style="color:var(--yellow)" id="stat-status">—</div>
    </div>
  </div>

  <!-- Tabs: My Activity / All (admin) -->
  <div class="tabs">
    <button class="tab active" id="tab-mine" onclick="switchTab('mine')">🙋 กิจกรรมของฉัน</button>
    <button class="tab" id="tab-all" onclick="switchTab('all')" style="display:none">👑 ทั้งระบบ (admin)</button>
  </div>

  <!-- Filter -->
  <div class="filter-bar">
    <select id="f-event">
      <option value="">Event: ทั้งหมด</option>
      <option value="USER_REGISTERED">USER_REGISTERED</option>
      <option value="USER_LOGIN">USER_LOGIN</option>
      <option value="TASK_CREATED">TASK_CREATED</option>
      <option value="TASK_STATUS_CHANGED">TASK_STATUS_CHANGED</option>
      <option value="TASK_DELETED">TASK_DELETED</option>
    </select>
    <button class="btn btn-primary" onclick="loadActivities()">🔄 โหลดใหม่</button>
    <button class="btn btn-secondary" onclick="clearFilter()">✕ ล้าง</button>
  </div>

  <!-- Timeline -->
  <div class="timeline" id="timeline">
    <div class="empty">⏳ กำลังโหลด...</div>
  </div>
  <p id="last-refresh" style="font-size:.75rem;color:var(--muted);text-align:right;margin-top:.75rem"></p>
</div>

<script>
const AUTH     = window.APP_CONFIG.AUTH_URL;
const ACTIVITY = window.APP_CONFIG.ACTIVITY_URL;

let token    = localStorage.getItem('jwt_token');
let currUser = null;
let currTab  = 'mine';

// event type → badge class
const BADGE = {
  USER_REGISTERED:    'REGISTERED',
  USER_LOGIN:         'LOGIN',
  TASK_CREATED:       'CREATED',
  TASK_STATUS_CHANGED:'STATUS',
  TASK_DELETED:       'DELETED'
};
const ICON = {
  USER_REGISTERED: '🎉', USER_LOGIN: '🔑',
  TASK_CREATED: '✅', TASK_STATUS_CHANGED: '🔄', TASK_DELETED: '🗑️'
};

function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function doLogin() {
  const email    = document.getElementById('l-email').value.trim();
  const password = document.getElementById('l-pass').value;
  const res  = await fetch(`${AUTH}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (res.ok) {
    token = data.token;
    localStorage.setItem('jwt_token', token);
    currUser = data.user;
    initPage();
  } else {
    document.getElementById('l-err').textContent = data.error || 'Login ล้มเหลว';
  }
}

function initPage() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('logged-as').textContent = `👤 ${currUser.username} (${currUser.role})`;
  if (currUser.role === 'admin') {
    document.getElementById('tab-all').style.display = 'inline-block';
  }
  loadActivities();
}

function switchTab(tab) {
  currTab = tab;
  document.getElementById('tab-mine').classList.toggle('active', tab === 'mine');
  document.getElementById('tab-all').classList.toggle('active',  tab === 'all');
  loadActivities();
}

async function loadActivities() {
  const event_type = document.getElementById('f-event').value;
  const params     = new URLSearchParams({ limit: 100 });
  if (event_type) params.set('event_type', event_type);

  const endpoint = currTab === 'all'
    ? `${ACTIVITY}/api/activity/all?${params}`
    : `${ACTIVITY}/api/activity/me?${params}`;

  const res = await fetch(endpoint, { headers: authHeaders() });

  if (res.status === 401) { document.getElementById('login-overlay').style.display = 'flex'; return; }
  if (res.status === 403) {
    document.getElementById('timeline').innerHTML =
      '<div class="empty" style="color:#f87171">⛔ เฉพาะ admin เท่านั้น</div>';
    return;
  }
  if (!res.ok) return;

  const data = await res.json();
  const acts = data.activities || [];

  updateStats(acts);
  renderTimeline(acts);

  document.getElementById('last-refresh').textContent =
    `อัปเดต: ${new Date().toLocaleTimeString('th-TH')} | ${acts.length}/${data.total} รายการ`;
}

function updateStats(acts) {
  document.getElementById('stat-total').textContent = acts.length;
  document.getElementById('stat-reg').textContent   = acts.filter(a => a.event_type === 'USER_REGISTERED').length;
  document.getElementById('stat-login').textContent = acts.filter(a => a.event_type === 'USER_LOGIN').length;
  document.getElementById('stat-tasks').textContent = acts.filter(a => a.event_type === 'TASK_CREATED').length;
  document.getElementById('stat-status').textContent = acts.filter(a => a.event_type === 'TASK_STATUS_CHANGED').length;
}

function renderTimeline(acts) {
  const container = document.getElementById('timeline');
  if (!acts.length) {
    container.innerHTML = '<div class="empty">📭 ยังไม่มี activity</div>';
    return;
  }
  container.innerHTML = acts.map(a => {
    const badge   = BADGE[a.event_type] || 'LOGIN';
    const icon    = ICON[a.event_type] || '•';
    const time    = new Date(a.created_at).toLocaleString('th-TH', {
      dateStyle: 'short', timeStyle: 'medium'
    });
    const metaStr = a.meta ? JSON.stringify(a.meta) : '';
    return `
      <div class="activity-item ${escHtml(a.event_type)}">
        <div class="activity-header">
          <span class="event-badge badge-${badge}">${icon} ${escHtml(a.event_type)}</span>
          ${a.username ? `<span class="activity-user">👤 ${escHtml(a.username)}</span>` : ''}
        </div>
        <div class="activity-summary">${escHtml(a.summary || '—')}</div>
        <div class="activity-time">🕐 ${escHtml(time)}</div>
        ${metaStr ? `<span class="meta-tag">${escHtml(metaStr)}</span>` : ''}
      </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearFilter() {
  document.getElementById('f-event').value = '';
  loadActivities();
}

// Auto-login ถ้ามี token
if (token) {
  (async () => {
    const res  = await fetch(`${AUTH}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.valid) { currUser = data.user; initPage(); }
    else { localStorage.removeItem('jwt_token'); token = null; }
  })();
}
</script>
</body>
</html>
```
