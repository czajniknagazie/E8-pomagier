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
    const nav = document.getElementById('main-nav');

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

        setupNavListeners();
        navigateTo('wszystkie');
    }

    // --- NAVIGATION ---
    function setupNavListeners() {
        nav.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const view = e.target.dataset.view;
                if (view) {
                    navigateTo(view);
                }
            }
        });
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
        }
    }

    // --- STUDENT VIEWS ---
    
    // Random Task Mode
    async function renderRandomTaskView(type) {
        const typeName = { wszystkie: 'Wszystkie zadania', zamkniete: 'Zadania zamknięte', otwarte: 'Zadania otwarte' }[type];
        mainContent.innerHTML = `<h1>${typeName}</h1>`;
        
        const task = await api.request(`/tasks/random?type=${type}`);
        appState.currentTask = task;

        if (!task) {
            mainContent.innerHTML += `<div class="content-box"><p>Gratulacje! Rozwiązałeś wszystkie dostępne zadania w tym trybie.</p></div>`;
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
            examName
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

    async function endExam(isFinished) {
        clearInterval(appState.examState.timer);
        
        if (isFinished) {
            let correctCount = 0;
            let wrongCount = 0;

            appState.examState.tasks.forEach(task => {
                const userAnswer = appState.examState.answers[task.id];
                if (userAnswer && userAnswer.toLowerCase() === task.odpowiedz.toLowerCase()) {
                    correctCount++;
                } else {
                    wrongCount++;
                }
            });

            const total = appState.examState.tasks.length;
            const percent = total > 0 ? ((correctCount / total) * 100).toFixed(0) : 0;
            
            await api.request('/results', 'POST', {
                examId: appState.examState.examId,
                examName: appState.examState.examName,
                correct: correctCount,
                wrong: wrongCount,
                total: total,
                percent: percent
            });
            
            mainContent.innerHTML = `
                <h1>Wyniki Egzaminu</h1>
                <div class="content-box">
                    <h2>${appState.examState.examName}</h2>
                    <p>Uzyskany wynik: <strong>${correctCount} / ${total} (${percent}%)</strong></p>
                    <button id="back-to-exams">Wróć do listy egzaminów</button>
                </div>`;
            document.getElementById('back-to-exams').addEventListener('click', () => navigateTo('egzaminy'));

        }

        appState.examState = { active: false, tasks: [], currentIndex: 0, answers: {}, timer: null };
    }
    
    // --- New Review Mode ---
    async function startExamReview(examId, examName) {
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
            examName
        };

        navigateTo('exam-review');
    }

    function renderExamReviewTask() {
        const { tasks, currentIndex } = appState.examState;
        const task = tasks[currentIndex];
        const answered = appState.examState.answers[task.id] !== undefined;

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
            </div>
        `;
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
            
            // Disable form after checking
            form.querySelector('button[type="submit"]').disabled = true;
            if (task.type === 'zamkniete') {
                form.querySelectorAll('input').forEach(input => input.disabled = true);
            } else {
                form.querySelector('#open-answer').disabled = true;
            }
        });
        
        document.getElementById('prev-btn').addEventListener('click', () => navigateReview(-1));
        document.getElementById('next-btn').addEventListener('click', () => navigateReview(1));
    }
    
    function navigateReview(direction) {
        const newIndex = appState.examState.currentIndex + direction;
        appState.examState.currentIndex = newIndex;
        renderExamReviewTask();
    }
    
    function showReviewResult(isCorrect, correctAnswer) {
        const resultBox = document.getElementById('result-box');
        if (isCorrect) {
            resultBox.innerHTML = `<div class="result-box correct">🎉 Dobrze!</div>`;
        } else {
            resultBox.innerHTML = `<div class="result-box incorrect">Błędna odpowiedź. Poprawna to: <strong>${correctAnswer}</strong></div>`;
        }
    }


    // Browse tasks
    async function renderBrowseTasks() {
        mainContent.innerHTML = `
            <h1>Przeglądaj Zadania</h1>
            <div class="content-box wide">
                <input type="text" id="search-tasks" placeholder="Szukaj po ID lub nazwie arkusza..." class="task-input">
                <div id="browse-tasks-list" style="margin-top: 20px;">Ładowanie...</div>
            </div>`;
        
        const searchInput = document.getElementById('search-tasks');
        searchInput.addEventListener('keyup', () => filterBrowseTasks(searchInput.value));

        const tasks = await api.request('/tasks');
        appState.allTasks = tasks; // Cache for filtering
        displayFilteredTasks(tasks);
    }

    function filterBrowseTasks(query) {
        const lowerQuery = query.toLowerCase();
        const filtered = appState.allTasks.filter(task => {
            const arkusz = task.arkusz || '';
            return task.id.toString().includes(lowerQuery) || arkusz.toLowerCase().includes(lowerQuery);
        });
        displayFilteredTasks(filtered);
    }

    function displayFilteredTasks(tasks) {
        const listEl = document.getElementById('browse-tasks-list');
        if (!tasks || !tasks.length) {
            listEl.innerHTML = '<p>Brak zadań spełniających kryteria.</p>';
            return;
        }
        listEl.innerHTML = `
            <ul class="item-list">
                ${tasks.map(task => `
                    <li class="task-list-item">
                        <img src="${task.tresc}" alt="Miniatura">
                        <div>
                            <strong>Zadanie #${task.id}</strong><br>
                            <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                        </div>
                        <span>Odp: ${task.odpowiedz}</span>
                    </li>
                `).join('')}
            </ul>`;
    }

    // Stats view
    async function renderStatsView() {
        const stats = await api.request('/stats');
        if (!stats) return;

        const { generalStats, typeStats, solvedExams } = stats;

        const openStats = typeStats.find(t => t.type === 'otwarte') || { correct: 0, wrong: 0 };
        const closedStats = typeStats.find(t => t.type === 'zamkniete') || { correct: 0, wrong: 0 };

        const openTotal = (openStats.correct || 0) + (openStats.wrong || 0);
        const closedTotal = (closedStats.correct || 0) + (closedStats.wrong || 0);

        const openPercent = openTotal > 0 ? ((openStats.correct || 0) / openTotal * 100) : 0;
        const closedPercent = closedTotal > 0 ? ((closedStats.correct || 0) / closedTotal * 100) : 0;

        let advice = '';
        if (openTotal > 5 && closedTotal > 5) {
            if (openPercent < closedPercent - 10) advice = 'Poćwicz zadania otwarte!';
            else if (closedPercent < openPercent - 10) advice = 'Poćwicz zadania zamknięte!';
        }

        const statsHtml = `
            <h1>Arkusz Osiągnięć</h1>
            <div class="content-box">
                <h2>Ogólne Statystyki</h2>
                <div class="stats-grid">
                    <div class="stat-card"><h3>Rozwiązane</h3><span class="value">${generalStats.total_solved || 0}</span></div>
                    <div class="stat-card"><h3>Poprawne</h3><span class="value" style="color: green;">${generalStats.total_correct || 0}</span></div>
                    <div class="stat-card"><h3>Błędne</h3><span class="value" style="color: red;">${generalStats.total_wrong || 0}</span></div>
                </div>
                ${advice ? `<div class="stat-card"><div class="advice">${advice}</div></div>` : ''}
            </div>
            <div class="content-box">
                <h2>Skuteczność wg typu</h2>
                 <div class="stats-grid">
                    <div class="stat-card"><h3>Otwarte</h3><span class="value">${openPercent.toFixed(0)}%</span><p>(${openStats.correct || 0}/${openTotal})</p></div>
                    <div class="stat-card"><h3>Zamknięte</h3><span class="value">${closedPercent.toFixed(0)}%</span><p>(${closedStats.correct || 0}/${closedTotal})</p></div>
                 </div>
            </div>
            <div class="content-box">
                <h2>Rozwiązane Egzaminy</h2>
                ${solvedExams.length ? `
                    <ul class="item-list">
                        ${solvedExams.map(e => `
                            <li class="list-item">
                                <span><strong>${e.exam_name}</strong> - ${new Date(e.created_at).toLocaleDateString()}</span>
                                <span>Wynik: <strong>${e.percent.toFixed(0)}%</strong> (${e.correct}/${e.total})</span>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p>Brak rozwiązanych egzaminów.</p>'}
            </div>
        `;
        mainContent.innerHTML = statsHtml;
    }


    // --- ADMIN VIEWS ---
    
    // Admin Tasks Management
    async function renderAdminTasks() {
        mainContent.innerHTML = `
            <h1>Zarządzaj Zadaniami</h1>
            <div class="content-box wide">
                <button id="show-add-task-form">Dodaj nowe zadania (masowo)</button>
                <div id="add-task-form-container" class="hidden" style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 20px;"></div>
                <hr>
                <h2>Istniejące zadania</h2>
                <div id="admin-tasks-list">Ładowanie...</div>
            </div>`;

        document.getElementById('show-add-task-form').addEventListener('click', renderBulkAddTaskForm);
        
        const tasks = await api.request('/tasks');
        const listEl = document.getElementById('admin-tasks-list');
        listEl.innerHTML = `
            <ul class="item-list" id="tasks-to-manage">
                ${tasks.map(task => `
                    <li class="task-list-item" data-id="${task.id}">
                        <img src="${task.tresc}" alt="Miniatura">
                        <div>
                            <strong>Zadanie #${task.id}</strong><br>
                            <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}, Odp: ${task.odpowiedz}</small>
                        </div>
                        <button class="delete-btn" data-id="${task.id}" data-type="task">Usuń</button>
                    </li>
                `).join('')}
            </ul>`;
        
        document.getElementById('tasks-to-manage').addEventListener('click', handleDeleteClick);
    }
    
    async function handleDeleteTask(id) {
        if (confirm(`Czy na pewno chcesz usunąć zadanie #${id}?`)) {
            const result = await api.request(`/tasks/${id}`, 'DELETE');
            if (result) {
                alert(`Zadanie #${id} zostało usunięte.`);
                navigateTo('admin-zadania');
            }
        }
    }

    function renderBulkAddTaskForm() {
        const formContainer = document.getElementById('add-task-form-container');
        formContainer.classList.toggle('hidden');
        if (formContainer.classList.contains('hidden')) {
            formContainer.innerHTML = '';
            return;
        }
        
        formContainer.innerHTML = `
            <h3>Krok 1: Wybierz typ i załącz pliki</h3>
            <label for="task-type">Typ zadań:</label>
            <select id="task-type">
                <option value="zamkniete">Zamknięte</option>
                <option value="otwarte">Otwarte</option>
            </select>
            <input type="file" id="task-files" multiple accept="image/*" style="margin-left: 10px;">
            <hr>
            <h3>Krok 2: Uzupełnij dane dla każdego zadania</h3>
            <div id="bulk-upload-preview"></div>
            <button id="save-bulk-tasks" class="hidden">Zapisz wszystkie zadania</button>
        `;

        document.getElementById('task-files').addEventListener('change', handleFileSelectionForBulkAdd);
        document.getElementById('save-bulk-tasks').addEventListener('click', handleSaveBulkTasks);
    }

    async function handleFileSelectionForBulkAdd(e) {
        const files = e.target.files;
        if (!files.length) return;

        const uploadResult = await api.upload(files);
        if (!uploadResult || !uploadResult.files) {
            alert('Nie udało się wysłać plików.');
            return;
        }
        
        const previewContainer = document.getElementById('bulk-upload-preview');
        const taskType = document.getElementById('task-type').value;
        previewContainer.innerHTML = '';

        uploadResult.files.forEach((file, index) => {
            previewContainer.innerHTML += `
                <div class="upload-item" data-url="${file.url}">
                    <img src="${file.url}" alt="Podgląd zadania">
                    <label>Odpowiedź:</label>
                    <input type="text" name="odpowiedz" required>
                    <label>Punkty:</label>
                    <input type="number" name="punkty" value="1" min="1" required>
                    ${taskType === 'zamkniete' ? `
                        <label>Opcje (oddzielone przecinkiem):</label>
                        <input type="text" name="opcje" placeholder="A,B,C,D" required>
                    ` : ''}
                </div>`;
        });
        document.getElementById('save-bulk-tasks').classList.remove('hidden');
    }

    async function handleSaveBulkTasks() {
        const previewContainer = document.getElementById('bulk-upload-preview');
        const taskItems = previewContainer.querySelectorAll('.upload-item');
        const taskType = document.getElementById('task-type').value;
        
        const tasksPayload = [];
        let isValid = true;

        taskItems.forEach(item => {
            const tresc = item.dataset.url;
            const odpowiedz = item.querySelector('input[name="odpowiedz"]').value;
            const punkty = item.querySelector('input[name="punkty"]').value;
            
            if (!odpowiedz || !punkty) {
                isValid = false;
            }

            const taskData = {
                type: taskType,
                tresc,
                odpowiedz,
                punkty
            };

            if (taskType === 'zamkniete') {
                const opcjeRaw = item.querySelector('input[name="opcje"]').value;
                if (!opcjeRaw) isValid = false;
                taskData.opcje = opcjeRaw.split(',').map(o => o.trim());
            }
            tasksPayload.push(taskData);
        });

        if (!isValid) {
            alert('Uzupełnij wszystkie pola dla każdego zadania!');
            return;
        }

        const result = await api.request('/tasks/bulk', 'POST', { tasks: tasksPayload });
        if (result) {
            alert(`Dodano ${result.count} nowych zadań.`);
            navigateTo('admin-zadania');
        }
    }
    
    async function renderAdminExams() {
        const exams = await api.request('/exams');
        mainContent.innerHTML = `
            <h1>Zarządzaj Egzaminami</h1>
            <div class="content-box wide">
                <h3>Stwórz nowy egzamin</h3>
                <p>Zaznacz zadania z listy poniżej, a następnie wpisz nazwę i kliknij "Stwórz Egzamin".</p>
                <form id="create-exam-form" style="display:flex; gap:10px; margin-bottom: 20px;">
                    <input type="text" id="new-exam-name" placeholder="Nazwa nowego egzaminu" required class="task-input">
                    <input type="text" id="new-exam-arkusz" placeholder="Nazwa arkusza dla zadań" required class="task-input">
                    <button type="submit">Stwórz Egzamin</button>
                </form>
                <hr>
                <h2>Istniejące egzaminy</h2>
                <div id="admin-exams-list">Ładowanie...</div>
                <hr>
                <h3>Wybierz zadania do egzaminu</h3>
                <div id="exam-tasks-list">Ładowanie...</div>
            </div>`;
        
        const examsListEl = document.getElementById('admin-exams-list');
        if (exams && exams.length) {
            examsListEl.innerHTML = `
                <ul class="item-list" id="exams-to-manage">
                    ${exams.map(exam => `
                        <li class="list-item" data-id="${exam.id}">
                            <span><strong>${exam.name}</strong></span>
                            <button class="delete-btn" data-id="${exam.id}" data-type="exam">Usuń</button>
                        </li>
                    `).join('')}
                </ul>`;
            examsListEl.addEventListener('click', handleDeleteClick);
        } else {
            examsListEl.innerHTML = '<p>Brak istniejących egzaminów.</p>';
        }

        const tasks = await api.request('/tasks');
        const tasksListEl = document.getElementById('exam-tasks-list');
        tasksListEl.innerHTML = `
            <ul class="item-list">
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
    }
    
    async function handleDeleteExam(id) {
        if (confirm(`Czy na pewno chcesz usunąć egzamin? Spowoduje to usunięcie wszystkich powiązanych z nim wyników.`)) {
            const result = await api.request(`/exams/${id}`, 'DELETE');
            if (result) {
                alert('Egzamin został usunięty.');
                navigateTo('admin-egzaminy');
            }
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
    
    function handleDeleteClick(e) {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.dataset.id;
            const type = e.target.dataset.type;
            
            if (type === 'task') {
                handleDeleteTask(id);
            } else if (type === 'exam') {
                handleDeleteExam(id);
            }
        }
    }

    // --- Start the App ---
    init();
});