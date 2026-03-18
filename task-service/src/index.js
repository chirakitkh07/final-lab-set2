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

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ [task-db] Connected.');

      // Fallback Query: CREATE TABLE IF NOT EXISTS
      const initSql = `
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
      `;
      await pool.query(initSql);
      console.log('✅ [task-db] Schema initialized.');
      break;
    } catch (e) {
      console.error(`❌ [task] DB initialization failed: ${e.message}`);
      retries--;
      console.log(`[task] Retrying in 3 seconds... (${retries} left)`);
      await new Promise(r => setTimeout(r, 3000));
      if (retries === 0) {
        console.error('💥 Could not connect to Database. Exiting...');
        process.exit(1);
      }
    }
  }
  app.listen(PORT, () => console.log(`[task-service] Running on :${PORT}`));
}
start();