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

    // Улучшенная функция уведомлений
    function showNotification(message, type = 'success') {
        // Удаляем старые уведомления
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(notif => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : '#4CAF50'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        
        document.body.appendChild(notification);

        // Анимация появления
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    // Навигация
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    // Модальные окна - исправленная версия без лагов
    function openModal(modalElement) {
        modalElement.style.display = 'flex';
        modalElement.style.opacity = '0';
        
        // Принудительный reflow
        modalElement.offsetHeight;
        
        requestAnimationFrame(() => {
            modalElement.style.opacity = '1';
            modalElement.classList.add('active');
        });
    }

    function closeModal(modalElement) {
        modalElement.style.opacity = '0';
        modalElement.classList.remove('active');
        
        setTimeout(() => {
            if (!modalElement.classList.contains('active')) {
                modalElement.style.display = 'none';
            }
        }, 300);
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

    // Улучшенная функция загрузки базового плана
    document.getElementById('load-default-plan').addEventListener('click', async () => {
        try {
            showNotification('Загружаем базовый план...', 'success');
            
            const response = await fetch(`${BACKEND_URL}/api/load-default-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
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

    // Улучшенная функция создания группы
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
            showNotification('Создаем группу...', 'success');
            
            const response = await fetch(`${BACKEND_URL}/api/groups/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    plan_type: planType,
                    creator_id: 1
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Автоматическое копирование кода
                try {
                    await navigator.clipboard.writeText(result.invite_code);
                    showNotification(`✅ Группа создана! Код "${result.invite_code}" скопирован в буфер обмена!`);
                } catch (copyError) {
                    // Fallback для браузеров без clipboard API
                    const textArea = document.createElement('textarea');
                    textArea.value = result.invite_code;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
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

    // Присоединение к группе
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invite_code: inviteCode,
                    user_id: 1
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

    // Открытие деталей группы
    window.openGroupDetail = function(groupId) {
        fetch(`${BACKEND_URL}/api/groups/${groupId}`)
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
            <div class="group-info">
                <p><strong>Описание:</strong> ${data.group.description || 'Отсутствует'}</p>
                <p><strong>Тип плана:</strong> ${data.group.plan_type === 'week' ? 'Недельный' : 'Месячный'}</p>
                <p><strong>Код приглашения:</strong> <code>${data.group.invite_code}</code></p>
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
        showNotification('🎨 Тема изменена');
    });

    document.getElementById('timezone-select').addEventListener('change', function() {
        localStorage.setItem('timezone', this.value);
        showNotification('🌍 Часовой пояс сохранен');
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

        // Создаем 7 дней если плана нет
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
            dayCard.className = `day-card ${dayData.is_rest_day ? 'rest-day' : ''}`;
            
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

    // Модальное окно дня
    function openDayModal(dayIndex) {
        currentEditingDayIndex = dayIndex;
        
        // Убедимся что план существует
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

        openModal(document.getElementById('day-modal'));
    }

    function renderExercisesList(exercises) {
        const listContainer = document.getElementById('exercises-list');
        listContainer.innerHTML = '';
        
        if (!exercises || exercises.length === 0) {
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
        if (currentEditingDayIndex === null || !appData.plan[currentEditingDayIndex].exercises) return;
        
        appData.plan[currentEditingDayIndex].exercises.splice(exerciseIndex, 1);
        renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
        savePlan();
    };

    // Улучшенная функция сохранения плана
    async function savePlan() {
        try {
            console.log('Saving plan:', appData.plan);
            
            const response = await fetch(`${BACKEND_URL}/api/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: appData.plan })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification('✅ План сохранен!');
                renderWeekPlan();
            } else {
                showNotification(result.error || '❌ Ошибка при сохранении', 'error');
            }
        } catch (error) {
            console.error('Error saving plan:', error);
            showNotification('❌ Ошибка при сохранении', 'error');
        }
    }

    // Обработчики форм - исправленные
    document.getElementById('rest-day-toggle').addEventListener('change', function() {
        if (currentEditingDayIndex === null) return;
        
        const isRestDay = this.checked;
        appData.plan[currentEditingDayIndex].is_rest_day = isRestDay;
        
        // Если день стал выходным, очищаем упражнения
        if (isRestDay) {
            appData.plan[currentEditingDayIndex].exercises = [];
            renderExercisesList([]);
        }
        
        savePlan();
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

        // Убедимся что массив упражнений существует
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

    // Кнопка начала тренировки
    document.getElementById('start-workout-btn').addEventListener('click', function() {
        showNotification('🏋️ Тренировка начата! Отмечайте выполненные упражнения.', 'success');
        // Здесь можно добавить логику отслеживания выполнения
    });

    // Закрытие модальных окон
    document.getElementById('modal-close-btn').addEventListener('click', () => {
        closeModal(document.getElementById('day-modal'));
    });

    document.getElementById('settings-close-btn').addEventListener('click', () => {
        closeModal(document.getElementById('settings-modal'));
    });

    // Закрытие модальных окон по клику на фон
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });

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