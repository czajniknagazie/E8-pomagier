// server.cjs

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

dotenv.config();
const app = express();
const db = new Database(process.env.DB_PATH || "./data.sqlite");
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads";

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));
app.use(cors());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static("public"));

// --- JWT & Authentication ---
function signToken(name, role) {
  return jwt.sign({ name, role }, process.env.JWT_SECRET, { expiresIn: role === "admin" ? "8h" : "365d" });
}

function auth(requiredRole = null) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Brak tokena" });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) return res.status(403).json({ error: "Brak uprawnień" });
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: "Błędny token" });
    }
  };
}

// --- Login Endpoints ---
app.post("/api/login-student", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "Brak nazwy" });
  const token = signToken(name, "student");
  res.json({ token, role: "student", name });
});
app.post("/api/admin/login", (req, res) => {
  const { name, code } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: "Brak nazwy lub kodu" });
  if (code !== process.env.ADMIN_CODE) return res.status(401).json({ error: "Błędne dane administratora!" });
  const token = signToken(name, "admin");
  res.json({ token, role: "admin", name });
});
// --- Tasks ---
app.get("/api/tasks", auth(), (req, res) => {
    const { search = '' } = req.query;
    let query = `SELECT * FROM tasks`;
    const params = [];
    if (search) {
        query += ' WHERE id LIKE ? OR arkusz LIKE ?';
        params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY id DESC';
    const tasks = db.prepare(query).all(params).map(t => ({ ...t, opcje: t.opcje ? JSON.parse(t.opcje) : null
    }));
    res.json(tasks);
});

app.get("/api/tasks/random", auth(), (req, res) => {
    const { type, incorrect } = req.query; // Dodano parametr `incorrect`
    let query;
    const params = [req.user.name];

    if (incorrect === 'true') {
      // Pobierz losowe zadanie, które zostało rozwiązane błędnie
      query = `
          SELECT T.* FROM tasks T
          INNER JOIN solved S ON T.id = S.task_id
          WHERE S.user = ? AND S.is_correct = 0
      `;
      if (type === 'zamkniete' || type === 'otwarte') {
          query += ' AND T.type = ?';
          params.push(type);
      }
    } else {
      // Standardowy tryb, pobierz losowe zadanie, które nie zostało rozwiązane
      query = `
           SELECT * FROM tasks
          WHERE id NOT IN (SELECT task_id FROM solved WHERE user = ?)
      `;
      if (type === 'zamkniete' || type === 'otwarte') {
          query += ' AND type = ?';
          params.push(type);
      }
    }
    
    query += ' ORDER BY RANDOM() LIMIT 1';
    
    const task = db.prepare(query).get(params);
    if (task) {
        task.opcje = task.opcje ? JSON.parse(task.opcje) : null;
    }
    res.json(task || null);
});

// --- Solved Tasks ---
app.post("/api/solved", auth(), (req, res) => {
  const { taskId, isCorrect } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "Brak taskId" });
  try {
    // Użyj INSERT OR REPLACE, aby zaktualizować status, jeśli zadanie już istnieje w arkuszu
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO solved (user, task_id, is_correct)
      VALUES (?, ?, ?)
    `);
    stmt.run(req.user.name, Number(taskId), isCorrect ? 1 : 0);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// NOWOŚĆ: Endpoint do resetowania postępów
app.delete("/api/solved", auth(), (req, res) => {
  const user = req.user.name;
  try {
    db.prepare("DELETE FROM solved WHERE user = ?").run(user);
    res.json({ success: true, message: "Postępy zresetowane." });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera podczas resetowania postępów: " + e.message });
  }
});
// --- Image Upload ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const base = path.basename(file.originalname, ext).replace(/[^\w.-]/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage });

app.post("/api/upload", auth("admin"), upload.array("files", 50), (req, res) => {
  const files = (req.files || []).map(f => ({
    filename: f.filename,
    url: `/uploads/${f.filename}`
  }));
  res.json({ success: true, files });
});
// --- Bulk Task Creation ---
app.post("/api/tasks/bulk", auth("admin"), (req, res) => {
  const { tasks } = req.body || {};
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: "Brak zadań" });

  const ins = db.prepare(`INSERT INTO tasks (type, tresc, odpowiedz, opcje, punkty) VALUES (@type, @tresc, @odpowiedz, @opcje, @punkty)`);
  
  const trx = db.transaction((arr) => {
    for (const t of arr) {
      ins.run({
        type: t.type,
        tresc: t.tresc,
        odpowiedz: t.odpowiedz,
        opcje: t.opcje ? JSON.stringify(t.opcje) : null,
        punkty: Number(t.punkty) || 1,
      });
    }
  });

  trx(tasks);
  res.json({ success: true, count: tasks.length });
});
// --- Usuwanie zadań ---
app.delete("/api/tasks/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    try {
        const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
        if (info.changes > 0) {
            res.status(204).send(); // Sukces, brak treści
        } else {
            res.status(404).json({ error: "Zadanie nie znaleziono." });
        }
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});
// --- Exams ---
app.get("/api/exams", auth(), (req, res) => {
  const list = db.prepare("SELECT id, name, tasks FROM exams ORDER BY id DESC").all();
  res.json(list);
});
app.get("/api/exams/:id", auth(), (req, res) => {
  const exam = db.prepare("SELECT id, name, tasks FROM exams WHERE id=?").get(req.params.id);
  if (!exam) return res.status(404).json({ error: "Nie ma takiego egzaminu" });
  const ids = JSON.parse(exam.tasks || "[]");
  if (!ids.length) return res.json({ id: exam.id, name: exam.name, tasks: [] });
  // Poprawione zapytanie SQL, które sortuje zadania po ID
  const q = `SELECT * FROM tasks WHERE id IN (${ids.map(()=>"?").join(",")}) ORDER BY id ASC`;
  const tasks = db.prepare(q).all(ids).map(t => ({ ...t, opcje: t.opcje ? JSON.parse(t.opcje) : null }));
  res.json({ id: exam.id, name: exam.name, tasks: tasks });
});
app.post("/api/exams", auth("admin"), (req, res) => {
  const { name, taskIds, arkuszName } = req.body || {};
  if (!name || !Array.isArray(taskIds) || !taskIds.length) {
    return res.status(400).json({ error: "Brak nazwy lub zadań" });
  }
  const dbTransaction = db.transaction(() => {
    const examInfo = db.prepare("INSERT INTO exams (name, tasks) VALUES (?, ?)").run(name, JSON.stringify(taskIds));
    const updateStmt = db.prepare("UPDATE tasks SET arkusz = ? WHERE id = ?");
    for (const taskId of taskIds) {
      updateStmt.run(arkuszName, taskId);
    }
    return examInfo;
  });
  try {
    const info = dbTransaction();
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: "Błąd podczas tworzenia egzaminu: " + e.message
    });
  }
});
// --- Usuwanie egzaminów ---
app.delete("/api/exams/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    try {
        const info = db.prepare("DELETE FROM exams WHERE id = ?").run(id);
        if (info.changes > 0) {
            res.status(204).send(); // Sukces, brak treści
        } else {
            res.status(404).json({ error: "Egzamin nie znaleziono." });
        }
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});
// --- Results ---
// Zaktualizowany endpoint, który przyjmuje więcej danych o wynikach
app.post("/api/results", auth(), (req, res) => {
    const { examId, examName, correct, wrong, total, percent } = req.body || {};
    try {
        db.prepare("INSERT INTO results (user, exam_id, exam_name, correct, wrong, total, percent) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(req.user.name, Number(examId), examName, Number(correct), Number(wrong), Number(total), Number(percent));
        res.json({ success: true });
    } catch (e) {
         res.status(400).json({ error: e.message });
    }
});
app.get("/api/stats", auth(), (req, res) => {
    const user = req.user.name;

    const generalStats = db.prepare(`
        SELECT 
            COUNT(s.id) as total_solved,
            SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
            SUM(CASE WHEN s.is_correct = 0 THEN 1 ELSE 0 END) as total_wrong
        FROM solved s WHERE s.user = ?
    `).get(user);

    const typeStats = db.prepare(`
        SELECT 
            t.type,
            SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as correct,
            SUM(CASE WHEN s.is_correct = 0 THEN 1 ELSE 0 END) as wrong
        FROM solved s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.user = ?
        GROUP BY t.type
    `).all(user);

    const solvedExams = db.prepare("SELECT exam_name, correct, total, percent FROM results WHERE user = ? ORDER BY id DESC").all(user);

    const formattedTypeStats = typeStats.reduce((acc, curr) => {
        acc[curr.type] = { correct: curr.correct, wrong: curr.wrong };
        return acc;
    }, {});

    res.json({ generalStats, typeStats: formattedTypeStats, solvedExams });
});
// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      name TEXT PRIMARY KEY,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      tresc TEXT NOT NULL,
      odpowiedz TEXT,
      opcje TEXT,
      punkty INTEGER DEFAULT 1,
      arkusz TEXT
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tasks TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS solved (
      user TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      PRIMARY KEY (user, task_id)
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      exam_id INTEGER NOT NULL,
      exam_name TEXT NOT NULL,
      correct INTEGER NOT NULL,
      wrong INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percent REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
});