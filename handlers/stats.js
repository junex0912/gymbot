const Groq = require('groq-sdk');
const db = require('../database/db');

const groqApiKey = process.env.GROQ_API_KEY;
let groqClient = null;

if (!groqApiKey) {
  console.warn('GROQ_API_KEY не задан в .env, аналитические отчёты недоступны.');
} else {
  groqClient = new Groq({ apiKey: groqApiKey });
}

const SQL_WORKOUTS_IN_RANGE = `
  SELECT *
  FROM workouts
  WHERE user_id = ? AND date >= ? AND date <= ?
`;

const SQL_SLEEP_IN_RANGE = `
  SELECT *
  FROM sleep_log
  WHERE user_id = ? AND date >= ? AND date <= ?
`;

const SQL_BODY_WEIGHT_IN_RANGE = `
  SELECT *
  FROM measurements
  WHERE user_id = ? AND date >= ? AND date <= ?
  ORDER BY date ASC
`;

const SQL_MONTHLY_AGGREGATES = `
  SELECT
    strftime('%Y-%m', date) AS month,
    exercise,
    MAX(weight_kg) AS max_weight,
    SUM(
      COALESCE(weight_kg, 0) * COALESCE(sets, 0) * COALESCE(reps, 0)
    ) AS total_volume
  FROM workouts
  WHERE user_id = ?
    AND date >= ?
    AND date <= ?
  GROUP BY month, exercise
  ORDER BY month ASC
`;

const SQL_MONTHLY_SLEEP_AGGREGATES = `
  SELECT
    strftime('%Y-%m', date) AS month,
    AVG(hours_slept) AS avg_sleep
  FROM sleep_log
  WHERE user_id = ?
    AND date >= ?
    AND date <= ?
  GROUP BY month
  ORDER BY month ASC
`;

const SQL_EXERCISE_HISTORY_BY_MONTH = `
  SELECT
    strftime('%Y-%m', date) AS month,
    MAX(weight_kg) AS max_weight
  FROM workouts
  WHERE user_id = ?
    AND exercise = ?
  GROUP BY month
  ORDER BY month ASC
`;

const SQL_RECORDS_BY_USER = `
  SELECT *
  FROM records
  WHERE user_id = ?
  ORDER BY achieved_date DESC, id DESC
`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDateDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftDateMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function calcVolumeSummary(workouts) {
  return workouts.reduce((sum, w) => {
    const v =
      (w.weight_kg || 0) * (w.sets || 0) * (w.reps || 0);
    return sum + v;
  }, 0);
}

function percentChange(current, previous) {
  if (!previous || previous === 0) {
    return current ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

async function callGroqSummary(prompt) {
  if (!groqClient) return null;

  const completion = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const choice = completion.choices && completion.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    return null;
  }

  const content = choice.message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((p) => p.text || '').join('').trim();
  }
  return String(content).trim();
}

async function ensureUser(ctx) {
  const telegramId = String(ctx.from.id);
  const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
    telegramId,
  ]);
  if (!user) {
    ctx.reply('Сначала пройди онбординг через /start, чтобы создать профиль.');
    return null;
  }
  return user;
}

function formatWeekReport({ maxByExercise, volCurrent, volPrev, avgSleep, aiSummary }) {
  const lines = [];
  lines.push('📊 Отчёт за последние 7 дней');

  if (maxByExercise.length) {
    lines.push('');
    lines.push('Максимальные веса за неделю:');
    maxByExercise.forEach((row) => {
      lines.push(`- ${row.exercise}: ${row.max_weight || 0} кг`);
    });
  } else {
    lines.push('');
    lines.push('За эту неделю тренировок не найдено.');
  }

  const change = percentChange(volCurrent, volPrev);
  lines.push('');
  lines.push(
    `Общий объём за неделю: ${Math.round(volCurrent)} (прошлая: ${Math.round(
      volPrev
    )}, изменение: ${change.toFixed(1)}%)`
  );

  lines.push('');
  lines.push(
    `Средний сон за неделю: ${
      Number.isFinite(avgSleep) ? avgSleep.toFixed(1) : 'нет данных'
    } ч`
  );

  if (aiSummary) {
    lines.push('');
    lines.push('Комментарий тренера:');
    lines.push(aiSummary);
  }

  return lines.join('\n');
}

