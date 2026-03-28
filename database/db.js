require('dotenv').config();
const path = require('path');

const useTurso = !!(
  process.env.TURSO_DATABASE_URL &&
  process.env.TURSO_AUTH_TOKEN &&
  String(process.env.TURSO_DATABASE_URL).trim() &&
  String(process.env.TURSO_AUTH_TOKEN).trim()
);

let tursoClient = null;
let sqliteDb = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    name TEXT,
    age INTEGER,
    height_cm REAL,
    weight_kg REAL,
    level TEXT,
    goal TEXT,
    avg_sleep_hours REAL,
    sleep_reminders INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    exercise TEXT NOT NULL,
    weight_kg REAL,
    sets INTEGER,
    reps INTEGER,
    notes TEXT,
    effort_score INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    body_weight REAL,
    chest REAL,
    waist REAL,
    hips REAL,
    bicep REAL,
    thigh REAL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sleep_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    hours_slept REAL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exercise TEXT NOT NULL,
    max_weight_kg REAL NOT NULL,
    achieved_date TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS exercise_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    input_text TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_aliases_user_input
   ON exercise_aliases (user_id, input_text)`,
];

function normalizeValue(v) {
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : v;
  }
  return v;
}

function tursoResultToRows(result) {
  if (!result || !result.rows) return [];
  return result.rows.map((row) => {
    const o = {};
    for (let i = 0; i < result.columns.length; i += 1) {
      o[result.columns[i]] = normalizeValue(row[i]);
    }
    return o;
  });
}

async function run(sql, args = []) {
  if (useTurso) {
    await tursoClient.execute({ sql, args });
    return;
  }
  sqliteDb.prepare(sql).run(...args);
}

async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0];
}

async function all(sql, args = []) {
  if (useTurso) {
    const r = await tursoClient.execute({ sql, args });
    return tursoResultToRows(r);
  }
  return sqliteDb.prepare(sql).all(...args);
}

async function migrateUsersColumns() {
  const cols = await all(`PRAGMA table_info(users)`);
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('avg_sleep_hours')) {
    await run(`ALTER TABLE users ADD COLUMN avg_sleep_hours REAL`);
  }
  if (!names.has('sleep_reminders')) {
    await run(
      `ALTER TABLE users ADD COLUMN sleep_reminders INTEGER NOT NULL DEFAULT 1`
    );
  }
}

async function init() {
  if (useTurso) {
    const { createClient } = require('@libsql/client');
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    for (const sql of SCHEMA_STATEMENTS) {
      await tursoClient.execute(sql);
    }
    await migrateUsersColumns();
    console.log('БД: подключение к Turso');
  } else {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'gymbot.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    for (const sql of SCHEMA_STATEMENTS) {
      sqliteDb.exec(sql);
    }
    const userColumns = sqliteDb.prepare(`PRAGMA table_info(users)`).all();
    const hasAvgSleep = userColumns.some((col) => col.name === 'avg_sleep_hours');
    if (!hasAvgSleep) {
      sqliteDb.exec(`ALTER TABLE users ADD COLUMN avg_sleep_hours REAL;`);
    }
    const hasSleepReminders = userColumns.some(
      (col) => col.name === 'sleep_reminders'
    );
    if (!hasSleepReminders) {
      sqliteDb.exec(
        `ALTER TABLE users ADD COLUMN sleep_reminders INTEGER NOT NULL DEFAULT 1;`
      );
    }
    console.log('БД: локальный SQLite', dbPath);
  }
}

module.exports = {
  init,
  run,
  get,
  all,
  useTurso,
};
