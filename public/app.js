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
                    throw new Error(error.error || 'Wystąpił błąd');
                }
                if (response.status === 204) return null;
                return response.json();
            } catch (err) {
                alert(`Błąd API: ${err.message}`);
                return null;
            }
        },
        async upload(files) {
            const formData = new FormData();
            for (const file of files) {
                formData.append('files', file);
            }
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${appState.token}` },
                    body: formData
                });
                if (response.status === 401) {
                    alert("Twoja sesja wygasła lub jest nieprawidłowa. Zaloguj się ponownie.");
                    logout();
                    return null;
                }
                if (!response.ok) throw new Error('Błąd wysyłania plików.');
                return response.json();
            } catch (err) {
                 alert(`Błąd API: ${err.message}`);
                return null;
            }
        }
    };

    // --- INITIALIZATION ---
    function init() {
        setupLoginListeners();
        const savedToken = localStorage.getItem('e8-token');
        const savedUser = localStorage.getItem('e8-user');
        if (savedToken && savedUser) {
            appState.token = savedToken;
            appState.user = JSON.parse(savedUser);
            showApp();
        } else {
            showLogin();
        }
    }

    // --- AUTH & UI TOGGLING ---
    function setupLoginListeners() {
        document.getElementById('student-login-form').addEventListener('submit', handleStudentLogin);
        document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
        document.getElementById('show-admin-login').addEventListener('click', () => toggleLoginView(true));
        document.getElementById('show-student-login').addEventListener('click', () => toggleLoginView(false));
    }
    
    function toggleLoginView(showAdmin) {
        document.getElementById('student-login-view').classList.toggle('hidden', showAdmin);
        document.getElementById('admin-login-view').classList.toggle('hidden', !showAdmin);
    }

    async function handleStudentLogin(e) {
        e.preventDefault();
        const name = document.getElementById('student-name').value;
        const data = await api.request('/login-student', 'POST', { name });
        if (data) {
            login(data);
        }
    }
    
    async function handleAdminLogin(e) {
        e.preventDefault();
        const name = document.getElementById('admin-name').value;
        const code = document.getElementById('admin-code').value;
        const data = await api.request('/admin/login', 'POST', { name, code });
        if (data) {
            login(data);
        }
    }

    function login(data) {
        appState.token = data.token;
        appState.user = { name: data.name, role: data.role };
        localStorage.setItem('e8-token', data.token);
        localStorage.setItem('e8-user', JSON.stringify(appState.user));
        showApp();
    }

    function logout() {
        localStorage.removeItem('e8-token');
        localStorage.removeItem('e8-user');
        window.location.reload();
    }

    function showLogin() {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    function showApp() {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.getElementById('zalogowany-jako').textContent = `Zalogowano jako: ${appState.user.name}`;
        
        const adminNav = document.getElementById('admin-panel-nav');
        if (appState.user.role === 'admin') {
            adminNav.classList.remove('hidden');
        } else {
            adminNav.classList.add('hidden');
        }

        setupNavigation(); // Centralna funkcja do obsługi nawigacji
        document.getElementById('logout-btn').addEventListener('click', logout);
        navigateTo('wszystkie');
    }

    // --- NAVIGATION ---
    function setupNavigation() {
        const navEl = document.getElementById('main-nav');
        const menuToggle = document.getElementById('menu-toggle');
        const menuOverlay = document.getElementById('menu-overlay');

        const closeMenu = () => {
            navEl.classList.remove('nav-visible');
            menuOverlay.classList.add('hidden');
        };

        // Listener dla przycisków w panelu nawigacji
        navEl.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.view) {
                // Jeśli menu mobilne jest otwarte, zamknij je po kliknięciu
                if (navEl.classList.contains('nav-visible')) {
                    closeMenu();
                }
                navigateTo(e.target.dataset.view);
            }
        });

        // Listenery dla mobilnego menu (hamburger i tło)
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navEl.classList.add('nav-visible');
            menuOverlay.classList.remove('hidden');
        });

        menuOverlay.addEventListener('click', closeMenu);
    }


    function navigateTo(view) {
        if (appState.examState.active && !view.startsWith('exam-')) {
            if (!confirm('Czy na pewno chcesz opuścić egzamin? Twoje postępy nie zostaną zapisane.')) {
                return;
            }
            endExam(false);
        }
        appState.currentView = view;
        renderView(view);
    }

    // --- VIEW RENDERING ---
    async function renderView(view) {
        mainContent.innerHTML = `<h1>Ładowanie...</h1>`;
        switch(view) {
            case 'wszystkie':
            case 'zamkniete':
            case 'otwarte':
                await renderRandomTaskView(view);
                break;
            case 'egzaminy':
                await renderExamsList();
                break;
            case 'przegladaj':
                await renderBrowseTasks();
                break;
            case 'statystyki':
                await renderStatsView();
                break;
            case 'admin-zadania':
                if (appState.user.role === 'admin') await renderAdminTasks();
                break;
            case 'admin-egzaminy':
                 if (appState.user.role === 'admin') await renderAdminExams();
                break;
            case 'exam-start':
                await renderExamTask();
                break;
            case 'exam-review':
                await renderExamReviewTask();
                break;
            case 'exam-results':
                await renderExamResultsView();
                break;
        }
    }

    // --- STUDENT VIEWS ---
    
    // Random Task Mode
    async function renderRandomTaskView(type) {
        const typeName = { wszystkie: 'Wszystkie zadania', zamkniete: 'Zadania zamknięte', otwarte: 'Zadania otwarte' }[type];
        mainContent.innerHTML = `<h1>${typeName}</h1>`;
        
        // Sprawdź, czy istnieje tryb treningu błędów
        const practiceMode = appState.currentView === 'practice-incorrect';

        const task = await api.request(`/tasks/random?type=${type}&incorrect=${practiceMode}`); // Zaktualizowana ścieżka API

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

    function handleCheckAnswer(e) {
        e.preventDefault();
        const task = appState.currentTask;
        let userAnswer;
        let isCorrect = false;

        if (task.type === 'zamkniete') {
            const selected = document.querySelector('input[name="answer"]:checked');
            if (!selected) {
                alert('Wybierz odpowiedź!');
                return;
            }
            userAnswer = selected.value;
            isCorrect = userAnswer.toLowerCase() === task.odpowiedz.toLowerCase();
            showResult(isCorrect, task.odpowiedz);
            api.request('/solved', 'POST', { taskId: task.id, isCorrect });
        } else { // otwarte
            userAnswer = document.getElementById('open-answer').value;
            if (!userAnswer) {
                alert('Wpisz odpowiedź!');
                return;
            }
            const resultBox = document.getElementById('result-box');
            resultBox.innerHTML = `
                <div class="result-box">
                    <p><strong>Twoja odpowiedź:</strong> ${userAnswer}</p>
                    <p><strong>Poprawna odpowiedź:</strong> ${task.odpowiedz}</p>
                    <p>Oceń swoją odpowiedź:</p>
                    <button id="self-assess-correct">Było dobrze</button>
                    <button id="self-assess-incorrect">Było źle</button>
                </div>
            `;
            document.getElementById('self-assess-correct').addEventListener('click', () => {
                showResult(true, null, true);
                api.request('/solved', 'POST', { taskId: task.id, isCorrect: true });
            });
            document.getElementById('self-assess-incorrect').addEventListener('click', () => {
                showResult(false, null, true);
                api.request('/solved', 'POST', { taskId: task.id, isCorrect: false });
            });
        }
    }
    
    function showResult(isCorrect, correctAnswer, isSelfAssessed = false) {
        const resultBox = document.getElementById('result-box');
        document.querySelector('#task-form button[type="submit"]').disabled = true;

        if (isCorrect) {
            resultBox.innerHTML = `<div class="result-box correct">🎉 Dobrze!</div>`;
        } else {
            let text = ` Błędna odpowiedź.`;
            if (correctAnswer) text += ` Poprawna to: <strong>${correctAnswer}</strong>`;
            resultBox.innerHTML = `<div class="result-box incorrect">${text}</div>`;
        }

        if (isSelfAssessed) {
             resultBox.innerHTML += `<p>Dziękujemy za ocenę!</p>`;
        }
        
        resultBox.innerHTML += `<button id="next-task-btn">Następne zadanie</button>`;
        document.getElementById('next-task-btn').addEventListener('click', () => renderView(appState.currentView));
    }

    async function handleResetProgress() {
        const isConfirmed = confirm("Czy na pewno chcesz zresetować swoje postępy? Wszystkie rozwiązane zadania zostaną oznaczone jako nierozwiązane, ale Twoje wyniki z egzaminów pozostaną nietknięte.");

        if (isConfirmed) {
            const result = await api.request('/solved', 'DELETE');
            if (result && result.success) {
                alert("Twoje postępy zostały zresetowane!");
                navigateTo(appState.currentView); // Reload view to get a new task
            }
        }
    }

    // Exams List
    async function renderExamsList() {
        const exams = await api.request('/exams');
        let examsHtml = `<ul class="item-list">`;
        if (exams && exams.length) {
            examsHtml += exams.map(exam => `
                <li class="list-item">
                    <span><strong>${exam.name}</strong></span>
                    <div class="exam-action-buttons">
                        <button data-exam-id="${exam.id}" data-exam-name="${exam.name}" data-action="start">Rozpocznij egzamin</button>
                        <button data-exam-id="${exam.id}" data-exam-name="${exam.name}" data-action="review">Przeglądaj</button>
                    </div>
                </li>
            `).join('');
        } else {
            examsHtml += `<p>Brak dostępnych egzaminów.</p>`;
        }
        examsHtml += `</ul>`;
        mainContent.innerHTML = `<h1>Wybierz Egzamin</h1><div class="content-box">${examsHtml}</div>`;

        mainContent.querySelectorAll('button[data-exam-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const examId = e.target.dataset.examId;
                const examName = e.target.dataset.examName;
                const action = e.target.dataset.action;
                if (action === 'start') {
                    startExam(examId, examName);
                } else if (action === 'review') {
                    startExamReview(examId, examName);
                }
            });
        });
    }
    
    // Exam Mode
    async function startExam(examId, examName) {
        const examData = await api.request(`/exams/${examId}`);
        if (!examData || !examData.tasks.length) {
            alert('Ten egzamin jest pusty lub nie można go załadować.');
            return;
        }

        appState.examState = {
            active: true,
            tasks: examData.tasks,
            currentIndex: 0,
            answers: {},
            timer: null,
            examId,
            examName,
            // Nowe pola do oceny zadań otwartych
            openTasksToGrade: [],
            gradedOpenTasks: {}
        };

        const timerDuration = 125 * 60;
        let timeLeft = timerDuration;
        
        appState.examState.timer = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const timerEl = document.getElementById('exam-timer');
            if (timerEl) {
                timerEl.textContent = `Pozostały czas: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            if (timeLeft <= 0) {
                endExam(true);
            }
        }, 1000);

        navigateTo('exam-start');
    }

    function renderExamTask() {
        const { tasks, currentIndex, answers } = appState.examState;
        const task = tasks[currentIndex];

        let answerHtml = '';
        const savedAnswer = answers[task.id];

        if (task.type === 'zamkniete') {
            answerHtml = `<div class="task-options">
                ${task.opcje.map(opt => `
                    <label><input type="radio" name="answer" value="${opt}" ${savedAnswer === opt ? 'checked' : ''}> ${opt}</label>
                `).join('')}
            </div>`;
        } else {
            answerHtml = `<textarea id="open-answer" class="task-input" rows="3" placeholder="Wpisz swoją odpowiedź...">${savedAnswer || ''}</textarea>`;
        }
        
        const examHtml = `
            <div id="exam-timer"></div>
            <h1>Egzamin: ${appState.examState.examName} (${currentIndex + 1} / ${tasks.length})</h1>
            <div class="content-box">
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <div id="exam-form">
                    ${answerHtml}
                </div>
                <div class="exam-navigation">
                    <button id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>Poprzednie</button>
                    <span></span>
                    <button id="next-btn">${currentIndex === tasks.length - 1 ? 'Zakończ egzamin' : 'Następne'}</button>
                </div>
            </div>`;
        mainContent.innerHTML = examHtml;
        document.getElementById('prev-btn').addEventListener('click', () => navigateExam(-1));
        document.getElementById('next-btn').addEventListener('click', () => navigateExam(1));
    }

    function navigateExam(direction) {
        saveCurrentExamAnswer();
        const newIndex = appState.examState.currentIndex + direction;
        if (newIndex < 0 || newIndex > appState.examState.tasks.length) return;
        if (newIndex === appState.examState.tasks.length) {
            endExam(true);
        } else {
            appState.examState.currentIndex = newIndex;
            renderExamTask();
        }
    }

    function saveCurrentExamAnswer() {
        const task = appState.examState.tasks[appState.examState.currentIndex];
        let userAnswer;
        if (task.type === 'zamkniete') {
            const selected = document.querySelector('input[name="answer"]:checked');
            userAnswer = selected ? selected.value : undefined;
        } else {
            userAnswer = document.getElementById('open-answer').value;
        }
        if (userAnswer) {
            appState.examState.answers[task.id] = userAnswer;
        }
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
            // Rozpoczęcie procesu oceny zadań otwartych
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
        await api.request('/results', 'POST', { examId, examName, correct: finalCorrect, wrong: finalWrong, total, percent, closedCorrect, closedWrong, openCorrect, openWrong });
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

    // --- New Review Mode ---
    async function startExamReview(examId, examName) {
        const examData = await api.request(`/exams/${examId}`);
        if (!examData || !examData.tasks.length) {
            alert('Ten egzamin jest pusty lub nie można go załadować.');
            return;
        }
        appState.examState = { active: true, tasks: examData.tasks, currentIndex: 0, answers: {}, timer: null, examId, examName };
        navigateTo('exam-review');
    }

    function renderExamReviewTask() {
        const { tasks, currentIndex } = appState.examState;
        const task = tasks[currentIndex];

        let answerHtml = '';
        if (task.type === 'zamkniete') {
            answerHtml = `
                <div class="task-options">
                    ${task.opcje.map(opt => `
                        <label>
                            <input type="radio" name="answer" value="${opt}"> ${opt}
                        </label>
                    `).join('')}
                </div>`;
        } else {
            answerHtml = `<textarea id="open-answer" class="task-input" rows="3" placeholder="Wpisz swoją odpowiedź..."></textarea>`;
        }

        const taskHtml = `
            <h1>Przeglądanie: ${appState.examState.examName} (${currentIndex + 1} / ${tasks.length})</h1>
            <div class="content-box">
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <div id="review-task-content">
                    <h3>Poprawna odpowiedź:</h3>
                    <div class="correct-answer-box">${task.odpowiedz}</div>
                </div>
                <div class="exam-navigation">
                    <button id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>Poprzednie</button>
                    <span></span>
                    <button id="next-btn">${currentIndex === tasks.length - 1 ? 'Zakończ przegląd' : 'Następne'}</button>
                </div>
            </div>`;
        mainContent.innerHTML = taskHtml;

        document.getElementById('prev-btn').addEventListener('click', () => {
            if (currentIndex > 0) {
                appState.examState.currentIndex--;
                renderExamReviewTask();
            }
        });

        document.getElementById('next-btn').addEventListener('click', () => {
            if (currentIndex < tasks.length - 1) {
                appState.examState.currentIndex++;
                renderExamReviewTask();
            } else {
                navigateTo('egzaminy'); // End review
            }
        });
    }

    // --- Admin Views ---
    async function renderAdminTasks() {
        mainContent.innerHTML = `
            <h1>Zarządzaj Zadania</h1>
            <div class="content-box">
                <h2>Dodaj nowe zadanie</h2>
                <form id="add-task-form">
                    <label for="task-arkusz">Arkusz:</label>
                    <input type="text" id="task-arkusz" required>

                    <label for="task-file">Pliki (Zaznacz obraz zadania):</label>
                    <input type="file" id="task-file" required>

                    <label for="task-type">Typ zadania:</label>
                    <select id="task-type">
                        <option value="otwarte">Otwarte</option>
                        <option value="zamkniete">Zamknięte</option>
                    </select>

                    <label for="task-points">Wartość punktowa:</label>
                    <input type="number" id="task-points" min="1" value="1" required>

                    <div id="dynamic-fields">
                        <label for="task-answer-open">Poprawna odpowiedź:</label>
                        <input type="text" id="task-answer-open" required>
                    </div>
                    
                    <button type="submit">Dodaj Zadanie</button>
                </form>
            </div>
            <div class="content-box">
                <h2>Wyszukaj i zarządzaj istniejącymi</h2>
                <input type="text" id="task-search-input" placeholder="Wyszukaj po ID lub arkuszu">
                <ul id="task-list" class="item-list"></ul>
            </div>
        `;
        document.getElementById('task-type').addEventListener('change', updateTaskForm);
        document.getElementById('add-task-form').addEventListener('submit', handleAddTask);
        document.getElementById('task-search-input').addEventListener('input', handleTaskSearch);
        await handleTaskSearch();
    }

    function updateTaskForm() {
        const type = document.getElementById('task-type').value;
        const dynamicFields = document.getElementById('dynamic-fields');
        if (type === 'zamkniete') {
            dynamicFields.innerHTML = `
                <label for="task-answer-closed">Poprawna odpowiedź:</label>
                <input type="text" id="task-answer-closed" required>
                <div id="options-container">
                    <label>Opcje (dodatkowe, min. 2):</label>
                    <div class="option-item">
                        <input type="text" class="task-option" placeholder="Opcja 1" required>
                    </div>
                    <div class="option-item">
                        <input type="text" class="task-option" placeholder="Opcja 2" required>
                    </div>
                </div>
                <button type="button" id="add-option-btn">Dodaj opcję</button>
            `;
            document.getElementById('add-option-btn').addEventListener('click', addOptionField);
        } else {
            dynamicFields.innerHTML = `
                <label for="task-answer-open">Poprawna odpowiedź:</label>
                <input type="text" id="task-answer-open" required>
            `;
        }
    }

    function addOptionField() {
        const optionsContainer = document.getElementById('options-container');
        const count = optionsContainer.querySelectorAll('.task-option').length + 1;
        const newOption = document.createElement('div');
        newOption.classList.add('option-item');
        newOption.innerHTML = `
            <input type="text" class="task-option" placeholder="Opcja ${count}" required>
            <button type="button" class="remove-option-btn">X</button>
        `;
        optionsContainer.appendChild(newOption);
        newOption.querySelector('.remove-option-btn').addEventListener('click', (e) => e.target.closest('.option-item').remove());
    }

    async function handleAddTask(e) {
        e.preventDefault();
        const arkusz = document.getElementById('task-arkusz').value;
        const fileInput = document.getElementById('task-file');
        const type = document.getElementById('task-type').value;
        const punkty = document.getElementById('task-points').value;
        
        if (fileInput.files.length === 0) {
            alert('Musisz wybrać plik z obrazem zadania.');
            return;
        }

        const formData = new FormData();
        formData.append('arkusz', arkusz);
        formData.append('type', type);
        formData.append('punkty', punkty);
        formData.append('file', fileInput.files[0]);

        let odpowiedz;
        let opcje = null;

        if (type === 'otwarte') {
            odpowiedz = document.getElementById('task-answer-open').value;
            if (!odpowiedz) {
                alert('Wpisz poprawną odpowiedź.');
                return;
            }
        } else { // zamkniete
            odpowiedz = document.getElementById('task-answer-closed').value;
            const optionInputs = document.querySelectorAll('.task-option');
            opcje = Array.from(optionInputs).map(input => input.value);
            if (!odpowiedz || opcje.some(opt => !opt)) {
                alert('Uzupełnij poprawną odpowiedź i wszystkie opcje.');
                return;
            }
        }

        formData.append('odpowiedz', odpowiedz);
        if (opcje) {
            formData.append('opcje', JSON.stringify(opcje));
        }

        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${appState.token}` },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Błąd dodawania zadania');
            }

            alert('Zadanie dodane pomyślnie!');
            document.getElementById('add-task-form').reset();
            updateTaskForm(); // Reset dynamic fields
            handleTaskSearch(); // Refresh task list
        } catch (err) {
            alert(`Błąd: ${err.message}`);
        }
    }

    async function handleTaskSearch(e) {
        const query = (e && e.target.value) || '';
        const tasks = await api.request(`/tasks?search=${query}`);
        const taskList = document.getElementById('task-list');
        taskList.innerHTML = '';
        if (tasks && tasks.length) {
            tasks.forEach(task => {
                const li = document.createElement('li');
                li.className = 'list-item';
                li.innerHTML = `
                    <span><strong>#${task.id}</strong> - ${task.arkusz ? `Arkusz: ${task.arkusz}` : 'Brak arkusza'} (${task.type}, ${task.punkty} pkt)</span>
                    <button class="delete-task-btn" data-id="${task.id}">Usuń</button>
                `;
                li.querySelector('.delete-task-btn').addEventListener('click', handleDeleteTask);
                taskList.appendChild(li);
            });
        } else {
            taskList.innerHTML = `<p>Brak zadań.</p>`;
        }
    }

    async function handleDeleteTask(e) {
        const taskId = e.target.dataset.id;
        if (confirm(`Czy na pewno chcesz usunąć zadanie #${taskId}?`)) {
            const result = await api.request(`/tasks/${taskId}`, 'DELETE');
            if (result !== null) {
                alert(`Zadanie #${taskId} zostało usunięte.`);
                handleTaskSearch();
            }
        }
    }

    async function renderAdminExams() {
        const exams = await api.request('/exams');
        const tasks = await api.request('/tasks');
        
        let examsHtml = `<ul class="item-list">`;
        if (exams && exams.length) {
            examsHtml += exams.map(exam => `
                <li class="list-item">
                    <span><strong>${exam.name}</strong></span>
                    <div class="admin-exam-actions">
                        <button class="delete-exam-btn" data-id="${exam.id}">Usuń</button>
                    </div>
                </li>
            `).join('');
        } else {
            examsHtml += `<p>Brak dostępnych egzaminów.</p>`;
        }
        examsHtml += `</ul>`;

        mainContent.innerHTML = `
            <h1>Zarządzaj Egzaminami</h1>
            <div class="content-box">
                <h2>Stwórz nowy egzamin</h2>
                <form id="create-exam-form">
                    <label for="new-exam-name">Nazwa egzaminu:</label>
                    <input type="text" id="new-exam-name" required>
                    <label for="new-exam-arkusz">Nazwa arkusza:</label>
                    <input type="text" id="new-exam-arkusz" placeholder="np. 'E8 2024 Czerwiec'" required>
                    <h3>Wybierz zadania:</h3>
                    <div id="exam-tasks-list">
                        ${tasks && tasks.length ? tasks.map(task => `
                            <label><input type="checkbox" value="${task.id}"> Zadanie #${task.id} (${task.arkusz || 'Brak arkusza'})</label>
                        `).join('') : '<p>Brak dostępnych zadań.</p>'}
                    </div>
                    <button type="submit">Stwórz Egzamin</button>
                </form>
            </div>
            <div class="content-box">
                <h2>Istniejące egzaminy</h2>
                ${examsHtml}
            </div>
        `;
        document.getElementById('create-exam-form').addEventListener('submit', handleCreateExam);
        document.querySelectorAll('.delete-exam-btn').forEach(btn => btn.addEventListener('click', handleDeleteExam));
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
            navigateTo('admin-egzaminy');
        }
    }

    async function handleDeleteExam(e) {
        const examId = e.target.dataset.id;
        if (confirm(`Czy na pewno chcesz usunąć egzamin #${examId}?`)) {
            const result = await api.request(`/exams/${examId}`, 'DELETE');
            if (result !== null) {
                alert(`Egzamin #${examId} został usunięty.`);
                navigateTo('admin-egzaminy');
            }
        }
    }
    
    // Browse tasks view
    async function renderBrowseTasks() {
        mainContent.innerHTML = `
            <h1>Przeglądaj wszystkie zadania</h1>
            <div class="content-box">
                <input type="text" id="browse-task-search" placeholder="Wyszukaj po ID lub arkuszu">
                <ul id="browse-task-list" class="item-list"></ul>
            </div>
        `;
        document.getElementById('browse-task-search').addEventListener('input', async (e) => {
            const query = e.target.value;
            const tasks = await api.request(`/tasks?search=${query}`);
            const taskList = document.getElementById('browse-task-list');
            taskList.innerHTML = '';
            if (tasks && tasks.length) {
                tasks.forEach(task => {
                    const li = document.createElement('li');
                    li.className = 'list-item';
                    li.innerHTML = `<span><strong>#${task.id}</strong> - ${task.arkusz ? `Arkusz: ${task.arkusz}` : 'Brak arkusza'} (${task.type}, ${task.punkty} pkt)</span>`;
                    taskList.appendChild(li);
                });
            } else {
                taskList.innerHTML = `<p>Brak zadań.</p>`;
            }
        });
        await document.getElementById('browse-task-search').dispatchEvent(new Event('input'));
    }

    // --- Stats View ---
    async function renderStatsView() {
        const stats = await api.request('/stats');

        if (!stats) {
            mainContent.innerHTML = '<h1>Arkusz osiągnięć</h1><div class="content-box"><p>Brak danych statystycznych.</p></div>';
            return;
        }

        let statsHtml = '<h1>Arkusz osiągnięć</h1>';
        statsHtml += '<div class="content-box">';

        // Sekcja "Twoje osiągnięcia"
        statsHtml += `
            <h2>Twoje osiągnięcia</h2>
            <p><strong>Ogólny postęp:</strong> Rozwiązałeś ${stats.generalStats.solved} z ${stats.generalStats.total} zadań.</p>
            <h3>Podsumowanie wyników:</h3>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Typ zadania</th>
                        <th>Poprawne</th>
                        <th>Błędne</th>
                        <th>Procent poprawnych</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Otwarte</td>
                        <td>${stats.typeStats.otwarte?.correct || 0}</td>
                        <td>${stats.typeStats.otwarte?.wrong || 0}</td>
                        <td>${(stats.typeStats.otwarte?.correct / ((stats.typeStats.otwarte?.correct || 0) + (stats.typeStats.otwarte?.wrong || 0)) * 100 || 0).toFixed(0)}%</td>
                    </tr>
                    <tr>
                        <td>Zamknięte</td>
                        <td>${stats.typeStats.zamkniete?.correct || 0}</td>
                        <td>${stats.typeStats.zamkniete?.wrong || 0}</td>
                        <td>${(stats.typeStats.zamkniete?.correct / ((stats.typeStats.zamkniete?.correct || 0) + (stats.typeStats.zamkniete?.wrong || 0)) * 100 || 0).toFixed(0)}%</td>
                    </tr>
                </tbody>
            </table>
        `;

        // Sekcja "Wyniki z egzaminów"
        if (stats.solvedExams && stats.solvedExams.length > 0) {
            statsHtml += `
                <h3 style="margin-top: 2rem;">Wyniki z egzaminów</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Arkusz</th>
                            <th>Poprawne</th>
                            <th>Błędne</th>
                            <th>Punkty (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.solvedExams.map(exam => `
                            <tr>
                                <td>${exam.exam_name}</td>
                                <td>${exam.correct} / ${exam.total}</td>
                                <td>${exam.wrong} / ${exam.total}</td>
                                <td>${exam.percent.toFixed(0)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            statsHtml += `
                <h3 style="margin-top: 2rem;">Wyniki z egzaminów</h3>
                <p>Brak wyników z egzaminów.</p>
            `;
        }
        
        // Statystyki dla każdego arkusza
        if (stats.sheetStats && stats.sheetStats.length > 0) {
            statsHtml += `
                <h3 style="margin-top: 2rem;">Wyniki z arkuszy</h3>
                ${stats.sheetStats.map(sheet => `
                    <h4>Arkusz: ${sheet.arkusz}</h4>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Typ zadania</th>
                                <th>Poprawne</th>
                                <th>Błędne</th>
                                <th>Punkty (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Otwarte</td>
                                <td>${sheet.otwarte?.correct || 0}</td>
                                <td>${sheet.otwarte?.wrong || 0}</td>
                                <td>${(sheet.otwarte?.correct / ((sheet.otwarte?.correct || 0) + (sheet.otwarte?.wrong || 0)) * 100 || 0).toFixed(0)}%</td>
                            </tr>
                            <tr>
                                <td>Zamknięte</td>
                                <td>${sheet.zamkniete?.correct || 0}</td>
                                <td>${sheet.zamkniete?.wrong || 0}</td>
                                <td>${(sheet.zamkniete?.correct / ((sheet.zamkniete?.correct || 0) + (sheet.zamkniete?.wrong || 0)) * 100 || 0).toFixed(0)}%</td>
                            </tr>
                        </tbody>
                    </table>
                `).join('')}
            `;
        } else {
            statsHtml += `<h3 style="margin-top: 2rem;">Wyniki z arkuszy</h3><p>Brak rozwiązanych zadań z arkuszy.</p>`;
        }

        statsHtml += '</div>';
        mainContent.innerHTML = statsHtml;
    }

    init();
});