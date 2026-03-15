require('dotenv').config();
const Groq = require('groq-sdk');
const { getUserContext } = require('./context');

const apiKey = process.env.GROQ_API_KEY;

let client = null;

if (!apiKey) {
  console.warn('GROQ_API_KEY не задан в .env, парсинг тренировок и советы недоступны.');
} else {
  client = new Groq({ apiKey });
}

function cleanJsonText(text) {
  let raw = text.trim();

  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-zA-Z]*\s*/u, '');
    raw = raw.replace(/```$/u, '');
    raw = raw.trim();
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }

  return raw.trim();
}

async function callGroq(prompt) {
  if (!client) {
    throw new Error('Groq клиент не инициализирован (проверь GROQ_API_KEY).');
  }

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
  });

  const choice = completion.choices && completion.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Пустой ответ от Groq');
  }

  const content = choice.message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text || '').join('').trim();
  }

  return String(content);
}

async function parseWorkout(text) {
  const prompt = `Извлеки из текста данные тренировки и верни ТОЛЬКО JSON без markdown: {exercise: string, weight_kg: number или null, sets: number, reps: number, notes: string}. Текст: ${text}`;

  const responseText = await callGroq(prompt);

  const cleaned = cleanJsonText(responseText);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('Ошибка парсинга JSON от Groq:', error, 'Исходный текст:', cleaned);
    throw new Error('Не удалось распознать тренировку');
  }

  const exercise = typeof parsed.exercise === 'string' ? parsed.exercise.trim() : '';
  const weight_kg =
    parsed.weight_kg === null || parsed.weight_kg === undefined
      ? null
      : Number(parsed.weight_kg);
  const sets =
    parsed.sets === null || parsed.sets === undefined ? null : Number(parsed.sets);
  const reps =
    parsed.reps === null || parsed.reps === undefined ? null : Number(parsed.reps);
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';

  return {
    exercise,
    weight_kg: Number.isFinite(weight_kg) ? weight_kg : null,
    sets: Number.isFinite(sets) ? sets : null,
    reps: Number.isFinite(reps) ? reps : null,
    notes,
  };
}

async function normalizeExerciseName(text) {
  const prompt =
    "Приведи название упражнения к стандартному виду на русском языке. Убирай лишние слова, сокращения, опечатки. Например: 'махи на среднюю' и 'махи на среднюю дельту' и 'махи дельта средняя' — всё это одно упражнение 'махи на среднюю дельту'. Верни ТОЛЬКО стандартное название упражнения, без лишних слов. Упражнение: " +
    text;

  const response = await callGroq(prompt);
  let name = response.trim();

  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).trim();
  }
  if (name.includes('\n')) {
    name = name.split('\n')[0].trim();
  }

  return name;
}

async function getAdvice(userId, exerciseList, effortScore) {
  const context = await getUserContext(userId);
  const { profile, workouts, measurements, sleep } = context;

  if (!profile) {
    throw new Error('Пользователь не найден для получения совета.');
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const todaySleepEntry =
    (sleep || []).find((s) => s.date === todayStr) || null;
  const sleepToday =
    todaySleepEntry && typeof todaySleepEntry.hours_slept === 'number'
      ? todaySleepEntry.hours_slept
      : null;

  const historyJson = JSON.stringify(workouts || []);
  const measurementsJson = JSON.stringify(measurements || []);
  const sleepJson = JSON.stringify(sleep || []);
  const exercisesJson = JSON.stringify(exerciseList || []);

  const name = profile.name || 'Без имени';
  const age = profile.age || 'не указан';
  const height = profile.height_cm || 'не указан';
  const weight = profile.weight_kg || 'не указан';
  const level = profile.level || 'не указан';
  const goal = profile.goal || 'не указана';

  const systemPrompt =
    'Ты персональный AI-тренер. Отвечай коротко, по делу, на русском. Давай конкретные цифры.\n' +
    'Данные пользователя: {имя}, {возраст} лет, рост {рост} см, вес {вес} кг, уровень: {уровень}, цель: {цель}.\n' +
    'Сон сегодня: {сон} ч. Самочувствие: {самочувствие}/10.\n' +
    'История тренировок за 6 недель: {история}.\n' +
    'Правила прогрессии: если выполнял целевые повторения 2 тренировки подряд — предложи +2.5-5 кг. Если нет прогресса 3 недели — предложи деload. Если сон меньше 6 часов — не рекомендуй рост нагрузки. Если самочувствие ниже 6 — предложи лёгкую тренировку.';

  const userPrompt =
    `Данные пользователя: ${name}, ${age} лет, рост ${height} см, вес ${weight} кг, уровень: ${level}, цель: ${goal}.\n` +
    `Сон сегодня: ${sleepToday !== null ? sleepToday : 'нет данных'} ч. Самочувствие: ${typeof effortScore === 'number' ? effortScore : 'нет данных'}/10.\n` +
    `История тренировок за 6 недель: ${historyJson}.\n` +
    `Последние замеры: ${measurementsJson}.\n` +
    `Сон за последние 7 дней: ${sleepJson}.\n` +
    `Упражнения текущей тренировки: ${exercisesJson}.\n` +
    'Дай короткую рекомендацию по следующей тренировке и нагрузкам.';

  if (!client) {
    throw new Error('Groq клиент не инициализирован (проверь GROQ_API_KEY).');
  }

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });

  const choice = completion.choices && completion.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Пустой ответ от Groq при получении совета');
  }

  const content = choice.message.content;
  let text;

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content.map((part) => part.text || '').join('').trim();
  } else {
    text = String(content);
  }

  return text.trim();
}

async function askTrainer(userId, history, question) {
  const context = await getUserContext(userId);
  const { profile, workouts, measurements, sleep } = context;

  if (!profile) {
    throw new Error('Пользователь не найден.');
  }

  const contextText =
    'Данные пользователя (профиль, тренировки, замеры, сон):\n' +
    JSON.stringify(
      {
        profile,
        workoutsCount: (workouts || []).length,
        measurementsCount: (measurements || []).length,
        sleepCount: (sleep || []).length,
        lastWorkouts: (workouts || []).slice(-10),
        lastMeasurements: measurements || [],
        lastSleep: sleep || [],
      },
      null,
      0
    );

  const systemPrompt =
    'Ты персональный AI-тренер. Отвечай на вопросы пользователя коротко и конкретно на русском языке. ' +
    'Используй данные пользователя, чтобы давать персональный совет, и учитывай контекст предыдущего диалога.\n\n' +
    contextText;

  if (!client) {
    throw new Error('Groq клиент не инициализирован (проверь GROQ_API_KEY).');
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []),
    { role: 'user', content: question },
  ];

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.3,
  });

  const choice = completion.choices && completion.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Пустой ответ от Groq');
  }

  const content = choice.message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((p) => p.text || '').join('').trim();
  }
  return String(content).trim();
}

module.exports = {
  parseWorkout,
  getAdvice,
  normalizeExerciseName,
  askTrainer,
};

