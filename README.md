# 🏋️ GymBot — AI Personal Trainer for Telegram

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)
![Telegraf](https://img.shields.io/badge/Telegraf-4.x-2CA5E0?style=flat-square&logo=telegram&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Groq AI](https://img.shields.io/badge/Groq_AI-llama--3.3--70b-F55036?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

> Your personal AI-powered gym coach living right inside Telegram. Log workouts in plain language, track sleep, measure progress — and let AI tell you exactly when to push harder.

---

## ✨ Features

- 🗣️ **Natural language logging** — just type `bench press 100kg 5x3` and the bot understands
- 🧠 **AI progression engine** — Groq AI analyzes your history and tells you when to increase weight
- 😴 **Sleep tracking** — daily check-ins and bedtime reminders with fun facts
- 📏 **Body measurements** — track chest, waist, biceps and more over time
- 🏆 **Personal records** — auto-detected and celebrated every time you hit a new max
- 📊 **Weekly & monthly reports** — full AI-generated analysis of your progress
- 💪 **Friend comparison** — see how your progress stacks up against others
- 🎯 **Smart advice** — recommendations adjust based on your sleep quality and daily mood
- 👤 **Multi-user** — every user gets their own private profile and stats

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| Node.js 18+ | Runtime |
| Telegraf 4.x | Telegram Bot Framework |
| SQLite (better-sqlite3) | Local database |
| Groq AI (llama-3.3-70b) | Natural language processing & coaching |
| node-cron | Scheduled reminders |
| dotenv | Environment configuration |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18 or higher
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Free Groq API key from [console.groq.com](https://console.groq.com)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/junex0912/gymbot.git
cd gymbot

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Fill in your keys in the .env file

# 4. Start the bot
node index.js
```

---

## 🔐 Environment Variables

| Variable | Description | Example |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather | `7284920174:AAF...` |
| `GROQ_API_KEY` | Free API key from console.groq.com | `gsk_...` |
| `MORNING_CHECK_TIME` | Daily sleep check-in time | `09:00` |
| `SLEEP_REMINDER_TIME` | Bedtime reminder time | `22:30` |
| `DB_PATH` | SQLite database file path | `./gymbot.db` |

---

## 📱 Bot Commands

| Command | Description |
|---|---|
| `/start` | Register and set up your profile |
| `/train` | Start a workout session |
| `/done` | Finish workout and get AI advice |
| `/week` | Weekly progress report |
| `/month` | Monthly progress report |
| `/stats N` | Report for last N months (e.g. `/stats 3`) |
| `/history` | Full history of a specific exercise |
| `/compare` | Compare progress with other users |
| `/records` | View your personal records |
| `/measure` | Log body measurements |
| `/sleep` | Manually log sleep hours |
| `/profile` | View your profile |
| `/update` | Update profile data |
| `/ask` | Chat freely with your AI trainer |
| `/stop` | Exit AI chat mode |
| `/help` | Show all commands |

---

## 📁 Project Structure

```
gymbot/
├── index.js              # Entry point
├── .env.example          # Environment template
├── database/
│   └── db.js             # SQLite init & table creation
├── handlers/
│   ├── onboarding.js     # User registration flow
│   ├── workout.js        # Workout logging
│   ├── stats.js          # Statistics & reports
│   ├── sleep.js          # Sleep tracking
│   ├── measure.js        # Body measurements
│   └── profile.js        # Profile management
├── ai/
│   ├── gemini.js         # Groq AI wrapper & NLP
│   └── context.js        # User context builder
├── cron/
│   └── reminders.js      # Scheduled notifications
└── data/
    └── sleep_facts.js    # Sleep facts & jokes database
```

---

## 🧠 How It Works

```
User Message → Telegram → Telegraf Bot
                                ↓
                         SQLite Database
                         (load user context)
                                ↓
                           Groq AI API
                         (analyze + advise)
                                ↓
                    Response → User in Telegram
```

Every time a user interacts with the bot, it pulls their full profile, workout history, sleep data and body measurements from SQLite — and sends it all as context to Groq AI. This gives every user truly personalized advice based on their actual data, not generic tips.

---

## 🗄️ Database Schema

```sql
users         — profiles, goals, physical data
workouts      — exercise logs with sets, reps, weight
measurements  — body measurements over time
sleep_log     — daily sleep hours
records       — personal bests per exercise
```

---

## 👤 Author

**junex0912** — [@junex0912](https://github.com/junex0912)

---

## 📄 License

MIT License — free to use, modify and distribute.

---

---

# 🏋️ GymBot — AI Персональный Тренер для Telegram

> Твой личный AI-тренер прямо в Telegram. Записывай тренировки в свободной форме, отслеживай сон, замеры тела — и пусть AI говорит тебе когда пора добавлять вес.

---

## ✨ Возможности

- 🗣️ **Свободный текст** — пиши `жим 100кг 5х3` и бот всё поймёт
- 🧠 **AI-прогрессия** — Groq AI анализирует историю и говорит когда увеличивать нагрузку
- 😴 **Трекинг сна** — ежедневные чек-ины и напоминания лечь спать с фактами
- 📏 **Замеры тела** — грудь, талия, бицепс и другие параметры в динамике
- 🏆 **Личные рекорды** — фиксируются автоматически при каждом новом максимуме
- 📊 **Отчёты за неделю и месяц** — полный AI-анализ прогресса
- 💪 **Сравнение с друзьями** — видишь прогресс других пользователей бота
- 🎯 **Умные советы** — рекомендации учитывают качество сна и самочувствие
- 👤 **Мультипользовательский** — у каждого свой приватный профиль и статистика

---

## 🛠️ Технологии

| Технология | Назначение |
|---|---|
| Node.js 18+ | Среда выполнения |
| Telegraf 4.x | Фреймворк для Telegram ботов |
| SQLite (better-sqlite3) | Локальная база данных |
| Groq AI (llama-3.3-70b) | Обработка текста и AI-советы |
| node-cron | Планировщик напоминаний |
| dotenv | Конфигурация через .env |

---

## 🚀 Установка

### Требования
- Node.js 18 или выше
- Токен Telegram бота от [@BotFather](https://t.me/BotFather)
- Бесплатный API ключ Groq на [console.groq.com](https://console.groq.com)

```bash
# 1. Клонируй репозиторий
git clone https://github.com/junex0912/gymbot.git
cd gymbot

# 2. Установи зависимости
npm install

# 3. Настрой переменные окружения
cp .env.example .env
# Заполни свои ключи в файле .env

# 4. Запусти бота
node index.js
```

---

## 📱 Команды бота

| Команда | Описание |
|---|---|
| `/start` | Регистрация и настройка профиля |
| `/train` | Начать тренировку |
| `/done` | Завершить тренировку и получить совет AI |
| `/week` | Отчёт за неделю |
| `/month` | Отчёт за месяц |
| `/stats N` | Отчёт за N месяцев |
| `/history` | История конкретного упражнения |
| `/compare` | Сравнение с другими пользователями |
| `/records` | Личные рекорды |
| `/measure` | Ввод замеров тела |
| `/sleep` | Записать часы сна |
| `/profile` | Просмотр профиля |
| `/update` | Обновить данные профиля |
| `/ask` | Свободный чат с AI-тренером |
| `/stop` | Выйти из режима чата |
| `/help` | Список всех команд |

---

## 👤 Автор

**junex0912** — [@junex0912](https://github.com/junex0912)

---

## 📄 Лицензия

MIT — свободно используй, изменяй и распространяй.
