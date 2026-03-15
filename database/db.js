const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'gymbot.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
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
  );

  CREATE TABLE IF NOT EXISTS workouts (
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
  );

  CREATE TABLE IF NOT EXISTS measurements (
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
  );

  CREATE TABLE IF NOT EXISTS sleep_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    hours_slept REAL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exercise TEXT NOT NULL,
    max_weight_kg REAL NOT NULL,
    achieved_date TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Ensure columns exist even if users table was created before these fields were added
const userColumns = db.prepare(`PRAGMA table_info(users)`).all();
const hasAvgSleep = userColumns.some((col) => col.name === 'avg_sleep_hours');
if (!hasAvgSleep) {
  db.exec(`ALTER TABLE users ADD COLUMN avg_sleep_hours REAL;`);
}
const hasSleepReminders = userColumns.some((col) => col.name === 'sleep_reminders');
if (!hasSleepReminders) {
  db.exec(`ALTER TABLE users ADD COLUMN sleep_reminders INTEGER NOT NULL DEFAULT 1;`);
}

module.exports = db;

