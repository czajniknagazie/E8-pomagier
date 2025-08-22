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
        let menuOverlay; // Declare overlay variable
    
        // Create overlay if it doesn't exist
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
        
        const task = await api.request(`/tasks/random?type=${type}`);
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
            document.getElementById('reset-progress-btn').addEventListener('click', handleResetProgress);
            document.getElementById('practice-incorrect-btn').addEventListener('click', () => {
                 navigateTo('practice-incorrect');
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
    
    async function renderPracticeIncorrectTaskView() {
        mainContent.innerHTML = `<h1>Tryb Ćwiczenia Błędów</h1>`;
    
        const task = await api.request(`/tasks/random?incorrect=true`);
        appState.currentTask = task;
    
        if (!task) {
            mainContent.innerHTML += `
                <div class="content-box">
                    <p><strong>Świetna robota! 💪</strong></p>
                    <p>Przećwiczyłeś/aś wszystkie zadania, w których wcześniej popełniłeś/aś błąd. Wróć do normalnego trybu nauki.</p>
                    <div class="action-buttons">
                         <button onclick="navigateTo('wszystkie')">Wróć do wszystkich zadań</button>
                    </div>
                </div>`;
            return;
        }
        // Reszta kodu jest identyczna jak w renderRandomTaskView, więc można ją wywołać
        renderTaskDisplay(task);
    }
    
    function renderTaskDisplay(task) {
        let answerHtml = '';
        if (task.type === 'zamkniete') {
            answerHtml = `<div class="task-options">${task.opcje.map(opt => `<label><input type="radio" name="answer" value="${opt}"> ${opt}</label>`).join('')}</div>`;
        } else {
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
            isCorrect = userAnswer.trim().toLowerCase() === task.odpowiedz.trim().toLowerCase();
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
                    <p><strong>Twoja odpowiedź:</strong></p>
                    <pre class="user-answer-box">${userAnswer}</pre>
                    <p><strong>Poprawna odpowiedź:</strong></p>
                    <pre class="correct-answer-box">${task.odpowiedz}</pre>
                    <p>Oceń swoją odpowiedź:</p>
                    <div class="grading-buttons">
                        <button id="self-assess-correct" class="correct">👍 Było dobrze</button>
                        <button id="self-assess-incorrect" class="incorrect">👎 Było źle</button>
                    </div>
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
        const formButton = document.querySelector('#task-form button[type="submit"]');
        if(formButton) formButton.disabled = true;


        if (isSelfAssessed) {
            resultBox.innerHTML = `<div class="result-box ${isCorrect ? 'correct' : 'incorrect'}">Dziękujemy za ocenę!</div>`;
        } else {
            if (isCorrect) {
                resultBox.innerHTML = `<div class="result-box correct">🎉 Dobrze!</div>`;
            } else {
                let text = ` Błędna odpowiedź.`;
                if (correctAnswer) text += ` Poprawna to: <strong>${correctAnswer}</strong>`;
                resultBox.innerHTML = `<div class="result-box incorrect">${text}</div>`;
            }
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
                    <div class="action-buttons">
                        <button data-exam-id="${exam.id}" data-exam-name="${exam.name}" data-action="start">Rozpocznij</button>
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
        const { tasks, currentIndex, answers, examName } = appState.examState;
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
            <h1>Egzamin: ${examName} (${currentIndex + 1} / ${tasks.length})</h1>
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
                if (userAnswer && userAnswer.trim().toLowerCase() === task.odpowiedz.trim().toLowerCase()) {
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
                await sendFinalResults();
            }

        } else {
             appState.examState = { active: false, tasks: [], currentIndex: 0, answers: {}, timer: null };
        }
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
        const { examId, examName, tasks, closedCorrect, closedWrong, gradedOpenTasks } = appState.examState;
        
        let openCorrect = 0;
        let openWrong = 0;
        
        Object.values(gradedOpenTasks).forEach(isCorrect => {
            if (isCorrect) openCorrect++;
            else openWrong++;
        });

        const finalCorrect = closedCorrect + openCorrect;
        const total = tasks.length;
        const finalWrong = total - finalCorrect;
        const percent = total > 0 ? (finalCorrect / total) * 100 : 0;

        await api.request('/results', 'POST', {
            examId,
            examName,
            correct: finalCorrect,
            wrong: finalWrong,
            total,
            percent
        });
        
        appState.examState = { active: false, tasks: [], currentIndex: 0, answers: {}, timer: null };


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

    // Review Mode
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
        const { tasks, currentIndex, examName } = appState.examState;
        const task = tasks[currentIndex];
        let answerHtml = '';
        if (task.type === 'zamkniete') {
            answerHtml = `<div class="task-options">${task.opcje.map(opt => `<label><input type="radio" name="answer" value="${opt}">${opt}</label>`).join('')}</div>`;
        } else {
            answerHtml = `<textarea id="open-answer" class="task-input" rows="3" placeholder="Wpisz swoją odpowiedź..."></textarea>`;
        }
        const taskHtml = `
            <h1>Przeglądanie: ${examName} (${currentIndex + 1} / ${tasks.length})</h1>
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
                    <button id="exit-review-btn">Zakończ przegląd</button>
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
            const isCorrect = userAnswer.trim().toLowerCase() === task.odpowiedz.trim().toLowerCase();
            showReviewResult(isCorrect, task.odpowiedz);
            form.querySelector('button[type="submit"]').disabled = true;
        });
        document.getElementById('prev-btn').addEventListener('click', () => navigateExamReview(-1));
        document.getElementById('next-btn').addEventListener('click', () => navigateExamReview(1));
        document.getElementById('exit-review-btn').addEventListener('click', () => {
            appState.examState.active = false;
            navigateTo('egzaminy');
        });
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

    // --- Stats View (NEW) ---
    async function renderStatsView() {
        mainContent.innerHTML = '<h1>Arkusz Osiągnięć</h1><p>Ładowanie danych...</p>';
        const stats = await api.request('/stats');
        if (!stats) {
            mainContent.innerHTML = '<h1>Arkusz Osiągnięć</h1><p>Nie udało się załadować statystyk.</p>';
            return;
        }

        const { generalStats, typeStats, solvedExams } = stats;

        const openCorrect = typeStats.otwarte?.correct || 0;
        const openWrong = typeStats.otwarte?.wrong || 0;
        const openTotal = openCorrect + openWrong;
        const openPercentage = openTotal > 0 ? ((openCorrect / openTotal) * 100).toFixed(0) : 0;

        const closedCorrect = typeStats.zamkniete?.correct || 0;
        const closedWrong = typeStats.zamkniete?.wrong || 0;
        const closedTotal = closedCorrect + closedWrong;
        const closedPercentage = closedTotal > 0 ? ((closedCorrect / closedTotal) * 100).toFixed(0) : 0;
        
        const hasIncorrectTasks = (generalStats.total_wrong || 0) > 0;

        let statsHtml = `
            <div class="stats-container">
                <div class="stats-section">
                    <h2>Ogólne Statystyki</h2>
                    <div class="stats-grid three-cols">
                        <div class="stat-card">
                            <h3>Rozwiązane</h3>
                            <div class="value">${generalStats.total_solved || 0}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Poprawne</h3>
                            <div class="value green">${generalStats.total_correct || 0}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Błędne</h3>
                            <div class="value red">${generalStats.total_wrong || 0}</div>
                        </div>
                    </div>
                    ${hasIncorrectTasks ? '<button id="practice-incorrect-btn" class="practice-btn">Poćwicz zadania, w których popełniasz błędy!</button>' : ''}
                </div>

                <div class="stats-section">
                    <h2>Skuteczność wg typu</h2>
                    <div class="stats-grid two-cols">
                        <div class="stat-card">
                            <h3>Otwarte</h3>
                            <div class="percentage">${openPercentage}%</div>
                            <div class="details">(${openCorrect}/${openTotal})</div>
                        </div>
                        <div class="stat-card">
                            <h3>Zamknięte</h3>
                            <div class="percentage">${closedPercentage}%</div>
                            <div class="details">(${closedCorrect}/${closedTotal})</div>
                        </div>
                    </div>
                </div>

                <div class="stats-section">
                    <h2>Rozwiązane Egzaminy</h2>
                    <div class="content-box">
                        ${solvedExams.length ? `
                            <ul class="item-list">
                                ${solvedExams.map(exam => `
                                    <li class="list-item">
                                        <span><strong>${exam.exam_name}</strong></span>
                                        <span>${exam.correct}/${exam.total} (<strong>${exam.percent.toFixed(0)}%</strong>)</span>
                                    </li>
                                `).join('')}
                            </ul>
                        ` : '<p>Brak rozwiązanych egzaminów.</p>'}
                    </div>
                </div>
            </div>
        `;
        
        mainContent.innerHTML = `<h1>Arkusz Osiągnięć</h1>${statsHtml}`;
        
        if (hasIncorrectTasks) {
            document.getElementById('practice-incorrect-btn').addEventListener('click', async () => {
                 await renderPracticeIncorrectTaskView();
            });
        }
    }


    // --- ADMIN VIEWS ---
    
    // Admin Tasks (NEW)
    async function renderAdminTasks() {
        const tasks = await api.request('/tasks');
        let tasksHtml = `
            <div class="content-box wide">
                <h2>Istniejące zadania</h2>
                <ul class="item-list">`;

        if (tasks && tasks.length) {
             tasksHtml += tasks.map(task => `
                <li class="list-item task-list-item">
                    <img src="${task.tresc}" alt="Miniatura">
                    <div>
                        <strong>Zadanie #${task.id}</strong><br>
                        <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                    </div>
                    <div class="action-buttons">
                        <button class="delete-task-btn" data-id="${task.id}">Usuń</button>
                    </div>
                </li>
             `).join('');
        } else {
            tasksHtml += `<p>Brak zadań.</p>`;
        }
        tasksHtml += `</ul></div>`;
        
        tasksHtml += `
            <div class="content-box wide" id="mass-upload-wizard">
                <h2>Dodaj nowe zadania (masowo)</h2>
                
                <div id="upload-step-1">
                    <h3>Krok 1: Wybierz typ i załącz pliki</h3>
                    <div class="form-group">
                        <label for="task-type-select">Typ zadań:</label>
                        <select id="task-type-select">
                            <option value="zamkniete">Zamknięte</option>
                            <option value="otwarte">Otwarte</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="task-files-input">Wybierz pliki (obrazki):</label>
                        <input type="file" id="task-files-input" multiple accept="image/*">
                    </div>
                </div>

                <div id="upload-step-2" class="hidden">
                    <h3>Krok 2: Uzupełnij dane dla każdego zadania</h3>
                    <div id="task-previews-container"></div>
                    <div class="action-buttons">
                        <button id="save-all-tasks-btn">Zapisz wszystkie zadania</button>
                        <button id="cancel-upload-btn">Anuluj</button>
                    </div>
                </div>
            </div>
        `;
        
        mainContent.innerHTML = `<h1>Panel Administracyjny: Zarządzanie zadaniami</h1>${tasksHtml}`;
        
        document.querySelectorAll('.delete-task-btn').forEach(btn => btn.addEventListener('click', handleDeleteTask));
        
        const step1 = document.getElementById('upload-step-1');
        const step2 = document.getElementById('upload-step-2');
        const typeSelect = document.getElementById('task-type-select');
        const fileInput = document.getElementById('task-files-input');
        const previewsContainer = document.getElementById('task-previews-container');

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            previewsContainer.innerHTML = '';

            files.forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const isClosed = typeSelect.value === 'zamkniete';
                    const previewHtml = `
                        <div class="task-preview-item" data-file-index="${index}" data-file-name="${file.name}">
                            <img src="${event.target.result}" class="task-preview-image" alt="Podgląd ${file.name}">
                            <div class="task-preview-form">
                                <div class="form-group">
                                    <label>Odpowiedź:</label>
                                    <input type="text" class="task-answer" required>
                                </div>
                                <div class="form-group">
                                    <label>Punkty:</label>
                                    <input type="number" class="task-points" value="1" required>
                                </div>
                                ${isClosed ? `
                                <div class="form-group">
                                    <label>Opcje (oddzielone średnikiem ";"):</label>
                                    <input type="text" class="task-options">
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                    previewsContainer.innerHTML += previewHtml;
                };
                reader.readAsDataURL(file);
            });
        });

        document.getElementById('cancel-upload-btn').addEventListener('click', () => {
            fileInput.value = ''; // Reset file input
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
        });

        document.getElementById('save-all-tasks-btn').addEventListener('click', async () => {
            const files = Array.from(fileInput.files);
            const previewItems = document.querySelectorAll('.task-preview-item');
            const type = typeSelect.value;
            
            // 1. Upload images
            const uploaded = await api.upload(files);
            if (!uploaded || uploaded.files.length !== files.length) {
                alert('Wystąpił błąd podczas przesyłania plików. Spróbuj ponownie.');
                return;
            }

            // 2. Collect form data
            const tasksData = [];
            let allValid = true;
            previewItems.forEach((item, index) => {
                const answerInput = item.querySelector('.task-answer');
                const pointsInput = item.querySelector('.task-points');
                const optionsInput = item.querySelector('.task-options');

                const answer = answerInput.value.trim();
                const points = parseInt(pointsInput.value);

                if (!answer) {
                    alert(`Uzupełnij odpowiedź dla zadania: ${item.dataset.fileName}`);
                    answerInput.focus();
                    allValid = false;
                    return;
                }

                // Match uploaded file URL with form data
                const uploadedFile = uploaded.files.find(f => f.filename.includes(item.dataset.fileName.split('.').slice(0, -1).join('.')));
                if (!uploadedFile) {
                    console.error('Could not find uploaded file for', item.dataset.fileName);
                    return;
                }

                const task = {
                    type: type,
                    tresc: uploadedFile.url,
                    odpowiedz: answer,
                    punkty: points,
                    opcje: null
                };

                if (type === 'zamkniete') {
                    const options = optionsInput.value.split(';').map(o => o.trim()).filter(o => o);
                    if (options.length === 0) {
                        alert(`Uzupełnij opcje dla zadania zamkniętego: ${item.dataset.fileName}`);
                        optionsInput.focus();
                        allValid = false;
                        return;
                    }
                    task.opcje = options;
                }
                tasksData.push(task);
            });

            if (!allValid || tasksData.length !== files.length) {
                alert('Nie udało się zebrać danych dla wszystkich zadań. Popraw błędy i spróbuj ponownie.');
                return;
            }

            // 3. Send to bulk create endpoint
            const result = await api.request('/tasks/bulk', 'POST', { tasks: tasksData });
            if (result) {
                alert(`Pomyślnie dodano ${result.count} zadań.`);
                navigateTo('admin-zadania');
            }
        });
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
        const tasks = await api.request('/tasks');
        let examsHtml = `<div class="content-box wide">
            <h2>Utwórz nowy arkusz egzaminacyjny</h2>
            <form id="create-exam-form">
                <input type="text" id="new-exam-name" placeholder="Nazwa egzaminu" required>
                <input type="text" id="new-exam-arkusz" placeholder="Nazwa arkusza (np. E8-2023)" required>
                <h3>Wybierz zadania z listy:</h3>
                <div class="task-list-container">
                    <ul id="exam-tasks-list" class="item-list">
                        ${tasks.map(task => `
                            <li class="list-item task-list-item">
                                <input type="checkbox" value="${task.id}" id="task-check-${task.id}" style="transform: scale(1.5); margin-right: 15px;">
                                <img src="${task.tresc}" alt="Miniatura">
                                <label for="task-check-${task.id}" style="width: 100%; cursor: pointer;">
                                    <strong>Zadanie #${task.id}</strong><br>
                                    <small>Typ: ${task.type}, Arkusz: ${task.arkusz || 'brak'}</small>
                                </label>
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
        if (confirm(`Czy na pewno chcesz usunąć egzamin #${examId}? Zmiana jest nieodwracalna.`)) {
            const result = await api.request(`/exams/${examId}`, 'DELETE');
            if (result !== null) {
                alert(`Egzamin #${examId} został usunięty.`);
                navigateTo('admin-egzaminy');
            }
        }
    }

    init();
});