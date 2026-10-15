require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.query('SELECT current_user, current_database()')
  .then(r => { console.log('Connected!', r.rows[0]); pool.end(); })
  .catch(e => { console.error('Failed:', e.message); pool.end(); });