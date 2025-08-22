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
    const tasks = db.prepare(query).all(params).map(t => ({ ...t, opcje: t.opcje ? JSON.parse(t.opcje) : null }));
    res.json(tasks);
});

// NOWOŚĆ: Endpoint do dodawania pojedynczego zadania (przywrócony)
app.post("/api/tasks", auth("admin"), (req, res) => {
  const { type, tresc, odpowiedz, opcje, punkty, arkusz } = req.body || {};
  if (!type || !tresc || !odpowiedz) return res.status(400).json({ error: "Brak wymaganych danych: typ, treść lub odpowiedź." });

  try {
    const info = db.prepare(`
      INSERT INTO tasks (type, tresc, odpowiedz, opcje, punkty, arkusz)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(type, tresc, odpowiedz, opcje ? JSON.stringify(opcje) : null, Number(punkty) || 1, arkusz || null);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/tasks/random", auth(), (req, res) => {
    const { type, mode } = req.query;
    let query;
    const params = [req.user.name];

    if (mode === 'wrong') {
        query = `SELECT * FROM tasks WHERE id IN (SELECT task_id FROM solved WHERE user = ? AND is_correct = 0)`;
    } else {
        query = `SELECT * FROM tasks WHERE id NOT IN (SELECT task_id FROM solved WHERE user = ?)`;
    }

    if (type === 'zamkniete' || type === 'otwarte') {
        query += ' AND type = ?';
        params.push(type);
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
    db.prepare(`INSERT OR IGNORE INTO solved (user, task_id, is_correct) VALUES (?, ?, ?)`)
      .run(req.user.name, Number(taskId), isCorrect ? 1 : 0);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Resetowanie postępów (pozostawione) ---
app.delete("/api/solved", auth(), (req, res) => {
  const user = req.user.name;
  try {
    db.prepare("DELETE FROM solved WHERE user = ?").run(user);
    res.json({ success: true, message: "Postępy zresetowane." });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera podczas resetowania postępów: " + e.message });
  }
});

app.delete("/api/solved/wrong", auth(), (req, res) => {
  const user = req.user.name;
  try {
    db.prepare("DELETE FROM solved WHERE user = ? AND is_correct = 0").run(user);
    res.json({ success: true, message: "Błędne zadania zresetowane." });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera podczas resetowania błędnych zadań: " + e.message });
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

// --- Usuwanie zadań (pozostawione) ---
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
  const exams = db.prepare("SELECT * FROM exams ORDER BY created_at DESC").all();
  res.json(exams);
});

app.get("/api/exams/:id", auth(), (req, res) => {
  const examId = req.params.id;
  try {
    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(examId);
    if (!exam) return res.status(404).json({ error: "Egzamin nie znaleziono." });
    
    const taskIds = JSON.parse(exam.tasks);
    const placeholders = taskIds.map(() => '?').join(',');
    const tasks = db.prepare(`SELECT * FROM tasks WHERE id IN (${placeholders})`).all(taskIds);
    
    // Sort tasks to match the order in the exam definition
    const orderedTasks = taskIds.map(id => tasks.find(t => t.id === id));
    
    res.json({ ...exam, tasks: orderedTasks.map(t => ({ ...t, opcje: t.opcje ? JSON.parse(t.opcje) : null })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/exams", auth("admin"), (req, res) => {
  const { name, taskIds, arkuszName } = req.body || {};
  if (!name || !Array.isArray(taskIds) || !taskIds.length) return res.status(400).json({ error: "Brak nazwy lub zadań." });
  try {
    const info = db.prepare(`INSERT INTO exams (name, tasks) VALUES (?, ?)`).run(name, JSON.stringify(taskIds));
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/exams/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    try {
        const info = db.prepare("DELETE FROM exams WHERE id = ?").run(id);
        if (info.changes > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ error: "Egzamin nie znaleziono." });
        }
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

app.post("/api/results", auth(), (req, res) => {
    const { examId, examName, correct, wrong, total, percent } = req.body || {};
    db.prepare("INSERT INTO results (user, exam_id, exam_name, correct, wrong, total, percent) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(req.user.name, Number(examId), examName, Number(correct), Number(wrong), Number(total), Number(percent));
    res.json({ success: true });
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

    const solvedExams = db.prepare("SELECT * FROM results WHERE user = ? ORDER BY created_at DESC").all(user);
    
    res.json({ generalStats, typeStats, solvedExams });
});

app.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});