function formatMonthReport({ maxByExercise, changeByExercise, avgSleep, bodyWeightTrend, aiSummary }) {
  const lines = [];
  lines.push('📊 Отчёт за последние 30 дней');

  if (maxByExercise.length) {
    lines.push('');
    lines.push('Максимальные веса за месяц:');
    maxByExercise.forEach((row) => {
      const change = changeByExercise[row.exercise];
      const changeText =
        typeof change === 'number' ? ` (${change.toFixed(1)}%)` : '';
      lines.push(`- ${row.exercise}: ${row.max_weight || 0} кг${changeText}`);
    });
  } else {
    lines.push('');
    lines.push('За этот месяц тренировок не найдено.');
  }

  lines.push('');
  lines.push(
    `Средний сон за месяц: ${
      Number.isFinite(avgSleep) ? avgSleep.toFixed(1) : 'нет данных'
    } ч`
  );

  if (bodyWeightTrend && bodyWeightTrend.length >= 2) {
    const first = bodyWeightTrend[0];
    const last = bodyWeightTrend[bodyWeightTrend.length - 1];
    const diff = last.body_weight - first.body_weight;
    const sign = diff > 0 ? '+' : '';
    lines.push('');
    lines.push(
      `Вес тела: ${first.body_weight.toFixed(1)} кг → ${last.body_weight.toFixed(
        1
      )} кг (${sign}${diff.toFixed(1)} кг)`
    );
  }

  if (aiSummary) {
    lines.push('');
    lines.push('Комментарий тренера:');
    lines.push(aiSummary);
  }

  return lines.join('\n');
}

