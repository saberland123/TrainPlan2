document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.enableClosingConfirmation();

    const BACKEND_URL = 'https://trainplan2-1.onrender.com';

    let appData = {
        plan: [],
        weekDates: [],
        weekNumber: 0,
        stats: {}
    };
    let currentEditingDayIndex = null;
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

    // Элементы страницы
    const screens = document.querySelectorAll('.screen');
    const modal = document.getElementById('day-modal');
    const settingsModal = document.getElementById('settings-modal');
    
    // Анимации
    function animateElement(element, animation) {
        element.style.animation = 'none';
        setTimeout(() => {
            element.style.animation = `${animation} 0.5s ease-out`;
        }, 10);
    }

    function showScreen(screenId) {
        // Анимация перехода между экранами
        screens.forEach(screen => {
            if (screen.classList.contains('active')) {
                screen.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => {
                    screen.classList.remove('active');
                }, 250);
            }
        });

        setTimeout(() => {
            const targetScreen = document.getElementById(screenId);
            targetScreen.classList.add('active');
            animateElement(targetScreen, 'fadeIn');
            
            // Вибрация для обратной связи
            tg.HapticFeedback.impactOccurred('soft');
        }, 300);
    }

    function openModal(modalElement) {
        modalElement.style.display = 'flex';
        setTimeout(() => {
            modalElement.classList.add('active');
            animateElement(modalElement.querySelector('.modal-content'), 'scaleIn');
            tg.HapticFeedback.impactOccurred('light');
        }, 10);
    }

    function closeModal(modalElement) {
        modalElement.classList.remove('active');
        animateElement(modalElement.querySelector('.modal-content'), 'fadeOut');
        setTimeout(() => {
            modalElement.style.display = 'none';
        }, 300);
        tg.HapticFeedback.impactOccurred('light');
    }

    // Навигация
    document.getElementById('menu-plan-btn').addEventListener('click', () => {
        renderWeekPlan();
        showScreen('plan-screen');
    });

    document.getElementById('menu-profile-btn').addEventListener('click', () => {
        loadStats();
        showScreen('profile-screen');
    });

    document.getElementById('menu-settings-btn').addEventListener('click', () => openModal(settingsModal));
    
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => showScreen('home-screen'));
    });

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

    // Загрузка базового плана
    document.getElementById('load-default-plan').addEventListener('click', async () => {
        if (confirm('Загрузить базовый план тренировок? Это перезапишет текущий план.')) {
            try {
                tg.showPopup({
                    title: 'Загрузка',
                    message: 'Загружаем базовый план...',
                    buttons: []
                });

                const response = await fetch('/api/load-default-plan', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `tma ${tg.initData}`
                    }
                });

                if (response.ok) {
                    await loadPlan();
                    tg.showPopup({
                        title: 'Успех!',
                        message: 'Базовый план загружен!',
                        buttons: [{ type: 'ok' }]
                    });
                    tg.HapticFeedback.notificationOccurred('success');
                }
            } catch (error) {
                console.error(error);
                tg.showAlert('Ошибка при загрузке плана');
                tg.HapticFeedback.notificationOccurred('error');
            }
        }
    });

    // Рендеринг плана с анимациями
    function renderWeekPlan() {
        const container = document.getElementById('week-plan-container');
        const weekInfo = document.getElementById('week-info');
        container.innerHTML = '';
        
        if (appData.weekDates && appData.weekDates.length > 0) {
            weekInfo.textContent = `Неделя ${appData.weekNumber} • ${formatWeekRange(appData.weekDates)}`;
        }

        appData.plan.forEach((dayData, index) => {
            const dayCard = document.createElement('div');
            dayCard.className = 'day-card';
            if (dayData.is_rest_day) {
                dayCard.classList.add('rest-day');
            }
            
            // Анимация появления с задержкой
            dayCard.style.animationDelay = `${index * 0.1}s`;
            dayCard.style.animation = 'scaleIn 0.5s ease-out forwards';
            dayCard.style.opacity = '0';

            const exerciseCountText = dayData.is_rest_day 
                ? '🏖️ Выходной' 
                : `${dayData.exercises.length} упр.`;

            const notificationInfo = dayData.notification_time && !dayData.is_rest_day 
                ? `<div class="notification-time">🔔 ${dayData.notification_time}</div>`
                : '';

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
                ${notificationInfo}
                ${!dayData.is_rest_day && dayData.exercises.length > 0 ? 
                    `<div class="day-exercises-preview">
                        ${dayData.exercises.slice(0, 2).map(ex => 
                            `<span class="exercise-preview">${ex.name}</span>`
                        ).join('')}
                        ${dayData.exercises.length > 2 ? '<span class="exercise-more">...</span>' : ''}
                    </div>` : ''
                }
            `;
            
            dayCard.addEventListener('click', () => openDayModal(index));
            container.appendChild(dayCard);
        });
    }

    // Загрузка статистики
    async function loadStats() {
        try {
            const response = await fetch('/api/stats', {
                method: 'GET',
                headers: {
                    'Authorization': `tma ${tg.initData}`
                }
            });
            
            if (response.ok) {
                appData.stats = await response.json();
                renderProfile();
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    function renderProfile() {
        document.getElementById('stat-days').textContent = appData.stats.completedThisWeek || 0;
        document.getElementById('stat-weeks').textContent = Math.floor((appData.stats.totalCompleted || 0) / 5);
        document.getElementById('stat-total').textContent = appData.stats.totalCompleted || 0;
        
        const progressElement = document.getElementById('stat-progress');
        const completed = appData.stats.completedThisWeek || 0;
        const trainingDaysCount = appData.plan.filter(day => !day.is_rest_day).length;
        progressElement.textContent = `${completed}/${trainingDaysCount} дней`;
        
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            const progressPercent = trainingDaysCount > 0 ? Math.min((completed / trainingDaysCount) * 100, 100) : 0;
            progressBar.style.width = `${progressPercent}%`;
            progressBar.style.backgroundColor = progressPercent >= 80 ? '#28a745' : 
                                              progressPercent >= 60 ? '#ffc107' : '#007bff';
        }

        const weekInfoElement = document.getElementById('week-info-profile');
        if (weekInfoElement && appData.weekDates && appData.weekDates.length > 0) {
            weekInfoElement.textContent = `Неделя ${appData.weekNumber} • ${formatWeekRange(appData.weekDates)}`;
        }
    }

    // Модальные окна
    function openDayModal(dayIndex) {
        currentEditingDayIndex = dayIndex;
        const dayData = appData.plan[dayIndex];

        const dateDisplay = appData.weekDates && appData.weekDates[dayIndex] 
            ? formatDate(appData.weekDates[dayIndex])
            : '';
        document.getElementById('modal-day-title').textContent = 
            `${dayNames[dayIndex]} • ${dateDisplay}`;

        renderExercisesList(dayData.exercises);
        
        const form = document.getElementById('add-exercise-form');
        const restDayToggle = document.getElementById('rest-day-toggle');
        const notificationSettings = document.getElementById('notification-settings');
        
        restDayToggle.checked = dayData.is_rest_day;
        form.style.display = dayData.is_rest_day ? 'none' : 'flex';
        notificationSettings.style.display = dayData.is_rest_day ? 'none' : 'block';

        document.getElementById('notification-time').value = dayData.notification_time || '19:00';
        document.getElementById('notification-interval').value = dayData.notification_interval || 10;
        document.getElementById('rest-between-sets').value = dayData.rest_between_sets || 60;
        document.getElementById('rest-after-exercise').value = dayData.rest_after_exercise || 60;

        openModal(modal);
    }

    function closeDayModal() {
        closeModal(modal);
        currentEditingDayIndex = null;
    }

    function closeSettingsModal() {
        closeModal(settingsModal);
    }

    // Обработчик переключения выходного дня
    document.getElementById('rest-day-toggle').addEventListener('change', function() {
        if (currentEditingDayIndex === null) return;
        
        const isRestDay = this.checked;
        appData.plan[currentEditingDayIndex].is_rest_day = isRestDay;
        
        const form = document.getElementById('add-exercise-form');
        const notificationSettings = document.getElementById('notification-settings');
        
        // Анимация переключения
        form.style.opacity = '0';
        notificationSettings.style.opacity = '0';
        
        setTimeout(() => {
            form.style.display = isRestDay ? 'none' : 'flex';
            notificationSettings.style.display = isRestDay ? 'none' : 'block';
            
            setTimeout(() => {
                form.style.opacity = '1';
                notificationSettings.style.opacity = '1';
            }, 50);
        }, 300);

        if (isRestDay) {
            appData.plan[currentEditingDayIndex].exercises = [];
            renderExercisesList([]);
        }
        
        savePlan();
        renderWeekPlan();
        tg.HapticFeedback.impactOccurred('medium');
    });

    function renderExercisesList(exercises) {
        const listContainer = document.getElementById('exercises-list');
        listContainer.innerHTML = '';
        
        if (exercises.length === 0) {
            listContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px; animation: fadeIn 0.5s ease-out;">Упражнений пока нет</p>';
            return;
        }

        exercises.forEach((ex, index) => {
            const item = document.createElement('div');
            item.className = 'exercise-item';
            item.style.animationDelay = `${index * 0.1}s`;
            item.innerHTML = `
                <div class="exercise-info">
                    <strong>${ex.name}</strong>
                    <span>${ex.sets} подход(а) × ${ex.reps}</span>
                    <small>Отдых: ${ex.rest_between_sets || 60}с между подходами, ${ex.rest_after_exercise || 60}с после</small>
                </div>
                <button class="delete-btn" data-index="${index}" title="Удалить упражнение">❌</button>
            `;
            listContainer.appendChild(item);
        });
    }

    // Работа с API
    async function loadPlan() {
        try {
            tg.MainButton.showProgress();
            const response = await fetch('/api/plan', {
                method: 'GET',
                headers: {
                    'Authorization': `tma ${tg.initData}`
                }
            });
            
            if (!response.ok) throw new Error('Ошибка при загрузке плана');
            
            const data = await response.json();
            appData.plan = data.plan;
            appData.weekDates = data.weekDates;
            appData.weekNumber = data.weekNumber;
            
            renderWeekPlan();
        } catch (error) {
            console.error(error);
            tg.showAlert('Не удалось загрузить план тренировок');
        } finally {
            tg.MainButton.hideProgress();
        }
    }

    async function savePlan() {
        try {
            tg.MainButton.showProgress();
            const response = await fetch('/api/plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `tma ${tg.initData}`
                },
                body: JSON.stringify({ plan: appData.plan })
            });
            
            if (!response.ok) throw new Error('Ошибка при сохранении плана');
            
            const result = await response.json();
            tg.HapticFeedback.notificationOccurred('success');
        } catch (error) {
            console.error(error);
            tg.showAlert('Не удалось сохранить план');
            tg.HapticFeedback.notificationOccurred('error');
        } finally {
            tg.MainButton.hideProgress();
        }
    }

    // Обработчики событий
    document.getElementById('modal-close-btn').addEventListener('click', closeDayModal);
    document.getElementById('settings-close-btn').addEventListener('click', closeSettingsModal);

    // Сохранение настроек уведомлений
    document.getElementById('save-notification-settings').addEventListener('click', () => {
        if (currentEditingDayIndex === null) return;

        const notificationTime = document.getElementById('notification-time').value;
        const notificationInterval = document.getElementById('notification-interval').value;

        appData.plan[currentEditingDayIndex].notification_time = notificationTime;
        appData.plan[currentEditingDayIndex].notification_interval = parseInt(notificationInterval);

        savePlan();
        
        tg.showPopup({
            title: 'Настройки сохранены',
            message: `Уведомления: ${notificationTime}, интервал: ${notificationInterval} мин`,
            buttons: [{ type: 'ok' }]
        });
        tg.HapticFeedback.notificationOccurred('success');
    });

    // Добавление упражнения с анимацией
    document.getElementById('add-exercise-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('ex-name').value;
        const sets = document.getElementById('ex-sets').value;
        const reps = document.getElementById('ex-reps').value;
        const restBetweenSets = document.getElementById('rest-between-sets').value;
        const restAfterExercise = document.getElementById('rest-after-exercise').value;

        if (name && sets && reps && currentEditingDayIndex !== null) {
            const newExercise = { 
                name, 
                sets: parseInt(sets), 
                reps,
                rest_between_sets: parseInt(restBetweenSets) || 60,
                rest_after_exercise: parseInt(restAfterExercise) || 60
            };
            
            appData.plan[currentEditingDayIndex].exercises.push(newExercise);
            
            renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
            renderWeekPlan();
            savePlan();
            
            // Анимация успешного добавления
            const form = e.target;
            form.style.transform = 'scale(0.98)';
            setTimeout(() => {
                form.style.transform = 'scale(1)';
            }, 150);
            
            e.target.reset();
            tg.HapticFeedback.impactOccurred('light');
        }
    });

    // Удаление упражнения с анимацией
    document.getElementById('exercises-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const exerciseIndex = parseInt(e.target.getAttribute('data-index'));
            if (currentEditingDayIndex !== null && !isNaN(exerciseIndex)) {
                const exerciseItem = e.target.closest('.exercise-item');
                exerciseItem.style.animation = 'fadeOut 0.3s ease-out forwards';
                
                setTimeout(() => {
                    appData.plan[currentEditingDayIndex].exercises.splice(exerciseIndex, 1);
                    renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
                    renderWeekPlan();
                    savePlan();
                }, 300);
                
                tg.HapticFeedback.notificationOccurred('warning');
            }
        }
    });

    // Инициализация
    tg.MainButton.setText('💪 Сохранить и закрыть');
    tg.MainButton.show();
    
    tg.onEvent('mainButtonClicked', () => {
        savePlan().then(() => {
            tg.close();
        });
    });

    if (tg.initDataUnsafe?.user) {
        document.getElementById('user-name').textContent = tg.initDataUnsafe.user.first_name;
    }

    // Загрузка данных
    loadPlan().then(() => {
        loadStats();
        showScreen('home-screen');
    });

    // Автообновление
    setInterval(() => {
        loadPlan();
        loadStats();
    }, 24 * 60 * 60 * 1000);
});// Добавляем в существующий script.js

// Новые экраны
const screens = {
    // существующие...
    'groups-screen': 'groups-screen',
    'create-group-screen': 'create-group-screen', 
    'group-detail-screen': 'group-detail-screen',
    'leaderboard-screen': 'leaderboard-screen',
    'analytics-screen': 'analytics-screen',
    'share-screen': 'share-screen'
};

// Навигация
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

// Функции для групповых тренировок
async function loadUserGroups() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/groups/user/1`, { // user_id должен быть динамическим
            headers: { 'Authorization': `tma ${tg.initData}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderGroupsList(data.groups);
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        tg.showAlert('Не удалось загрузить группы');
    }
}

function renderGroupsList(groups) {
    const container = document.getElementById('groups-list-container');
    container.innerHTML = '';
    
    if (groups.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>👥 У вас пока нет групп</h3>
                <p>Создайте первую группу и пригласите друзей!</p>
                <button class="btn-primary" onclick="showScreen('create-group-screen')">
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
                <span class="member-count">👥 ${group.member_count}</span>
            </div>
            <div class="group-description">${group.description || 'Без описания'}</div>
            <div class="group-type">Тип: ${group.plan_type === 'week' ? 'Недельный' : 'Месячный'} план</div>
            <button class="btn-secondary" onclick="openGroupDetail(${group.id})">
                Открыть
            </button>
        `;
        container.appendChild(groupCard);
    });
}

// Создание группы
document.getElementById('create-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('group-name').value;
    const description = document.getElementById('group-description').value;
    const planType = document.getElementById('group-plan-type').value;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/groups/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${tg.initData}`
            },
            body: JSON.stringify({
                name,
                description,
                plan_type: planType,
                creator_id: 1 // Должен быть динамическим
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            tg.showPopup({
                title: 'Группа создана!',
                message: `Пригласительный код: ${result.invite_code}`,
                buttons: [{ type: 'ok' }]
            });
            showScreen('groups-screen');
            loadUserGroups();
        }
    } catch (error) {
        console.error('Error creating group:', error);
        tg.showAlert('Ошибка при создании группы');
    }
});

// Присоединение к группе
document.getElementById('join-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const inviteCode = document.getElementById('invite-code').value.toUpperCase();
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/groups/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${tg.initData}`
            },
            body: JSON.stringify({
                invite_code: inviteCode,
                user_id: 1 // Должен быть динамическим
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            tg.showPopup({
                title: 'Успех!',
                message: `Вы присоединились к группе "${result.group_name}"`,
                buttons: [{ type: 'ok' }]
            });
            document.getElementById('invite-code').value = '';
            showScreen('groups-screen');
            loadUserGroups();
        } else {
            const error = await response.json();
            tg.showAlert(error.error || 'Ошибка при присоединении');
        }
    } catch (error) {
        console.error('Error joining group:', error);
        tg.showAlert('Ошибка при присоединении к группе');
    }
});

