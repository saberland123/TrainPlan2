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
        stats: {},
        currentWorkout: null,
        healthProfile: null,
        nutritionData: {
            meals: [],
            water: 0,
            targets: {}
        },
        challenges: [],
        achievements: [],
        exerciseLibrary: []
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
        oldNotifications.forEach(notif => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
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

    // Новые обработчики для здоровья и питания
    document.getElementById('menu-health-btn')?.addEventListener('click', () => {
        loadHealthProfile();
        showScreen('health-screen');
    });

    document.getElementById('menu-nutrition-btn')?.addEventListener('click', () => {
        loadNutritionData();
        showScreen('nutrition-screen');
    });

    document.getElementById('menu-challenges-btn')?.addEventListener('click', () => {
        loadChallenges();
        showScreen('challenges-screen');
    });

    document.getElementById('menu-exercises-btn')?.addEventListener('click', () => {
        loadExerciseLibrary();
        showScreen('exercises-screen');
    });

    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => showScreen('home-screen'));
    });

    // ==================== СИСТЕМА ЗДОРОВЬЯ ====================

    async function loadHealthProfile() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/health/profile`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                appData.healthProfile = data.health_profile;
                renderHealthProfile();
            }
        } catch (error) {
            console.error('Error loading health profile:', error);
            showNotification('❌ Ошибка загрузки профиля здоровья', 'error');
        }
    }

    function renderHealthProfile() {
        const container = document.getElementById('health-profile-container');
        if (!container) return;

        const profile = appData.healthProfile;
        
        container.innerHTML = `
            <div class="health-card">
                <h3>📊 Основные показатели</h3>
                <div class="health-grid">
                    <div class="health-metric">
                        <div class="value">${profile.age || '-'}</div>
                        <div class="label">Возраст</div>
                    </div>
                    <div class="health-metric">
                        <div class="value">${profile.height || '-'} см</div>
                        <div class="label">Рост</div>
                    </div>
                    <div class="health-metric">
                        <div class="value">${profile.weight || '-'} кг</div>
                        <div class="label">Вес</div>
                    </div>
                    <div class="health-metric">
                        <div class="value">${getGoalText(profile.goal)}</div>
                        <div class="label">Цель</div>
                    </div>
                </div>
            </div>

            <div class="health-card">
                <h3>🎯 Цели питания</h3>
                <div class="nutrition-overview">
                    <div class="nutrition-metric calories">
                        <div class="value">${profile.daily_calorie_target || 2000}</div>
                        <div class="label">Ккал</div>
                    </div>
                    <div class="nutrition-metric protein">
                        <div class="value">${profile.protein_target || 150}г</div>
                        <div class="label">Белки</div>
                    </div>
                    <div class="nutrition-metric carbs">
                        <div class="value">${profile.carb_target || 250}г</div>
                        <div class="label">Углеводы</div>
                    </div>
                    <div class="nutrition-metric fat">
                        <div class="value">${profile.fat_target || 67}г</div>
                        <div class="label">Жиры</div>
                    </div>
                </div>
            </div>

            <div class="health-card">
                <h3>📝 Редактировать профиль</h3>
                <form id="health-profile-form">
                    <div class="form-row">
                        <div class="form-group-vertical">
                            <label for="health-age">Возраст</label>
                            <input type="number" id="health-age" value="${profile.age || ''}" min="10" max="100">
                        </div>
                        <div class="form-group-vertical">
                            <label for="health-gender">Пол</label>
                            <select id="health-gender">
                                <option value="">Выберите пол</option>
                                <option value="male" ${profile.gender === 'male' ? 'selected' : ''}>Мужской</option>
                                <option value="female" ${profile.gender === 'female' ? 'selected' : ''}>Женский</option>
                                <option value="other" ${profile.gender === 'other' ? 'selected' : ''}>Другой</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group-vertical">
                            <label for="health-height">Рост (см)</label>
                            <input type="number" id="health-height" value="${profile.height || ''}" min="100" max="250">
                        </div>
                        <div class="form-group-vertical">
                            <label for="health-weight">Вес (кг)</label>
                            <input type="number" id="health-weight" value="${profile.weight || ''}" min="30" max="200" step="0.1">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group-vertical">
                            <label for="health-goal">Цель</label>
                            <select id="health-goal">
                                <option value="weight_loss" ${profile.goal === 'weight_loss' ? 'selected' : ''}>Похудение</option>
                                <option value="muscle_gain" ${profile.goal === 'muscle_gain' ? 'selected' : ''}>Набор массы</option>
                                <option value="maintenance" ${profile.goal === 'maintenance' ? 'selected' : ''}>Поддержание</option>
                                <option value="endurance" ${profile.goal === 'endurance' ? 'selected' : ''}>Выносливость</option>
                            </select>
                        </div>
                        <div class="form-group-vertical">
                            <label for="health-activity">Активность</label>
                            <select id="health-activity">
                                <option value="sedentary" ${profile.activity_level === 'sedentary' ? 'selected' : ''}>Сидячий</option>
                                <option value="light" ${profile.activity_level === 'light' ? 'selected' : ''}>Легкая</option>
                                <option value="moderate" ${profile.activity_level === 'moderate' ? 'selected' : ''}>Умеренная</option>
                                <option value="active" ${profile.activity_level === 'active' ? 'selected' : ''}>Активная</option>
                                <option value="very_active" ${profile.activity_level === 'very_active' ? 'selected' : ''}>Очень активная</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group-vertical">
                        <label for="health-injuries">Травмы и ограничения</label>
                        <textarea id="health-injuries" placeholder="Опишите ваши травмы или ограничения...">${profile.health_notes || ''}</textarea>
                    </div>

                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 20px;">
                        💾 Сохранить профиль здоровья
                    </button>
                </form>
            </div>
        `;

        // Обработчик формы
        document.getElementById('health-profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveHealthProfile();
        });
    }

    function getGoalText(goal) {
        const goals = {
            'weight_loss': 'Похудение',
            'muscle_gain': 'Набор массы',
            'maintenance': 'Поддержание',
            'endurance': 'Выносливость'
        };
        return goals[goal] || 'Не указана';
    }

    async function saveHealthProfile() {
        const formData = {
            age: parseInt(document.getElementById('health-age').value) || null,
            gender: document.getElementById('health-gender').value || null,
            height: parseInt(document.getElementById('health-height').value) || null,
            weight: parseFloat(document.getElementById('health-weight').value) || null,
            goal: document.getElementById('health-goal').value || null,
            activity_level: document.getElementById('health-activity').value || null,
            health_notes: document.getElementById('health-injuries').value || ''
        };

        try {
            const response = await fetch(`${BACKEND_URL}/api/health/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                showNotification('✅ Профиль здоровья сохранен!');
                loadHealthProfile(); // Перезагружаем данные
            } else {
                showNotification('❌ Ошибка сохранения профиля', 'error');
            }
        } catch (error) {
            console.error('Error saving health profile:', error);
            showNotification('❌ Ошибка сохранения профиля', 'error');
        }
    }

    // ==================== СИСТЕМА ПИТАНИЯ ====================

    async function loadNutritionData() {
        await loadMeals();
        await loadWaterIntake();
        await loadNutritionTargets();
        renderNutritionScreen();
    }

    async function loadMeals() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`${BACKEND_URL}/api/nutrition/meals?date=${today}`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                appData.nutritionData.meals = data.meals;
            }
        } catch (error) {
            console.error('Error loading meals:', error);
        }
    }

    async function loadWaterIntake() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`${BACKEND_URL}/api/nutrition/water?date=${today}`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                appData.nutritionData.water = data.total_ml;
                appData.nutritionData.waterTarget = data.recommended_ml;
            }
        } catch (error) {
            console.error('Error loading water data:', error);
        }
    }

    async function loadNutritionTargets() {
        if (!appData.healthProfile) {
            await loadHealthProfile();
        }
        appData.nutritionData.targets = {
            calories: appData.healthProfile?.daily_calorie_target || 2000,
            protein: appData.healthProfile?.protein_target || 150,
            carbs: appData.healthProfile?.carb_target || 250,
            fat: appData.healthProfile?.fat_target || 67
        };
    }

    function renderNutritionScreen() {
        const container = document.getElementById('nutrition-container');
        if (!container) return;

        const { meals, water, waterTarget, targets } = appData.nutritionData;
        
        // Расчет текущих показателей
        const current = calculateCurrentNutrition(meals);

        container.innerHTML = `
            <div class="welcome-card">
                <h3>🍎 Питание сегодня</h3>
                <div class="nutrition-overview">
                    <div class="nutrition-metric calories">
                        <div class="value">${current.calories}</div>
                        <div class="label">Ккал</div>
                        <div class="target">из ${targets.calories}</div>
                    </div>
                    <div class="nutrition-metric protein">
                        <div class="value">${current.protein.toFixed(0)}г</div>
                        <div class="label">Белки</div>
                        <div class="target">из ${targets.protein}г</div>
                    </div>
                    <div class="nutrition-metric carbs">
                        <div class="value">${current.carbs.toFixed(0)}г</div>
                        <div class="label">Углеводы</div>
                        <div class="target">из ${targets.carbs}г</div>
                    </div>
                    <div class="nutrition-metric fat">
                        <div class="value">${current.fat.toFixed(0)}г</div>
                        <div class="label">Жиры</div>
                        <div class="target">из ${targets.fat}г</div>
                    </div>
                </div>
            </div>

            <div class="water-tracker">
                <h3>💧 Потребление воды</h3>
                <div class="water-progress">
                    <div class="water-circle" style="--progress: ${(water / waterTarget) * 100}%">
                        ${water} мл
                    </div>
                </div>
                <div class="water-target">Цель: ${waterTarget} мл</div>
                <div class="water-actions">
                    <button class="water-btn" onclick="addWater(250)">+250 мл</button>
                    <button class="water-btn" onclick="addWater(500)">+500 мл</button>
                    <button class="water-btn" onclick="addWater(1000)">+1000 мл</button>
                </div>
            </div>

            <div class="meals-section">
                <div class="section-header">
                    <h3>🍽️ Приемы пищи</h3>
                    <button class="btn-primary" onclick="showAddMealModal()">
                        + Добавить прием пищи
                    </button>
                </div>
                ${renderMealsList(meals)}
            </div>
        `;
    }

    function calculateCurrentNutrition(meals) {
        return meals.reduce((total, meal) => ({
            calories: total.calories + (meal.total_calories || 0),
            protein: total.protein + (meal.total_protein || 0),
            carbs: total.carbs + (meal.total_carbs || 0),
            fat: total.fat + (meal.total_fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    }

    function renderMealsList(meals) {
        if (meals.length === 0) {
            return `
                <div class="empty-state">
                    <p>🍽️ Приемы пищи еще не добавлены</p>
                    <button class="btn-secondary" onclick="showAddMealModal()">
                        Добавить первый прием пищи
                    </button>
                </div>
            `;
        }

        return meals.map(meal => `
            <div class="meal-card">
                <div class="meal-header">
                    <div class="meal-type">${getMealEmoji(meal.meal_type)} ${getMealTypeText(meal.meal_type)}</div>
                    <div class="meal-time">${meal.meal_time}</div>
                </div>
                <div class="meal-nutrition">
                    <span class="nutrition-item">${meal.total_calories} ккал</span>
                    <span class="nutrition-item">Б: ${meal.total_protein}г</span>
                    <span class="nutrition-item">У: ${meal.total_carbs}г</span>
                    <span class="nutrition-item">Ж: ${meal.total_fat}г</span>
                </div>
                ${meal.items && meal.items.length > 0 ? `
                    <div class="meal-items">
                        ${meal.items.map(item => `
                            <div class="meal-item">
                                <span class="item-name">${item.name}</span>
                                <span class="item-quantity">${item.quantity} ${item.serving_size}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${meal.notes ? `<div class="meal-notes">📝 ${meal.notes}</div>` : ''}
            </div>
        `).join('');
    }

    function getMealEmoji(mealType) {
        const emojis = {
            breakfast: '🌅',
            lunch: '🍽️',
            dinner: '🌙',
            snack: '🍎'
        };
        return emojis[mealType] || '🍴';
    }

    function getMealTypeText(mealType) {
        const texts = {
            breakfast: 'Завтрак',
            lunch: 'Обед',
            dinner: 'Ужин',
            snack: 'Перекус'
        };
        return texts[mealType] || mealType;
    }

    window.addWater = async function(amount) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/nutrition/water`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify({ amount_ml: amount })
            });

            if (response.ok) {
                showNotification(`💧 Добавлено ${amount} мл воды!`);
                await loadNutritionData(); // Перезагружаем данные
            } else {
                showNotification('❌ Ошибка добавления воды', 'error');
            }
        } catch (error) {
            console.error('Error adding water:', error);
            showNotification('❌ Ошибка добавления воды', 'error');
        }
    };

    window.showAddMealModal = function() {
        // Создаем модальное окно для добавления приема пищи
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🍽️ Добавить прием пищи</h3>
                    <button class="close-btn" onclick="closeModal(this.closest('.modal'))">×</button>
                </div>
                <div class="modal-body">
                    <form id="add-meal-form">
                        <div class="form-group-vertical">
                            <label for="meal-type">Тип приема пищи</label>
                            <select id="meal-type" required>
                                <option value="breakfast">🌅 Завтрак</option>
                                <option value="lunch">🍽️ Обед</option>
                                <option value="dinner">🌙 Ужин</option>
                                <option value="snack">🍎 Перекус</option>
                            </select>
                        </div>
                        <div class="form-group-vertical">
                            <label for="meal-time">Время</label>
                            <input type="time" id="meal-time" value="${new Date().toTimeString().slice(0,5)}" required>
                        </div>
                        <div class="form-group-vertical">
                            <label for="meal-notes">Заметки (необязательно)</label>
                            <textarea id="meal-notes" placeholder="Что вы ели?"></textarea>
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%;">
                            ✅ Добавить прием пищи
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        openModal(modal);

        document.getElementById('add-meal-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await addMeal();
            closeModal(modal);
            modal.remove();
        });
    };

    async function addMeal() {
        const formData = {
            meal_type: document.getElementById('meal-type').value,
            meal_time: document.getElementById('meal-time').value,
            notes: document.getElementById('meal-notes').value,
            meal_date: new Date().toISOString().split('T')[0],
            items: [] // Пока без продуктов
        };

        try {
            const response = await fetch(`${BACKEND_URL}/api/nutrition/meals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                showNotification('✅ Прием пищи добавлен!');
                await loadNutritionData();
            } else {
                showNotification('❌ Ошибка добавления приема пищи', 'error');
            }
        } catch (error) {
            console.error('Error adding meal:', error);
            showNotification('❌ Ошибка добавления приема пищи', 'error');
        }
    }

    // ==================== СИСТЕМА ЧЕЛЛЕНДЖЕЙ ====================

    async function loadChallenges() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/challenges/active`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                appData.challenges = data.challenges;
                renderChallenges();
            }
        } catch (error) {
            console.error('Error loading challenges:', error);
            showNotification('❌ Ошибка загрузки челленджей', 'error');
        }
    }

    function renderChallenges() {
        const container = document.getElementById('challenges-container');
        if (!container) return;

        if (appData.challenges.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>🎯 Пока нет активных челленджей</h3>
                    <p>Следите за обновлениями, скоро появятся новые вызовы!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="challenge-list">
                ${appData.challenges.map(challenge => `
                    <div class="challenge-item">
                        <div class="challenge-header">
                            <div class="challenge-title">${challenge.name}</div>
                            <div class="challenge-difficulty ${challenge.difficulty || 'medium'}">
                                ${challenge.difficulty || 'medium'}
                            </div>
                        </div>
                        <p class="challenge-description">${challenge.description}</p>
                        
                        <div class="challenge-progress">
                            <div class="progress-text">
                                <span>Прогресс</span>
                                <span>${challenge.current_progress || 0}/${challenge.goal_value}</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${((challenge.current_progress || 0) / challenge.goal_value) * 100}%"></div>
                            </div>
                        </div>

                        <div class="challenge-meta">
                            <div class="challenge-reward">🎁 ${challenge.reward_xp} XP</div>
                            <div class="challenge-participants">👥 ${challenge.participant_count} участников</div>
                            ${challenge.end_date ? `
                                <div class="challenge-deadline">
                                    📅 До ${new Date(challenge.end_date).toLocaleDateString()}
                                </div>
                            ` : ''}
                        </div>

                        ${!challenge.completed_at ? `
                            <button class="btn-primary" onclick="joinChallenge(${challenge.id})" 
                                    style="width: 100%; margin-top: 15px;">
                                🎯 Присоединиться
                            </button>
                        ` : `
                            <div class="challenge-completed">
                                ✅ Завершено ${new Date(challenge.completed_at).toLocaleDateString()}
                            </div>
                        `}
                    </div>
                `).join('')}
            </div>
        `;
    }

    window.joinChallenge = async function(challengeId) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/challenges/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appData.token}`
                },
                body: JSON.stringify({ challenge_id: challengeId })
            });

            if (response.ok) {
                showNotification('🎯 Вы присоединились к челленджу!');
                await loadChallenges();
            } else {
                showNotification('❌ Ошибка присоединения к челленджу', 'error');
            }
        } catch (error) {
            console.error('Error joining challenge:', error);
            showNotification('❌ Ошибка присоединения к челленджу', 'error');
        }
    };

    // ==================== БИБЛИОТЕКА УПРАЖНЕНИЙ ====================

    async function loadExerciseLibrary() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/exercises/library`, {
                headers: {
                    'Authorization': `Bearer ${appData.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                appData.exerciseLibrary = data.exercises;
                renderExerciseLibrary();
            }
        } catch (error) {
            console.error('Error loading exercise library:', error);
            showNotification('❌ Ошибка загрузки библиотеки упражнений', 'error');
        }
    }

    function renderExerciseLibrary() {
        const container = document.getElementById('exercises-container');
        if (!container) return;

        container.innerHTML = `
            <div class="exercise-filters">
                <select id="exercise-category" onchange="filterExercises()">
                    <option value="">Все категории</option>
                    <option value="strength">💪 Силовые</option>
                    <option value="cardio">🏃 Кардио</option>
                    <option value="flexibility">🧘 Гибкость</option>
                </select>
                <select id="exercise-difficulty" onchange="filterExercises()">
                    <option value="">Любая сложность</option>
                    <option value="beginner">Начинающий</option>
                    <option value="intermediate">Продвинутый</option>
                    <option value="advanced">Эксперт</option>
                </select>
            </div>

            <div class="exercise-grid" id="exercise-grid">
                ${appData.exerciseLibrary.map(exercise => `
                    <div class="exercise-card" data-category="${exercise.category}" data-difficulty="${exercise.difficulty}">
                        <div class="exercise-card-header">
                            <div class="exercise-name">${exercise.name}</div>
                            <div class="exercise-muscle">${exercise.muscle_group}</div>
                        </div>
                        <p class="exercise-description">${exercise.description}</p>
                        <div class="exercise-details">
                            <div class="exercise-detail">
                                <span>⚡</span>
                                <span>${exercise.difficulty}</span>
                            </div>
                            <div class="exercise-detail">
                                <span>🎯</span>
                                <span>${exercise.equipment}</span>
                            </div>
                            <div class="exercise-detail">
                                <span>🔥</span>
                                <span>${exercise.calories_per_minute} ккал/мин</span>
                            </div>
                        </div>
                        <div class="exercise-actions">
                            <button class="btn-secondary" onclick="addExerciseToPlan(${exercise.id})">
                                ➕ В план
                            </button>
                            <button class="btn-primary" onclick="showExerciseDetails(${exercise.id})">
                                ℹ️ Подробнее
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    window.filterExercises = function() {
        const category = document.getElementById('exercise-category').value;
        const difficulty = document.getElementById('exercise-difficulty').value;
        const exercises = document.querySelectorAll('.exercise-card');

        exercises.forEach(exercise => {
            const matchesCategory = !category || exercise.dataset.category === category;
            const matchesDifficulty = !difficulty || exercise.dataset.difficulty === difficulty;
            
            if (matchesCategory && matchesDifficulty) {
                exercise.style.display = 'block';
            } else {
                exercise.style.display = 'none';
            }
        });
    };

    window.addExerciseToPlan = function(exerciseId) {
        showNotification('✅ Упражнение добавлено в план!');
        // Здесь можно добавить логику добавления в конкретный день
    };

    window.showExerciseDetails = function(exerciseId) {
        const exercise = appData.exerciseLibrary.find(e => e.id === exerciseId);
        if (!exercise) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${exercise.name}</h3>
                    <button class="close-btn" onclick="closeModal(this.closest('.modal'))">×</button>
                </div>
                <div class="modal-body">
                    <div class="exercise-detail-section">
                        <h4>📝 Описание</h4>
                        <p>${exercise.description}</p>
                    </div>
                    
                    <div class="exercise-detail-section">
                        <h4>🎯 Инструкция</h4>
                        <p>${exercise.instructions || 'Инструкция скоро будет добавлена...'}</p>
                    </div>
                    
                    <div class="exercise-stats">
                        <div class="stat-item">
                            <span class="stat-label">Мышечная группа:</span>
                            <span class="stat-value">${exercise.muscle_group}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Сложность:</span>
                            <span class="stat-value">${exercise.difficulty}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Оборудование:</span>
                            <span class="stat-value">${exercise.equipment}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Калории:</span>
                            <span class="stat-value">${exercise.calories_per_minute} ккал/мин</span>
                        </div>
                    </div>

                    <button class="btn-primary" style="width: 100%; margin-top: 20px;" 
                            onclick="addExerciseToPlan(${exercise.id})">
                        ➕ Добавить в план тренировок
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        openModal(modal);
    };

    // ==================== СУЩЕСТВУЮЩИЕ ФУНКЦИИ (планы, группы, статистика) ====================

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
                    exercises: dayData.exercises
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
                body: JSON.stringify({ plan: appData.plan })
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

    // ==================== ГРУППЫ И СТАТИСТИКА ====================

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
                <div class="welcome-card" style="text-align: center;">
                    <h3>👥 У вас пока нет групп</h3>
                    <p>Создайте первую группу и пригласите друзей!</p>
                    <button class="btn-primary" onclick="switchGroupTab('create-group')" style="margin-top: 15px;">
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
                <button class="btn-secondary" onclick="openGroupDetail(${group.id})" style="margin-top: 12px;">
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
                <p><strong>🔑 Код приглашения:</strong> <code style="background: var(--secondary-bg); padding: 4px 8px; border-radius: 6px; font-weight: bold;">${data.group.invite_code}</code></p>
                <p><strong>👑 Создатель:</strong> ${data.group.creator_name || 'Неизвестно'}</p>
            </div>
            <div class="members-list welcome-card">
                <h4>Участники (${data.members.length})</h4>
                ${data.members.map(member => `
                    <div class="member-item" style="padding: 10px; border-bottom: 1px solid var(--border-color);">
                        <div>
                            <strong>${member.first_name || member.username}</strong>
                            ${member.username ? `<br><small style="color: var(--text-secondary);">@${member.username}</small>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

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
            container.innerHTML = '<div class="welcome-card" style="text-align: center;"><p>Пока нет данных для таблицы лидеров</p></div>';
            return;
        }

        leaders.forEach((leader, index) => {
            const rank = index + 1;
            const leaderItem = document.createElement('div');
            leaderItem.className = 'leader-item';
            leaderItem.innerHTML = `
                <div class="leader-rank">${rank}</div>
                <div class="leader-info">
                    <div class="leader-name">${leader.first_name || leader.username || 'Пользователь'}</div>
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

        // Загружаем дополнительные данные
        loadHealthProfile();
        loadNutritionData();
        loadChallenges();
        loadExerciseLibrary();

        console.log('🚀 TrainPlan Pro инициализирован!');
        console.log('👤 Пользователь:', appData.user);
    }

    // Запуск приложения
    checkAuth();
});