function registerStats(bot) {
  // /week
  bot.command('week', async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const to = todayISO();
    const from = shiftDateDays(-6);
    const prevFrom = shiftDateDays(-13);
    const prevTo = shiftDateDays(-7);

    const workouts = await db.all(SQL_WORKOUTS_IN_RANGE, [user.id, from, to]);
    const prevWorkouts = await db.all(SQL_WORKOUTS_IN_RANGE, [
      user.id,
      prevFrom,
      prevTo,
    ]);
    const sleepRows = await db.all(SQL_SLEEP_IN_RANGE, [user.id, from, to]);

    const maxByExerciseMap = new Map();
    workouts.forEach((w) => {
      if (!w.exercise) return;
      const current = maxByExerciseMap.get(w.exercise) || 0;
      if (w.weight_kg !== null && w.weight_kg !== undefined && w.weight_kg > current) {
        maxByExerciseMap.set(w.exercise, w.weight_kg);
      }
    });
    const maxByExercise = Array.from(maxByExerciseMap.entries()).map(
      ([exercise, max_weight]) => ({ exercise, max_weight })
    );

    const volCurrent = calcVolumeSummary(workouts);
    const volPrev = calcVolumeSummary(prevWorkouts);
    const avgSleep =
      sleepRows.length > 0
        ? sleepRows.reduce((s, r) => s + (r.hours_slept || 0), 0) /
          sleepRows.length
        : NaN;

    let aiSummary = null;
    try {
      const prompt =
        'Ты персональный AI-тренер. Кратко оцени тренировочную неделю пользователя: что идёт хорошо, что скорректировать. ' +
        'Отвечай конкретно, на русском.\n' +
        `Тренировки за последнюю неделю (JSON): ${JSON.stringify(workouts)}\n` +
        `Тренировки за прошлую неделю (JSON): ${JSON.stringify(prevWorkouts)}\n` +
        `Сон за неделю (JSON): ${JSON.stringify(sleepRows)}\n`;
      aiSummary = await callGroqSummary(prompt);
    } catch (e) {
      console.error('Groq week summary error:', e);
    }

    const report = formatWeekReport({
      maxByExercise,
      volCurrent,
      volPrev,
      avgSleep,
      aiSummary,
    });

    await ctx.reply(report);
  });

  // /month
  bot.command('month', async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const to = todayISO();
    const from = shiftDateDays(-29);
    const prevFrom = shiftDateDays(-59);
    const prevTo = shiftDateDays(-30);

    const workouts = await db.all(SQL_WORKOUTS_IN_RANGE, [user.id, from, to]);
    const prevWorkouts = await db.all(SQL_WORKOUTS_IN_RANGE, [
      user.id,
      prevFrom,
      prevTo,
    ]);
    const sleepRows = await db.all(SQL_SLEEP_IN_RANGE, [user.id, from, to]);
    const bodyWeights = await db.all(SQL_BODY_WEIGHT_IN_RANGE, [
      user.id,
      from,
      to,
    ]);

    const maxByExerciseMap = new Map();
    const prevMaxByExerciseMap = new Map();

    workouts.forEach((w) => {
      if (!w.exercise) return;
      const current = maxByExerciseMap.get(w.exercise) || 0;
      if (w.weight_kg !== null && w.weight_kg !== undefined && w.weight_kg > current) {
        maxByExerciseMap.set(w.exercise, w.weight_kg);
      }
    });

    prevWorkouts.forEach((w) => {
      if (!w.exercise) return;
      const current = prevMaxByExerciseMap.get(w.exercise) || 0;
      if (w.weight_kg !== null && w.weight_kg !== undefined && w.weight_kg > current) {
        prevMaxByExerciseMap.set(w.exercise, w.weight_kg);
      }
    });

    const maxByExercise = Array.from(maxByExerciseMap.entries()).map(
      ([exercise, max_weight]) => ({ exercise, max_weight })
    );

    const changeByExercise = {};
    maxByExercise.forEach(({ exercise, max_weight }) => {
      const prevMax = prevMaxByExerciseMap.get(exercise) || 0;
      changeByExercise[exercise] = percentChange(max_weight || 0, prevMax || 0);
    });

    const avgSleep =
      sleepRows.length > 0
        ? sleepRows.reduce((s, r) => s + (r.hours_slept || 0), 0) /
          sleepRows.length
        : NaN;

    let aiSummary = null;
    try {
      const prompt =
        'Ты персональный AI-тренер. Проанализируй тренировки и сон пользователя за месяц и скажи, достигается ли его цель. ' +
        'Отвечай коротко, конкретно, на русском.\n' +
        `Тренировки за месяц (JSON): ${JSON.stringify(workouts)}\n` +
        `Тренировки за прошлый месяц (JSON): ${JSON.stringify(prevWorkouts)}\n` +
        `Сон за месяц (JSON): ${JSON.stringify(sleepRows)}\n` +
        `Замеры веса тела за месяц (JSON): ${JSON.stringify(bodyWeights)}\n`;
      aiSummary = await callGroqSummary(prompt);
    } catch (e) {
      console.error('Groq month summary error:', e);
    }

    const report = formatMonthReport({
      maxByExercise,
      changeByExercise,
      avgSleep,
      bodyWeightTrend: bodyWeights,
      aiSummary,
    });

    await ctx.reply(report);
  });

  // /stats N
  bot.command('stats', async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const parts = ctx.message.text.split(' ').slice(1);
    const nStr = parts[0];
    const n = parseInt(nStr, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 24) {
      await ctx.reply('Укажи количество месяцев, например: /stats 3');
      return;
    }

    const to = todayISO();
    const from = shiftDateMonths(-n);

    const workoutAgg = await db.all(SQL_MONTHLY_AGGREGATES, [
      user.id,
      from,
      to,
    ]);
    const sleepAgg = await db.all(SQL_MONTHLY_SLEEP_AGGREGATES, [
      user.id,
      from,
      to,
    ]);

    const byMonth = {};
    workoutAgg.forEach((row) => {
      if (!byMonth[row.month]) byMonth[row.month] = { month: row.month, exercises: [] };
      byMonth[row.month].exercises.push({
        exercise: row.exercise,
        max_weight: row.max_weight,
        total_volume: row.total_volume,
      });
    });

    sleepAgg.forEach((row) => {
      if (!byMonth[row.month]) byMonth[row.month] = { month: row.month, exercises: [] };
      byMonth[row.month].avg_sleep = row.avg_sleep;
    });

    const months = Object.values(byMonth).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    if (!months.length) {
      await ctx.reply('За указанный период тренировок не найдено.');
      return;
    }

    const lines = [];
    lines.push(`📊 Отчёт за последние ${n} мес.`);
    months.forEach((m) => {
      lines.push('');
      lines.push(`Месяц: ${m.month}`);
      if (m.exercises.length) {
        m.exercises.forEach((e) => {
          lines.push(
            `- ${e.exercise}: макс ${e.max_weight || 0} кг, объём ${Math.round(
              e.total_volume || 0
            )}`
          );
        });
      } else {
        lines.push('- тренировок нет');
      }
      lines.push(
        `Средний сон: ${
          m.avg_sleep ? m.avg_sleep.toFixed(1) : 'нет данных'
        } ч`
      );
    });

    let aiSummary = null;
    try {
      const prompt =
        'Ты персональный AI-тренер. На основе агрегированных данных по месяцам оцени динамику прогресса пользователя и дай краткий вывод. ' +
        'Отвечай на русском.\n' +
        `Агрегированные данные по месяцам (JSON): ${JSON.stringify(months)}\n`;
      aiSummary = await callGroqSummary(prompt);
    } catch (e) {
      console.error('Groq stats summary error:', e);
    }

    if (aiSummary) {
      lines.push('');
      lines.push('Комментарий тренера:');
      lines.push(aiSummary);
    }

    await ctx.reply(lines.join('\n'));
  });

  // /history exercise
  bot.command('history', async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const query = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!query) {
      await ctx.reply('Укажи упражнение, например: /history жим');
      return;
    }

    const rows = await db.all(SQL_EXERCISE_HISTORY_BY_MONTH, [
      user.id,
      query,
    ]);

    if (!rows.length) {
      await ctx.reply('История по этому упражнению не найдена.');
      return;
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    const start = first.max_weight || 0;
    const end = last.max_weight || 0;
    const progress = start
      ? ((end - start) / start) * 100
      : end
      ? 100
      : 0;

    const lines = [];
    lines.push(`📈 История упражнения: ${query}`);
    rows.forEach((r) => {
      lines.push(`- ${r.month}: макс ${r.max_weight || 0} кг`);
    });
    lines.push('');
    lines.push(
      `Прогресс от первой к последней записи: ${progress.toFixed(1)}%`
    );

    let aiSummary = null;
    try {
      const prompt =
        'Ты персональный AI-тренер. Оцени прогресс пользователя по одному упражнению и скажи, насколько хорошо он продвигается. ' +
        'Отвечай коротко, на русском.\n' +
        `Упражнение: ${query}\n` +
        `Максимальные веса по месяцам (JSON): ${JSON.stringify(rows)}\n`;
      aiSummary = await callGroqSummary(prompt);
    } catch (e) {
      console.error('Groq history summary error:', e);
    }

    if (aiSummary) {
      lines.push('');
      lines.push('Комментарий тренера:');
      lines.push(aiSummary);
    }

    await ctx.reply(lines.join('\n'));
  });

  // /compare
  bot.command('compare', async (ctx) => {
    const users = await db.all('SELECT id, name FROM users');
    if (!users.length) {
      await ctx.reply('Пользователей пока нет.');
      return;
    }

    const to = todayISO();
    const from = shiftDateDays(-6);
    const prevFrom = shiftDateDays(-13);
    const prevTo = shiftDateDays(-7);

    const results = [];

    for (const u of users) {
      const ws = await db.all(SQL_WORKOUTS_IN_RANGE, [u.id, from, to]);
      const prev = await db.all(SQL_WORKOUTS_IN_RANGE, [
        u.id,
        prevFrom,
        prevTo,
      ]);
      const vNow = calcVolumeSummary(ws);
      const vPrev = calcVolumeSummary(prev);
      const change = percentChange(vNow, vPrev);
      results.push({
        name: u.name || 'Без имени',
        progress: change,
      });
    }

    results.sort((a, b) => b.progress - a.progress);

    const lines = [];
    lines.push('🏅 Прогресс за текущую неделю:');
    results.forEach((r) => {
      lines.push(
        `- ${r.name}: ${r.progress.toFixed(1)}%`
      );
    });

    let aiSummary = null;
    try {
      const prompt =
        'Ты мотивационный AI-тренер. На основе списка прогресса разных пользователей дай короткий мотивирующий комментарий, без упоминания личных данных кроме имён. ' +
        'Отвечай на русском.\n' +
        `Прогресс пользователей за неделю (JSON): ${JSON.stringify(results)}\n`;
      aiSummary = await callGroqSummary(prompt);
    } catch (e) {
      console.error('Groq compare summary error:', e);
    }

    if (aiSummary) {
      lines.push('');
      lines.push(aiSummary);
    }

    await ctx.reply(lines.join('\n'));
  });

  // /records
  bot.command('records', async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const rows = await db.all(SQL_RECORDS_BY_USER, [user.id]);

    if (!rows.length) {
      await ctx.reply('Пока нет ни одного личного рекорда.');
      return;
    }

    const lines = [];
    lines.push('🏆 Личные рекорды:');
    rows.forEach((r) => {
      lines.push(
        `- ${r.exercise}: ${r.max_weight_kg} кг (дата: ${r.achieved_date})`
      );
    });

    await ctx.reply(lines.join('\n'));
  });
}

module.exports = {
  registerStats,
};

