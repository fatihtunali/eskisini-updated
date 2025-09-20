import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_general_ci' // bağlantı düzeyi; tablo collation zaten turkish_ci
});
