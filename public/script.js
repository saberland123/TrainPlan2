document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.enableClosingConfirmation();

    const BACKEND_URL = window.location.hostname.includes('render.com') 
        ? window.location.origin
        : 'http://localhost:3000';

    let appData = {
        plan: [],
        weekDates: [],
        weekNumber: 0,
        stats: {}
    };
    let currentEditingDayIndex = null;
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

    // Инициализация темы
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.classList.toggle('light-theme', savedTheme === 'light');
        document.getElementById('theme-toggle').checked = savedTheme === 'light';
    }

    // Показать уведомление
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Навигация
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    // Модальные окна
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
        }, 200);
    }

    // Форматирование даты
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

    // Обработчики навигации
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

    // Загрузка базового плана
    document.getElementById('load-default-plan').addEventListener('click', async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/load-default-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                await loadPlan();
                showNotification('Базовый план загружен!');
            } else {
                showNotification('Ошибка при загрузке плана', 'error');
            }
        } catch (error) {
            console.error('Error loading default plan:', error);
            showNotification('Ошибка при загрузке плана', 'error');
        }
    });

    // Групповые тренировки
    async function loadUserGroups() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/user/1`);
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
                    <h3>👥 У вас пока нет групп</h3>
                    <p>Создайте первую группу и пригласите друзей!</p>
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
                    <span class="member-count">👥 ${group.member_count}</span>
                </div>
                <div class="group-description">${group.description || 'Без описания'}</div>
                <button class="btn-secondary" onclick="openGroupDetail(${group.id})">
                    Открыть группу
                </button>
            `;
            container.appendChild(groupCard);
        });
    }

    // Переключение табов в группах
    window.switchGroupTab = function(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.getElementById(`${tabName}-tab`).classList.add('active');
        event.target.classList.add('active');
    }

    // Создание группы с автокопированием кода
    document.getElementById('create-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('group-name').value;
        const description = document.getElementById('group-description').value;
        const planType = document.getElementById('group-plan-type').value;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description,
                    plan_type: planType,
                    creator_id: 1
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Автоматическое копирование кода
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(result.invite_code);
                    showNotification(`Код ${result.invite_code} скопирован!`);
                } else {
                    showNotification(`Код группы: ${result.invite_code}`);
                }
                
                document.getElementById('create-group-form').reset();
                showScreen('groups-screen');
                loadUserGroups();
            }
        } catch (error) {
            console.error('Error creating group:', error);
            showNotification('Ошибка при создании группы', 'error');
        }
    });

    // Присоединение к группе
    document.getElementById('join-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const inviteCode = document.getElementById('invite-code').value.toUpperCase();
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invite_code: inviteCode,
                    user_id: 1
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                showNotification(`Вы присоединились к группе "${result.group_name}"`);
                document.getElementById('invite-code').value = '';
                showScreen('groups-screen');
                loadUserGroups();
            } else {
                showNotification('Ошибка при присоединении к группе', 'error');
            }
        } catch (error) {
            console.error('Error joining group:', error);
            showNotification('Ошибка при присоединении к группе', 'error');
        }
    });

    // Открытие деталей группы
    window.openGroupDetail = function(groupId) {
        fetch(`${BACKEND_URL}/api/groups/${groupId}`)
            .then(response => response.json())
            .then(data => {
                renderGroupDetail(data);
                showScreen('group-detail-screen');
            })
            .catch(error => {
                console.error('Error loading group details:', error);
                showNotification('Ошибка при загрузке группы', 'error');
            });
    };

    function renderGroupDetail(data) {
        document.getElementById('group-detail-title').textContent = data.group.name;
        const container = document.getElementById('group-detail-container');
        
        container.innerHTML = `
            <div class="group-info">
                <p><strong>Описание:</strong> ${data.group.description || 'Отсутствует'}</p>
                <p><strong>Тип плана:</strong> ${data.group.plan_type === 'week' ? 'Недельный' : 'Месячный'}</p>
                <p><strong>Код приглашения:</strong> ${data.group.invite_code}</p>
            </div>
            <div class="members-list">
                <h4>Участники (${data.members.length})</h4>
                ${data.members.map(member => `
                    <div class="member-item">
                        <span>${member.first_name}</span>
                        <small>${member.username ? '@' + member.username : ''}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Лидерборд
    async function loadLeaderboard() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/leaderboard`);
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
            container.innerHTML = '<div class="empty-state"><p>Пока нет данных для таблицы лидеров</p></div>';
            return;
        }

        leaders.forEach((leader, index) => {
            const rank = index + 1;
            const leaderItem = document.createElement('div');
            leaderItem.className = 'leader-item';
            leaderItem.innerHTML = `
                <div class="leader-rank">${rank}</div>
                <div class="leader-info">
                    <div class="leader-name">${leader.first_name || 'Пользователь'}</div>
                    <div class="leader-stats">
                        ${leader.total_workout_days} дней • Стрик: ${leader.current_streak}
                    </div>
                </div>
                <div class="leader-badge">
                    ${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅'}
                </div>
            `;
            container.appendChild(leaderItem);
        });
    }

    // Аналитика
    async function loadAnalytics() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/analytics/1`);
            if (response.ok) {
                const data = await response.json();
                renderAnalytics(data);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    function renderAnalytics(data) {
        // Общая статистика
        document.getElementById('stat-days-analytics').textContent = data.leader_stats?.total_workout_days || 0;
        document.getElementById('stat-weeks-analytics').textContent = Math.floor((data.leader_stats?.total_workout_days || 0) / 7);
        document.getElementById('stat-total-analytics').textContent = data.leader_stats?.total_workout_days || 0;
        document.getElementById('stat-streak-analytics').textContent = data.leader_stats?.current_streak || 0;
        document.getElementById('stat-best-streak').textContent = data.leader_stats?.longest_streak || 0;
    }

    // Настройки
    document.getElementById('theme-toggle').addEventListener('change', function() {
        const isLight = this.checked;
        document.body.classList.toggle('light-theme', isLight);
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        showNotification('Тема изменена');
    });

    document.getElementById('timezone-select').addEventListener('change', function() {
        localStorage.setItem('timezone', this.value);
        showNotification('Часовой пояс сохранен');
    });

    // План тренировок
    async function loadPlan() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/plan`);
            if (response.ok) {
                const data = await response.json();
                appData.plan = data.plan;
                appData.weekDates = data.weekDates;
                appData.weekNumber = data.weekNumber;
                renderWeekPlan();
                loadStats();
            }
        } catch (error) {
            console.error('Error loading plan:', error);
        }
    }

    function renderWeekPlan() {
        const container = document.getElementById('week-plan-container');
        const weekInfo = document.getElementById('week-info');
        container.innerHTML = '';
        
        if (appData.weekDates && appData.weekDates.length > 0) {
            weekInfo.textContent = `Неделя ${appData.weekNumber} • ${formatWeekRange(appData.weekDates)}`;
        }

        appData.plan.forEach((dayData, index) => {
            const dayCard = document.createElement('div');
            dayCard.className = `day-card ${dayData.is_rest_day ? 'rest-day' : ''}`;
            
            const exerciseCountText = dayData.is_rest_day 
                ? '🏖️ Выходной' 
                : `${dayData.exercises.length} упр.`;

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
                ${!dayData.is_rest_day && dayData.exercises.length > 0 ? `
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

    // Модальное окно дня
    function openDayModal(dayIndex) {
        currentEditingDayIndex = dayIndex;
        const dayData = appData.plan[dayIndex];

        const dateDisplay = appData.weekDates && appData.weekDates[dayIndex] 
            ? formatDate(appData.weekDates[dayIndex])
            : '';
        document.getElementById('modal-day-title').textContent = 
            `${dayNames[dayIndex]} • ${dateDisplay}`;

        renderExercisesList(dayData.exercises);
        
        const restDayToggle = document.getElementById('rest-day-toggle');
        const notificationSettings = document.getElementById('notification-settings');
        
        restDayToggle.checked = dayData.is_rest_day;
        notificationSettings.style.display = dayData.is_rest_day ? 'none' : 'block';

        document.getElementById('notification-time').value = dayData.notification_time || '19:00';

        openModal(document.getElementById('day-modal'));
    }

    function renderExercisesList(exercises) {
        const listContainer = document.getElementById('exercises-list');
        listContainer.innerHTML = '';
        
        if (exercises.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">Упражнений пока нет</p>';
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

    // Удаление упражнения
    window.deleteExercise = function(exerciseIndex) {
        appData.plan[currentEditingDayIndex].exercises.splice(exerciseIndex, 1);
        renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
        savePlan();
    };

    // Сохранение плана
    async function savePlan() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: appData.plan })
            });
            
            if (response.ok) {
                showNotification('План сохранен!');
                renderWeekPlan();
            }
        } catch (error) {
            console.error('Error saving plan:', error);
            showNotification('Ошибка при сохранении', 'error');
        }
    }

    // Обработчики форм
    document.getElementById('rest-day-toggle').addEventListener('change', function() {
        if (currentEditingDayIndex === null) return;
        
        const isRestDay = this.checked;
        appData.plan[currentEditingDayIndex].is_rest_day = isRestDay;
        
        const notificationSettings = document.getElementById('notification-settings');
        notificationSettings.style.display = isRestDay ? 'none' : 'block';

        // Если день стал выходным, очищаем упражнения
        if (isRestDay) {
            appData.plan[currentEditingDayIndex].exercises = [];
            renderExercisesList([]);
        }
        
        savePlan();
    });

    document.getElementById('save-notification-settings').addEventListener('click', () => {
        if (currentEditingDayIndex === null) return;

        const notificationTime = document.getElementById('notification-time').value;
        appData.plan[currentEditingDayIndex].notification_time = notificationTime;
        
        savePlan();
        showNotification('Настройки уведомлений сохранены');
    });

    document.getElementById('add-exercise-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('ex-name').value;
        const sets = document.getElementById('ex-sets').value;
        const reps = document.getElementById('ex-reps').value;

        if (name && sets && reps && currentEditingDayIndex !== null) {
            const newExercise = { 
                name, 
                sets: parseInt(sets), 
                reps,
                rest_between_sets: 60,
                rest_after_exercise: 60
            };
            
            appData.plan[currentEditingDayIndex].exercises.push(newExercise);
            renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
            savePlan();
            
            e.target.reset();
            showNotification('Упражнение добавлено');
        }
    });

    // Закрытие модальных окон
    document.getElementById('modal-close-btn').addEventListener('click', () => {
        closeModal(document.getElementById('day-modal'));
    });

    document.getElementById('settings-close-btn').addEventListener('click', () => {
        closeModal(document.getElementById('settings-modal'));
    });

    // Статистика
    async function loadStats() {
        try {
            // Заглушка для статистики - в реальном приложении здесь будет API вызов
            const completedThisWeek = appData.plan.reduce((count, day) => {
                return count + (day.exercises.length > 0 ? 1 : 0);
            }, 0);
            
            const totalCompleted = completedThisWeek * appData.weekNumber;
            
            appData.stats = {
                completedThisWeek,
                totalCompleted,
                currentStreak: 0
            };
            
            renderStats();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    function renderStats() {
        document.getElementById('stat-days').textContent = appData.stats.completedThisWeek || 0;
        document.getElementById('stat-weeks').textContent = Math.floor((appData.stats.totalCompleted || 0) / 7);
    }

    // Инициализация
    function initApp() {
        initTheme();
        loadPlan();
        
        // Загрузка сохраненного часового пояса
        const savedTimezone = localStorage.getItem('timezone') || 'Europe/Moscow';
        document.getElementById('timezone-select').value = savedTimezone;

        if (tg.initDataUnsafe?.user) {
            document.getElementById('user-name').textContent = tg.initDataUnsafe.user.first_name;
        }
    }

    initApp();
});