const db = require('../database/db');

async function getUserContext(userId) {
  const profile = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

  const today = new Date();
  const sixWeeksAgo = new Date(today);
  sixWeeksAgo.setDate(today.getDate() - 42);
  const sixWeeksAgoStr = sixWeeksAgo.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const workouts = await db.all(
    `SELECT *
     FROM workouts
     WHERE user_id = ? AND date >= ?
     ORDER BY date DESC`,
    [userId, sixWeeksAgoStr]
  );
  const measurements = await db.all(
    `SELECT *
     FROM measurements
     WHERE user_id = ?
     ORDER BY date DESC
     LIMIT 3`,
    [userId]
  );
  const sleep = await db.all(
    `SELECT *
     FROM sleep_log
     WHERE user_id = ? AND date >= ?
     ORDER BY date DESC`,
    [userId, sevenDaysAgoStr]
  );

  return {
    profile,
    workouts,
    measurements,
    sleep,
  };
}

module.exports = {
  getUserContext,
};
