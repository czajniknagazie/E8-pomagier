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

    // NOWA FUNKCJA do przełączania widoków logowania
    function toggleLoginView(viewName) {
        document.getElementById('student-login-view').classList.add('hidden');
        document.getElementById('student-register-view').classList.add('hidden');
        document.getElementById('admin-login-view').classList.add('hidden');
        
        const viewToShow = document.getElementById(viewName);
        if (viewToShow) {
            viewToShow.classList.remove('hidden');
        } else {
            // Domyślnie pokaż logowanie studenta, jeśli coś pójdzie nie tak
            document.getElementById('student-login-view').classList.remove('hidden');
        }
    }

    // ZMODYFIKOWANA FUNKCJA
    function setupLoginListeners() {
        document.getElementById('student-login-form').addEventListener('submit', handleStudentLogin);
        document.getElementById('student-register-form').addEventListener('submit', handleStudentRegister); // NOWE
        document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
        
        // Przełączniki
        document.getElementById('show-admin-login').addEventListener('click', () => toggleLoginView('admin-login-view'));
        document.getElementById('show-student-login').addEventListener('click', () => toggleLoginView('student-login-view'));
        
        // NOWE przełączniki
        document.getElementById('show-register-view').addEventListener('click', () => toggleLoginView('student-register-view'));
        document.getElementById('show-login-view-from-register').addEventListener('click', () => toggleLoginView('student-login-view'));
        document.getElementById('show-admin-login-from-register').addEventListener('click', () => toggleLoginView('admin-login-view'));
    }

    // ZMODYFIKOWANA FUNKCJA
    async function handleStudentLogin(e) {
        e.preventDefault();
        const name = document.getElementById('student-name').value;
        const password = document.getElementById('student-password').value; // NOWE
        const rememberMe = document.getElementById('student-remember-me').checked; // NOWE
        // ZMIENIONY request API
        const data = await api.request('/login-student', 'POST', { name, password }); 
        if (data) {
            login(data, rememberMe); // ZMIANA
        }
    }

    // NOWA FUNKCJA
    async function handleStudentRegister(e) {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const password = document.getElementById('register-password').value;
        if (!name || !password) {
            alert('Nazwa i hasło są wymagane.');
            return;
        }
        
        try {
            // Używamy try...catch, aby obsłużyć błędy z api.request
            const data = await api.request('/register-student', 'POST', { name, password });
            if (data && data.success) {
                alert('Rejestracja pomyślna! Teraz możesz się zalogować.');
                toggleLoginView('student-login-view');
                document.getElementById('student-name').value = name; // Wypełnij nazwę
                document.getElementById('student-password').value = ''; // Wyczyść hasło
            }
        } catch (err) {
            // Błąd (np. "użytkownik już istnieje") zostanie wyświetlony przez globalny handler w api.request
            console.error("Błąd rejestracji:", err);
        }
    }
    
    // ZMODYFIKOWANA FUNKCJA
    async function handleAdminLogin(e) {
        e.preventDefault();
        const name = document.getElementById('admin-name').value;
        const code = document.getElementById('admin-code').value;
        const rememberMe = document.getElementById('admin-remember-me').checked; // NOWE
        // UWAGA: Logika logowania admina również powinna zostać zaktualizowana na serwerze,
        // aby korzystać z bazy danych, tak jak w pliku backend_setup.js
        const data = await api.request('/admin/login', 'POST', { name, code }); 
        if (data) {
            login(data, rememberMe); // ZMIANA
        }
    }

    // ZMODYFIKOWANA FUNKCJA
    function login(data, rememberMe = true) {
        appState.token = data.token;
        appState.user = { name: data.name, role: data.role };
        
        // ZMIANA: Warunkowe zapisywanie w localStorage
        if (rememberMe) {
            localStorage.setItem('e8-token', data.token);
            localStorage.setItem('e8-user', JSON.stringify(appState.user));
        } else {
            localStorage.removeItem('e8-token');
            localStorage.removeItem('e8-user');
        }
        
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

    // ZMODYFIKOWANA FUNKCJA
    function showApp() {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.getElementById('zalogowany-jako').textContent = `Zalogowano jako: ${appState.user.name}`;
        
        // NOWE: Dodanie listenera dla wylogowania
        document.getElementById('logout-btn').addEventListener('click', logout);
        
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
let adminTasksSearchTerm = ''; // Zmienna do przechowywania aktualnego wyszukiwania

async function renderAdminTasks() {
    mainContent.innerHTML = `
        <h1>Zarządzaj Zadami</h1>
        <div class="admin-controls">
            <input type="text" id="admin-task-search" placeholder="Szukaj ID, treści, arkusza..." value="${adminTasksSearchTerm}">
            <button id="admin-task-search-btn">Szukaj</button>
            <button id="admin-task-reset-btn">Resetuj</button>
            <button id="add-task-btn" class="primary-btn">Dodaj Zadanie</button>
        </div>
        <div id="admin-tasks-list">Ładowanie zadań...</div>
    `;

    // Obsługa wyszukiwania
    document.getElementById('admin-task-search-btn').addEventListener('click', () => {
        adminTasksSearchTerm = document.getElementById('admin-task-search').value;
        renderAdminTasksList();
    });
    document.getElementById('admin-task-reset-btn').addEventListener('click', () => {
        adminTasksSearchTerm = '';
        document.getElementById('admin-task-search').value = '';
        renderAdminTasksList();
    });
    document.getElementById('admin-task-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            adminTasksSearchTerm = document.getElementById('admin-task-search').value;
            renderAdminTasksList();
        }
    });

    document.getElementById('add-task-btn').addEventListener('click', () => renderAdminEditTask(null));

    renderAdminTasksList();
}

