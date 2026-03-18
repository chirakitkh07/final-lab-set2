require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db/db'); // ใช้ pool จาก db.js ที่เราแก้กันก่อนหน้า
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

// ── Start & DB Initialization ──────────────────────────────────────────
async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      // 1. ทดสอบการเชื่อมต่อเบื้องต้น
      await pool.query('SELECT 1');
      console.log('✅ [auth-db] Connected.');

      // 2. Fallback Query: สร้าง Table และ Seed ข้อมูล
      const initSql = `
        -- สร้าง Table Users
        CREATE TABLE IF NOT EXISTS users (
          id            SERIAL PRIMARY KEY,
          username      VARCHAR(50)  UNIQUE NOT NULL,
          email         VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role          VARCHAR(20)  DEFAULT 'member',
          created_at    TIMESTAMP    DEFAULT NOW(),
          last_login    TIMESTAMP
        );

        -- สร้าง Table Logs
        CREATE TABLE IF NOT EXISTS logs (
          id          SERIAL       PRIMARY KEY,
          level       VARCHAR(10)  NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
          event       VARCHAR(100) NOT NULL,
          user_id     INTEGER,
          ip_address  VARCHAR(45),
          message     TEXT,
          meta        JSONB,
          created_at  TIMESTAMP    DEFAULT NOW()
        );

        -- Seed ข้อมูล (Alice & Admin)
        INSERT INTO users (username, email, password_hash, role) VALUES
          ('alice', 'alice@lab.local', 
           '$2b$10$PjnT4Aw1VHdFD89uFMsbtOunaa8XXNtp.8aGFlC4Rf2F1zAp3V.KC', 
           'member'),
          ('admin', 'admin@lab.local', 
           '$2b$10$ZFSu9jujm16MjmDzk3fIYO36TyW7tNXJl3MGQuDkWBoiaiNJ2iFca', 
           'admin')
        ON CONFLICT (username) DO NOTHING;
      `;

      await pool.query(initSql);
      console.log('✅ [auth-db] Schema initialized and seeded.');
      break;

    } catch (e) {
      console.error(`❌ [auth] DB initialization failed: ${e.message}`);
      retries--;
      console.log(`[auth] Retrying in 3 seconds... (${retries} left)`);
      await new Promise(r => setTimeout(r, 3000));

      if (retries === 0) {
        console.error('💥 Could not connect to Database. Exiting...');
        process.exit(1);
      }
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 [auth-service] Running on :${PORT}`);
  });
}

start();