// Функции для лидерборда
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
    
    leaders.forEach((leader, index) => {
        const rank = index + 1;
        const leaderItem = document.createElement('div');
        leaderItem.className = 'leader-item';
        leaderItem.innerHTML = `
            <div class="leader-rank">${rank}</div>
            <div class="leader-info">
                <div class="leader-name">${leader.first_name}</div>
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
        const response = await fetch(`${BACKEND_URL}/api/analytics/1`); // user_id должен быть динамическим
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
    document.getElementById('total-workout-days').textContent = data.leader_stats.total_workout_days;
    document.getElementById('current-streak').textContent = data.leader_stats.current_streak;
    document.getElementById('longest-streak').textContent = data.leader_stats.longest_streak;
    
    // Топ упражнений
    const exercisesContainer = document.getElementById('top-exercises');
    exercisesContainer.innerHTML = data.exercise_stats.slice(0, 5).map(ex => `
        <div class="exercise-stat">
            <span>${ex.exercise_name}</span>
            <span>${ex.count} раз</span>
        </div>
    `).join('');
    
    // Еженедельная активность
    renderWeeklyChart(data.weekly_stats);
}

// Шаринг результатов
async function shareResults() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/share/results`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${tg.initData}`
            },
            body: JSON.stringify({
                user_id: 1, // Должен быть динамическим
                days_range: 7
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Показываем ссылку для шаринга
            tg.showPopup({
                title: 'Поделиться результатами',
                message: `Ваша ссылка: ${result.share_code}\n\nСкопируйте и отправьте друзьям!`,
                buttons: [{ type: 'ok' }]
            });
            
            // Можно также автоматически скопировать в буфер обмена
            if (navigator.clipboard) {
                navigator.clipboard.writeText(result.share_code);
            }
        }
    } catch (error) {
        console.error('Error sharing results:', error);
        tg.showAlert('Ошибка при создании ссылки');
    }
}