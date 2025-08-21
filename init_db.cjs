// init_db.cjs
const Database = require("better-sqlite3");
const dotenv = require("dotenv");
dotenv.config();

const DB_PATH = process.env.DB_PATH || "./data.sqlite";
const db = new Database(DB_PATH);

db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('otwarte','zamkniete')),
      tresc TEXT NOT NULL,
      odpowiedz TEXT NOT NULL,
      opcje TEXT, -- JSON array for 'zamkniete'
      punkty INTEGER NOT NULL DEFAULT 1,
      arkusz TEXT
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      tasks TEXT NOT NULL, -- JSON array: [id,id,...] in order
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        exam_id INTEGER,
        exam_name TEXT,
        correct INTEGER NOT NULL DEFAULT 0,
        wrong INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        percent REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS solved (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(user, task_id)
    );
`);

console.log("🏁 Inicjalizacja bazy zakończona. (bez importu z tasks_import.json)");
