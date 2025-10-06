@echo off
echo Запуск TrainPlan сервера и туннеля...
echo.

echo Установка зависимостей...
npm install

echo Запуск сервера...
start cmd /k "node server.js"

timeout /t 5

echo Запуск туннеля Serveo (не требует установки)...
start cmd /k "ssh -R 80:localhost:3000 serveo.net"

echo.
echo Готово! 
echo - Сервер: http://localhost:3000
echo - Туннель: появится в новом окне через 10-20 секунд
echo.
pause