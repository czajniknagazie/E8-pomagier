// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    const appState = {
        token: null,
        user: { name: '', role: '' },
        currentView: null,
        currentTask: null,
        examState: {
            active: false,
            tasks: [],
            currentIndex: 0,
            answers: {},
            timer: null,
            examId: null,
            examName: ''
        },
    };

    // DOM Elements
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const mainContent = document.getElementById('main-content');
    
    // --- API HELPER ---
    const api = {
        async request(endpoint, method = 'GET', body = null) {
            const headers = { 'Content-Type': 'application/json' };
            if (appState.token) {
                headers['Authorization'] = `Bearer ${appState.token}`;
            }
            const options = { method, headers };
            if (body) {
                options.body = JSON.stringify(body);
            }
            try {
                const response = await fetch(`/api${endpoint}`, options);

                if (response.status === 401) {
                    alert("Twoja sesja wygasła lub jest nieprawidłowa. Zaloguj się ponownie.");
                    logout();
                    return null;
                }

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Coś poszło nie tak");
                }
                
                if (response.status === 204) {
                    return { success: true };
                }

                return await response.json();

            } catch (error) {
                console.error("Błąd API:", error);
                alert(`Błąd: ${error.message}`);
                return null;
            }
        },
    };

    // --- UTILS ---
    function navigateTo(view) {
        appState.currentView = view;
        switch (view) {
            case 'login':
                renderLoginView();
                break;
            case 'main':
                renderMainView();
                break;
            case 'nauka':
                renderNaukaView();
                break;
            case 'losowe-zadanie':
                renderRandomTaskView('wszystkie');
                break;
            case 'egzaminy':
                renderExamsView();
                break;
            case 'stats':
                renderStatsView();
                break;
            case 'settings':
                renderSettingsView();
                break;
        }
    }

    function logout() {
        appState.token = null;
        appState.user = { name: '', role: '' };
        localStorage.removeItem('token');
        navigateTo('login');
    }

    // --- RENDERERS ---

    function renderLoginView() {
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
        
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('register-form').addEventListener('submit', handleRegister);
    }

    function renderMainView() {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'flex';
        mainContent.innerHTML = `
            <h1>Witaj, ${appState.user.name}!</h1>
            <div class="content-box">
                <p>Jesteś zalogowany jako ${appState.user.role}.</p>
            </div>`;
    }

    function renderNaukaView() {
        mainContent.innerHTML = `
            <h1>Nauka i zadania</h1>
            <div class="content-box">
                <p>Wybierz tryb nauki:</p>
                <div class="nauka-options">
                    <button id="losowe-btn" class="nauka-btn" data-type="wszystkie">Wszystkie zadania</button>
                    <button id="zamkniete-btn" class="nauka-btn" data-type="zamkniete">Zadania zamknięte</button>
                    <button id="otwarte-btn" class="nauka-btn" data-type="otwarte">Zadania otwarte</button>
                </div>
            </div>`;

        document.querySelectorAll('.nauka-btn').forEach(button => {
            button.addEventListener('click', () => {
                const type = button.dataset.type;
                appState.currentView = 'losowe-zadanie';
                renderRandomTaskView(type);
            });
        });
    }

    async function renderRandomTaskView(type) {
        const typeName = { wszystkie: 'Wszystkie zadania', zamkniete: 'Zadania zamknięte', otwarte: 'Zadania otwarte' }[type];
        mainContent.innerHTML = `<h1>${typeName}</h1>`;

        const practiceMode = appState.currentView === 'practice-incorrect';
        const task = await api.request(`/tasks/random?type=${type}&incorrect=${practiceMode}`);

        appState.currentTask = task;

        if (!task) {
            mainContent.innerHTML += `
                <div class="content-box">
                    <p><strong>Gratulacje! 🎉</strong></p>
                    <p>Rozwiązałeś wszystkie dostępne zadania w tym trybie. Chcesz zacząć od nowa?</p>
                    <div class="action-buttons">
                        <button id="reset-progress-btn">Resetuj postępy</button>
                        <button id="practice-incorrect-btn">Ćwicz zadania, które poszły źle</button>
                    </div>
                </div>`;
            document.getElementById('reset-progress-btn').addEventListener('click', handleResetProgress);
            document.getElementById('practice-incorrect-btn').addEventListener('click', () => {
                appState.currentView = 'practice-incorrect';
                renderRandomTaskView(type);
            });
            return;
        }

        let answerHtml = '';
        if (task.type === 'zamkniete') {
            answerHtml = `
                <div class="task-options">
                    ${task.opcje.map((opt, i) => `
                        <label><input type="radio" name="answer" value="${opt}"> ${opt}</label>
                    `).join('')}
                </div>`;
        } else { // otwarte
            answerHtml = `<textarea id="open-answer" class="task-input" rows="3" placeholder="Wpisz swoją odpowiedź..."></textarea>`;
        }

        const taskHtml = `
            <div class="content-box">
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <form id="task-form">
                    ${answerHtml}
                    <button type="submit">Sprawdź</button>
                </form>
                <div id="result-box"></div>
            </div>`;
        mainContent.innerHTML += taskHtml;
        document.getElementById('task-form').addEventListener('submit', handleCheckAnswer);
    }

    async function handleCheckAnswer(e) {
        e.preventDefault();
        const resultBox = document.getElementById('result-box');
        const task = appState.currentTask;

        let userAnswer;
        if (task.type === 'zamkniete') {
            const selected = document.querySelector('input[name="answer"]:checked');
            userAnswer = selected ? selected.value : '';
        } else {
            userAnswer = document.getElementById('open-answer').value;
        }

        const isCorrect = (task.type === 'zamkniete' && userAnswer.toLowerCase() === task.odpowiedz.toLowerCase());

        const response = await api.request('/solved', 'POST', {
            taskId: task.id,
            isCorrect: isCorrect ? 1 : 0
        });

        if (response) {
            if (isCorrect) {
                resultBox.innerHTML = `<p class="correct">👍 Dobra robota! Poprawna odpowiedź!</p>`;
            } else {
                resultBox.innerHTML = `<p class="incorrect">👎 Niestety, błędna odpowiedź. Poprawna to: <strong>${task.odpowiedz}</strong></p>`;
            }

            const form = document.getElementById('task-form');
            form.innerHTML += `<button id="next-task-btn" type="button">Następne zadanie</button>`;
            document.getElementById('next-task-btn').addEventListener('click', () => {
                renderRandomTaskView(task.type);
            });
        }
    }

    async function handleResetProgress() {
        if (confirm('Jesteś pewien, że chcesz zresetować postępy? Spowoduje to usunięcie wszystkich Twoich rozwiązań.')) {
            const response = await api.request('/solved/reset', 'POST');
            if (response.success) {
                alert('Postępy zostały zresetowane.');
                navigateTo('nauka');
            }
        }
    }

    async function renderExamsView() {
        mainContent.innerHTML = `
            <h1>Egzaminy</h1>
            <div class="content-box">
                <div class="exam-actions">
                    <button id="create-exam-btn" class="action-btn">Stwórz nowy egzamin</button>
                </div>
            </div>
            <div class="content-box">
                <h2>Twoje egzaminy</h2>
                <div id="exams-list">Ładowanie egzaminów...</div>
            </div>
            <div class="content-box">
                <h2>Rozwiązane egzaminy</h2>
                <div id="solved-exams-list">Ładowanie wyników...</div>
            </div>
        `;

        document.getElementById('create-exam-btn').addEventListener('click', () => navigateTo('create-exam'));
        
        const examsList = document.getElementById('exams-list');
        const solvedExamsList = document.getElementById('solved-exams-list');
        
        const exams = await api.request('/exams');
        if (exams) {
            if (exams.length > 0) {
                examsList.innerHTML = `
                    <ul class="clean-list">
                        ${exams.map(exam => `
                            <li>
                                <strong>${exam.name}</strong> (${exam.tasks} zadań)<br>
                                <small>Arkusz: ${exam.arkusz_name}</small>
                                <button class="start-exam-btn" data-exam-id="${exam.id}">Rozpocznij</button>
                            </li>
                        `).join('')}
                    </ul>`;
                document.querySelectorAll('.start-exam-btn').forEach(btn => {
                    btn.addEventListener('click', () => startExam(btn.dataset.examId));
                });
            } else {
                examsList.innerHTML = '<p>Brak dostępnych egzaminów.</p>';
            }
        }

        const solvedExams = await api.request('/results');
        if (solvedExams) {
            if (solvedExams.length > 0) {
                solvedExamsList.innerHTML = `
                    <ul class="clean-list">
                        ${solvedExams.map(result => `
                            <li>
                                <strong>${result.exam_name}</strong> - Wynik: ${result.correct} / ${result.total} (${result.percent.toFixed(0)}%)
                                <br><small>Zadania zamknięte: ${result.closed_correct}/${result.closed_correct + result.closed_wrong}</small>
                                <br><small>Zadania otwarte: ${result.open_correct}/${result.open_correct + result.open_wrong}</small>
                            </li>
                        `).join('')}
                    </ul>`;
            } else {
                solvedExamsList.innerHTML = '<p>Brak rozwiązanych egzaminów.</p>';
            }
        }
    }
    
    async function startExam(examId) {
        const exam = await api.request(`/exams/${examId}`);
        if (!exam) return;

        appState.examState = {
            active: true,
            examId: exam.id,
            examName: exam.name,
            tasks: JSON.parse(exam.tasks),
            currentIndex: 0,
            answers: {},
            timer: null
        };

        renderExamTask();
        startExamTimer();
    }

    function startExamTimer() {
        const timerElement = document.getElementById('exam-timer');
        let totalSeconds = 0;
        appState.examState.timer = setInterval(() => {
            totalSeconds++;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            timerElement.textContent = `Czas: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 1000);
    }

    function renderExamTask() {
        if (!appState.examState.active) return;
        
        const { tasks, currentIndex, answers } = appState.examState;
        if (currentIndex >= tasks.length) {
            endExam(true);
            return;
        }

        const task = tasks[currentIndex];
        const taskType = task.type === 'zamkniete' ? 'Zadanie zamknięte' : 'Zadanie otwarte';

        let answerHtml = '';
        if (task.type === 'zamkniete') {
            const currentAnswer = answers[task.id] || '';
            answerHtml = `
                <div class="task-options">
                    ${task.opcje.map(opt => `
                        <label>
                            <input type="radio" name="exam-answer-${task.id}" value="${opt}" ${currentAnswer === opt ? 'checked' : ''}>
                            ${opt}
                        </label>
                    `).join('')}
                </div>`;
        } else {
            const currentAnswer = answers[task.id] || '';
            answerHtml = `<textarea id="open-answer" class="task-input" rows="5" placeholder="Wpisz swoją odpowiedź...">${currentAnswer}</textarea>`;
        }

        mainContent.innerHTML = `
            <h1>Egzamin: ${appState.examState.examName}</h1>
            <div class="exam-controls">
                <span id="exam-timer">Czas: 00:00</span>
                <span>Zadanie ${currentIndex + 1} z ${tasks.length}</span>
            </div>
            <div class="content-box">
                <p><strong>${taskType} #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <form id="exam-task-form">
                    ${answerHtml}
                    <div class="exam-navigation">
                        <button type="button" id="prev-task-btn" ${currentIndex === 0 ? 'disabled' : ''}>Poprzednie</button>
                        <button type="submit" id="next-task-btn">${currentIndex === tasks.length - 1 ? 'Zakończ egzamin' : 'Następne'}</button>
                    </div>
                </form>
            </div>
        `;
        document.getElementById('exam-task-form').addEventListener('submit', handleExamNavigation);
        document.getElementById('prev-task-btn').addEventListener('click', handleExamNavigation);
    }
    
    function saveCurrentExamAnswer() {
        const { tasks, currentIndex, answers } = appState.examState;
        const currentTask = tasks[currentIndex];

        let userAnswer;
        if (currentTask.type === 'zamkniete') {
            const selected = document.querySelector(`input[name="exam-answer-${currentTask.id}"]:checked`);
            userAnswer = selected ? selected.value : '';
        } else {
            userAnswer = document.getElementById('open-answer').value;
        }
        answers[currentTask.id] = userAnswer;
    }

    function handleExamNavigation(e) {
        e.preventDefault();
        saveCurrentExamAnswer();
        
        const action = e.target.id;
        if (action === 'prev-task-btn') {
            appState.examState.currentIndex--;
        } else {
            appState.examState.currentIndex++;
        }
        renderExamTask();
    }
    
    async function endExam(isFinished) {
        clearInterval(appState.examState.timer);
        if (isFinished) {
            saveCurrentExamAnswer();
            
            const closedTasks = appState.examState.tasks.filter(t => t.type === 'zamkniete');
            const openTasks = appState.examState.tasks.filter(t => t.type === 'otwarte');

            let closedCorrect = 0;
            let closedWrong = 0;
            closedTasks.forEach(task => {
                const userAnswer = appState.examState.answers[task.id];
                if (userAnswer && userAnswer.toLowerCase() === task.odpowiedz.toLowerCase()) {
                    closedCorrect++;
                } else {
                    closedWrong++;
                }
            });

            appState.examState.closedCorrect = closedCorrect;
            appState.examState.closedWrong = closedWrong;
            appState.examState.openTasksToGrade = openTasks;
            appState.examState.gradedOpenTasks = {};
            appState.examState.currentOpenTaskIndex = 0;

            if (openTasks.length > 0) {
                renderOpenTaskGradingView();
            } else {
                sendFinalResults();
            }

        }
        appState.examState = { active: false, tasks: [], currentIndex: 0, answers: {}, timer: null };
    }

    function renderOpenTaskGradingView() {
        const { openTasksToGrade, currentOpenTaskIndex, answers } = appState.examState;
        if (currentOpenTaskIndex >= openTasksToGrade.length) {
            sendFinalResults();
            return;
        }

        const task = openTasksToGrade[currentOpenTaskIndex];
        const userAnswer = answers[task.id] || 'Brak odpowiedzi';

        mainContent.innerHTML = `
            <h1>Ocena zadań otwartych (${currentOpenTaskIndex + 1} / ${openTasksToGrade.length})</h1>
            <div class="content-box">
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <h3>Twoja odpowiedź:</h3>
                <div class="user-answer-box">${userAnswer}</div>
                <h3>Poprawna odpowiedź:</h3>
                <div class="correct-answer-box">${task.odpowiedz}</div>
                <div class="grading-buttons">
                    <button id="grade-correct-btn" class="correct">👍 Prawidłowo</button>
                    <button id="grade-incorrect-btn" class="incorrect">👎 Nieprawidłowo</button>
                </div>
            </div>
        `;

        document.getElementById('grade-correct-btn').addEventListener('click', () => {
            appState.examState.gradedOpenTasks[task.id] = true;
            appState.examState.currentOpenTaskIndex++;
            renderOpenTaskGradingView();
        });

        document.getElementById('grade-incorrect-btn').addEventListener('click', () => {
            appState.examState.gradedOpenTasks[task.id] = false;
            appState.examState.currentOpenTaskIndex++;
            renderOpenTaskGradingView();
        });
    }

    async function sendFinalResults() {
        const { examId, examName, tasks, answers, closedCorrect, closedWrong, gradedOpenTasks } = appState.examState;
        
        let openCorrect = 0;
        let openWrong = 0;
        
        for (const taskId in gradedOpenTasks) {
            if (gradedOpenTasks[taskId]) {
                openCorrect++;
            } else {
                openWrong++;
            }
        }

        const finalCorrect = closedCorrect + openCorrect;
        const finalWrong = closedWrong + openWrong;
        const total = tasks.length;
        const percent = ((finalCorrect / total) * 100) || 0;

        await api.request('/results', 'POST', {
            examId,
            examName,
            correct: finalCorrect,
            wrong: finalWrong,
            total,
            percent,
            closedCorrect,
            closedWrong,
            openCorrect,
            openWrong
        });

        mainContent.innerHTML = `
            <h1>Wyniki Egzaminu</h1>
            <div class="content-box">
                <h2>${examName}</h2>
                <p>Wynik końcowy: <strong>${finalCorrect} / ${total} (${percent.toFixed(0)}%)</strong></p>
                <p>Zadania zamknięte: ${closedCorrect} poprawnych, ${closedWrong} błędnych</p>
                <p>Zadania otwarte: ${openCorrect} poprawnych, ${openWrong} błędnych</p>
                <button id="back-to-exams">Wróć do listy egzaminów</button>
            </div>
        `;
        document.getElementById('back-to-exams').addEventListener('click', () => navigateTo('egzaminy'));
    }

    async function renderStatsView() {
        mainContent.innerHTML = '<h1>Statystyki</h1><div id="stats-content" class="content-box">Ładowanie statystyk...</div>';
        const statsContent = document.getElementById('stats-content');
        const stats = await api.request('/stats');

        if (stats) {
            const closedTotal = stats.closedStats.correct + stats.closedStats.wrong;
            const openTotal = stats.openStats.correct + stats.openStats.wrong;
            const closedPercent = closedTotal > 0 ? (stats.closedStats.correct / closedTotal * 100) : 0;
            const openPercent = openTotal > 0 ? (stats.openStats.correct / openTotal * 100) : 0;

            statsContent.innerHTML = `
                <h2>Ogólne statystyki</h2>
                <p>Łącznie rozwiązanych zadań: ${stats.generalStats.total_solved}</p>
                <p>Poprawne: ${stats.generalStats.total_correct}</p>
                <p>Błędne: ${stats.generalStats.total_wrong}</p>
                
                <h2>Statystyki wg typów</h2>
                <p><strong>Zadania zamknięte:</strong></p>
                <p>Poprawne: ${stats.closedStats.correct} / ${closedTotal} (${closedPercent.toFixed(0)}%)</p>
                <p>Błędne: ${stats.closedStats.wrong} / ${closedTotal} (${(100 - closedPercent).toFixed(0)}%)</p>
                
                <p><strong>Zadania otwarte:</strong></p>
                <p>Poprawne: ${stats.openStats.correct} / ${openTotal} (${openPercent.toFixed(0)}%)</p>
                <p>Błędne: ${stats.openStats.wrong} / ${openTotal} (${(100 - openPercent).toFixed(0)}%)</p>
            `;
        } else {
            statsContent.innerHTML = '<p>Brak statystyk do wyświetlenia.</p>';
        }
    }

    async function renderSettingsView() {
        mainContent.innerHTML = `
            <h1>Ustawienia</h1>
            <div class="content-box">
                <p>Tutaj możesz zmienić ustawienia swojego konta.</p>
                <button id="logout-btn">Wyloguj</button>
            </div>
        `;
        document.getElementById('logout-btn').addEventListener('click', logout);
    }
    
    async function renderCreateExamView() {
        mainContent.innerHTML = `
            <h1>Stwórz nowy egzamin</h1>
            <div class="content-box">
                <form id="create-exam-form">
                    <label for="new-exam-name">Nazwa egzaminu:</label>
                    <input type="text" id="new-exam-name" required>
                    <label for="new-exam-arkusz">Nazwa arkusza:</label>
                    <input type="text" id="new-exam-arkusz" required>
                    <h2>Wybierz zadania</h2>
                    <div id="exam-tasks-list">Ładowanie zadań...</div>
                    <button type="submit" class="action-btn">Utwórz egzamin</button>
                </form>
            </div>
        `;

        const tasksList = document.getElementById('exam-tasks-list');
        const tasks = await api.request('/tasks');
        
        if (tasks && tasks.length > 0) {
            tasksList.innerHTML = `
            <ul class="task-select-list">
                ${tasks.map(task => `
                    <li class="task-list-item">
                        <input type="checkbox" value="${task.id}" style="transform: scale(1.5);">
                        <img src="${task.tresc}" alt="Miniatura">
                        <div>
                            <strong>Zadanie #${task.id}</strong><br>
                            <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                        </div>
                    </li>
                `).join('')}
            </ul>`;
            
        document.getElementById('create-exam-form').addEventListener('submit', handleCreateExam);
        } else {
            tasksList.innerHTML = '<p>Brak dostępnych zadań.</p>';
        }
    }

    async function handleCreateExam(e) {
        e.preventDefault();
        const name = document.getElementById('new-exam-name').value;
        const arkuszName = document.getElementById('new-exam-arkusz').value;
        const selectedCheckboxes = document.querySelectorAll('#exam-tasks-list input[type="checkbox"]:checked');
        const taskIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));

        if (!name || !arkuszName || taskIds.length === 0) {
            alert('Wpisz nazwę egzaminu, nazwę arkusza i zaznacz co najmniej jedno zadanie.');
            return;
        }

        const result = await api.request('/exams', 'POST', { name, taskIds, arkuszName });
        if (result) {
            alert(`Pomyślnie utworzono egzamin "${name}".`);
            navigateTo('egzaminy');
        }
    }

    // --- INITIALIZATION ---
    function init() {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                appState.token = token;
                appState.user = { name: payload.name, role: payload.role };
                navigateTo('main');
            } catch (e) {
                console.error("Invalid token:", e);
                navigateTo('login');
            }
        } else {
            navigateTo('login');
        }

        document.getElementById('nav-main-btn').addEventListener('click', () => navigateTo('main'));
        document.getElementById('nav-nauka-btn').addEventListener('click', () => navigateTo('nauka'));
        document.getElementById('nav-egzaminy-btn').addEventListener('click', () => navigateTo('egzaminy'));
        document.getElementById('nav-stats-btn').addEventListener('click', () => navigateTo('stats'));
        document.getElementById('nav-settings-btn').addEventListener('click', () => navigateTo('settings'));
        document.getElementById('logout-btn-nav').addEventListener('click', logout);
    }

    init();
});