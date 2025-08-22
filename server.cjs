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
      req.user = decoded;
      if (requiredRole && req.user.role !== requiredRole) {
        return res.status(403).json({ error: "Brak uprawnień" });
      }
      next();
    } catch (err) {
      res.status(401).json({ error: "Nieprawidłowy token" });
    }
  };
}

// --- USERS & AUTH ---
app.post("/api/register", (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: "Wymagana nazwa użytkownika i hasło" });

  try {
    const existingUser = db.prepare("SELECT * FROM users WHERE name = ?").get(name);
    if (existingUser) return res.status(409).json({ error: "Użytkownik o tej nazwie już istnieje" });

    const role = name.toLowerCase() === "admin" ? "admin" : "user";
    db.prepare("INSERT INTO users (name, password, role) VALUES (?, ?, ?)").run(name, password, role);

    const token = signToken(name, role);
    res.json({ success: true, token, user: { name, role } });
  } catch (err) {
    console.error("Błąd rejestracji:", err);
    res.status(500).json({ error: "Wystąpił błąd podczas rejestracji" });
  }
});

app.post("/api/login", (req, res) => {
  const { name, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE name = ? AND password = ?").get(name, password);

  if (user) {
    const token = signToken(user.name, user.role);
    res.json({ success: true, token, user: { name: user.name, role: user.role } });
  } else {
    res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło" });
  }
});

app.get("/api/user", auth(), (req, res) => {
  res.json({ name: req.user.name, role: req.user.role });
});

// --- TASKS ---
app.get("/api/tasks", auth("admin"), (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks").all();
  res.json(tasks);
});

app.post("/api/tasks", auth("admin"), (req, res) => {
  const { tresc, odpowiedz, opcje, punkty, typ, arkusz } = req.body;
  if (!tresc || !odpowiedz || !punkty || !typ) {
    return res.status(400).json({ error: "Wszystkie pola są wymagane" });
  }
  const result = db.prepare("INSERT INTO tasks (tresc, odpowiedz, opcje, punkty, type, arkusz) VALUES (?, ?, ?, ?, ?, ?)").run(tresc, odpowiedz, JSON.stringify(opcje), punkty, typ, arkusz);
  res.json({ success: true, taskId: result.lastInsertRowid });
});

app.delete("/api/tasks/:id", auth("admin"), (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  res.json({ success: true });
});

// --- FILES ---
const upload = multer({ dest: 'uploads/' });
app.post("/api/upload", auth("admin"), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Brak pliku" });
  }
  const fileId = `${Date.now()}-${req.file.originalname}`;
  const newPath = path.join(UPLOADS_DIR, fileId);
  fs.renameSync(req.file.path, newPath);
  res.json({ success: true, fileId });
});

// --- SOLVED TASKS ---
app.post("/api/solved", auth(), (req, res) => {
  const { taskId, isCorrect } = req.body;
  try {
    db.prepare("INSERT OR REPLACE INTO solved (user, task_id, is_correct) VALUES (?, ?, ?)").run(req.user.name, taskId, isCorrect);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Błąd bazy danych" });
  }
});

app.post("/api/solved/reset", auth(), (req, res) => {
  db.prepare("DELETE FROM solved WHERE user = ?").run(req.user.name);
  res.json({ success: true });
});

app.get("/api/tasks/random", auth(), (req, res) => {
    const { type, incorrect } = req.query;
    let query;
    const params = [req.user.name];

    if (incorrect === 'true') {
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

// --- EXAMS ---
app.post("/api/exams", auth("admin"), (req, res) => {
  const { name, arkuszName, taskIds } = req.body;
  if (!name || !arkuszName || !taskIds || taskIds.length === 0) {
    return res.status(400).json({ error: "Wszystkie pola są wymagane" });
  }
  const result = db.prepare("INSERT INTO exams (name, arkusz_name, tasks) VALUES (?, ?, ?)").run(name, arkuszName, JSON.stringify(taskIds));
  res.json({ success: true, examId: result.lastInsertRowid });
});

app.get("/api/exams", auth(), (req, res) => {
  const exams = db.prepare("SELECT * FROM exams").all();
  const examsWithTaskCount = exams.map(exam => ({
    ...exam,
    tasks: JSON.parse(exam.tasks).length
  }));
  res.json(examsWithTaskCount);
});

app.get("/api/exams/:id", auth(), (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(req.params.id);
  if (!exam) return res.status(404).json({ error: "Egzamin nie znaleziony" });
  const taskIds = JSON.parse(exam.tasks);
  const tasks = taskIds.map(id => db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
  const fullExam = {
    ...exam,
    tasks: tasks.map(t => ({
      ...t,
      opcje: t.opcje ? JSON.parse(t.opcje) : null
    }))
  };
  res.json(fullExam);
});

// --- RESULTS ---
app.post("/api/results", auth(), (req, res) => {
    const { examId, examName, correct, wrong, total, percent, closedCorrect, closedWrong, openCorrect, openWrong } = req.body;
    db.prepare("INSERT INTO results (user, exam_id, exam_name, correct, wrong, total, percent, closed_correct, closed_wrong, open_correct, open_wrong) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(req.user.name, Number(examId), examName, Number(correct), Number(wrong), Number(total), Number(percent), Number(closedCorrect), Number(closedWrong), Number(openCorrect), Number(openWrong));
    res.json({ success: true });
});

app.get("/api/results", auth(), (req, res) => {
    const results = db.prepare("SELECT * FROM results WHERE user = ?").all(req.user.name);
    res.json(results);
});


// --- STATS ---
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

    const solvedExams = db.prepare("SELECT COUNT(id) as total_exams FROM results WHERE user = ?").get(user);

    const closedStats = typeStats.find(s => s.type === 'zamkniete') || { correct: 0, wrong: 0 };
    const openStats = typeStats.find(s => s.type === 'otwarte') || { correct: 0, wrong: 0 };
    
    res.json({
        generalStats,
        closedStats,
        openStats,
        solvedExams
    });
});

app.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});