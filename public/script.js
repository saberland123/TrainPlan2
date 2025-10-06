document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();

    const BACKEND_URL = '';

    let appData = {
        plan: [],
        profile: {},
        settings: {}
    };
    let currentEditingDayIndex = null;
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

    // --- ЭЛЕМЕНТЫ СТРАНИЦЫ ---
    const screens = document.querySelectorAll('.screen');
    const modal = document.getElementById('day-modal');
    const settingsModal = document.getElementById('settings-modal');
    
    // --- НАВИГАЦИЯ ---
    function showScreen(screenId) {
        screens.forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    document.getElementById('menu-plan-btn').addEventListener('click', () => {
        renderWeekPlan();
        showScreen('plan-screen');
    });

    document.getElementById('menu-profile-btn').addEventListener('click', () => {
        renderProfile();
        showScreen('profile-screen');
    });

    document.getElementById('menu-settings-btn').addEventListener('click', () => {
        openSettingsModal();
    });

    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => showScreen('home-screen'));
    });

    // --- РЕНДЕРИНГ ---
    function renderWeekPlan() {
        const container = document.getElementById('week-plan-container');
        container.innerHTML = '';
        
        appData.plan.forEach((dayData, index) => {
            const dayCard = document.createElement('div');
            dayCard.className = 'day-card';
            if (dayData.isRestDay) {
                dayCard.classList.add('rest-day');
            }
            
            const exerciseCountText = dayData.isRestDay 
                ? '🏖️ Выходной' 
                : `${dayData.exercises.length} упр.`;

            const notificationInfo = dayData.notificationTime && !dayData.isRestDay 
                ? `<div class="notification-time">🔔 ${dayData.notificationTime}</div>`
                : '';

            dayCard.innerHTML = `
                <div class="day-header">
                    <span class="day-name">${dayNames[index]}</span>
                    <span class="exercise-count">${exerciseCountText}</span>
                </div>
                ${notificationInfo}
            `;
            
            dayCard.addEventListener('click', () => {
                openDayModal(index);
            });
            
            container.appendChild(dayCard);
        });
    }

    function renderProfile() {
        if (appData.profile) {
            document.getElementById('stat-days').textContent = appData.profile.completedDays || 0;
            document.getElementById('stat-weeks').textContent = appData.profile.completedWeeks || 0;
            document.getElementById('stat-progress').textContent = appData.profile.progress || "0/0";
        }
    }

    // --- МОДАЛЬНЫЕ ОКНА ---
    function openDayModal(dayIndex) {
        currentEditingDayIndex = dayIndex;
        const dayData = appData.plan[dayIndex];

        document.getElementById('modal-day-title').textContent = `Упражнения на ${dayNames[dayIndex]}`;
        renderExercisesList(dayData.exercises);
        
        const form = document.getElementById('add-exercise-form');
        form.style.display = dayData.isRestDay ? 'none' : 'flex';

        // Заполняем настройки уведомлений
        document.getElementById('notification-time').value = dayData.notificationTime || '19:00';
        document.getElementById('notification-interval').value = dayData.notificationInterval || 10;

        // Показываем/скрываем настройки уведомлений
        const notificationSettings = document.getElementById('notification-settings');
        notificationSettings.style.display = dayData.isRestDay ? 'none' : 'block';

        modal.style.display = 'flex';
    }

    function closeDayModal() {
        modal.style.display = 'none';
        currentEditingDayIndex = null;
    }

    function openSettingsModal() {
        loadSettings().then(() => {
            document.getElementById('global-notifications').checked = appData.settings.notificationsEnabled !== false;
            document.getElementById('sound-enabled').checked = appData.settings.soundEnabled !== false;
            document.getElementById('language-select').value = appData.settings.language || 'ru';
            document.getElementById('timezone-select').value = appData.settings.timezone || 'Europe/Moscow';
            
            settingsModal.style.display = 'flex';
        });
    }

    function closeSettingsModal() {
        settingsModal.style.display = 'none';
    }

    function renderExercisesList(exercises) {
        const listContainer = document.getElementById('exercises-list');
        listContainer.innerHTML = '';
        
        if (exercises.length === 0) {
            listContainer.innerHTML = '<p style="color: var(--secondary-text-color); text-align: center; padding: 20px;">Упражнений пока нет</p>';
            return;
        }

        exercises.forEach((ex, index) => {
            const item = document.createElement('div');
            item.className = 'exercise-item';
            item.innerHTML = `
                <div class="exercise-info">
                    <strong>${ex.name}</strong>
                    <span>${ex.sets} подход(а) × ${ex.reps} повторений</span>
                </div>
                <button class="delete-btn" data-index="${index}" title="Удалить упражнение">❌</button>
            `;
            listContainer.appendChild(item);
        });
    }

    // --- РАБОТА С API ---
    async function loadPlan() {
        try {
            tg.MainButton.showProgress();
            const response = await fetch(`/api/plan`, {
                method: 'GET',
                headers: {
                    'Authorization': `tma ${tg.initData}`
                }
            });
            
            if (!response.ok) throw new Error('Ошибка при загрузке плана');
            
            const planFromServer = await response.json();
            appData.plan = planFromServer;
            renderWeekPlan();
        } catch (error) {
            console.error(error);
            tg.showAlert('Не удалось загрузить план. Используются демо-данные.');
            // Демо-данные
            appData.plan = dayNames.map((day, index) => ({ 
                day, 
                exercises: [], 
                isRestDay: index >= 5,
                notificationTime: "19:00",
                notificationInterval: 10
            }));
            renderWeekPlan();
        } finally {
            tg.MainButton.hideProgress();
        }
    }

    async function savePlan() {
        try {
            tg.MainButton.showProgress();
            const response = await fetch(`/api/plan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `tma ${tg.initData}`
                },
                body: JSON.stringify({ plan: appData.plan })
            });
            
            if (!response.ok) throw new Error('Ошибка при сохранении плана');
            
            const result = await response.json();
            tg.showPopup({
                title: 'Успех!',
                message: result.message,
                buttons: [{ type: 'ok' }]
            });
        } catch (error) {
            console.error(error);
            tg.showAlert('Не удалось сохранить план. Проверьте соединение.');
        } finally {
            tg.MainButton.hideProgress();
        }
    }

    async function loadSettings() {
        try {
            const response = await fetch(`/api/settings`, {
                method: 'GET',
                headers: {
                    'Authorization': `tma ${tg.initData}`
                }
            });
            
            if (response.ok) {
                appData.settings = await response.json();
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
        }
    }

    async function saveSettings() {
        try {
            const response = await fetch(`/api/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `tma ${tg.initData}`
                },
                body: JSON.stringify({ 
                    settings: {
                        notificationsEnabled: document.getElementById('global-notifications').checked,
                        soundEnabled: document.getElementById('sound-enabled').checked,
                        language: document.getElementById('language-select').value,
                        timezone: document.getElementById('timezone-select').value
                    }
                })
            });
            
            if (response.ok) {
                tg.showPopup({
                    title: 'Настройки сохранены',
                    message: 'Изменения применены успешно!',
                    buttons: [{ type: 'ok' }]
                });
            }
        } catch (error) {
            console.error('Ошибка сохранения настроек:', error);
            tg.showAlert('Не удалось сохранить настройки.');
        }
    }

    // --- ОБРАБОТКА СОБЫТИЙ ---
    document.getElementById('modal-close-btn').addEventListener('click', closeDayModal);
    document.getElementById('settings-close-btn').addEventListener('click', closeSettingsModal);

    // Сохранение настроек уведомлений
    document.getElementById('save-notification-settings').addEventListener('click', () => {
        if (currentEditingDayIndex === null) return;

        const notificationTime = document.getElementById('notification-time').value;
        const notificationInterval = document.getElementById('notification-interval').value;

        appData.plan[currentEditingDayIndex].notificationTime = notificationTime;
        appData.plan[currentEditingDayIndex].notificationInterval = parseInt(notificationInterval);

        savePlan();
        
        tg.showPopup({
            title: 'Настройки сохранены',
            message: `Уведомления: ${notificationTime}, интервал: ${notificationInterval} мин`,
            buttons: [{ type: 'ok' }]
        });
    });

    // Сохранение глобальных настроек
    document.getElementById('save-global-settings').addEventListener('click', () => {
        saveSettings();
    });

    // Добавление упражнения
    document.getElementById('add-exercise-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('ex-name').value;
        const sets = document.getElementById('ex-sets').value;
        const reps = document.getElementById('ex-reps').value;

        if (name && sets && reps && currentEditingDayIndex !== null) {
            appData.plan[currentEditingDayIndex].exercises.push({ 
                name, 
                sets: parseInt(sets), 
                reps 
            });
            
            renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
            renderWeekPlan();
            savePlan();
            e.target.reset();
            tg.HapticFeedback.impactOccurred('light');
        }
    });

    // Удаление упражнения
    document.getElementById('exercises-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const exerciseIndex = parseInt(e.target.getAttribute('data-index'));
            if (currentEditingDayIndex !== null && !isNaN(exerciseIndex)) {
                appData.plan[currentEditingDayIndex].exercises.splice(exerciseIndex, 1);
                renderExercisesList(appData.plan[currentEditingDayIndex].exercises);
                renderWeekPlan();
                savePlan();
                tg.HapticFeedback.notificationOccurred('warning');
            }
        }
    });

    // --- ИНИЦИАЛИЗАЦИЯ ---
    tg.MainButton.setText('Сохранить и закрыть');
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
        showScreen('home-screen');
        tg.MainButton.show();
    });
});