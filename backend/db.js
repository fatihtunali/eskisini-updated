// backend/db.js
import mysql from 'mysql2/promise';
import 'dotenv/config';

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER,
  DB_PASS,
  DB_NAME,
  DB_SSL = 'true'
} = process.env;

const ssl = DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_general_ci',
  ssl
});

export async function pingDb(){
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    console.log('[DB] connected:', `${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  } finally {
    conn.release();
  }
}
