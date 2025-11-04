const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const jwt = require("jsonwebtoken");

// --- ZMIANA NA PG ---
const { Pool } = require("pg"); // ZMIANA: Używamy 'pg' zamiast 'better-sqlite3'

const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
// ...

dotenv.config();
const app = express();
// --- USUNIĘTA STARA LINIA 13 ---
// const db = new Database(process.env.DB_PATH || "./data.sqlite"); // USUNIJ TĘ LINIĘ!
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads";
const saltRounds = 10; // Siła hashowania

// --- NOWA INICJALIZACJA DLA POSTGRESQL (Dodana w nowym miejscu) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Funkcja do obsługi zapytań
const query = (text, params) => pool.query(text, params);
// --- SEKCJA AKTUALIZACJI BAZY DANYCH (MIGRACJA) ---

// Migracja tabeli 'solved' (bez zmian w tej wersji, zachowujemy punkty i tryby)
try {
  const columns = db.prepare(`PRAGMA table_info(solved)`).all();
  const hasModeColumn = columns.some(col => col.name === 'mode');
  if (!hasModeColumn) {
    console.log("Wykryto starą wersję bazy danych. Aktualizowanie tabeli 'solved' (dodanie 'mode')...");
    db.prepare(`ALTER TABLE solved ADD COLUMN mode TEXT NOT NULL DEFAULT 'standard'`).run();
    console.log("Tabela 'solved' zaktualizowana.");
  }
  
  const hasEarnedPointsColumn = columns.some(col => col.name === 'earned_points');
  if (!hasEarnedPointsColumn) {
    console.log("Aktualizowanie tabeli 'solved' (dodanie 'earned_points')...");
    db.prepare(`ALTER TABLE solved ADD COLUMN earned_points INTEGER`).run();
    // Ustawienie domyślnych punktów na 1 za poprawne rozwiązanie (dla wstecznej kompatybilności)
    db.prepare(`UPDATE solved SET earned_points = CASE WHEN is_correct = 1 THEN 1 ELSE 0 END`).run();
    console.log("Tabela 'solved' zaktualizowana.");
  }
} catch (err) {
  if (!err.message.includes("no such table: solved")) {
    console.error("Błąd podczas migracji tabeli 'solved':", err);
  }
}


