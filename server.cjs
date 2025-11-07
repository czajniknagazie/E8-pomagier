const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg"); // UŻYWAMY 'pg'
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

// Poprawka wczytywania .env, aby działało na Railway
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads"; 
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key'; // Dodano domyślny klucz

// Konfiguracja połączenia z PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Wymagane na darmowych planach
    }
});

// Funkcja do inicjalizacji bazy danych (tworzenia tabel)
async function initializeDatabase() {
    console.log("Łączenie z bazą danych PostgreSQL...");
    let client;
    try {
        client = await pool.connect();
        console.log("Połączono z bazą PostgreSQL. Inicjalizacja tabel...");

        // UŻYTKOWNICY
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student'
            );
        `);
        
        // ZADANIA
        await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                tresc TEXT NOT NULL,
                odpowiedz TEXT,
                opcje JSONB, // JSONB dla PostgreSQL
                punkty INTEGER DEFAULT 1,
                arkusz TEXT
            );
        `);
        
        // EGZAMINY
        await client.query(`
            CREATE TABLE IF NOT EXISTS exams (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                tasks TEXT NOT NULL 
            );
        `);
        
        // WYNIKI
        await client.query(`
            CREATE TABLE IF NOT EXISTS results (
                id SERIAL PRIMARY KEY,
                "user" TEXT NOT NULL, 
                exam_id INTEGER NOT NULL,
                exam_name TEXT NOT NULL,
                correct INTEGER NOT NULL,
                wrong INTEGER NOT NULL,
                total INTEGER NOT NULL,
                percent REAL NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // ROZWIĄZANE ZADANIA
        await client.query(`
            CREATE TABLE IF NOT EXISTS solved (
                "user" TEXT NOT NULL,
                task_id INTEGER NOT NULL,
                is_correct INTEGER NOT NULL,
                mode TEXT NOT NULL DEFAULT 'standard',
                earned_points INTEGER,
                PRIMARY KEY ("user", task_id, mode)
            );
        `);

        // Sprawdzenie i utworzenie admina
        const adminPassword = process.env.ADMIN_CODE || 'admin123';
        const adminHash = bcrypt.hashSync(adminPassword, saltRounds);
        
        // Używamy ON CONFLICT (tylko PostgreSQL), aby zaktualizować hasło admina, jeśli już istnieje
        await client.query(
            `INSERT INTO users (name, password_hash, role) VALUES ($1, $2, $3)
             ON CONFLICT (name) DO UPDATE SET password_hash = $2, role = $3`,
            ['admin', adminHash, 'admin']
        );
        
        console.log("Tabele PostgreSQL zweryfikowane/utworzone.");
        client.release();
    } catch (err) {
        console.error("Błąd inicjalizacji bazy danych PostgreSQL:", err);
        // Konieczne, by Railway zobaczył błąd i nie uruchomił uszkodzonego serwera
        throw err; 
    }
}
// --- KONIEC SEKCJI INICJALIZACJI ---


if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));
app.use(cors());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static("public"));

// --- JWT & Authentication ---
function signToken(user) {
  return jwt.sign(
    { userId: user.id, name: user.name, role: user.role }, 
    JWT_SECRET, 
    { expiresIn: user.role === "admin" ? "8h" : "365d" }
  );
}

function auth(requiredRole = null) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Brak tokena" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) return res.status(403).json({ error: "Brak uprawnień" });
      req.user = decoded; 
      next();
    } catch {
      res.status(401).json({ error: "Błędny token" });
    }
  };
}

// --- Login Endpoints ---
app.post("/api/register-student", async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ error: 'Nazwa i hasło są wymagane.' });
  }
  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE name = $1', [name]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Ta nazwa użytkownika jest już zajęta.' });
    }
    const password_hash = bcrypt.hashSync(password, saltRounds);
    const info = await pool.query(
      'INSERT INTO users (name, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [name, password_hash, 'student']
    );
    res.status(201).json({ success: true, message: 'Użytkownik zarejestrowany!', userId: info.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: 'Błąd serwera podczas rejestracji: ' + e.message });
  }
});

app.post("/api/login-student", async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: "Brak nazwy lub hasła" });
  try {
    const result = await pool.query('SELECT * FROM users WHERE name = $1 AND role = $2', [name, 'student']);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
    }
    if (!user.password_hash) {
      return res.status(401).json({ error: "Konto nie ma hasła. Użyj 'Rejestracja' aby ustawić hasło." });
    }
    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
    }
    const token = signToken(user);
    res.json({ token, role: user.role, name: user.name });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera: " + e.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const { name, code } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: "Brak nazwy lub kodu (hasła)" });
  try {
    const result = await pool.query('SELECT * FROM users WHERE name = $1 AND role = $2', [name, 'admin']);
    const adminUser = result.rows[0];
    if (!adminUser) {
      return res.status(401).json({ error: "Błędne dane administratora!" });
    }
    const match = bcrypt.compareSync(code, adminUser.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Błędne dane administratora!" });
    }
    const token = signToken(adminUser);
    res.json({ token, role: adminUser.role, name: adminUser.name });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera: " + e.message });
  }
});

// --- Tasks ---
app.get("/api/tasks", auth(), async (req, res) => {
    const { search = '' } = req.query;
    let queryText = `SELECT * FROM tasks`;
    const params = [];
    if (search) {
        queryText += ' WHERE id::text LIKE $1 OR arkusz LIKE $1';
        params.push(`%${search}%`);
    }
    queryText += ' ORDER BY id DESC';
    
    try {
        const result = await pool.query(queryText, params);
        // 'opcje' są już JSONB, PostgreSQL zwraca je jako obiekty
        res.json(result.rows);
    } catch(e) {
        console.error("Błąd przy pobieraniu zadań:", e);
        res.status(500).json({ error: "Błąd serwera przy pobieraniu zadań." });
    }
});

app.put("/api/tasks/:id", auth("admin"), async (req, res) => {
    const { id } = req.params;
    const { odpowiedz, punkty, opcje } = req.body;
    if (odpowiedz === undefined || punkty === undefined) return res.status(400).json({ error: "Brak wszystkich wymaganych danych (odpowiedz, punkty)." });
    try {
        // opcje przychodzą jako obiekt JSON z frontendu, PostgreSQL to przyjmuje
        const result = await pool.query(
            "UPDATE tasks SET odpowiedz = $1, punkty = $2, opcje = $3 WHERE id = $4",
            [odpowiedz, Number(punkty), opcje, id]
        );
        if (result.rowCount > 0) res.json({ success: true, message: "Zadanie zaktualizowane." });
        else res.status(404).json({ error: "Nie znaleziono zadania." });
    } catch (e) {
       res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

app.get("/api/tasks/random", auth(), async (req, res) => {
    const { type, incorrect, mode = 'standard' } = req.query;
    let queryText;
    const params = [req.user.name, mode]; 

    if (incorrect === 'true') {
        queryText = `SELECT T.* FROM tasks T INNER JOIN solved S ON T.id = S.task_id WHERE S."user" = $1 AND S.mode = $2 AND S.is_correct = 0`;
        if (type === 'zamkniete' || type === 'otwarte') {
            queryText += ' AND T.type = $3';
            params.push(type); 
        }
    } else {
        queryText = `SELECT * FROM tasks WHERE id NOT IN (SELECT task_id FROM solved WHERE "user" = $1 AND mode = $2)`;
        if (type === 'zamkniete' || type === 'otwarte') {
            queryText += ' AND type = $3';
            params.push(type); 
        }
    }
    queryText += ' ORDER BY RANDOM() LIMIT 1';

    try {
        const result = await pool.query(queryText, params);
        res.json(result.rows[0] || null);
    } catch(e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

// --- Solved Tasks ---
app.post("/api/solved", auth(), async (req, res) => {
  const { taskId, isCorrect, mode = 'standard', earnedPoints } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "Brak taskId" });
  const points = earnedPoints !== undefined ? Number(earnedPoints) : (isCorrect ? 1 : 0);
  try {
    // Składnia ON CONFLICT dla PostgreSQL
    await pool.query(
        `INSERT INTO solved ("user", task_id, is_correct, mode, earned_points) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("user", task_id, mode) 
         DO UPDATE SET is_correct = $3, earned_points = $5`,
        [req.user.name, Number(taskId), isCorrect ? 1 : 0, mode, points]
    );
    res.json({ success: true });
  } catch (e) {
   res.status(400).json({ error: e.message });
  }
});

app.delete("/api/solved", auth(), async (req, res) => {
  const user = req.user.name; 
  const { mode = 'standard' } = req.body;
  try {
    await pool.query('DELETE FROM solved WHERE "user" = $1 AND mode = $2', [user, mode]);
    res.json({ success: true, message: `Postępy dla trybu '${mode}' zresetowane.` });
  } catch (e) {
    res.status(500).json({ error: "Błąd serwera: " + e.message });
  }
});

// --- Image Upload (bez zmian) ---
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

// --- Bulk Task Creation (KLUCZOWA POPRAWKA PARSOWANIA) ---
app.post("/api/tasks/bulk", auth("admin"), async (req, res) => {
  const { tasks } = req.body || {};
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: "Brak zadań" });

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Rozpocznij transakcję
    for (const t of tasks) {
        
        // ZMIANA: KLUCZOWA POPRAWKA PARSOWANIA POLA OPCJE
        let opcjeObject = null;
        if (t.opcje) {
            try {
                // Spróbuj sparsować, jeśli jest to ciąg znaków (jak w eksporcie SQLite)
                opcjeObject = JSON.parse(t.opcje);
            } catch {
                // Jeśli parsowanie się nie uda, użyj wartości bezpośrednio (jeśli już jest obiektem)
                opcjeObject = t.opcje;
            }
        }
        // KONIEC KLUCZOWEJ POPRAWKI
        
        // Teraz wysyłamy opcjeObject, które jest już poprawnym obiektem/tablicą dla JSONB
        await client.query(
            `INSERT INTO tasks (type, tresc, odpowiedz, opcje, punkty, arkusz) VALUES ($1, $2, $3, $4, $5, $6)`,
            [t.type, t.tresc, t.odpowiedz, opcjeObject, Number(t.punkty) || 1, t.arkusz]
        );
    }
    await client.query('COMMIT'); // Zakończ transakcję
    res.json({ success: true, count: tasks.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Błąd serwera: " + e.message });
  } finally {
    client.release();
  }
});

app.delete("/api/tasks/:id", auth("admin"), async (req, res) => {
    const { id } = req.params;
    try {
        // Usuń powiązane wpisy w 'solved' zanim usuniemy zadanie
        await pool.query("DELETE FROM solved WHERE task_id = $1", [id]);
        const result = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
        
        if (result.rowCount > 0) res.status(204).send();
        else res.status(404).json({ error: "Zadanie nie znaleziono." });
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

// --- Exams ---
app.get("/api/exams", auth(), async (req, res) => {
  const result = await pool.query("SELECT id, name, tasks FROM exams ORDER BY id DESC");
  res.json(result.rows);
});

app.get("/api/exams/:id", auth(), async (req, res) => {
  const examResult = await pool.query("SELECT id, name, tasks FROM exams WHERE id=$1", [req.params.id]);
  const exam = examResult.rows[0];
  if (!exam) return res.status(404).json({ error: "Nie ma takiego egzaminu" });
  
  const ids = JSON.parse(exam.tasks || "[]");
  if (!ids.length) return res.json({ id: exam.id, name: exam.name, tasks: [] });
  
  // Składnia PostgreSQL dla listy ID (ANY)
  const tasksResult = await pool.query(`SELECT * FROM tasks WHERE id = ANY($1::int[])`, [ids]);
  
  const tasksMap = new Map(tasksResult.rows.map(t => [t.id, t]));
  const sortedTasks = ids.map(id => tasksMap.get(id)).filter(Boolean); 
  
  res.json({ id: exam.id, name: exam.name, tasks: sortedTasks });
});

app.put("/api/exams/:id", auth("admin"), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Brak nowej nazwy." });
    try {
        const result = await pool.query("UPDATE exams SET name = $1 WHERE id = $2", [name, id]);
        if (result.rowCount > 0) res.json({ success: true, message: "Nazwa egzaminu zaktualizowana." });
        else res.status(404).json({ error: "Nie znaleziono egzaminu." });
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

app.post("/api/exams", auth("admin"), async (req, res) => {
  const { name, taskIds, arkuszName } = req.body || {};
  if (!name || !Array.isArray(taskIds) || !taskIds.length) return res.status(400).json({ error: "Brak nazwy lub zadań" });
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const examInfo = await client.query(
        "INSERT INTO exams (name, tasks) VALUES ($1, $2) RETURNING id", 
        [name, JSON.stringify(taskIds)]
    );
    
    // Przypisz arkusz do zadań
    if (arkuszName) {
        await client.query(
            "UPDATE tasks SET arkusz = $1 WHERE id = ANY($2::int[])", 
            [arkuszName, taskIds]
        );
    }
    
    await client.query('COMMIT');
    res.json({ success: true, id: examInfo.rows[0].id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Błąd podczas tworzenia egzaminu: " + e.message });
  } finally {
    client.release();
  }
});

app.delete("/api/exams/:id", auth("admin"), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM results WHERE exam_id = $1', [id]);
        const result = await pool.query("DELETE FROM exams WHERE id = $1", [id]);
        if (result.rowCount > 0) res.status(204).send();
        else res.status(404).json({ error: "Egzamin nie znaleziono." });
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

// --- Results i Stats (bez zmian) ---
app.post("/api/results", auth(), async (req, res) => {
    const { examId, examName, correct, wrong, total, percent } = req.body || {};
    try {
        await pool.query(
            'INSERT INTO results ("user", exam_id, exam_name, correct, wrong, total, percent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [req.user.name, Number(examId), examName, Number(correct), Number(wrong), Number(total), Number(percent)]
        );
        res.json({ success: true });
    } catch (e) {
     res.status(400).json({ error: e.message });
    }
});

app.get("/api/stats", auth(), async (req, res) => {
    const user = req.user.name; 
    
    const generalStatsRes = await pool.query(`
        SELECT COUNT(s."user") as total_solved,
               SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
               SUM(CASE WHEN s.is_correct = 0 THEN 1 ELSE 0 END) as total_wrong
        FROM solved s WHERE s."user" = $1 AND s.mode = 'standard'
    `, [user]);
    
    const typeStatsRes = await pool.query(`
        SELECT t.type,
               SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as correct,
               SUM(CASE WHEN s.is_correct = 0 THEN 1 ELSE 0 END) as wrong
        FROM solved s JOIN tasks t ON s.task_id = t.id
        WHERE s."user" = $1 AND s.mode = 'standard' GROUP BY t.type
    `, [user]);
    
    const examAggregatesRes = await pool.query(`
        SELECT MAX(percent) as highestScore, AVG(percent) as averageScore
        FROM results WHERE "user" = $1
    `, [user]);

    const solvedExamsRes = await pool.query(
        'SELECT exam_name, correct, total, percent FROM results WHERE "user" = $1 ORDER BY id DESC', 
        [user]
    );

    const generalStats = generalStatsRes.rows[0] || {};
    const examAggregates = examAggregatesRes.rows[0] || {};

    generalStats.highestScore = examAggregates.highestscore || 0;
    generalStats.averageScore = examAggregates.averageScore || 0;
    
    const formattedTypeStats = typeStatsRes.rows.reduce((acc, curr) => {
        acc[curr.type] = { correct: Number(curr.correct) || 0, wrong: Number(curr.wrong) || 0 };
        return acc;
    }, {});
    
    res.json({ generalStats, typeStats: formattedTypeStats, solvedExams: solvedExamsRes.rows });
});

app.get("/api/games/player-card-stats", auth(), async (req, res) => {
    const user = req.user.name; 
    try {
        const gameModeStatsRes = await pool.query(`
            SELECT t.type,
                   SUM(s.earned_points) as points,
                   SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as correct,
                   COUNT(*) as total
            FROM solved s JOIN tasks t ON s.task_id = t.id
            WHERE s."user" = $1 AND s.mode = 'games' GROUP BY t.type
        `, [user]);
        
        const examDataRes = await pool.query(`SELECT AVG(percent) as avg_percent FROM results WHERE "user" = $1`, [user]);

        const gameModeStats = gameModeStatsRes.rows;
        const closedData = gameModeStats.find(r => r.type === 'zamkniete') || {};
        const openData = gameModeStats.find(r => r.type === 'otwarte') || {};
        const examData = examDataRes.rows[0];

        res.json({
            name: user,
            totalPoints: (Number(closedData.points) || 0) + (Number(openData.points) || 0),
            closedPoints: Number(closedData.points) || 0,
            openPoints: Number(openData.points) || 0,
            solvedClosedTotal: Number(closedData.total) || 0,
            solvedOpenTotal: Number(openData.total) || 0,
            avgExamPercent: (examData?.avg_percent || 0).toFixed(0),
            effectiveness: gameModeStats.map(t => ({
                type: t.type,
                percentage: t.total > 0 ? ((t.correct / t.total) * 100).toFixed(0) : 0,
                details: `${t.correct || 0}/${t.total || 0}`
            }))
        });
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});

app.get("/api/games/leaderboard", auth(), async (req, res) => {
    const { type = 'all' } = req.query;
    try {
        let leaderboardQuery;
        if (type === 'all') {
            leaderboardQuery = await pool.query(`
                SELECT "user", SUM(points) as total_points FROM (
                    SELECT s."user", s.earned_points as points FROM solved s WHERE s.mode = 'games'
                    UNION ALL
                    SELECT "user", (CAST(percent / 10 AS INTEGER) * 5) as points FROM results
                ) AS combined_scores GROUP BY "user" ORDER BY total_points DESC LIMIT 100
            `);
        } else if (type === 'closed') {
            leaderboardQuery = await pool.query(`
                SELECT s."user", SUM(s.earned_points) as total_points FROM solved s JOIN tasks t ON s.task_id = t.id
                WHERE t.type = 'zamkniete' AND s.mode = 'games' GROUP BY s."user" ORDER BY total_points DESC LIMIT 100
            `);
        } else if (type === 'open') {
            leaderboardQuery = await pool.query(`
                SELECT s."user", SUM(s.earned_points) as total_points FROM solved s JOIN tasks t ON s.task_id = t.id
                WHERE t.type = 'otwarte' AND s.mode = 'games' GROUP BY s."user" ORDER BY total_points DESC LIMIT 100
            `);
        } else if (type === 'exams') {
             leaderboardQuery = await pool.query(`
                SELECT "user", AVG(percent) as avg_percent FROM results
                GROUP BY "user" ORDER BY avg_percent DESC LIMIT 100
            `);
        } else {
            return res.status(400).json({ error: "Nieprawidłowy typ rankingu" });
        }
        res.json(leaderboardQuery.rows);
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera: " + e.message });
    }
});


// --- Start Server & DB Init ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}).catch(err => {
    console.error("Nie udało się uruchomić serwera z powodu błędu bazy danych, sprawdź DATABASE_URL:", err);
    process.exit(1); // Upewnienie się, że proces zakończy się niepowodzeniem
});