async function renderAdminTasksList() {
    const listContainer = document.getElementById('admin-tasks-list');
    if (!listContainer) return;
    listContainer.innerHTML = 'Ładowanie...';

    // Pobierz tylko 50 zadań, aby uniknąć przeciążenia
    const tasks = await api.request(`/tasks?search=${adminTasksSearchTerm}&limit=50`); 
    
    if (tasks && tasks.length) {
        let tasksHtml = `<ul class="admin-item-list">`;
        tasksHtml += tasks.map(task => `
            <li class="admin-list-item">
                <span>ID: ${task.id} (${task.punkty} pkt) | Typ: ${task.type} | Arkusz: ${task.arkusz}</span>
                <div class="admin-actions">
                    <button class="edit-task-btn" data-task-id="${task.id}">Edytuj</button>
                    <button class="delete-task-btn danger-btn" data-task-id="${task.id}">Usuń</button>
                </div>
            </li>
        `).join('');
        tasksHtml += `</ul>`;
        listContainer.innerHTML = tasksHtml;

        document.querySelectorAll('.edit-task-btn').forEach(btn => 
            btn.addEventListener('click', (e) => navigateTo('admin-edytuj-zadanie', e.target.dataset.taskId))
        );
        document.querySelectorAll('.delete-task-btn').forEach(btn => 
            btn.addEventListener('click', (e) => handleDeleteTask(e.target.dataset.taskId))
        );
    } else {
        listContainer.innerHTML = `<p>Brak zadań pasujących do kryteriów. ${adminTasksSearchTerm ? 'Wyszukaj inne frazy.' : ''}</p>`;
    }
}

async function handleDeleteTask(taskId) {
    if (!confirm(`Czy na pewno chcesz usunąć zadanie o ID: ${taskId}? Ta operacja jest nieodwracalna.`)) {
        return;
    }
    const result = await api.request(`/tasks/${taskId}`, 'DELETE');
    if (result) {
        alert('Zadanie usunięte pomyślnie!');
        renderAdminTasks();
    }
}