// NOWOŚĆ I NAPRAWA: W pełni funkcjonalna Migracja tabeli 'users'
// Obsługuje błąd "no such column: id" i zachowuje dane.
try {
  // Sprawdzenie obecnej struktury tabeli 'users'
  const userTableInfo = db.prepare(`PRAGMA table_info(users)`).all();
  const hasIdColumn = userTableInfo.some(col => col.name === 'id');
  const hasPasswordHash = userTableInfo.some(col => col.name === 'password_hash');
  
  // --- Krok 1: Napraw błąd "no such column: id" przez migrację struktury ---
  if (!hasIdColumn && userTableInfo.length > 0) {
    console.log("Wykryto starą wersję tabeli 'users' (brak kolumny 'id'). Rozpoczynanie zaawansowanej migracji...");
    
    // 1. Zmień nazwę starej tabeli (przechowanie danych)
    db.exec(`ALTER TABLE users RENAME TO old_users;`);

    // 2. Stwórz nową tabelę z poprawnym schematem
    db.exec(`
      CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'student'
      );
    `);
    
    // 3. Przenieś dane z powrotem do nowej tabeli (zachowujemy name i role)
    db.exec(`INSERT INTO users (name, role) SELECT name, role FROM old_users;`);
    
    // 4. Usuń starą tabelę
    db.exec(`DROP TABLE old_users;`);
    
    console.log("Struktura tabeli 'users' została zaktualizowana pomyślnie.");
  }

  // --- Krok 2: Dodaj hasło hash, jeśli brakuje w bazie ---
  // To jest konieczne, jeśli tabela została zmigrowana w kroku 1, ale nie miała jeszcze kolumny hash.
  const currentUserTableInfo = db.prepare(`PRAGMA table_info(users)`).all();
  const currentHasPasswordHash = currentUserTableInfo.some(col => col.name === 'password_hash');

  if (currentUserTableInfo.length > 0 && !currentHasPasswordHash) {
     console.log("Aktualizowanie tabeli 'users' o kolumnę 'password_hash'...");
     db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT;`);
     console.log("Tabela 'users' została zaktualizowana.");
  }
  
  // --- Krok 3: Stwórz/Zweryfikuj domyślnego admina i jego hasło ---
  const adminPassword = process.env.ADMIN_CODE || 'admin123';
  const adminHash = bcrypt.hashSync(adminPassword, saltRounds);

  // Sprawdź, czy admin istnieje
  const adminExists = db.prepare("SELECT name FROM users WHERE name = 'admin'").get();
  
  if (!adminExists) {
    // Stwórz nowego admina, jeśli go nie ma
    db.prepare(
      'INSERT INTO users (name, password_hash, role) VALUES (?, ?, ?)'
    ).run('admin', adminHash, 'admin');
    console.log("Konto administratora ('admin') zostało utworzone.");
  } else {
    // Zaktualizuj hasło istniejącego admina na to z .env
    db.prepare(
      'UPDATE users SET password_hash = ?, role = ? WHERE name = ?'
    ).run(adminHash, 'admin', 'admin');
    console.log("Konto administratora ('admin') zostało zweryfikowane i hasło zaktualizowane (jeśli było inne).");
  }

} catch (err) {
  if (!err.message.includes("no such table: users")) {
    console.error("Błąd podczas migracji tabeli 'users':", err);
  }
}
// --- KONIEC SEKCJI AKTUALIZACJI ---


if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));
app.use(cors());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static("public"));

// --- JWT & Authentication ---

// ZMODYFIKOWANO: Token teraz przechowuje 'userId' dla lepszego powiązania z bazą
function signToken(user) {
  return jwt.sign(
    { userId: user.id, name: user.name, role: user.role }, 
    process.env.JWT_SECRET, 
    { expiresIn: user.role === "admin" ? "8h" : "365d" }
  );
}

function auth(requiredRole = null) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Brak tokena" });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) return res.status(403).json({ error: "Brak uprawnień" });
      req.user = decoded; // req.user zawiera teraz { userId, name, role }
      next();
    } catch {
      res.status(401).json({ error: "Błędny token" });
    }
  };
}

// --- Login Endpoints ---

// NOWOŚĆ: Endpoint rejestracji
app.post("/api/register-student", (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ error: 'Nazwa i hasło są wymagane.' });
  }

  try {
    // 1. Sprawdź, czy użytkownik już istnieje
    // Ten select teraz działa poprawnie dzięki zaawansowanej migracji
    const existingUser = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
    if (existingUser) {
      return res.status(400).json({ error: 'Ta nazwa użytkownika jest już zajęta.' });
    }

    // 2. Stwórz hash hasła
    const password_hash = bcrypt.hashSync(password, saltRounds);

    // 3. Dodaj użytkownika do bazy
    const info = db.prepare(
      'INSERT INTO users (name, password_hash, role) VALUES (?, ?, ?)'
    ).run(name, password_hash, 'student');

    res.status(201).json({ success: true, message: 'Użytkownik zarejestrowany!', userId: info.lastInsertRowid });
  
  } catch (e) {
    res.status(500).json({ error: 'Błąd serwera podczas rejestracji: ' + e.message });
  }
});


// ZMODYFIKOWANO: Logowanie studenta sprawdza teraz hasło
app.post("/api/login-student", (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: "Brak nazwy lub hasła" });

  try {
    const user = db.prepare('SELECT * FROM users WHERE name = ? AND role = ?').get(name, 'student');
    
    // Sprawdź, czy użytkownik istnieje
    if (!user) {
      return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
    }

    // Sprawdź, czy konto ma hasło (dla starych kont z migracji)
    if (!user.password_hash) {
      // W przypadku migracji, studenci logujący się po raz pierwszy muszą się "zarejestrować"
      return res.status(401).json({ error: "To konto nie ma ustawionego hasła. Użyj opcji 'Rejestracja' aby ustawić nowe hasło do konta." });
    }

    // Porównaj hasło
    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
    }

    // Hasło pasuje, wygeneruj token
    const token = signToken(user);
    res.json({ token, role: user.role, name: user.name });

  } catch (e) {
    res.status(500).json({ error: "Błąd serwera: " + e.message });
  }
});

// ZMODYFIKOWANO: Logowanie admina sprawdza teraz bazę danych
app.post("/api/admin/login", (req, res) => {
  const { name, code } = req.body || {}; // 'code' to teraz hasło admina
  if (!name || !code) return res.status(400).json({ error: "Brak nazwy lub kodu (hasła)" });
  
  try {
    const adminUser = db.prepare('SELECT * FROM users WHERE name = ? AND role = ?').get(name, 'admin');

    if (!adminUser) {
      return res.status(401).json({ error: "Błędne dane administratora!" });
    }

    // Porównaj hasło (przesłane w polu 'code')
    const match = bcrypt.compareSync(code, adminUser.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Błędne dane administratora!" });
    }
    
    // Hasło pasuje, wygeneruj token
    const token = signToken(adminUser);
    res.json({ token, role: adminUser.role, name: adminUser.name });

  } catch (e) {
    res.status(500).json({ error: "Błąd serwera: " + e.message });
  }
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

app.put("/api/tasks/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    const { odpowiedz, punkty, opcje } = req.body;
    if (!odpowiedz || punkty === undefined) return res.status(400).json({ error: "Brak wszystkich wymaganych danych (odpowiedz, punkty)." });
    try {
        const stmt = db.prepare("UPDATE tasks SET odpowiedz = ?, punkty = ?, opcje = ? WHERE id = ?");
        const opcjeJson = opcje ? JSON.stringify(opcje) : null;
     
   const info = stmt.run(odpowiedz, Number(punkty), opcjeJson, id);
        if (info.changes > 0) res.json({ success: true, message: "Zadanie zaktualizowane." });
        else res.status(404).json({ error: "Nie znaleziono zadania." });
    } catch (e) {
       res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});
app.get("/api/tasks/random", auth(), (req, res) => {
    const { type, incorrect, mode = 'standard' } = req.query;
    let query;
    const params = [req.user.name, mode]; // Używamy req.user.name, które jest identyfikatorem w tabeli solved

    if (incorrect === 'true') {
        query = `SELECT T.* FROM tasks T INNER JOIN solved S ON T.id = S.task_id WHERE S.user = ? AND S.mode = ? AND S.is_correct = 0`;
        if (type === 'zamkniete' || type === 'otwarte') {
         query += 
' AND T.type = ?';
            params.push(type);
        }
    } else {
        query = `SELECT * FROM tasks WHERE id NOT IN (SELECT task_id FROM solved WHERE user = ? AND mode = ?)`;
        if (type === 'zamkniete' || type === 'otwarte') {
            query += ' AND type = ?';
       
     params.push(type);
        }
    }
    query += ' ORDER BY RANDOM() LIMIT 1';

    const task = db.prepare(query).get(params);
    if (task) task.opcje = task.opcje ? JSON.parse(task.opcje) : null;
    res.json(task || null);
});
// --- Solved Tasks ---
app.post("/api/solved", auth(), (req, res) => {
  const { taskId, isCorrect, mode = 'standard', earnedPoints } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "Brak taskId" });
  
  const points = earnedPoints !== undefined ? Number(earnedPoints) : (isCorrect ? 1 : 0);

  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO solved (user, task_id, is_correct, mode, earned_points) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(req.user.name, Number(taskId), isCorrect ? 1 : 0, mode, points); 
    res.json({ success: true });
  } catch (e) {
  
   res.status(400).json({ error: e.message });
  }
});
app.delete("/api/solved", auth(), (req, res) => {
  const user = req.user.name; 
  const { mode = 'standard' } = req.body;
  try {
    db.prepare("DELETE FROM solved WHERE user = ? AND mode = ?").run(user, mode);
    res.json({ success: true, message: `Postępy dla trybu '${mode}' zresetowane.` });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera: " + e.message });
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
  const files = (req.files || []).map(f => ({ filename: f.filename, url: `/uploads/${f.filename}` }));
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
app.delete("/api/tasks/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    try {
        const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
        if (info.changes > 0) res.status(204).send();
        else res.status(404).json({ error: "Zadanie nie znaleziono." });
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
  const q = `SELECT * FROM tasks WHERE id IN (${ids.map(()=>"?").join(",")}) ORDER BY id ASC`;
  const tasks = db.prepare(q).all(ids).map(t => ({ ...t, opcje: t.opcje ? JSON.parse(t.opcje) : null }));
  res.json({ id: exam.id, name: exam.name, tasks: tasks });
});
app.put("/api/exams/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Brak nowej nazwy." });
    try {
        const info = db.prepare("UPDATE exams SET name = ? WHERE id = ?").run(name, id);
        if (info.changes > 0) res.json({ success: true, message: "Nazwa egzaminu zaktualizowana." });
        else res.status(404).json({ error: "Nie znaleziono egzaminu." });
    } catch 
(e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});
app.post("/api/exams", auth("admin"), (req, res) => {
  const { name, taskIds, arkuszName } = req.body || {};
  if (!name || !Array.isArray(taskIds) || !taskIds.length) return res.status(400).json({ error: "Brak nazwy lub zadań" });
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
    res.status(500).json({ error: "Błąd podczas tworzenia egzaminu: " + e.message });
  }
});
app.delete("/api/exams/:id", auth("admin"), (req, res) => {
    const { id } = req.params;
    try {
        const info = db.prepare("DELETE FROM exams WHERE id = ?").run(id);
        if (info.changes > 0) res.status(204).send();
        else res.status(404).json({ error: "Egzamin nie znaleziono." });
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});
// --- Results ---
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
// --- Stats ---
app.get("/api/stats", auth(), (req, res) => {
    const user = req.user.name; 
    const generalStats = db.prepare(`
        SELECT COUNT(s.user) as total_solved,
               SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
               SUM(CASE WHEN s.is_correct = 0 THEN 1 ELSE 0 END) as total_wrong
        FROM solved s WHERE s.user = 
? AND s.mode = 'standard'
    `).get(user);

    const typeStats = db.prepare(`
        SELECT t.type,
               SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as correct,
               SUM(CASE WHEN s.is_correct = 0 THEN 1 ELSE 0 END) as wrong
        FROM solved s JOIN tasks t ON s.task_id = t.id
       
 WHERE s.user = ? AND s.mode = 'standard' GROUP BY t.type
    `).all(user);

    const examAggregates = db.prepare(`
        SELECT MAX(percent) as highestScore, AVG(percent) as averageScore
        FROM results WHERE user = ?
    `).get(user);

    generalStats.highestScore = examAggregates ? (examAggregates.highestScore || 0) : 0;
    generalStats.averageScore = examAggregates ? (examAggregates.averageScore || 0) : 0;
const solvedExams = db.prepare("SELECT exam_name, correct, total, percent FROM results WHERE user = ? ORDER BY id DESC").all(user);
const formattedTypeStats = typeStats.reduce((acc, curr) => {
        acc[curr.type] = { correct: curr.correct || 0, wrong: curr.wrong || 0 };
        return acc;
    }, {});
res.json({ generalStats, typeStats: formattedTypeStats, solvedExams });
});


// === ENDPOINTY DLA TRYBU GIER ===
app.get("/api/games/player-card-stats", auth(), (req, res) => {
    const user = req.user.name; 
    try {
        const gameModeStats = db.prepare(`
            SELECT t.type,
                   SUM(s.earned_points) as points,
      SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as correct,
        
            COUNT(*) as total
            FROM solved s JOIN tasks t ON s.task_id = t.id
            WHERE s.user = ? AND s.mode = 'games' GROUP BY t.type
        `).all(user);

        const closedData = 
gameModeStats.find(r => r.type === 'zamkniete') || {};
        const openData = gameModeStats.find(r => r.type === 'otwarte') || {};

  
       const examData = db.prepare(`SELECT AVG(percent) as avg_percent FROM results WHERE user = ?`).get(user);

        res.json({
            name: user,
            totalPoints: (closedData.points || 0) + (openData.points || 0),
            closedPoints: closedData.points || 0,
            openPoints: openData.points ||
0,
            solvedClosedTotal: closedData.total ||
0,
            solvedOpenTotal: openData.total ||
0,
            avgExamPercent: (examData?.avg_percent || 0).toFixed(0),
            effectiveness: gameModeStats.map(t => ({
                type: t.type,
                percentage: t.total > 0 ? ((t.correct / t.total) * 100).toFixed(0) : 0,
                details: `${t.correct}/${t.total}`
   }))
      
   });
} catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
}
});
app.get("/api/games/leaderboard", auth(), (req, res) => {
    const { type = 'all' } = req.query;
    try {
        let leaderboardQuery;
        if (type === 'all') {
            leaderboardQuery = db.prepare(`
                SELECT user, SUM(points) as total_points FROM (
                    SELECT 
s.user, s.earned_points as points FROM solved s WHERE s.mode = 'games'
                    UNION ALL
                    SELECT user, (CAST(percent / 10 AS INTEGER) * 5) as points FROM results
                ) GROUP BY user ORDER BY total_points DESC LIMIT 100
          `).all();
  
       } else if (type === 'closed') {
            leaderboardQuery = db.prepare(`
                SELECT s.user, SUM(s.earned_points) as total_points FROM solved s JOIN tasks t ON s.task_id = t.id
                WHERE t.type = 'zamkniete' AND s.mode = 'games' GROUP BY s.user ORDER BY total_points DESC LIMIT 100
           `).all();
} 
 else if (type === 'open') {
            leaderboardQuery = db.prepare(`
                SELECT s.user, SUM(s.earned_points) as total_points FROM solved s JOIN tasks t ON s.task_id = t.id
                WHERE t.type = 'otwarte' AND s.mode = 'games' GROUP BY s.user ORDER BY total_points DESC LIMIT 100
            `).all();
} else if (type === 'exams') {
             leaderboardQuery = db.prepare(`
                SELECT user, AVG(percent) as avg_percent FROM results
                GROUP BY user ORDER BY avg_percent DESC LIMIT 100
            `).all();
} else {
            return res.status(400).json({ error: "Nieprawidłowy typ rankingu" });
}
        res.json(leaderboardQuery);
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
}
});


// --- Start Server & DB Init ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  
  // ZMODYFIKOWANO: Definicje tabel używane tylko, jeśli BAZA NIE ISTNIEJE
  db.exec(`
    /* * Tabela Użytkowników:
     * id: unikalny identyfikator
     * name: unikalna nazwa użytkownika (login)
     * password_hash: zahashowane hasło
     * role: 'student' lub 'admin'
     */
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student'
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

    CREATE TABLE IF NOT EXISTS solved (
        user TEXT NOT NULL,
        task_id INTEGER NOT NULL,
        is_correct INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'standard',
        earned_points INTEGER,
        PRIMARY KEY (user, task_id, mode)
    );
 `);
});