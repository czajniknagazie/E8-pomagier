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
            examName: '',
            theme: 'light',
            finalResults: {} // Store final results for review
        },
        allTasksCache: [], // Cache for all tasks
    };

    // DOM Elements
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    let mainContent = document.getElementById('main-content');
    
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
        setupFooterToggle();
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
        appState.token = null;
        appState.user = {};
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
        
        setupNavigation();
        navigateTo('wszystkie');
    }

    // --- NAVIGATION ---
    function setupNavigation() {
        const navEl = document.getElementById('main-nav');
        const menuToggle = document.getElementById('menu-toggle');
        let menuOverlay;
    
        if (!document.getElementById('menu-overlay')) {
            menuOverlay = document.createElement('div');
            menuOverlay.id = 'menu-overlay';
            menuOverlay.classList.add('hidden');
            document.body.appendChild(menuOverlay);
        } else {
            menuOverlay = document.getElementById('menu-overlay');
        }
    
        const closeMenu = () => {
            document.body.classList.remove('nav-open');
            navEl.classList.remove('nav-visible');
            if (menuOverlay) menuOverlay.classList.add('hidden');
        };
    
        navEl.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.view) {
                if (navEl.classList.contains('nav-visible')) {
                    closeMenu();
                }
                navigateTo(e.target.dataset.view);
            }
        });
    
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            document.body.classList.add('nav-open');
            navEl.classList.add('nav-visible');
            if (menuOverlay) menuOverlay.classList.remove('hidden');
        });
    
        if (menuOverlay) {
            menuOverlay.addEventListener('click', closeMenu);
        }
    }


    function navigateTo(view, params = null) {
        if (appState.examState.active && !view.startsWith('exam-') && !view.startsWith('games')) {
            if (!confirm('Czy na pewno chcesz opuścić egzamin? Twoje postępy nie zostaną zapisane.')) {
                return;
            }
            endExam(false);
        }
        
        const isGamesMode = view.startsWith('games') || (view.startsWith('exam-') && appState.examState.theme === 'dark');
        document.body.classList.toggle('games-mode-active', isGamesMode);

        appState.currentView = view;
        renderView(view, params);
    }


    // --- VIEW RENDERING ---
    async function renderView(view, params = null) {
        const newMainContent = mainContent.cloneNode(false);
        mainContent.parentNode.replaceChild(newMainContent, mainContent);
        mainContent = newMainContent;
        
        const isGamesView = view.startsWith('games') || (view.startsWith('exam-') && appState.examState.theme === 'dark');

        if (isGamesView) {
            mainContent.innerHTML = `<div class="games-background"><canvas id="matrix-canvas"></canvas></div><div class="games-content"><p>Ładowanie...</p></div>`;
            if(typeof initializeMatrixAnimation === 'function') initializeMatrixAnimation();
        } else {
            mainContent.innerHTML = `<h1>Ładowanie...</h1>`;
        }

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
            case 'admin-edytuj-zadanie':
                if (appState.user.role === 'admin') await renderAdminEditTask(params);
                break;
            case 'admin-egzaminy':
                 if (appState.user.role === 'admin') await renderAdminExams();
                break;
            case 'exam-start':
                await renderExamTask();
                break;
            case 'exam-results':
                await renderExamResultsView();
                break;
            case 'games':
                await renderGamesView();
                break;
            case 'games-exams':
                await renderGamesExamsList();
                break;
        }
    }

    // --- STUDENT VIEWS ---
    
    async function renderRandomTaskView(type) {
        const typeName = { wszystkie: 'Wszystkie zadania', zamkniete: 'Zadania zamknięte', otwarte: 'Zadania otwarte' }[type];
        mainContent.innerHTML = `<h1>${typeName}</h1>`;
        
        const task = await api.request(`/tasks/random?type=${type}&mode=standard`);
        appState.currentTask = task;

        if (!task) {
            mainContent.innerHTML += `
                <div class="content-box">
                    <p><strong>Gratulacje! 🎉</strong></p>
                    <p>Rozwiązałeś wszystkie dostępne zadania w tym trybie. Możesz zresetować swoje postępy lub przećwiczyć zadania, w których popełniłeś/aś błąd.</p>
                    <div class="action-buttons">
                        <button id="reset-progress-btn">Resetuj postępy</button>
                        <button id="practice-incorrect-btn">Ćwicz błędne odpowiedzi</button>
                    </div>
                </div>`;
            document.getElementById('reset-progress-btn').addEventListener('click', () => handleResetProgress('standard'));
            document.getElementById('practice-incorrect-btn').addEventListener('click', () => {
                 renderPracticeIncorrectTaskView();
            });
            return;
        }

        renderTaskDisplay(task);
    }
    
    async function renderPracticeIncorrectTaskView() {
        mainContent.innerHTML = `<h1>Tryb Ćwiczenia Błędów</h1>`;
    
        const task = await api.request(`/tasks/random?incorrect=true&mode=standard`);
        appState.currentTask = task;
    
        if (!task) {
            mainContent.innerHTML += `
                <div class="content-box">
                    <p><strong>Świetna robota! 💪</strong></p>
                    <p>Przećwiczyłeś/aś wszystkie zadania, w których wcześniej popełniłeś/aś błąd. Wróć do normalnego trybu nauki.</p>
                    <div class="action-buttons">
                         <button id="back-to-all-tasks">Wróć do wszystkich zadań</button>
                    </div>
                </div>`;
            document.getElementById('back-to-all-tasks').addEventListener('click', () => navigateTo('wszystkie'));
            return;
        }
        
        renderTaskDisplay(task);
    }
    
    function renderTaskDisplay(task) {
        let answerHtml = '';
        if (task.type === 'zamkniete') {
            answerHtml = `
                <div class="task-options">
                    ${task.opcje.map((opt) => `
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
        if (task.type === 'zamkniete') {
            const selected = document.querySelector('input[name="answer"]:checked');
            if (!selected) { alert('Wybierz odpowiedź!'); return; }
            const isCorrect = selected.value.trim().toLowerCase() === task.odpowiedz.trim().toLowerCase();
            showResult(isCorrect, task.odpowiedz);
            // ZMIANA: Wyślij liczbę zdobytych punktów (1 lub 0)
            api.request('/solved', 'POST', { taskId: task.id, isCorrect, mode: 'standard', earnedPoints: isCorrect ? 1 : 0 });
        } else { // otwarte
            const userAnswer = document.getElementById('open-answer').value;
            if (!userAnswer) { alert('Wpisz odpowiedź!'); return; }
            document.getElementById('result-box').innerHTML = `
                <div class="result-box">
                    <p><strong>Twoja odpowiedź:</strong></p><pre class="user-answer-box">${userAnswer}</pre>
                    <p><strong>Poprawna odpowiedź:</strong></p><pre class="correct-answer-box">${task.odpowiedz}</pre>
                    <p>Oceń swoją odpowiedź (0 - ${task.punkty} pkt):</p>
                    <form id="self-assess-form">
                        <input type="number" id="self-assess-points" min="0" max="${task.punkty}" value="0" style="width: 100px; margin-right: 10px;">
                        <button type="submit">Oceń</button>
                    </form>
                </div>`;
            document.getElementById('self-assess-form').addEventListener('submit', (ev) => {
                ev.preventDefault();
                const points = parseInt(document.getElementById('self-assess-points').value, 10);
                if (isNaN(points) || points < 0 || points > task.punkty) {
                    alert(`Wpisz poprawną liczbę punktów (od 0 do ${task.punkty}).`);
                    return;
                }
                const isConsideredCorrect = (points === task.punkty);
                // ZMIANA: Wyślij dokładnie tyle punktów, ile przyznał sobie użytkownik
                api.request('/solved', 'POST', { taskId: task.id, isCorrect: isConsideredCorrect, mode: 'standard', earnedPoints: points });
                showResult(true, null, true);
            });
        }
    }
    
    function showResult(isCorrect, correctAnswer, isSelfAssessed = false) {
        const resultBox = document.getElementById('result-box');
        const formButton = document.querySelector('#task-form button[type="submit"]');
        if(formButton) formButton.disabled = true;

        if (isSelfAssessed) {
            resultBox.innerHTML = `<div class="result-box correct">Dziękujemy za ocenę! Twoja odpowiedź została zapisana.</div>`;
        } else {
            resultBox.innerHTML = isCorrect
                ? `<div class="result-box correct">🎉 Dobrze!</div>`
                : `<div class="result-box incorrect">Błędna odpowiedź. Poprawna to: <strong>${correctAnswer}</strong></div>`;
        }
        
        resultBox.innerHTML += `<button id="next-task-btn">Następne zadanie</button>`;
        document.getElementById('next-task-btn').addEventListener('click', () => renderView(appState.currentView));
    }


    async function handleResetProgress(mode) {
        const message = mode === 'games' 
            ? "Czy na pewno chcesz zresetować swoje postępy w Trybie Gier?"
            : "Czy na pewno chcesz zresetować swoje postępy? Wszystkie rozwiązane zadania zostaną oznaczone jako nierozwiązane, ale Twoje wyniki z egzaminów pozostaną nietknięte.";
        
        if (confirm(message)) {
            const result = await api.request('/solved', 'DELETE', { mode });
            if (result && result.success) {
                alert("Twoje postępy zostały zresetowane!");
                navigateTo(appState.currentView);
            }
        }
    }

    async function renderBrowseTasks() {
        mainContent.innerHTML = '<h1>Przeglądaj wszystkie zadania</h1><div class="warning-box">Pamiętaj, że postępy w tym trybie nie są zapisywane w Twoim arkuszu osiągnięć.</div>';
        const tasks = await api.request('/tasks');
        if (tasks) {
            appState.allTasksCache = tasks;
            renderScrollableTaskList(tasks, mainContent);
        } else {
            mainContent.innerHTML += '<p>Nie udało się załadować zadań.</p>';
        }
    }

    async function renderExamsList() {
        mainContent.innerHTML = `<h1>Wybierz Egzamin</h1>`;
        const exams = await api.request('/exams');
        let examsHtml = `<div class="content-box"><ul class="item-list">`;
        
        if (exams && exams.length) {
            const monthMap = { styczeń: 1, stycznia: 1, luty: 2, lutego: 2, marzec: 3, marca: 3, kwiecień: 4, kwietnia: 4, maj: 5, maja: 5, czerwiec: 6, czerwca: 6, lipiec: 7, lipca: 7, sierpień: 8, sierpnia: 8, wrzesień: 9, września: 9, październik: 10, października: 10, listopad: 11, listopada: 11, grudzień: 12, grudnia: 12 };
            const monthRegex = new RegExp(Object.keys(monthMap).join('|'), 'i');
            exams.sort((a, b) => {
                const yearA = a.name.match(/\b(\d{4})\b/); const yearB = b.name.match(/\b(\d{4})\b/);
                const monthA = a.name.match(monthRegex); const monthB = b.name.match(monthRegex);
                const yearNumA = yearA ? parseInt(yearA[1], 10) : 0; const yearNumB = yearB ? parseInt(yearB[1], 10) : 0;
                const monthNumA = monthA ? monthMap[monthA[0].toLowerCase()] : 0; const monthNumB = monthB ? monthMap[monthB[0].toLowerCase()] : 0;
                if (yearNumA !== yearNumB) return yearNumB - yearNumA;
                return monthNumB - monthNumA;
            });

            examsHtml += exams.map(exam => `
                <li class="list-item">
                    <span><strong>${exam.name}</strong></span>
                    <div class="action-buttons">
                        <button class="start-exam-btn" data-exam-id="${exam.id}" data-exam-name="${exam.name}">Rozpocznij</button>
                        <button class="review-exam-btn" data-exam-id="${exam.id}" data-exam-name="${exam.name}">Przeglądaj</button>
                    </div>
                </li>`).join('');
        } else {
            examsHtml += `<p>Brak dostępnych egzaminów.</p>`;
        }
        examsHtml += `</ul></div>`;
        mainContent.innerHTML += examsHtml;

        mainContent.querySelectorAll('.start-exam-btn').forEach(btn => 
            btn.addEventListener('click', e => {
                const { examId, examName } = e.target.dataset;
                startExam(examId, examName, 155, 'light'); // Domyślny czas i motyw
            })
        );
        mainContent.querySelectorAll('.review-exam-btn').forEach(btn => 
            btn.addEventListener('click', e => {
                const { examId, examName } = e.target.dataset;
                startExamReview(examId, examName);
            })
        );
    }
    
    function renderExamStartScreen(examId, examName, theme = 'light') {
        if (theme === 'dark') {
            if (!confirm('Masz 155 minut na rozwiązanie arkusza.')) {
                return;
            }
        }
        startExam(examId, examName, 155, theme);
    }
    
    async function startExam(examId, examName, timeInMinutes, theme = 'light') {
        const examData = await api.request(`/exams/${examId}`);
        if (!examData || !examData.tasks.length) {
            alert('Ten egzamin jest pusty lub nie można go załadować.');
            return;
        }

        appState.examState = {
            active: true, tasks: examData.tasks, currentIndex: 0, answers: {}, timer: null,
            examId, examName, theme, openTasksToGrade: [], gradedOpenTasks: {}
        };

        if (timeInMinutes > 0) {
            let timeLeft = timeInMinutes * 60;
            appState.examState.timer = setInterval(() => {
                timeLeft--;
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                const timerEl = document.getElementById('exam-timer');
                if (timerEl) {
                    timerEl.textContent = `Pozostały czas: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
                if (timeLeft <= 0) {
                    alert("Czas się skończył!");
                    endExam(true);
                }
            }, 1000);
        }
        navigateTo('exam-start');
    }

    function renderExamTask() {
        const { tasks, currentIndex, answers, examName, timer, theme } = appState.examState;
        const task = tasks[currentIndex];

        let answerHtml = '';
        const savedAnswer = answers[task.id];
        const optionsClass = theme === 'dark' ? 'games-task-options' : 'task-options';
        const textareaClass = theme === 'dark' ? 'games-task-textarea' : 'task-input';
        
        if (task.type === 'zamkniete') {
            answerHtml = `<div class="${optionsClass}">
                ${task.opcje.map(opt => `<label><input type="radio" name="answer" value="${opt}" ${savedAnswer === opt ? 'checked' : ''}> ${opt}</label>`).join('')}
            </div>`;
        } else {
            answerHtml = `<textarea id="open-answer" class="${textareaClass}" rows="3" placeholder="Wpisz swoją odpowiedź...">${savedAnswer || ''}</textarea>`;
        }
        
        const containerClass = theme === 'dark' ? 'games-task-box' : 'content-box';
        const examHtml = `
            ${timer ? `<div id="exam-timer" class="${theme === 'dark' ? 'dark' : ''}">Ładowanie...</div>` : ''}
            <div class="${containerClass}">
                <h1>Egzamin: ${examName} (${currentIndex + 1} / ${tasks.length})</h1>
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <div id="exam-form">${answerHtml}</div>
                <div class="exam-navigation">
                    <button id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>Poprzednie</button>
                    <button id="next-btn">${currentIndex === tasks.length - 1 ? 'Zakończ' : 'Następne'}</button>
                </div>
            </div>`;
        
        mainContent.innerHTML = theme === 'dark' ? `<div class="games-background"><canvas id="matrix-canvas"></canvas></div><div class="games-content games-task-view-mode">${examHtml}</div>` : examHtml;
        if(theme === 'dark' && typeof initializeMatrixAnimation === 'function') initializeMatrixAnimation();

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
        if(appState.examState.timer) clearInterval(appState.examState.timer);
        appState.examState.timer = null;

        if (isFinished) {
            saveCurrentExamAnswer();
            
            const openTasks = appState.examState.tasks.filter(t => t.type === 'otwarte');

            appState.examState.openTasksToGrade = openTasks;
            appState.examState.gradedOpenTasks = {};

            if (openTasks.length > 0) {
                renderOpenTaskGradingView();
            } else {
                await sendFinalResults();
            }

        } else {
             appState.examState = { active: false, theme: 'light' };
        }
    }

    function renderOpenTaskGradingView() {
        const { openTasksToGrade, gradedOpenTasks, answers, theme } = appState.examState;
        const currentOpenTaskIndex = Object.keys(gradedOpenTasks).length;

        if (currentOpenTaskIndex >= openTasksToGrade.length) {
            sendFinalResults();
            return;
        }

        const task = openTasksToGrade[currentOpenTaskIndex];
        const userAnswer = answers[task.id] || 'Brak odpowiedzi';

        const containerClass = theme === 'dark' ? 'games-task-box' : 'content-box';
        const buttonClass = theme === 'dark' ? 'games-task-button' : '';
        const inputStyle = theme === 'dark' ? 'style="color:#000;"' : '';

        const gradingHtml = `
            <div class="${containerClass}">
                <h1>Ocena zadań otwartych (${currentOpenTaskIndex + 1} / ${openTasksToGrade.length})</h1>
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <h3>Twoja odpowiedź:</h3><div class="user-answer-box">${userAnswer}</div>
                <h3>Poprawna odpowiedź:</h3><div class="correct-answer-box">${task.odpowiedz}</div>
                <form id="self-assess-form">
                    <p>Oceń swoją odpowiedź (0 - ${task.punkty} pkt):</p>
                    <input type="number" id="self-assess-points" min="0" max="${task.punkty}" value="0" ${inputStyle}>
                    <button type="submit" class="${buttonClass}">Zatwierdź i kontynuuj</button>
                </form>
            </div>`;
        
        const contentTarget = theme === 'dark' ? mainContent.querySelector('.games-content') : mainContent;
        contentTarget.innerHTML = gradingHtml;

        document.getElementById('self-assess-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const pointsInput = document.getElementById('self-assess-points');
            const points = parseInt(pointsInput.value, 10);
            if (isNaN(points) || points < 0 || points > task.punkty) {
                alert(`Wpisz poprawną liczbę punktów (od 0 do ${task.punkty}).`);
                return;
            }
            appState.examState.gradedOpenTasks[task.id] = points;
            renderOpenTaskGradingView();
        });
    }

    async function sendFinalResults() {
        const { examId, examName, tasks, answers, gradedOpenTasks } = appState.examState;
        
        let totalPoints = 0;
        let earnedPoints = 0;
        
        const detailedResults = tasks.map(task => {
            let points = 0;
            if (task.type === 'zamkniete') {
                const isCorrect = answers[task.id] && answers[task.id].trim().toLowerCase() === task.odpowiedz.trim().toLowerCase();
                if (isCorrect) points = 1; // Closed tasks are worth 1 point
                totalPoints += 1;
            } else { // otwarte
                points = gradedOpenTasks[task.id] || 0;
                totalPoints += task.punkty;
            }
            earnedPoints += points;
            return {
                ...task,
                userAnswer: answers[task.id] || 'Brak odpowiedzi',
                earnedPoints: points
            };
        });

        const percent = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

        await api.request('/results', 'POST', {
            examId, examName, 
            correct: earnedPoints, // Using 'correct' for total points earned
            total: totalPoints,    // Using 'total' for max possible points
            wrong: totalPoints - earnedPoints,
            percent
        });
        
        appState.examState.finalResults = {
            examName,
            tasks: detailedResults,
            earnedPoints,
            totalPoints,
            percent
        };
        
        // Navigate to the new review view
        renderExamReviewView();
    }

    function renderExamReviewView() {
        const { examName, tasks, earnedPoints, totalPoints, percent } = appState.examState.finalResults;
        const theme = appState.examState.theme;

        const containerClass = theme === 'dark' ? 'games-task-box' : 'content-box wide';
        const buttonClass = theme === 'dark' ? 'games-task-button' : '';

        const reviewHtml = `
            <div class="${containerClass}">
                <h1>Wyniki Egzaminu: ${examName}</h1>
                <div class="exam-summary-score">
                    Wynik końcowy: <strong>${earnedPoints} / ${totalPoints} (${percent.toFixed(0)}%)</strong>
                </div>
                <div class="task-review-list">
                    ${tasks.map(task => `
                        <div class="task-review-item">
                            <p><strong>Zadanie #${task.id} (${task.earnedPoints} / ${task.punkty} pkt.)</strong></p>
                            <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                            <div class="answers-review">
                                <div>
                                    <h3>Twoja odpowiedź:</h3>
                                    <div class="user-answer-box">${task.userAnswer}</div>
                                </div>
                                <div>
                                    <h3>Poprawna odpowiedź:</h3>
                                    <div class="correct-answer-box">${task.odpowiedz}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button id="back-to-exams" class="${buttonClass}">Wróć do listy egzaminów</button>
            </div>`;
        
        const contentTarget = theme === 'dark' ? mainContent.querySelector('.games-content') : mainContent;
        contentTarget.innerHTML = reviewHtml;

        document.getElementById('back-to-exams').addEventListener('click', () => {
            const destination = theme === 'dark' ? 'games-exams' : 'egzaminy';
            appState.examState = { active: false, theme: 'light', finalResults: {} }; // Reset exam state
            navigateTo(destination);
        });
    }

    async function startExamReview(examId, examName) {
        const examData = await api.request(`/exams/${examId}`);
        if (!examData) { alert('Nie można załadować egzaminu.'); return; }
        appState.allTasksCache = examData.tasks;
        mainContent.innerHTML = `<h1>Przeglądanie: ${examName}</h1><div class="warning-box">Postępy w tym trybie nie są zapisywane.</div>`;
        renderScrollableTaskList(examData.tasks, mainContent);
    }
    
    function renderScrollableTaskList(tasks, container) {
        const tasksHtml = tasks.map(task => {
            let answerHtml = '';
            if (task.type === 'zamkniete') {
                answerHtml = `<div class="task-options">${task.opcje.map(opt => `<label><input type="radio" name="answer-${task.id}" value="${opt}"> ${opt}</label>`).join('')}</div>`;
            } else {
                answerHtml = `<textarea class="task-input" rows="3" placeholder="Wpisz swoją odpowiedź..."></textarea>`;
            }
            return `<div class="content-box task-container" data-task-id="${task.id}">
                    <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                    <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                    <form class="task-check-form">${answerHtml}<button type="submit">Sprawdź</button></form>
                    <div class="result-box-container"></div>
                </div>`;
        }).join('');
        container.innerHTML += tasksHtml;
        container.addEventListener('submit', handleScrollableTaskCheck);
    }

    function handleScrollableTaskCheck(e) {
        if (!e.target.classList.contains('task-check-form')) return;
        e.preventDefault();

        const form = e.target;
        const taskContainer = form.closest('.task-container');
        const resultContainer = taskContainer.querySelector('.result-box-container');
        const taskId = parseInt(taskContainer.dataset.taskId, 10);
        const task = appState.allTasksCache.find(t => t.id === taskId);
        if (!task) return;

        form.querySelector('button[type="submit"]').disabled = true;

        if (task.type === 'zamkniete') {
            const selected = form.querySelector(`input[name="answer-${task.id}"]:checked`);
            if (!selected) {
                alert('Wybierz odpowiedź!');
                form.querySelector('button[type="submit"]').disabled = false;
                return;
            }
            const isCorrect = selected.value.trim().toLowerCase() === task.odpowiedz.trim().toLowerCase();
            resultContainer.innerHTML = isCorrect ? `<div class="result-box correct">🎉 Dobrze!</div>` : `<div class="result-box incorrect">Błąd. Poprawna odpowiedź: <strong>${task.odpowiedz}</strong></div>`;
        } else { // otwarte
            const userAnswer = form.querySelector('textarea').value;
            if (!userAnswer) {
                alert('Wpisz odpowiedź!');
                form.querySelector('button[type="submit"]').disabled = false;
                return;
            }
            resultContainer.innerHTML = `<div class="result-box">
                    <p><strong>Twoja odpowiedź:</strong></p><pre class="user-answer-box">${userAnswer}</pre>
                    <p><strong>Poprawna odpowiedź:</strong></p><pre class="correct-answer-box">${task.odpowiedz}</pre>
                </div>`;
        }
    }

    async function renderStatsView() {
        mainContent.innerHTML = '<h1>Arkusz Osiągnięć</h1><p>Ładowanie danych...</p>';
        const stats = await api.request('/stats');
        if (!stats) {
            mainContent.innerHTML = '<h1>Arkusz Osiągnięć</h1><p>Nie udało się załadować statystyk.</p>';
            return;
        }

        const { generalStats, typeStats, solvedExams } = stats;
        const openTotal = (typeStats.otwarte?.correct || 0) + (typeStats.otwarte?.wrong || 0);
        const openPercentage = openTotal > 0 ? (((typeStats.otwarte?.correct || 0) / openTotal) * 100).toFixed(0) : 0;
        const closedTotal = (typeStats.zamkniete?.correct || 0) + (typeStats.zamkniete?.wrong || 0);
        const closedPercentage = closedTotal > 0 ? (((typeStats.zamkniete?.correct || 0) / closedTotal) * 100).toFixed(0) : 0;
        
        let statsHtml = `
            <div class="stats-container">
                <div class="stats-section">
                    <h2>Ogólne Statystyki</h2>
                    <div class="stats-grid three-cols">
                        <div class="stat-card"><h3>Rozwiązane</h3><div class="value">${generalStats.total_solved || 0}</div></div>
                        <div class="stat-card"><h3>Poprawne</h3><div class="value green">${generalStats.total_correct || 0}</div></div>
                        <div class="stat-card"><h3>Błędne</h3><div class="value red">${generalStats.total_wrong || 0}</div></div>
                    </div>
                     <div class="stats-grid two-cols" style="margin-top: 20px;">
                        <div class="stat-card"><h3>Średnia z Egzaminów</h3><div class="percentage">${(generalStats.averageScore || 0).toFixed(0)}%</div></div>
                        <div class="stat-card"><h3>Najlepszy Wynik</h3><div class="percentage">${(generalStats.highestScore || 0).toFixed(0)}%</div></div>
                    </div>
                    ${(generalStats.total_wrong || 0) > 0 ? `<button id="practice-incorrect-btn" class="practice-btn">Poćwicz zadania, w których popełniasz błędy!</button>` : ''}
                </div>
                <div class="stats-section">
                    <h2>Skuteczność wg typu</h2>
                    <div class="stats-grid two-cols">
                        <div class="stat-card"><h3>Otwarte</h3><div class="percentage">${openPercentage}%</div><div class="details">(${(typeStats.otwarte?.correct || 0)}/${openTotal})</div></div>
                        <div class="stat-card"><h3>Zamknięte</h3><div class="percentage">${closedPercentage}%</div><div class="details">(${(typeStats.zamkniete?.correct || 0)}/${closedTotal})</div></div>
                    </div>
                </div>
                <div class="stats-section">
                    <h2>Rozwiązane Egzaminy</h2>
                    <div class="content-box">
                        ${solvedExams.length ? `<ul class="item-list">${solvedExams.map(exam => `<li class="list-item"><span><strong>${exam.exam_name}</strong></span><span>${exam.correct}/${exam.total} (<strong>${exam.percent.toFixed(0)}%</strong>)</span></li>`).join('')}</ul>` : '<p>Brak rozwiązanych egzaminów.</p>'}
                    </div>
                </div>
            </div>`;
        
        mainContent.innerHTML = `<h1>Arkusz Osiągnięć</h1>${statsHtml}`;
        
        const practiceBtn = document.getElementById('practice-incorrect-btn');
        if (practiceBtn) {
            practiceBtn.addEventListener('click', () => renderPracticeIncorrectTaskView());
        }
    }

    // --- ADMIN VIEWS ---
    // Tutaj znajdują się funkcje admina, które pozostają bez zmian.

    // --- TRYB GIER ---
    
async function renderGamesView() {
    mainContent.querySelector('.games-content').innerHTML = `
        <div class="games-mobile-toggles">
            <button class="mobile-toggle" data-target="#player-stats-panel-content">Statystyki <span>▼</span></button>
            <button class="mobile-toggle" data-target="#leaderboard-section-content">Liderzy <span>▼</span></button>
        </div>

        <aside id="player-stats-panel" class="games-player-stats-panel">
            <div id="player-stats-panel-content" class="collapsible-content">Ładowanie statystyk gracza...</div>
        </aside>

        <div class="games-main-section">
            <div class="games-main-buttons">
                <button data-task-type="zamkniete">Zadania Zamknięte</button>
                <button data-task-type="otwarte">Zadania Otwarte</button>
                <button data-task-type="wszystkie">Tryb Mieszany</button>
                <button data-action="show-exams">Egzaminy</button>
                <button id="exit-games-mode-btn">Wyjdź z Trybu Gier</button>
            </div>
        </div>

        <aside class="games-leaderboard-section">
            <div id="leaderboard-section-content" class="collapsible-content">
                <div id="leaderboard-container">
                    <h2>Najlepsi Gracze</h2>
                    <div id="leaderboard-table-container"><p>Ładowanie...</p></div>
                </div>
                <div id="stats-view-container" class="hidden">
                    <h2>Statystyki Liderów</h2>
                    <div id="stats-table-container"><p>Ładowanie...</p></div>
                </div>
                <button id="toggle-stats-btn" class="games-stats-btn">Statystyki Liderów</button>
            </div>
        </aside>`;

    // Logika przycisków głównych
    document.querySelector('.games-main-buttons').addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        if (button.dataset.taskType) renderGamesTaskView(button.dataset.taskType);
        else if (button.dataset.action === 'show-exams') navigateTo('games-exams');
        else if (button.id === 'exit-games-mode-btn') navigateTo('wszystkie');
    });

    // NOWA LOGIKA: Obsługa rozwijania/zwijania paneli za pomocą mniejszych przycisków
    mainContent.querySelector('.games-content').addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.mobile-toggle');
        if (!toggleBtn) return;

        const targetId = toggleBtn.dataset.target;
        const targetPanel = document.querySelector(targetId);
        const arrow = toggleBtn.querySelector('span');

        if (targetPanel) {
            const isExpanded = targetPanel.classList.toggle('expanded');
            arrow.textContent = isExpanded ? '▲' : '▼';
        }
    });

    // Ładowanie statystyk gracza (lewa strona)
    const playerStatsContainer = document.getElementById('player-stats-panel-content');
    const playerStats = await api.request('/games/player-card-stats');
    if (playerStats) {
        const effectivenessHtml = playerStats.effectiveness.map(eff => `
            <div class="stat-item"><span>Skuteczność (${eff.type})</span><span class="value">${eff.percentage}%</span></div>
        `).join('');
        playerStatsContainer.innerHTML = `
            <h2>Statystyki Gracza</h2>
            <h3>${playerStats.name}</h3>
            <div class="stat-item"><span>Punkty Ogółem</span><span class="value">${playerStats.totalPoints}</span></div>
            <div class="stat-item"><span>Punkty (zamknięte)</span><span class="value">${playerStats.closedPoints}</span></div>
            <div class="stat-item"><span>Punkty (otwarte)</span><span class="value">${playerStats.openPoints}</span></div>
            <div class="stat-item"><span>Rozw. zamknięte</span><span class="value">${playerStats.solvedClosedTotal}</span></div>
            <div class="stat-item"><span>Rozw. otwarte</span><span class="value">${playerStats.solvedOpenTotal}</span></div>
            <div class="stat-item"><span>Średnia z Egzaminów</span><span class="value">${playerStats.avgExamPercent}%</span></div>
            ${effectivenessHtml}
        `;
    } else {
        playerStatsContainer.innerHTML = '<h2>Statystyki</h2><p>Błąd ładowania statystyk.</p>';
    }

    // Logika liderów (prawa strona)
    const renderLeaderboard = (data, type) => {
        if (!data || data.length === 0) return '<p>Brak danych.</p>';
        let tableHtml = '<table><thead><tr><th>#</th><th>Gracz</th>';
        if (type === 'exams') {
            tableHtml += '<th>Wynik %</th></tr></thead><tbody>' + data.map((row, i) => `<tr><td>${i+1}</td><td>${row.user}</td><td>${(row.avg_percent || 0).toFixed(0)}%</td></tr>`).join('');
        } else {
            tableHtml += '<th>Punkty</th></tr></thead><tbody>' + data.map((row, i) => `<tr><td>${i+1}</td><td>${row.user}</td><td>${row.total_points}</td></tr>`).join('');
        }
        return tableHtml + '</tbody></table>';
    };

    document.getElementById('leaderboard-table-container').innerHTML = renderLeaderboard(await api.request('/games/leaderboard?type=all'), 'all');
    
    const toggleBtn = document.getElementById('toggle-stats-btn');
    toggleBtn.addEventListener('click', async () => {
        const isStatsView = !document.getElementById('leaderboard-container').classList.toggle('hidden');
        document.getElementById('stats-view-container').classList.toggle('hidden', !isStatsView);
        
        if (isStatsView) {
            toggleBtn.textContent = 'Powrót do Rankingu';
            const [closed, open, exams] = await Promise.all([
                api.request('/games/leaderboard?type=closed'), api.request('/games/leaderboard?type=open'), api.request('/games/leaderboard?type=exams')
            ]);
            document.getElementById('stats-table-container').innerHTML = `
                <h3>Tylko Zamknięte</h3>${renderLeaderboard(closed, 'closed')}
                <h3>Tylko Otwarte</h3>${renderLeaderboard(open, 'open')}
                <h3>Procent z Egzaminów</h3>${renderLeaderboard(exams, 'exams')}`;
        } else {
            toggleBtn.textContent = 'Statystyki Liderów';
        }
    });
}

    async function renderGamesExamsList() {
        mainContent.querySelector('.games-content').innerHTML = `
            <div class="games-task-box">
                <button class="games-back-button">‹ Wróć</button>
                <h2>Wybierz Egzamin</h2>
                <div id="games-exams-container">Ładowanie...</div>
            </div>`;
        document.querySelector('.games-back-button').addEventListener('click', () => navigateTo('games'));

        const exams = await api.request('/exams');
        const container = document.getElementById('games-exams-container');
        if (exams && exams.length) {
            // Skopiowana logika sortowania
            const monthMap = { styczeń: 1, stycznia: 1, luty: 2, lutego: 2, marzec: 3, marca: 3, kwiecień: 4, kwietnia: 4, maj: 5, maja: 5, czerwiec: 6, czerwca: 6, lipiec: 7, lipca: 7, sierpień: 8, sierpnia: 8, wrzesień: 9, września: 9, październik: 10, października: 10, listopad: 11, listopada: 11, grudzień: 12, grudnia: 12 };
            const monthRegex = new RegExp(Object.keys(monthMap).join('|'), 'i');
            exams.sort((a, b) => {
                const yearA = a.name.match(/\b(\d{4})\b/); const yearB = b.name.match(/\b(\d{4})\b/);
                const monthA = a.name.match(monthRegex); const monthB = b.name.match(monthRegex);
                const yearNumA = yearA ? parseInt(yearA[1], 10) : 0; const yearNumB = yearB ? parseInt(yearB[1], 10) : 0;
                const monthNumA = monthA ? monthMap[monthA[0].toLowerCase()] : 0; const monthNumB = monthB ? monthMap[monthB[0].toLowerCase()] : 0;
                if (yearNumA !== yearNumB) return yearNumB - yearNumA;
                return monthNumB - monthNumA;
            });
            
            container.innerHTML = `<ul class="games-exams-list">${exams.map(exam => `<li><button class="games-exam-item" data-exam-id="${exam.id}" data-exam-name="${exam.name}">${exam.name}</button></li>`).join('')}</ul>`;
            container.querySelectorAll('.games-exam-item').forEach(btn => btn.addEventListener('click', e => {
                const { examId, examName } = e.target.dataset;
                renderExamStartScreen(examId, examName, 'dark');
            }));
        } else {
            container.innerHTML = '<p>Brak dostępnych egzaminów.</p>';
        }
    }


    async function renderGamesTaskView(type) {
        const contentArea = mainContent.querySelector('.games-content');
        contentArea.innerHTML = `<div class="games-task-box"><p>Ładowanie zadania...</p></div>`;

        const task = await api.request(`/tasks/random?type=${type}&mode=games`);
        appState.currentTask = task; 
        
        if (!task) {
            contentArea.innerHTML = `<div class="games-task-box">
                <h2>Gratulacje! 🎉</h2>
                <p>Rozwiązałeś wszystkie dostępne zadania w tym trybie.</p>
                <button class="games-task-button" id="back-to-menu-btn">Wróć do menu</button>
            </div>`;
            document.getElementById('back-to-menu-btn').addEventListener('click', () => navigateTo('games'));
            return;
        }

        let answerHtml = '';
        if (task.type === 'zamkniete') {
            answerHtml = `<div class="task-options games-task-options">${task.opcje.map(opt => `<label><input type="radio" name="answer" value="${opt}"> ${opt}</label>`).join('')}</div>`;
        } else {
            answerHtml = `<textarea id="open-answer" class="games-task-textarea" rows="4" placeholder="Wpisz swoją odpowiedź..."></textarea>`;
        }

        contentArea.innerHTML = `<div class="games-task-box">
             <button class="games-back-button">‹ Wróć</button>
            <p class="task-header">Zadanie #${task.id} (${task.punkty} pkt.)</p>
            <img src="${task.tresc}" alt="Treść zadania" class="task-image">
            <form id="task-form">${answerHtml}<button type="submit" class="games-task-button">Sprawdź</button></form>
            <div id="result-box" class="games-result-box"></div>
        </div>`;
        document.querySelector('.games-back-button').addEventListener('click', () => navigateTo('games'));
        document.getElementById('task-form').addEventListener('submit', e => { e.preventDefault(); handleGamesAnswerCheck(type); });
    }

    function handleGamesAnswerCheck(originalType) {
        const task = appState.currentTask;
        if (task.type === 'zamkniete') {
            const selected = document.querySelector('input[name="answer"]:checked');
            if (!selected) { alert('Wybierz odpowiedź!'); return; }
            const isCorrect = selected.value.trim().toLowerCase() === task.odpowiedz.trim().toLowerCase();
            showGamesResult(isCorrect, task.odpowiedz, originalType);
            // ZMIANA: Wyślij liczbę zdobytych punktów (1 lub 0)
            api.request('/solved', 'POST', { taskId: task.id, isCorrect, mode: 'games', earnedPoints: isCorrect ? 1 : 0 });
        } else {
            const userAnswer = document.getElementById('open-answer').value;
            if (!userAnswer) { alert('Wpisz odpowiedź!'); return; }
            document.querySelector('#task-form button[type="submit"]').disabled = true;
            document.getElementById('result-box').innerHTML = `
                <div class="result-box">
                    <p><strong>Twoja odpowiedź:</strong></p><pre class="user-answer-box">${userAnswer}</pre>
                    <p><strong>Poprawna odpowiedź:</strong></p><pre class="correct-answer-box">${task.odpowiedz}</pre>
                    <p>Oceń swoją odpowiedź (0 - ${task.punkty} pkt):</p>
                    <form id="self-assess-form">
                        <input type="number" id="self-assess-points" min="0" max="${task.punkty}" value="0" style="width:100px;margin-right:10px;color:#000;">
                        <button type="submit" class="games-task-button">Oceń</button>
                    </form>
                </div>`;
            document.getElementById('self-assess-form').addEventListener('submit', ev => {
                ev.preventDefault();
                const points = parseInt(document.getElementById('self-assess-points').value, 10);
                if (isNaN(points) || points < 0 || points > task.punkty) {
                    alert(`Wpisz poprawną liczbę punktów (od 0 do ${task.punkty}).`);
                    return;
                }
                const isCorrect = (points === task.punkty);
                // ZMIANA: Wyślij dokładnie tyle punktów, ile przyznał sobie użytkownik
                api.request('/solved', 'POST', { taskId: task.id, isCorrect, mode: 'games', earnedPoints: points });
                showGamesResult(true, null, originalType, true);
            });
        }
    }

    function showGamesResult(isCorrect, correctAnswer, originalType, isSelfAssessed = false) {
        const resultBox = document.getElementById('result-box');
        if (document.querySelector('#task-form button[type="submit"]')) {
            document.querySelector('#task-form button[type="submit"]').disabled = true;
        }
        if (isSelfAssessed) {
            resultBox.innerHTML = `<div class="result-box correct">Dziękujemy za ocenę!</div>`;
        } else {
            resultBox.innerHTML = isCorrect ? `<div class="result-box correct">🎉 Dobrze!</div>` : `<div class="result-box incorrect">Błąd. Poprawna to: <strong>${correctAnswer}</strong></div>`;
        }
        resultBox.innerHTML += `<button class="games-task-button" id="next-task-btn">Następne zadanie</button>`;
        document.getElementById('next-task-btn').addEventListener('click', () => renderGamesTaskView(originalType));
    }

    function setupFooterToggle() {
        const helpButton = document.getElementById('help-button');
        const footerContent = document.getElementById('footer-content');
        const collapseButton = document.getElementById('collapse-footer-btn');
        if (helpButton && footerContent && collapseButton) {
            helpButton.addEventListener('click', () => {
                helpButton.classList.add('hidden');
                footerContent.classList.remove('hidden');
            });
            collapseButton.addEventListener('click', () => {
                footerContent.classList.add('hidden');
                helpButton.classList.remove('hidden');
            });
        }
    }

    init();
});