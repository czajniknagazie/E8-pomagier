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
                            <input type="radio" name="answer" value="${opt}">
                            ${opt}
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
                <form id="task-review-form">
                    ${answerHtml}
                    <button type="submit">Sprawdź</button>
                </form>
                <div id="result-box"></div>
                <div class="exam-navigation">
                    <button id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>Poprzednie</button>
                    <span></span>
                    <button id="next-btn" ${currentIndex === tasks.length - 1 ? 'disabled' : ''}>Następne</button>
                </div>
            </div>`;
        mainContent.innerHTML = taskHtml;
        const form = document.getElementById('task-review-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const task = appState.examState.tasks[appState.examState.currentIndex];
            let userAnswer;
            if (task.type === 'zamkniete') {
                const selected = form.querySelector('input[name="answer"]:checked');
                userAnswer = selected ? selected.value : '';
            } else {
                userAnswer = form.querySelector('#open-answer').value;
            }
            const isCorrect = userAnswer.toLowerCase() === task.odpowiedz.toLowerCase();
            showReviewResult(isCorrect, task.odpowiedz);
            form.querySelector('button[type="submit"]').disabled = true;
            if (task.type === 'zamkniete') {
                form.querySelectorAll('input').forEach(input => input.disabled = true);
            }
        });
        document.getElementById('prev-btn').addEventListener('click', () => navigateExamReview(-1));
        document.getElementById('next-btn').addEventListener('click', () => navigateExamReview(1));
    }

    function navigateExamReview(direction) {
        const newIndex = appState.examState.currentIndex + direction;
        if (newIndex >= 0 && newIndex < appState.examState.tasks.length) {
            appState.examState.currentIndex = newIndex;
            renderExamReviewTask();
        }
    }

    function showReviewResult(isCorrect, correctAnswer) {
        const resultBox = document.getElementById('result-box');
        if (isCorrect) {
            resultBox.innerHTML = `<div class="result-box correct">🎉 Dobrze!</div>`;
        } else {
            resultBox.innerHTML = `<div class="result-box incorrect">Błędna odpowiedź. Poprawna to: <strong>${correctAnswer}</strong></div>`;
        }
    }

    // --- Stats View ---
    async function renderStatsView() {
        mainContent.innerHTML = '<h1>Statystyki</h1><p>Ładowanie danych...</p>';
        const stats = await api.request('/stats');
        if (!stats) return;

        let statsHtml = `
            <div class="content-box">
                <h2>Ogólne statystyki</h2>
                <p>Rozwiązane zadania: <strong>${stats.generalStats.total_solved || 0}</strong></p>
                <p>Poprawne odpowiedzi: <strong>${stats.generalStats.total_correct || 0}</strong></p>
                <p>Błędne odpowiedzi: <strong>${stats.generalStats.total_wrong || 0}</strong></p>
            </div>
            <div class="content-box">
                <h2>Statystyki według typu zadania</h2>
                <ul>
                    <li><strong>Zamknięte:</strong> ${stats.typeStats.zamkniete?.correct || 0} dobrych, ${stats.typeStats.zamkniete?.wrong || 0} błędnych</li>
                    <li><strong>Otwarte:</strong> ${stats.typeStats.otwarte?.correct || 0} dobrych, ${stats.typeStats.otwarte?.wrong || 0} błędnych</li>
                </ul>
            </div>
            <div class="content-box">
                <h2>Wyniki z egzaminów</h2>
                <ul class="item-list">`;
        
        if (stats.solvedExams.length) {
            statsHtml += stats.solvedExams.map(exam => `
                <li class="list-item">
                    <span><strong>${exam.exam_name}</strong> - ${exam.correct}/${exam.total} (${exam.percent.toFixed(0)}%)</span>
                </li>
            `).join('');
        } else {
            statsHtml += `<li>Brak rozwiązanych egzaminów.</li>`;
        }

        statsHtml += `</ul></div>`;
        mainContent.innerHTML = `<h1>Statystyki</h1>${statsHtml}`;
    }

    // --- ADMIN VIEWS ---
    
    // Admin Tasks
    async function renderAdminTasks() {
        const tasks = await api.request('/tasks');
        let tasksHtml = `<div class="content-box wide">
            <div class="admin-tasks-controls">
                <input type="text" id="task-search-input" placeholder="Szukaj po ID lub arkuszu..." style="width: 50%;">
                <button id="search-tasks-btn">Szukaj</button>
                <button id="clear-search-btn">Wyczyść</button>
            </div>
            <ul class="item-list">`;
        if (tasks && tasks.length) {
             tasksHtml += tasks.map(task => `
                <li class="list-item">
                    <img src="${task.tresc}" alt="Miniatura" style="height: 50px; width: auto; border-radius: 4px;">
                    <div>
                        <strong>Zadanie #${task.id}</strong><br>
                        <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                    </div>
                    <button class="delete-task-btn" data-id="${task.id}">Usuń</button>
                </li>
             `).join('');
        } else {
            tasksHtml += `<p>Brak zadań.</p>`;
        }
        tasksHtml += `</ul></div>`;
        
        // Formularz dodawania zadań
        tasksHtml += `
            <div class="content-box">
                <h2>Dodaj nowe zadania</h2>
                <p>Wgraj obrazki zadań. Nazwa pliku to typ (zamkniete/otwarte), a następnie treść odpowiedzi, np. 'zamkniete_OdpowiedzA.png', 'otwarte_OdpowiedzB.png'</p>
                <form id="upload-form">
                    <input type="file" id="task-files" multiple required>
                    <button type="submit">Wgraj</button>
                </form>
            </div>
        `;
        
        mainContent.innerHTML = `<h1>Panel Administracyjny: Zarządzanie zadaniami</h1>${tasksHtml}`;

        document.getElementById('upload-form').addEventListener('submit', handleTaskUpload);
        document.querySelectorAll('.delete-task-btn').forEach(btn => btn.addEventListener('click', handleDeleteTask));
        document.getElementById('task-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') renderAdminTasksSearch();
        });
        document.getElementById('search-tasks-btn').addEventListener('click', renderAdminTasksSearch);
        document.getElementById('clear-search-btn').addEventListener('click', () => navigateTo('admin-zadania'));
    }
    
    async function renderAdminTasksSearch() {
        const search = document.getElementById('task-search-input').value;
        const tasks = await api.request(`/tasks?search=${encodeURIComponent(search)}`);
        // Odtworzenie widoku z wynikami wyszukiwania
        let tasksHtml = `<div class="content-box wide">
            <div class="admin-tasks-controls">
                <input type="text" id="task-search-input" placeholder="Szukaj po ID lub arkuszu..." value="${search}">
                <button id="search-tasks-btn">Szukaj</button>
                <button id="clear-search-btn">Wyczyść</button>
            </div>
            <ul class="item-list">`;
        if (tasks && tasks.length) {
            tasksHtml += tasks.map(task => `
                <li class="list-item">
                    <img src="${task.tresc}" alt="Miniatura" style="height: 50px; width: auto; border-radius: 4px;">
                    <div>
                        <strong>Zadanie #${task.id}</strong><br>
                        <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                    </div>
                    <button class="delete-task-btn" data-id="${task.id}">Usuń</button>
                </li>
            `).join('');
        } else {
            tasksHtml += `<p>Brak zadań pasujących do kryteriów wyszukiwania.</p>`;
        }
        tasksHtml += `</ul></div>`;
        mainContent.innerHTML = `<h1>Panel Administracyjny: Zarządzanie zadaniami</h1>${tasksHtml}`;
        document.getElementById('upload-form').addEventListener('submit', handleTaskUpload);
        document.querySelectorAll('.delete-task-btn').forEach(btn => btn.addEventListener('click', handleDeleteTask));
        document.getElementById('task-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') renderAdminTasksSearch();
        });
        document.getElementById('search-tasks-btn').addEventListener('click', renderAdminTasksSearch);
        document.getElementById('clear-search-btn').addEventListener('click', () => navigateTo('admin-zadania'));
    }

    async function handleTaskUpload(e) {
        e.preventDefault();
        const files = document.getElementById('task-files').files;
        if (!files.length) return alert('Wybierz pliki do wgrania.');

        const uploaded = await api.upload(files);
        if (!uploaded) return;

        const tasksData = uploaded.files.map(file => {
            const parts = file.filename.split(/_(.+)/);
            if (parts.length < 2) {
                console.error('Nieprawidłowa nazwa pliku:', file.filename);
                return null;
            }
            const type = parts[0];
            const answerPart = parts[1].replace(path.extname(parts[1]), '');
            
            const task = {
                type: type === 'zamkniete' ? 'zamkniete' : 'otwarte',
                tresc: file.url,
                odpowiedz: answerPart
            };
            if (task.type === 'zamkniete') {
                task.opcje = [answerPart]; // Pusta lista opcji do uzupełnienia ręcznie
            }
            return task;
        }).filter(t => t !== null);

        const result = await api.request('/tasks/bulk', 'POST', { tasks: tasksData });
        if (result) {
            alert(`Pomyślnie dodano ${result.count} zadań.`);
            navigateTo('admin-zadania');
        }
    }
    
    async function handleDeleteTask(e) {
        const taskId = e.target.dataset.id;
        if (confirm(`Czy na pewno chcesz usunąć zadanie #${taskId}?`)) {
            const result = await api.request(`/tasks/${taskId}`, 'DELETE');
            if (result !== null) {
                alert(`Zadanie #${taskId} zostało usunięte.`);
                navigateTo('admin-zadania');
            }
        }
    }
    
    // Admin Exams
    async function renderAdminExams() {
        const exams = await api.request('/exams');
        const tasks = await api.request('/tasks'); // Pobierz listę wszystkich zadań
        let examsHtml = `<div class="content-box wide">
            <h2>Utwórz nowy arkusz egzaminacyjny</h2>
            <form id="create-exam-form">
                <input type="text" id="new-exam-name" placeholder="Nazwa egzaminu" required>
                <input type="text" id="new-exam-arkusz" placeholder="Nazwa arkusza" required>
                <h3>Wybierz zadania:</h3>
                <div class="task-list-container">
                    <ul id="exam-tasks-list" class="item-list task-list">
                        ${tasks.map(task => `
                            <li class="list-item">
                                <input type="checkbox" value="${task.id}" style="transform: scale(1.5);">
                                <img src="${task.tresc}" alt="Miniatura">
                                <div>
                                    <strong>Zadanie #${task.id}</strong><br>
                                    <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <button type="submit">Utwórz egzamin</button>
            </form>
        </div>`;
        
        examsHtml += `<div class="content-box">
            <h2>Istniejące egzaminy</h2>
            <ul class="item-list">`;
        if (exams && exams.length) {
            examsHtml += exams.map(exam => `
                <li class="list-item">
                    <span><strong>${exam.name}</strong> (${JSON.parse(exam.tasks || '[]').length} zadań)</span>
                    <button class="delete-exam-btn" data-id="${exam.id}">Usuń</button>
                </li>
            `).join('');
        } else {
            examsHtml += `<p>Brak dostępnych egzaminów.</p>`;
        }
        examsHtml += `</ul></div>`;

        mainContent.innerHTML = `<h1>Panel Administracyjny: Egzaminy</h1>${examsHtml}`;
        
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

    // --- Inicjalizacja ---
    init();

});