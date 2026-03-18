const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('railway.app') ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'taskboard',
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'secret123',
    };

const pool = new Pool(poolConfig);

module.exports = { pool };
