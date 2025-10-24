/*
    PRZYKŁADOWY KOD SERWERA (BACKEND) - backend_setup.js
    Musisz zintegrować ten kod ze swoim istniejącym serwerem Node.js/Express.
    
    Wymagane zależności:
    npm install express sqlite3 bcrypt jsonwebtoken
*/

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express(); // Załóżmy, że masz już instancję 'app'
app.use(express.json()); // Upewnij się, że serwer parsuje JSON

// --- Ustawienia ---
const JWT_SECRET = 'TWOJ_BARDZO_TAJNY_KLUCZ_JWT'; // ZMIEŃ TO!
const saltRounds = 10; // Do hashowania haseł

// --- Inicjalizacja Bazy Danych ---
// Użyj tej samej instancji bazy danych, co reszta aplikacji
// lub stwórz nową, jeśli jeszcze jej nie masz.
const db = new sqlite3.Database('./e8pomagier.db', (err) => {
    if (err) {
        console.error("Błąd otwierania bazy danych:", err.message);
    } else {
        console.log("Połączono z bazą danych SQLite.");
        // Stwórz tabelę użytkowników, jeśli nie istnieje
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student'
        )`, (err) => {
            if (err) {
                console.error("Błąd tworzenia tabeli users:", err);
            } else {
                // Opcjonalnie: Stwórz domyślnego admina przy pierwszym uruchomieniu
                const adminPassword = 'admin123'; // ZMIEŃ TO HASŁO!
                bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
                    if (err) return;
                    db.run(
                        'INSERT OR IGNORE INTO users (name, password_hash, role) VALUES (?, ?, ?)',
                        ['admin', hash, 'admin'],
                        (err) => {
                            if (!err) console.log("Domyślny użytkownik 'admin' został utworzony/istnieje.");
                        }
                    );
                });
            }
        });
    }
});

// --- NOWY ENDPOINT: Rejestracja Studenta ---
app.post('/api/register-student', async (req, res) => {
    const { name, password } = req.body;

    if (!name || !password) {
        return res.status(400).json({ error: 'Nazwa i hasło są wymagane.' });
    }

    try {
        // Sprawdź, czy użytkownik już istnieje
        db.get('SELECT name FROM users WHERE name = ?', [name], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Błąd bazy danych.' });
            }
            if (row) {
                return res.status(400).json({ error: 'Ta nazwa użytkownika jest już zajęta.' });
            }

            // Stwórz hash hasła
            const password_hash = await bcrypt.hash(password, saltRounds);

            // Dodaj użytkownika do bazy
            db.run('INSERT INTO users (name, password_hash, role) VALUES (?, ?, ?)', [name, password_hash, 'student'], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Nie udało się zarejestrować użytkownika.' });
                }
                res.status(201).json({ success: true, message: 'Użytkownik zarejestrowany pomyślnie.' });
            });
        });
    } catch (err) {
        res.status(500).json({ error: 'Błąd serwera podczas rejestracji.' });
    }
});

// --- ZMODYFIKOWANY ENDPOINT: Logowanie Studenta ---
app.post('/api/login-student', (req, res) => {
    const { name, password } = req.body;

    if (!name || !password) {
        return res.status(400).json({ error: 'Nazwa i hasło są wymagane.' });
    }

    db.get('SELECT * FROM users WHERE name = ? AND role = ?', [name, 'student'], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Błąd bazy danych.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
        }

        // Porównaj hasło
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
        }

        // Wygeneruj token JWT
        const token = jwt.sign(
            { userId: user.id, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' } // Token ważny 24 godziny
        );

        res.json({
            token,
            name: user.name,
            role: user.role
        });
    });
});

// --- ZMODYFIKOWANY ENDPOINT: Logowanie Admina ---
// Teraz admin też loguje się na hasło z bazy danych (kod dostępu to teraz hasło)
app.post('/api/admin/login', (req, res) => {
    const { name, code } = req.body; // 'code' to teraz hasło admina

    db.get('SELECT * FROM users WHERE name = ? AND role = ?', [name, 'admin'], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Błąd bazy danych.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Nieprawidłowe dane logowania administratora.' });
        }

        // Porównaj hasło (przesłane w polu 'code')
        const match = await bcrypt.compare(code, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Nieprawidłowe dane logowania administratora.' });
        }

        // Wygeneruj token JWT
        const token = jwt.sign(
            { userId: user.id, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            name: user.name,
            role: user.role
        });
    });
});


// ... (reszta Twoich endpointów API, np. /api/tasks, /api/exams, itp.)
// ... (app.listen(...))