require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db/db');
const tasksRouter = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use('/api/tasks', tasksRouter);

// ── Start & DB Initialization ──────────────────────────────────────────
async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      // 1. ตรวจสอบการเชื่อมต่อกับ task-db
      await pool.query('SELECT 1');
      console.log('✅ [task-db] Connected successfully.');

      // 2. Fallback SQL: สร้าง Tables ตาม Schema ที่กำหนด
      const initSql = `
        -- สร้าง Table Tasks
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

        -- สร้าง Table Logs (สำหรับเก็บ log ภายใน task-service)
        CREATE TABLE IF NOT EXISTS logs (
          id         SERIAL       PRIMARY KEY,
          level      VARCHAR(10)  NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
          event      VARCHAR(100) NOT NULL,
          user_id    INTEGER,
          message    TEXT,
          meta       JSONB,
          created_at TIMESTAMP    DEFAULT NOW()
        );

        -- สร้าง Index เพื่อให้ Query เร็วขึ้น
        CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      `;

      await pool.query(initSql);
      console.log('✅ [task-db] Tables (tasks, logs) are ready.');
      break;

    } catch (e) {
      console.error(`❌ [task] DB Initialization failed: ${e.message}`);
      retries--;
      console.log(`[task] Waiting for DB... (${retries} left)`);

      if (retries === 0) {
        console.error('💥 [task-service] Could not connect to DB. Exiting...');
        process.exit(1);
      }

      await new Promise(r => setTimeout(r, 3000));
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 [task-service] Running on port :${PORT}`);
  });
}

start();