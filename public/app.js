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
            case 'wrong-answers':
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
            case 'exam-self-assess':
                renderExamSelfAssessment();
                break;
        }
    }

    // --- STUDENT VIEWS ---
    
    // Random Task Mode
    async function renderRandomTaskView(type) {
        const typeName = { 
            wszystkie: 'Wszystkie zadania', 
            zamkniete: 'Zadania zamknięte', 
            otwarte: 'Zadania otwarte',
            'wrong-answers': 'Powtórka błędnych zadań'
        }[type];
        mainContent.innerHTML = `<h1>${typeName}</h1>`;
        
        const endpoint = type === 'wrong-answers' ? `/tasks/random?mode=wrong` : `/tasks/random?type=${type}`;
        const task = await api.request(endpoint);
        appState.currentTask = task;

        if (!task) {
            mainContent.innerHTML += `
                <div class="content-box">
                    <p><strong>Gratulacje! 🎉</strong></p>
                    <p>Rozwiązałeś wszystkie dostępne zadania w tym trybie. Chcesz zacząć od nowa?</p>
                    <button id="reset-progress-btn">Resetuj wszystkie postępy</button>
                    <button id="redo-wrong-btn">Powtórz źle zrobione zadania</button>
                </div>`;
            document.getElementById('reset-progress-btn').addEventListener('click', handleResetProgress);
            document.getElementById('redo-wrong-btn').addEventListener('click', handleRedoWrongProgress);
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

    async function handleRedoWrongProgress() {
        const isConfirmed = confirm("Czy na pewno chcesz zresetować tylko błędnie zrobione zadania? Zostaną usunięte z twojego arkusza osiągnięć, abyś mógł je powtórzyć.");
        if (isConfirmed) {
            const result = await api.request('/solved/wrong', 'DELETE');
            if (result && result.success) {
                alert("Błędne zadania zostały zresetowane! Zaczynasz tryb 'Powtórka błędnych zadań'.");
                navigateTo('wrong-answers');
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
        appState.examState = { active: true, tasks: examData.tasks, currentIndex: 0, answers: {}, timer: null, examId, examName };
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
            </div>
        `;
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
        appState.examState.answers[task.id] = userAnswer;
    }

    async function endExam(saveProgress) {
        clearInterval(appState.examState.timer);
        saveCurrentExamAnswer();
        
        if (!saveProgress) {
            appState.examState = { active: false, tasks: [], currentIndex: 0, answers: {}, timer: null, examId: null, examName: '' };
            return;
        }

        const openTasksToAssess = appState.examState.tasks.filter(t => t.type === 'otwarte');
        if (openTasksToAssess.length > 0) {
            appState.examState.openTasksToAssess = openTasksToAssess;
            appState.examState.assessmentIndex = 0;
            appState.examState.selfAssessedScore = { correct: 0, wrong: 0 };
            navigateTo('exam-self-assess');
        } else {
            await submitExamResults();
        }
    }
    
    async function submitExamResults() {
        let correctCount = 0;
        let wrongCount = 0;
        const totalCount = appState.examState.tasks.length;
        const openTasks = appState.examState.tasks.filter(t => t.type === 'otwarte');
        const closedTasks = appState.examState.tasks.filter(t => t.type === 'zamkniete');

        closedTasks.forEach(task => {
            const userAnswer = appState.examState.answers[task.id];
            if (userAnswer && userAnswer.toLowerCase() === task.odpowiedz.toLowerCase()) {
                correctCount++;
            } else {
                wrongCount++;
            }
        });
        
        correctCount += appState.examState.selfAssessedScore.correct;
        wrongCount += appState.examState.selfAssessedScore.wrong;

        const percent = Math.floor((correctCount / totalCount) * 100);

        await api.request('/results', 'POST', {
            examId: appState.examState.examId,
            examName: appState.examState.examName,
            correct: correctCount,
            wrong: wrongCount,
            total: totalCount,
            percent
        });
        
        const resultText = `Egzamin zakończony! Twoje wyniki:
            Poprawne odpowiedzi: ${correctCount}
            Błędne odpowiedzi: ${wrongCount}
            Łącznie punktów: ${correctCount} z ${totalCount}
            Procentowo: ${percent}%`;
            
        alert(resultText);
        
        appState.examState = { active: false, tasks: [], currentIndex: 0, answers: {}, timer: null, examId: null, examName: '' };
        navigateTo('egzaminy');
    }
    
    function renderExamSelfAssessment() {
        const { openTasksToAssess, assessmentIndex, answers } = appState.examState;
        if (assessmentIndex >= openTasksToAssess.length) {
            submitExamResults();
            return;
        }

        const task = openTasksToAssess[assessmentIndex];
        const userAnswer = answers[task.id] || "Brak odpowiedzi";

        mainContent.innerHTML = `
            <h1>Samoocena pytań otwartych</h1>
            <div class="content-box">
                <p><strong>Zadanie #${task.id} (${assessmentIndex + 1} / ${openTasksToAssess.length})</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <div class="result-box">
                    <p><strong>Twoja odpowiedź:</strong> ${userAnswer}</p>
                    <p><strong>Poprawna odpowiedź:</strong> ${task.odpowiedz}</p>
                    <p>Oceń swoją odpowiedź:</p>
                    <button id="self-assess-correct">Było dobrze</button>
                    <button id="self-assess-incorrect">Było źle</button>
                </div>
            </div>`;
        
        document.getElementById('self-assess-correct').addEventListener('click', () => {
            appState.examState.selfAssessedScore.correct++;
            appState.examState.assessmentIndex++;
            renderExamSelfAssessment();
        });
        document.getElementById('self-assess-incorrect').addEventListener('click', () => {
            appState.examState.selfAssessedScore.wrong++;
            appState.examState.assessmentIndex++;
            renderExamSelfAssessment();
        });
    }

    // Browse Tasks View
    async function renderBrowseTasks() {
        const tasks = await api.request('/tasks');
        if (!tasks) return;

        let tasksHtml = `
            <div class="content-box">
                <input type="text" id="browse-search" placeholder="Szukaj po ID lub arkuszu..." class="search-input">
            </div>
            <ul id="browse-list" class="item-list">`;
        tasksHtml += renderTasksList(tasks);
        tasksHtml += `</ul>`;

        mainContent.innerHTML = `<h1>Przeglądaj zadania</h1>${tasksHtml}`;

        document.getElementById('browse-search').addEventListener('input', async (e) => {
            const search = e.target.value;
            const filteredTasks = await api.request(`/tasks?search=${search}`);
            document.getElementById('browse-list').innerHTML = renderTasksList(filteredTasks);
        });
    }

    function renderTasksList(tasks) {
        if (!tasks.length) return `<p>Brak zadań pasujących do kryteriów.</p>`;
        return tasks.map(task => `
            <li class="list-item">
                <img src="${task.tresc}" alt="Miniatura" class="list-image">
                <div>
                    <strong>Zadanie #${task.id}</strong><br>
                    <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                </div>
                <div class="task-action-buttons">
                    <button data-task-id="${task.id}" data-action="delete" class="delete-btn">Usuń</button>
                    <a href="${task.tresc}" target="_blank" class="view-link">Zobacz</a>
                </div>
            </li>
        `).join('');
    }

    // Stats View
    async function renderStatsView() {
        const stats = await api.request('/stats');
        if (!stats) return;

        const { generalStats, typeStats, solvedExams } = stats;
        const totalSolved = generalStats.total_solved || 0;
        const totalCorrect = generalStats.total_correct || 0;
        const totalWrong = generalStats.total_wrong || 0;
        const percentCorrect = totalSolved > 0 ? ((totalCorrect / totalSolved) * 100).toFixed(1) : 0;

        let statsHtml = `
            <div class="stats-container">
                <div class="stats-card general-stats">
                    <h2>Podsumowanie ogólne</h2>
                    <div class="stat-item">
                        <span>Rozwiązanych zadań:</span>
                        <strong>${totalSolved}</strong>
                    </div>
                    <div class="stat-item correct-stats">
                        <span>Poprawnych:</span>
                        <strong>${totalCorrect}</strong>
                    </div>
                    <div class="stat-item incorrect-stats">
                        <span>Błędnych:</span>
                        <strong>${totalWrong}</strong>
                    </div>
                    <div class="stat-item">
                        <span>Skuteczność:</span>
                        <strong>${percentCorrect}%</strong>
                    </div>
                </div>`;

        if (typeStats.length) {
            statsHtml += `<div class="stats-card type-stats">
                <h2>Statystyki według typu</h2>
                ${typeStats.map(s => {
                    const totalType = s.correct + s.wrong;
                    const typePercent = totalType > 0 ? ((s.correct / totalType) * 100).toFixed(1) : 0;
                    return `<div class="type-item">
                        <h3>${s.type === 'zamkniete' ? 'Zamknięte' : 'Otwarte'}</h3>
                        <p>Poprawnych: ${s.correct}</p>
                        <p>Błędnych: ${s.wrong}</p>
                        <p>Skuteczność: ${typePercent}%</p>
                    </div>`;
                }).join('')}
            </div>`;
        }

        if (solvedExams.length) {
            statsHtml += `<div class="stats-card exam-results-stats">
                <h2>Wyniki z egzaminów</h2>
                <ul class="exam-results-list">
                    ${solvedExams.map(e => `
                        <li>
                            <div class="exam-header">
                                <strong>${e.exam_name}</strong>
                                <small>(${e.correct}/${e.total} pkt.)</small>
                            </div>
                            <div class="exam-score">
                                <span>${e.percent}%</span>
                                <small>Rozwiązano: ${new Date(e.created_at).toLocaleString()}</small>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>`;
        }
        
        statsHtml += `</div>`;
        mainContent.innerHTML = `<h1>Arkusz osiągnięć</h1>${statsHtml}`;
    }

    // Admin Views
    async function renderAdminTasks() {
        mainContent.innerHTML = `
            <h1>Zarządzanie zadaniami</h1>
            <div class="content-box wide">
                <h2>Krok 1: Wybierz typ zadań</h2>
                <p>Określ, czy dodawane zadania są **otwarte** czy **zamknięte**.</p>
                <div class="type-selection">
                    <button id="select-otwarte-btn" class="type-btn">Zadania Otwarte</button>
                    <button id="select-zamkniete-btn" class="type-btn">Zadania Zamknięte</button>
                </div>
            </div>
            <div id="file-upload-container" class="content-box wide hidden">
                <h2>Krok 2: Prześlij pliki zadań</h2>
                <p>Wybierz i prześlij pliki graficzne zadań. Możesz zaznaczyć wiele plików naraz.</p>
                <form id="task-upload-form">
                    <input type="file" id="task-image-upload" accept="image/*" multiple required>
                    <button type="submit" class="upload-btn">Prześlij pliki</button>
                </form>
            </div>
            <div id="task-forms-container"></div>
            <div class="content-box wide">
                <h2>Wszystkie zadania</h2>
                <input type="text" id="admin-browse-search" placeholder="Szukaj po ID lub arkuszu..." class="search-input">
                <ul id="admin-tasks-list" class="item-list">
                    </ul>
            </div>
        `;

        const fileUploadContainer = document.getElementById('file-upload-container');
        document.getElementById('select-otwarte-btn').addEventListener('click', () => {
            fileUploadContainer.dataset.taskType = 'otwarte';
            fileUploadContainer.classList.remove('hidden');
        });
        document.getElementById('select-zamkniete-btn').addEventListener('click', () => {
            fileUploadContainer.dataset.taskType = 'zamkniete';
            fileUploadContainer.classList.remove('hidden');
        });

        document.getElementById('task-upload-form').addEventListener('submit', handleTaskUpload);
        document.getElementById('admin-browse-search').addEventListener('input', async (e) => {
            const search = e.target.value;
            const filteredTasks = await api.request(`/tasks?search=${search}`);
            document.getElementById('admin-tasks-list').innerHTML = renderAdminTasksList(filteredTasks);
        });

        const existingTasks = await api.request('/tasks');
        if (existingTasks) {
            document.getElementById('admin-tasks-list').innerHTML = renderAdminTasksList(existingTasks);
        }
    }

    async function handleTaskUpload(e) {
        e.preventDefault();
        const files = document.getElementById('task-image-upload').files;
        const taskType = document.getElementById('file-upload-container').dataset.taskType;

        if (files.length === 0) {
            alert("Wybierz pliki do przesłania.");
            return;
        }
        if (!taskType) {
            alert("Najpierw wybierz typ zadań.");
            return;
        }

        const data = await api.upload(files);
        if (data && data.files) {
            renderBulkTaskCreationForm(data.files, taskType);
        }
    }

    function renderBulkTaskCreationForm(uploadedFiles, taskType) {
        const container = document.getElementById('task-forms-container');
        const showOptions = taskType === 'zamkniete';
        container.innerHTML = `
            <div class="content-box wide">
                <h2>Krok 3: Uzupełnij szczegóły zadań (${taskType === 'otwarte' ? 'Otwarte' : 'Zamknięte'})</h2>
                <p>Uzupełnij informacje dla wszystkich przesłanych zadań i zapisz je jednym kliknięciem.</p>
                <form id="bulk-create-form" data-task-type="${taskType}">
                    <div id="individual-task-forms">
                        ${uploadedFiles.map((file, index) => `
                            <div class="individual-task-form" data-task-index="${index}">
                                <h3>Zadanie ${index + 1}</h3>
                                <img src="${file.url}" alt="Przesłane zadanie" class="upload-preview-image">
                                <input type="hidden" name="tresc" value="${file.url}">
                                <label for="odpowiedz-${index}">Poprawna odpowiedź:</label>
                                <input type="text" id="odpowiedz-${index}" name="odpowiedz" required>
                                ${showOptions ? `
                                    <div class="options-group">
                                        <label for="opcje-${index}">Opcje (rozdziel przecinkiem):</label>
                                        <input type="text" id="opcje-${index}" name="opcje" required>
                                    </div>
                                ` : ''}
                                <label for="punkty-${index}">Punkty:</label>
                                <input type="number" id="punkty-${index}" name="punkty" value="1" required>
                            </div>
                        `).join('')}
                    </div>
                    <button type="submit" class="save-all-btn">Dodaj wszystkie zadania</button>
                </form>
            </div>
        `;
        
        document.getElementById('bulk-create-form').addEventListener('submit', handleBulkTaskSubmit);
    }

    async function handleBulkTaskSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const taskType = form.dataset.taskType;
        const forms = document.querySelectorAll('#individual-task-forms .individual-task-form');
        const tasksToSave = [];
        
        for (const formElement of forms) {
            const tresc = formElement.querySelector('[name="tresc"]').value;
            const odpowiedz = formElement.querySelector('[name="odpowiedz"]').value;
            const punkty = formElement.querySelector('[name="punkty"]').value;
            let opcje = null;

            if (taskType === 'zamkniete') {
                const opcjeInput = formElement.querySelector('[name="opcje"]').value;
                opcje = opcjeInput ? opcjeInput.split(',').map(s => s.trim()) : null;
            }

            if (!tresc || !odpowiedz || !punkty || (taskType === 'zamkniete' && !opcje)) {
                alert("Wszystkie pola muszą być wypełnione!");
                return;
            }

            tasksToSave.push({ tresc, type: taskType, odpowiedz, opcje, punkty: Number(punkty) });
        }

        const successMessages = [];
        for (const task of tasksToSave) {
            const result = await api.request('/tasks', 'POST', task);
            if (result && result.success) {
                successMessages.push(`Zadanie o id #${result.id} zostało dodane.`);
            }
        }
        
        if (successMessages.length > 0) {
            alert(`Pomyślnie dodano ${successMessages.length} zadań!`);
            renderAdminTasks();
        } else {
            alert("Nie udało się dodać żadnych zadań.");
        }
    }

    function renderAdminTasksList(tasks) {
        if (!tasks.length) return `<p>Brak zadań.</p>`;
        return tasks.map(task => `
            <li class="list-item">
                <img src="${task.tresc}" alt="Miniatura" class="list-image">
                <div>
                    <strong>Zadanie #${task.id}</strong><br>
                    <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                </div>
                <div class="task-action-buttons">
                    <button data-task-id="${task.id}" data-action="delete" class="delete-btn">Usuń</button>
                    <a href="${task.tresc}" target="_blank" class="view-link">Zobacz</a>
                </div>
            </li>
        `).join('');
    }

    async function renderAdminExams() {
        const [exams, tasks] = await Promise.all([
            api.request('/exams'),
            api.request('/tasks')
        ]);
        if (!exams || !tasks) return;

        let adminExamsHtml = `
            <div class="content-box wide">
                <h2>Utwórz nowy egzamin</h2>
                <form id="create-exam-form">
                    <label for="new-exam-name">Nazwa egzaminu:</label>
                    <input type="text" id="new-exam-name" required>
                    <label for="new-exam-arkusz">Nazwa arkusza:</label>
                    <input type="text" id="new-exam-arkusz" required>
                    <h3>Wybierz zadania:</h3>
                    <ul id="exam-tasks-list" class="item-list task-selection-list">
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
                    <button type="submit">Utwórz egzamin</button>
                </form>
            </div>`;
        
        mainContent.innerHTML = `<h1>Zarządzanie egzaminami</h1>${adminExamsHtml}`;
        
        document.getElementById('create-exam-form').addEventListener('submit', handleCreateExam);
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

    // Exam Review
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
                            <input type="radio" name="answer" value="${opt}" disabled> ${opt}
                        </label>
                    `).join('')}
                </div>`;
            const correctInput = document.querySelector(`input[value="${task.odpowiedz}"]`);
            if (correctInput) {
                correctInput.closest('label').classList.add('correct-answer');
            }
        } else {
            answerHtml = `<p><strong>Poprawna odpowiedź:</strong> ${task.odpowiedz}</p>`;
        }
        
        const reviewHtml = `
            <h1>Przegląd Egzaminu: ${appState.examState.examName} (${currentIndex + 1} / ${tasks.length})</h1>
            <div class="content-box">
                <p><strong>Zadanie #${task.id} (${task.punkty} pkt.)</strong></p>
                <img src="${task.tresc}" alt="Treść zadania" class="task-image">
                <div id="review-form">
                    ${answerHtml}
                </div>
                <div class="exam-navigation">
                    <button id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>Poprzednie</button>
                    <span></span>
                    <button id="next-btn">${currentIndex === tasks.length - 1 ? 'Zakończ przegląd' : 'Następne'}</button>
                </div>
            </div>`;
        mainContent.innerHTML = reviewHtml;
        document.getElementById('prev-btn').addEventListener('click', () => navigateExamReview(-1));
        document.getElementById('next-btn').addEventListener('click', () => navigateExamReview(1));
    }

    function navigateExamReview(direction) {
        const newIndex = appState.examState.currentIndex + direction;
        if (newIndex < 0 || newIndex > appState.examState.tasks.length - 1) {
            alert('Koniec przeglądu.');
            navigateTo('egzaminy');
            return;
        }
        appState.examState.currentIndex = newIndex;
        renderExamReviewTask();
    }

    init();
});