document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    if (tg.initData) {
        tg.expand();
        tg.enableClosingConfirmation();
    }

    const BACKEND_URL = window.location.hostname.includes('render.com') 
        ? window.location.origin
        : 'http://localhost:3000';

    let appData = {
        user: null,
        token: null,
        plan: [],
        weekDates: [],
        weekNumber: 0,
        currentDay: 0,
        stats: {},
        currentWorkout: null,
        exerciseLibrary: [],
        workoutTemplates: [],
        reminders: []
    };
    
    let currentEditingDayIndex = null;
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

    // ==================== СИСТЕМА АУТЕНТИФИКАЦИИ ====================

    function checkAuth() {
        const token = localStorage.getItem('trainplan_token');
        const user = localStorage.getItem('trainplan_user');
        
        if (token && user) {
            appData.token = token;
            appData.user = JSON.parse(user);
            showScreen('home-screen');
            initApp();
            loadUserInfo();
        } else {
            showScreen('auth-screen');
        }
    }

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const firstName = document.getElementById('register-firstname').value.trim();
        const email = document.getElementById('register-email').value.trim();

        if (password.length < 6) {
            showNotification('❌ Пароль должен содержать минимум 6 символов', 'error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    firstName: firstName || username,
                    email: email || null
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                appData.token = result.token;
                appData.user = result.user;
                
                localStorage.setItem('trainplan_token', result.token);
                localStorage.setItem('trainplan_user', JSON.stringify(result.user));
                
                showNotification(`✅ Добро пожаловать, ${result.user.first_name}!`);
                showScreen('home-screen');
                initApp();
                loadUserInfo();
            } else {
                showNotification(result.error || '❌ Ошибка при регистрации', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showNotification('❌ Ошибка соединения с сервером', 'error');
        }
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch(`${BACKEND_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();
            
            if (response.ok) {
                appData.token = result.token;
                appData.user = result.user;
                
                localStorage.setItem('trainplan_token', result.token);
                localStorage.setItem('trainplan_user', JSON.stringify(result.user));
                
                showNotification(`✅ С возвращением, ${result.user.first_name}!`);
                showScreen('home-screen');
                initApp();
                loadUserInfo();
            } else {
                showNotification(result.error || '❌ Неверное имя пользователя или пароль', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification('❌ Ошибка соединения с сервером', 'error');
        }
    });

    window.demoLogin = async function() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: 'demo_user', 
                    password: 'demo123' 
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                appData.token = result.token;
                appData.user = result.user;
                
                localStorage.setItem('trainplan_token', result.token);
                localStorage.setItem('trainplan_user', JSON.stringify(result.user));
                
                showNotification(`🎮 Демо режим активирован!`);
                showScreen('home-screen');
                initApp();
                loadUserInfo();
            } else {
                const registerResponse = await fetch(`${BACKEND_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: 'demo_user',
                        password: 'demo123',
                        firstName: 'Демо Пользователь'
                    })
                });

                const registerResult = await registerResponse.json();
                
                if (registerResponse.ok) {
                    appData.token = registerResult.token;
                    appData.user = registerResult.user;
                    
                    localStorage.setItem('trainplan_token', registerResult.token);
                    localStorage.setItem('trainplan_user', JSON.stringify(registerResult.user));
                    
                    showNotification(`🎮 Демо режим активирован!`);
                    showScreen('home-screen');
                    initApp();
                    loadUserInfo();
                } else {
                    showNotification('❌ Ошибка демо входа', 'error');
                }
            }
        } catch (error) {
            console.error('Demo login error:', error);
            showNotification('❌ Ошибка соединения с сервером', 'error');
        }
    };

    window.logout = function() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            localStorage.removeItem('trainplan_token');
            localStorage.removeItem('trainplan_user');
            appData.token = null;
            appData.user = null;
            showNotification('👋 До скорой встречи!');
            showScreen('auth-screen');
        }
    };

    async function loadUserInfo() {
        if (!appData.token) return;

        try {
            const response = await fetch(`${BACKEND_URL}/api/user`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                document.getElementById('user-name').textContent = data.user.first_name;
                document.getElementById('user-id-display').textContent = data.user.id;
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    // ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.classList.toggle('light-theme', savedTheme === 'light');
        document.getElementById('theme-toggle').checked = savedTheme === 'light';
    }

    function showNotification(message, type = 'success') {
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(notif => notif.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">✕</button>
            </div>
        `;
        
        document.body.appendChild(notification);

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });

        setTimeout(() => notification.classList.add('show'), 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    function openModal(modalElement) {
        modalElement.style.display = 'flex';
        setTimeout(() => {
            modalElement.classList.add('active');
        }, 10);
    }

    function closeModal(modalElement) {
        modalElement.classList.remove('active');
        setTimeout(() => {
            modalElement.style.display = 'none';
        }, 300);
    }

    window.switchAuthTab = function(tabName) {
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.getElementById(`${tabName}-form`).classList.add('active');
        event.target.classList.add('active');
    };

    function formatDate(dateString) {
        const date = new Date(dateString);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Сегодня';
        }
        if (date.toDateString() === tomorrow.toDateString()) {
            return 'Завтра';
        }

        return `${date.getDate()} ${monthNames[date.getMonth()]}`;
    }

    function formatWeekRange(weekDates) {
        if (!weekDates || weekDates.length === 0) return '';
        
        const start = new Date(weekDates[0]);
        const end = new Date(weekDates[6]);
        
        if (start.getMonth() === end.getMonth()) {
            return `${start.getDate()}-${end.getDate()} ${monthNames[start.getMonth()]}`;
        } else {
            return `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]}`;
        }
    }

    // ==================== ОБРАБОТЧИКИ НАВИГАЦИИ ====================

    document.getElementById('menu-plan-btn').addEventListener('click', () => {
        renderWeekPlan();
        showScreen('plan-screen');
    });

    document.getElementById('menu-groups-btn').addEventListener('click', () => {
        loadUserGroups();
        showScreen('groups-screen');
    });

    document.getElementById('menu-leaderboard-btn').addEventListener('click', () => {
        loadLeaderboard();
        showScreen('leaderboard-screen');
    });

    document.getElementById('menu-analytics-btn').addEventListener('click', () => {
        loadAnalytics();
        showScreen('analytics-screen');
    });

    document.getElementById('menu-settings-btn').addEventListener('click', () => {
        openModal(document.getElementById('settings-modal'));
    });

    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => showScreen('home-screen'));
    });

    // ==================== ПЛАН ТРЕНИРОВОК ====================

    document.getElementById('load-default-plan').addEventListener('click', async () => {
        try {
            showNotification('Загружаем базовый план...', 'success');
            
            const response = await fetch(`${BACKEND_URL}/api/load-default-plan`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            const result = await response.json();
            
            if (response.ok) {
                await loadPlan();
                showNotification('✅ Базовый план загружен! Теперь вы можете добавить упражнения.');
            } else {
                showNotification(result.error || 'Ошибка при загрузке плана', 'error');
            }
        } catch (error) {
            console.error('Error loading default plan:', error);
            showNotification('❌ Ошибка при загрузке плана', 'error');
        }
    });

    async function loadPlan() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/plan`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                appData.plan = data.plan;
                appData.weekDates = data.weekDates;
                appData.weekNumber = data.weekNumber;
                appData.currentDay = data.currentDay;
                renderWeekPlan();
            } else if (response.status === 401) {
                localStorage.removeItem('trainplan_token');
                localStorage.removeItem('trainplan_user');
                showScreen('auth-screen');
                showNotification('❌ Сессия истекла. Войдите снова.', 'error');
            }
        } catch (error) {
            console.error('Error loading plan:', error);
            showNotification('❌ Ошибка загрузки плана', 'error');
        }
    }

    function renderWeekPlan() {
        const container = document.getElementById('week-plan-container');
        const weekInfo = document.getElementById('week-info');
        container.innerHTML = '';
        
        if (appData.weekDates && appData.weekDates.length > 0) {
            weekInfo.textContent = `Неделя ${appData.weekNumber} • ${formatWeekRange(appData.weekDates)}`;
        }

        if (appData.plan.length === 0) {
            appData.plan = Array(7).fill().map((_, index) => ({
                day_of_week: index,
                is_rest_day: false,
                notification_time: '19:00',
                exercises: []
            }));
        }

        appData.plan.forEach((dayData, index) => {
            const dayCard = document.createElement('div');
            dayCard.className = `day-card ${dayData.is_rest_day ? 'rest-day' : ''} ${index === appData.currentDay ? 'today' : ''}`;
            
            const exerciseCountText = dayData.is_rest_day 
                ? '🏖️ Выходной' 
                : `${dayData.exercises ? dayData.exercises.length : 0} упр.`;

            const dateDisplay = appData.weekDates && appData.weekDates[index] 
                ? formatDate(appData.weekDates[index])
                : '';

            dayCard.innerHTML = `
                <div class="day-header">
                    <div class="day-main-info">
                        <span class="day-name">${dayNames[index]}</span>
                        <span class="exercise-count">${exerciseCountText}</span>
                    </div>
                    <div class="day-date">${dateDisplay}</div>
                </div>
                ${!dayData.is_rest_day && dayData.exercises && dayData.exercises.length > 0 ? `
                    <div class="day-exercises-preview">
                        ${dayData.exercises.slice(0, 2).map(ex => 
                            `<span class="exercise-preview">${ex.name}</span>`
                        ).join('')}
                        ${dayData.exercises.length > 2 ? '<span class="exercise-more">...</span>' : ''}
                    </div>
                ` : ''}
            `;
            
            dayCard.addEventListener('click', () => openDayModal(index));
            container.appendChild(dayCard);
        });
    }

    // ==================== СИСТЕМА ТРЕНИРОВОК ====================

    async function completeWorkout(dayIndex) {
        try {
            const dayData = appData.plan[dayIndex];
            if (!dayData || !dayData.exercises || dayData.exercises.length === 0) {
                showNotification('❌ Нет упражнений для завершения', 'error');
                return;
            }

            const response = await fetch(`${BACKEND_URL}/api/complete-workout`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify({
                    day_of_week: dayIndex,
                    exercises: dayData.exercises,
                    workout_duration: 45,
                    notes: 'Завершено через веб-приложение'
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                showNotification('🎉 Тренировка завершена! Отличная работа! 💪');
                closeModal(document.getElementById('workout-screen'));
                await loadAnalytics();
            } else {
                showNotification(result.error || 'Ошибка при сохранении тренировки', 'error');
            }
        } catch (error) {
            console.error('Error completing workout:', error);
            showNotification('❌ Ошибка при завершении тренировки', 'error');
        }
    }

    function startWorkout(dayIndex) {
        const dayData = appData.plan[dayIndex];
        if (!dayData || dayData.is_rest_day || !dayData.exercises || dayData.exercises.length === 0) {
            showNotification('❌ Нет упражнений для тренировки', 'error');
            return;
        }

        appData.currentWorkout = {
            dayIndex: dayIndex,
            exercises: [...dayData.exercises],
            currentExerciseIndex: 0,
            startTime: new Date()
        };

        renderWorkoutScreen();
        showScreen('workout-screen');
    }

    function renderWorkoutScreen() {
        if (!appData.currentWorkout) return;

        const workout = appData.currentWorkout;
        const exercise = workout.exercises[workout.currentExerciseIndex];
        const progress = ((workout.currentExerciseIndex) / workout.exercises.length) * 100;

        const workoutScreen = document.getElementById('workout-screen');
        workoutScreen.innerHTML = `
            <div class="container">
                <div class="header">
                    <button class="back-button" onclick="showScreen('plan-screen')">← Назад</button>
                    <h2>🏋️ Тренировка</h2>
                    <div class="workout-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <span>${workout.currentExerciseIndex + 1}/${workout.exercises.length}</span>
                    </div>
                </div>
                
                <div class="workout-content">
                    <div class="current-exercise">
                        <h3>${exercise.name}</h3>
                        <div class="exercise-details">
                            <div class="detail-item">
                                <span class="label">Подходы:</span>
                                <span class="value">${exercise.sets}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Повторения:</span>
                                <span class="value">${exercise.reps}</span>
                            </div>
                        </div>
                    </div>

                    <div class="workout-actions">
                        <button class="btn-primary" onclick="completeExercise()">
                            ✅ Выполнил упражнение
                        </button>
                        <button class="btn-secondary" onclick="skipExercise()">
                            ⏭️ Пропустить
                        </button>
                    </div>

                    <div class="upcoming-exercises">
                        <h4>Следующие упражнения:</h4>
                        ${workout.exercises.slice(workout.currentExerciseIndex + 1).map((ex, index) => `
                            <div class="upcoming-exercise">
                                <span>${workout.currentExerciseIndex + index + 2}. ${ex.name}</span>
                                <span>${ex.sets} × ${ex.reps}</span>
                            </div>
                        `).join('')}
                        ${workout.exercises.length === workout.currentExerciseIndex + 1 ? `
                            <div class="upcoming-exercise" style="text-align: center; color: var(--text-secondary);">
                                🎉 Это последнее упражнение!
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    window.completeExercise = function() {
        if (!appData.currentWorkout) return;

        const workout = appData.currentWorkout;
        workout.currentExerciseIndex++;

        if (workout.currentExerciseIndex >= workout.exercises.length) {
            completeWorkout(workout.dayIndex);
        } else {
            renderWorkoutScreen();
            showNotification('✅ Упражнение выполнено!');
        }
    };

    window.skipExercise = function() {
        if (!appData.currentWorkout) return;

        const workout = appData.currentWorkout;
        workout.currentExerciseIndex++;

        if (workout.currentExerciseIndex >= workout.exercises.length) {
            completeWorkout(workout.dayIndex);
        } else {
            renderWorkoutScreen();
            showNotification('⏭️ Упражнение пропущено');
        }
    };

    // ==================== МОДАЛЬНОЕ ОКНО ДНЯ ====================

    function openDayModal(dayIndex) {
        currentEditingDayIndex = dayIndex;
        
        if (!appData.plan[dayIndex]) {
            appData.plan[dayIndex] = {
                day_of_week: dayIndex,
                is_rest_day: false,
                notification_time: '19:00',
                exercises: []
            };
        }
        
        const dayData = appData.plan[dayIndex];

        const dateDisplay = appData.weekDates && appData.weekDates[dayIndex] 
            ? formatDate(appData.weekDates[dayIndex])
            : '';
        document.getElementById('modal-day-title').textContent = 
            `${dayNames[dayIndex]} • ${dateDisplay}`;

        renderExercisesList(dayData.exercises || []);
        
        const restDayToggle = document.getElementById('rest-day-toggle');
        restDayToggle.checked = dayData.is_rest_day || false;

        const startButton = document.getElementById('start-workout-btn');
        if (startButton) {
            if (dayData.is_rest_day || !dayData.exercises || dayData.exercises.length === 0) {
                startButton.style.display = 'none';
            } else {
                startButton.style.display = 'block';
                startButton.onclick = () => {
                    closeModal(document.getElementById('day-modal'));
                    startWorkout(dayIndex);
                };
            }
        }

        openModal(document.getElementById('day-modal'));
    }

    function renderExercisesList(exercises) {
        const listContainer = document.getElementById('exercises-list');
        listContainer.innerHTML = '';
        
        if (!exercises || exercises.length === 0) {
            listContainer.innerHTML = '<div class="empty-state"><div class="icon">💪</div><p>Упражнений пока нет</p></div>';
            return;
        }

        exercises.forEach((ex, index) => {
            const item = document.createElement('div');
            item.className = 'exercise-item';
            item.innerHTML = `
                <div class="exercise-info">
                    <strong>${ex.name}</strong>
                    <span>${ex.sets} подход(а) × ${ex.reps}</span>
                </div>
                <button class="delete-btn" onclick="deleteExercise(${index})">❌</button>
            `;
            listContainer.appendChild(item);
        });
    }

    window.deleteExercise = function(exerciseIndex) {
        if (currentEditingDayIndex === null || !appData.plan[currentEditingDayIndex].exercises) return;
        
        appData.plan[currentEditingDayIndex].exercises.splice(exerciseIndex, 1);
        renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
        savePlan();
    };

    async function savePlan() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/plan`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify({ 
                    plan: appData.plan,
                    weekDates: appData.weekDates
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                console.log('✅ План сохранен');
                renderWeekPlan();
            } else {
                showNotification(result.error || '❌ Ошибка при сохранении', 'error');
            }
        } catch (error) {
            console.error('Error saving plan:', error);
            showNotification('❌ Ошибка при сохранении', 'error');
        }
    }

    document.getElementById('rest-day-toggle').addEventListener('change', function() {
        if (currentEditingDayIndex === null) return;
        
        const isRestDay = this.checked;
        appData.plan[currentEditingDayIndex].is_rest_day = isRestDay;
        
        if (isRestDay) {
            appData.plan[currentEditingDayIndex].exercises = [];
            renderExercisesList([]);
        }
        
        savePlan();
        showNotification(isRestDay ? '🏖️ День отмечен как выходной' : '💪 День тренировки');
    });

    document.getElementById('add-exercise-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('ex-name').value.trim();
        const sets = document.getElementById('ex-sets').value;
        const reps = document.getElementById('ex-reps').value.trim();

        if (!name || !sets || !reps || currentEditingDayIndex === null) {
            showNotification('❌ Заполните все поля', 'error');
            return;
        }

        if (appData.plan[currentEditingDayIndex].is_rest_day) {
            showNotification('❌ Нельзя добавлять упражнения в выходной день', 'error');
            return;
        }

        if (!appData.plan[currentEditingDayIndex].exercises) {
            appData.plan[currentEditingDayIndex].exercises = [];
        }

        const newExercise = { 
            name, 
            sets: parseInt(sets), 
            reps
        };
        
        appData.plan[currentEditingDayIndex].exercises.push(newExercise);
        renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
        savePlan();
        
        e.target.reset();
        showNotification('✅ Упражнение добавлено');
    });

    // ==================== ГРУППОВЫЕ ТРЕНИРОВКИ ====================

    async function loadUserGroups() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/user/1`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                renderGroupsList(data.groups);
            }
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    }

    function renderGroupsList(groups) {
        const container = document.getElementById('groups-list-container');
        container.innerHTML = '';

        if (!groups || groups.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">👥</div>
                    <h3>У вас пока нет групп</h3>
                    <p>Создайте первую группу и пригласите друзей!</p>
                    <button class="btn-primary" onclick="switchGroupTab('create-group')" style="margin-top: 20px;">
                        Создать группу
                    </button>
                </div>
            `;
            return;
        }

        groups.forEach(group => {
            const groupCard = document.createElement('div');
            groupCard.className = 'group-card';
            groupCard.innerHTML = `
                <div class="group-header">
                    <h4>${group.name}</h4>
                    <span class="member-count">👥 ${group.member_count || 1}</span>
                </div>
                <div class="group-description">${group.description || 'Без описания'}</div>
                <button class="btn-secondary" onclick="openGroupDetail(${group.id})" style="margin-top: 16px;">
                    Открыть группу
                </button>
            `;
            container.appendChild(groupCard);
        });
    }

    window.switchGroupTab = function(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.getElementById(`${tabName}-tab`).classList.add('active');
        event.target.classList.add('active');
    };

    document.getElementById('create-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('group-name').value;
        const description = document.getElementById('group-description').value;
        const planType = document.getElementById('group-plan-type').value;
        
        if (!name.trim()) {
            showNotification('❌ Введите название группы', 'error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/create`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    plan_type: planType
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                try {
                    await navigator.clipboard.writeText(result.invite_code);
                    showNotification(`✅ Группа создана! Код "${result.invite_code}" скопирован в буфер обмена!`);
                } catch (copyError) {
                    showNotification(`✅ Группа создана! Код: ${result.invite_code} (скопируйте вручную)`);
                }
                
                document.getElementById('create-group-form').reset();
                showScreen('groups-screen');
                loadUserGroups();
            } else {
                showNotification(result.error || '❌ Ошибка при создании группы', 'error');
            }
        } catch (error) {
            console.error('Error creating group:', error);
            showNotification('❌ Ошибка при создании группы', 'error');
        }
    });

    document.getElementById('join-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const inviteCode = document.getElementById('invite-code').value.toUpperCase().trim();
        
        if (!inviteCode) {
            showNotification('❌ Введите код приглашения', 'error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/join`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify({
                    invite_code: inviteCode
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification(`✅ Вы присоединились к группе "${result.group_name}"`);
                document.getElementById('invite-code').value = '';
                showScreen('groups-screen');
                loadUserGroups();
            } else {
                showNotification(result.error || '❌ Ошибка при присоединении к группе', 'error');
            }
        } catch (error) {
            console.error('Error joining group:', error);
            showNotification('❌ Ошибка при присоединении к группе', 'error');
        }
    });

    window.openGroupDetail = function(groupId) {
        fetch(`${BACKEND_URL}/api/groups/${groupId}`, {
            headers: {
                'Authorization': `Bearer ${appData.token}`
            }
        })
        .then(response => {
            if (!response.ok) throw new Error('Group not found');
            return response.json();
        })
        .then(data => {
            renderGroupDetail(data);
            showScreen('group-detail-screen');
        })
        .catch(error => {
            console.error('Error loading group details:', error);
            showNotification('❌ Ошибка при загрузке группы', 'error');
        });
    };

    function renderGroupDetail(data) {
        document.getElementById('group-detail-title').textContent = data.group.name;
        const container = document.getElementById('group-detail-container');
        
        container.innerHTML = `
            <div class="group-info welcome-card">
                <p><strong>📝 Описание:</strong> ${data.group.description || 'Отсутствует'}</p>
                <p><strong>📊 Тип плана:</strong> ${data.group.plan_type === 'week' ? 'Недельный' : 'Месячный'}</p>
                <p><strong>🔑 Код приглашения:</strong> <code style="background: var(--secondary-bg); padding: 6px 10px; border-radius: 8px; font-weight: bold; font-size: 14px;">${data.group.invite_code}</code></p>
                <p><strong>👑 Создатель:</strong> ${data.group.creator_name || 'Неизвестно'}</p>
            </div>
            <div class="members-list welcome-card">
                <h4 style="margin-bottom: 16px;">Участники (${data.members.length})</h4>
                ${data.members.map(member => `
                    <div class="member-item" style="padding: 14px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; flex-shrink: 0;">
                            ${member.first_name ? member.first_name.charAt(0).toUpperCase() : member.username ? member.username.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                            <strong>${member.first_name || member.username}</strong>
                            ${member.username ? `<br><small style="color: var(--text-secondary);">@${member.username}</small>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ==================== ЛИДЕРБОРД ====================

    async function loadLeaderboard() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/leaderboard`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                renderLeaderboard(data.leaders);
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        }
    }

    function renderLeaderboard(leaders) {
        const container = document.getElementById('leaderboard-container');
        container.innerHTML = '';

        if (!leaders || leaders.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="icon">🏆</div><p>Пока нет данных для таблицы лидеров</p></div>';
            return;
        }

        leaders.forEach((leader, index) => {
            const rank = index + 1;
            const isCurrentUser = appData.user && (leader.username === appData.user.username || leader.first_name === appData.user.first_name);
            const leaderItem = document.createElement('div');
            leaderItem.className = `leader-item ${isCurrentUser ? 'current-user' : ''}`;
            leaderItem.innerHTML = `
                <div class="leader-rank">${rank}</div>
                <div class="leader-info">
                    <div class="leader-name">${leader.first_name || leader.username || 'Пользователь'} ${isCurrentUser ? ' (Вы)' : ''}</div>
                    <div class="leader-stats">
                        <span>${leader.total_workout_days} дней</span>
                        <span>•</span>
                        <span>Стрик: ${leader.current_streak}</span>
                        <span>•</span>
                        <span>Недавно: ${leader.recent_workouts || 0}</span>
                    </div>
                </div>
                <div class="leader-badge">
                    ${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅'}
                </div>
            `;
            container.appendChild(leaderItem);
        });
    }

    // ==================== АНАЛИТИКА ====================

    async function loadAnalytics() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/analytics/1`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                renderAnalytics(data);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    function renderAnalytics(data) {
        document.getElementById('stat-days-analytics').textContent = data.leader_stats?.total_workout_days || 0;
        document.getElementById('stat-weeks-analytics').textContent = data.leader_stats?.completed_weeks || 0;
        document.getElementById('stat-total-analytics').textContent = data.leader_stats?.total_exercises || 0;
        document.getElementById('stat-streak-analytics').textContent = data.leader_stats?.current_streak || 0;
        document.getElementById('stat-best-streak').textContent = data.leader_stats?.longest_streak || 0;
    }

    // ==================== НАСТРОЙКИ ====================

    document.getElementById('theme-toggle').addEventListener('change', function() {
        const isLight = this.checked;
        document.body.classList.toggle('light-theme', isLight);
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        showNotification(isLight ? '🌞 Светлая тема активирована' : '🌙 Темная тема активирована');
    });

    document.getElementById('timezone-select').addEventListener('change', function() {
        localStorage.setItem('timezone', this.value);
        showNotification('🌍 Часовой пояс сохранен');
    });

    // ==================== ЗАКРЫТИЕ МОДАЛЬНЫХ ОКОН ====================

    document.getElementById('modal-close-btn').addEventListener('click', () => {
        closeModal(document.getElementById('day-modal'));
    });

    document.getElementById('settings-close-btn').addEventListener('click', () => {
        closeModal(document.getElementById('settings-modal'));
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================

    function initApp() {
        initTheme();
        loadPlan();
        loadAnalytics();
        
        const savedTimezone = localStorage.getItem('timezone') || 'Europe/Moscow';
        document.getElementById('timezone-select').value = savedTimezone;

        if (appData.user) {
            document.getElementById('user-id-display').textContent = appData.user.id;
        }

        console.log('🚀 TrainPlan инициализирован!');
        console.log('👤 Пользователь:', appData.user);
    }

    checkAuth();
});