async function renderAdminEditTask(taskId) {
    let task = null;
    let isNew = !taskId;
    
    if (!isNew) {
        task = await api.request(`/tasks/${taskId}`);
        if (!task) {
            alert('Nie udało się załadować zadania do edycji.');
            navigateTo('admin-zadania');
            return;
        }
    }
    
    mainContent.innerHTML = `
        <h1>${isNew ? 'Dodaj Nowe Zadanie' : `Edytuj Zadanie #${taskId}`}</h1>
        <form id="admin-task-form" class="admin-form">
            <label for="task-type">Typ zadania:</label>
            <select id="task-type" required>
                <option value="zamkniete" ${task?.type === 'zamkniete' ? 'selected' : ''}>Zamknięte</option>
                <option value="otwarte" ${task?.type === 'otwarte' ? 'selected' : ''}>Otwarte</option>
            </select>

            <label for="task-punkty">Punkty (max):</label>
            <input type="number" id="task-punkty" value="${task?.punkty || 1}" min="1" required>

            <label for="task-arkusz">Arkusz (np. Maj 2024):</label>
            <input type="text" id="task-arkusz" value="${task?.arkusz || ''}" required>
            
            <label for="task-tresc-url">URL Treści (Obraz):</label>
            <input type="text" id="task-tresc-url" value="${task?.tresc || ''}" placeholder="Pełny URL do obrazu" required>

            <label for="task-odpowiedz">Poprawna Odpowiedź (lub URL do odpowiedzi):</label>
            <textarea id="task-odpowiedz" rows="3" required>${task?.odpowiedz || ''}</textarea>

            <div id="opcje-container" style="${task?.type === 'otwarte' ? 'display: none;' : ''}">
                <label for="task-opcje">Opcje (rozdziel przecinkami - tylko dla zamkniętych):</label>
                <textarea id="task-opcje" rows="3">${task?.opcje?.join(', ') || ''}</textarea>
            </div>
            
            <label>Przesyłanie plików:</label>
            <input type="file" id="task-files" multiple>
            <button type="button" id="upload-files-btn">Wgraj pliki i uzupełnij pola</button>
            <div id="upload-status" style="margin-top: 10px;"></div>

            <button type="submit" class="primary-btn">${isNew ? 'Dodaj Zadanie' : 'Zapisz Zmiany'}</button>
            <button type="button" onclick="navigateTo('admin-zadania')" class="secondary-btn">Anuluj</button>
        </form>
    `;

    document.getElementById('task-type').addEventListener('change', (e) => {
        document.getElementById('opcje-container').style.display = e.target.value === 'zamkniete' ? 'block' : 'none';
        document.getElementById('task-punkty').value = e.target.value === 'zamkniete' ? 1 : (task?.punkty || 3);
    });
    
    // Obsługa przesyłania plików
    document.getElementById('upload-files-btn').addEventListener('click', async () => {
        const filesInput = document.getElementById('task-files');
        const statusDiv = document.getElementById('upload-status');
        if (filesInput.files.length === 0) {
            alert('Wybierz pliki do wgrania.');
            return;
        }
        
        statusDiv.innerHTML = 'Wgrywanie...';
        const result = await api.upload(filesInput.files);

        if (result && result.files && result.files.length > 0) {
            statusDiv.innerHTML = 'Wgrano pomyślnie. Wypełniam pola...';
            
            // Przyjmujemy, że pierwszy wgrany plik to treść zadania (URL treści)
            document.getElementById('task-tresc-url').value = result.files[0];
            
            // Jeśli wgrano dwa pliki, drugi to odpowiedź
            if (result.files.length > 1) {
                document.getElementById('task-odpowiedz').value = result.files[1];
            }
        } else {
            statusDiv.innerHTML = 'Błąd przesyłania plików.';
        }
    });


    // Obsługa formularza (dodanie/edycja)
    document.getElementById('admin-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            type: document.getElementById('task-type').value,
            punkty: parseInt(document.getElementById('task-punkty').value, 10),
            arkusz: document.getElementById('task-arkusz').value,
            tresc: document.getElementById('task-tresc-url').value,
            odpowiedz: document.getElementById('task-odpowiedz').value,
        };

        if (data.type === 'zamkniete') {
            const opcje = document.getElementById('task-opcje').value.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (opcje.length < 2) {
                alert('Dla zadania zamkniętego wymagane są co najmniej dwie opcje!');
                return;
            }
            data.opcje = opcje;
            // Dla zadań zamkniętych punkty zawsze powinny wynosić 1
            data.punkty = 1; 
        }

        const endpoint = isNew ? '/tasks' : `/tasks/${taskId}`;
        const method = isNew ? 'POST' : 'PUT';
        
        const result = await api.request(endpoint, method, data);

        if (result) {
            alert(isNew ? 'Zadanie dodane pomyślnie!' : 'Zadanie zaktualizowane pomyślnie!');
            navigateTo('admin-zadania');
        }
    });
}

// ----------------------------------------------------------------------
// ZARZĄDZANIE EGZAMINAMI
// ----------------------------------------------------------------------

async function renderAdminExams() {
    mainContent.innerHTML = `
        <h1>Zarządzaj Egzaminami</h1>
        <div class="admin-controls">
            <button id="add-exam-btn" class="primary-btn">Dodaj Egzamin</button>
        </div>
        <div id="admin-exams-list">Ładowanie egzaminów...</div>
    `;

    document.getElementById('add-exam-btn').addEventListener('click', () => renderAdminEditExam(null));
    
    const listContainer = document.getElementById('admin-exams-list');
    const exams = await api.request('/exams'); 
    
    if (exams && exams.length) {
        let examsHtml = `<ul class="admin-item-list">`;
        examsHtml += exams.map(exam => `
            <li class="admin-list-item">
                <span>ID: ${exam.id} | Nazwa: ${exam.name} | Liczba zadań: ${JSON.parse(exam.taskIds).length}</span>
                <div class="admin-actions">
                    <button class="edit-exam-btn" data-exam-id="${exam.id}">Edytuj</button>
                    <button class="delete-exam-btn danger-btn" data-exam-id="${exam.id}">Usuń</button>
                </div>
            </li>
        `).join('');
        examsHtml += `</ul>`;
        listContainer.innerHTML = examsHtml;

        document.querySelectorAll('.edit-exam-btn').forEach(btn => 
            btn.addEventListener('click', (e) => renderAdminEditExam(e.target.dataset.examId))
        );
        document.querySelectorAll('.delete-exam-btn').forEach(btn => 
            btn.addEventListener('click', (e) => handleDeleteExam(e.target.dataset.examId))
        );
    } else {
        listContainer.innerHTML = `<p>Brak dostępnych egzaminów.</p>`;
    }
}

async function handleDeleteExam(examId) {
    if (!confirm(`Czy na pewno chcesz usunąć egzamin o ID: ${examId}? Ta operacja jest nieodwracalna.`)) {
        return;
    }
    const result = await api.request(`/exams/${examId}`, 'DELETE');
    if (result) {
        alert('Egzamin usunięty pomyślnie!');
        renderAdminExams();
    }
}

async function renderAdminEditExam(examId) {
    let exam = null;
    let isNew = !examId;

    if (!isNew) {
        exam = await api.request(`/exams/${examId}`);
        if (!exam) {
            alert('Nie udało się załadować egzaminu do edycji.');
            navigateTo('admin-egzaminy');
            return;
        }
    }

    // Wyświetl widok edycji
    mainContent.innerHTML = `
        <h1>${isNew ? 'Dodaj Nowy Egzamin' : `Edytuj Egzamin #${examId}`}</h1>
        <form id="admin-exam-form" class="admin-form">
            <label for="exam-name">Nazwa egzaminu:</label>
            <input type="text" id="exam-name" value="${exam?.name || ''}" required>

            <label for="exam-taskIds">Lista ID zadań (format JSON Array, np. [1, 5, 20]):</label>
            <textarea id="exam-taskIds" rows="10" required>${exam?.taskIds || ''}</textarea>

            <button type="submit" class="primary-btn">${isNew ? 'Dodaj Egzamin' : 'Zapisz Zmiany'}</button>
            <button type="button" onclick="navigateTo('admin-egzaminy')" class="secondary-btn">Anuluj</button>
        </form>
    `;
    
    document.getElementById('admin-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            name: document.getElementById('exam-name').value,
            taskIds: document.getElementById('exam-taskIds').value // Wysłane jako string
        };

        // Podstawowa walidacja JSON Array
        try {
            const parsedIds = JSON.parse(data.taskIds);
            if (!Array.isArray(parsedIds) || parsedIds.some(id => typeof id !== 'number' || id <= 0)) {
                throw new Error("Elementy nie są liczbami lub są niepoprawne.");
            }
        } catch (error) {
            alert("Błąd walidacji listy ID zadań. Upewnij się, że format to [1, 5, 20] i zawiera tylko liczby.");
            return;
        }


        const endpoint = isNew ? '/exams' : `/exams/${examId}`;
        const method = isNew ? 'POST' : 'PUT';
        
        const result = await api.request(endpoint, method, data);

        if (result) {
            alert(isNew ? 'Egzamin dodany pomyślnie!' : 'Egzamin zaktualizowany pomyślnie!');
            navigateTo('admin-egzaminy');
        }
    });
}

    // --- TRYB GIER ---
    
async function renderGamesView() {
    mainContent.querySelector('.games-content').innerHTML = `
        <button id="stats-toggle" class="mobile-icon-toggle" data-target="#player-stats-panel-content">📊<span>▼</span></button>
        <button id="leaderboard-toggle" class="mobile-icon-toggle" data-target="#leaderboard-section-content">🏆<span>▼</span></button>

        <aside id="player-stats-panel" class="games-player-stats-panel">
            <div id="player-stats-panel-content" class="collapsible-content">
                <div class="panel-inner-content">Ładowanie statystyk gracza...</div>
            </div>
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
                <div class="panel-inner-content">
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
            </div>
        </aside>`;

    // Logika przycisków głównych (bez zmian)
    document.querySelector('.games-main-buttons').addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        if (button.dataset.taskType) renderGamesTaskView(button.dataset.taskType);
        else if (button.dataset.action === 'show-exams') navigateTo('games-exams');
        else if (button.id === 'exit-games-mode-btn') navigateTo('wszystkie');
    });

    // NOWA, ULEPSZONA LOGIKA DLA PEŁNOEKRANOWYCH PANELI
    const gamesContent = mainContent.querySelector('.games-content');
    const toggles = gamesContent.querySelectorAll('.mobile-icon-toggle');
    const panels = gamesContent.querySelectorAll('.collapsible-content');

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.dataset.target;
            const targetPanel = gamesContent.querySelector(targetId);

            // Jeśli kliknięty panel jest już otwarty, zamknij go
            if (targetPanel.classList.contains('expanded')) {
                targetPanel.classList.remove('expanded');
                gamesContent.classList.remove('panel-is-open');
                toggle.querySelector('span').textContent = '▼';
            } else {
                // Jeśli otwierasz nowy panel, najpierw zamknij wszystkie inne
                panels.forEach(p => p.classList.remove('expanded'));
                toggles.forEach(t => t.querySelector('span').textContent = '▼');

                // Teraz otwórz docelowy panel
                targetPanel.classList.add('expanded');
                gamesContent.classList.add('panel-is-open');
                toggle.querySelector('span').textContent = '▲';
            }
        });
    });

    // Ładowanie statystyk gracza (bez zmian, ale celuje w nową strukturę)
    const playerStatsContainer = mainContent.querySelector('#player-stats-panel-content .panel-inner-content');
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

    // Logika liderów (bez zmian, ale celuje w nową strukturę)
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

    mainContent.querySelector('#leaderboard-table-container').innerHTML = renderLeaderboard(await api.request('/games/leaderboard?type=all'), 'all');
    
    const toggleBtn = mainContent.querySelector('#toggle-stats-btn');
    toggleBtn.addEventListener('click', async () => {
        const isStatsView = !mainContent.querySelector('#leaderboard-container').classList.toggle('hidden');
        mainContent.querySelector('#stats-view-container').classList.toggle('hidden', !isStatsView);
        
        if (isStatsView) {
            toggleBtn.textContent = 'Powrót do Rankingu';
            const [closed, open, exams] = await Promise.all([
                api.request('/games/leaderboard?type=closed'), api.request('/games/leaderboard?type=open'), api.request('/games/leaderboard?type=exams')
            ]);
            mainContent.querySelector('#stats-table-container').innerHTML = `
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