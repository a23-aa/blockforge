@echo off
rem Заполни четыре строки ниже и запусти этот файл двойным щелчком.
set BOT_TOKEN=сюда_токен_от_BotFather
set API_URL=https://адрес-твоего-сервера-аккаунтов
set ADMIN_KEY=сюда_админ_ключ
set OWNER_ID=сюда_твой_telegram_id
rem Цена в Stars и дни по желанию:
set PRICE_STARS=75
set DAYS=30
rem Если хочешь принимать переводы на карту, напиши реквизиты (иначе оставь пустым):
set PAY_TEXT=
node bot.js
pause
