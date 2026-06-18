/**
 * worker/lib/behavior-collector.js
 * 后端批量行为处理 + 短期画像计算
 */

/**
 * 批量写入行为日志
 */
export async function batchInsertBehaviors(db, userId, actions) {
  const stmt = db.prepare(
    'INSERT INTO behavior_log (user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
  );
  const batch = actions.map(a =>
    stmt.bind(userId, a.action, a.target_type || '', a.target_id || 0, JSON.stringify(a.metadata || {}))
  );
  await db.batch(batch);
}

/**
 * 计算用户短期画像（7天行为聚合）
 */
export async function computeShortProfile(db, userId) {
  const sevenDaysAgo = "datetime('now', '-7 days')";

  const actionStats = await db.prepare(
    `SELECT action, target_type, COUNT(*) as cnt
     FROM behavior_log
     WHERE user_id = ? AND created_at > ${sevenDaysAgo}
     GROUP BY action, target_type`
  ).bind(userId).all();

  const recentSubjects = await db.prepare(
    `SELECT DISTINCT target_id
     FROM behavior_log
     WHERE user_id = ? AND target_type IN ('anime', 'game', 'novel')
       AND created_at > ${sevenDaysAgo}
     LIMIT 100`
  ).bind(userId).all();

  const subjectIds = (recentSubjects.results || []).map(r => r.target_id);
  let recentTags = {};
  if (subjectIds.length > 0) {
    const placeholders = subjectIds.map(() => '?').join(',');
    const subjects = await db.prepare(
      `SELECT tags FROM bangumi_subjects WHERE id IN (${placeholders})`
    ).bind(...subjectIds).all();

    const tagCount = {};
    for (const s of (subjects.results || [])) {
      try {
        const tags = JSON.parse(s.tags || '[]');
        for (const tag of tags) {
          const name = typeof tag === 'string' ? tag : tag.name;
          if (name) tagCount[name] = (tagCount[name] || 0) + 1;
        }
      } catch {}
    }
    recentTags = tagCount;
  }

  const recentTypes = {};
  for (const row of (actionStats.results || [])) {
    if (['anime', 'game', 'novel'].includes(row.target_type)) {
      recentTypes[row.target_type] = (recentTypes[row.target_type] || 0) + row.cnt;
    }
  }

  const totalActions = (actionStats.results || []).reduce((s, r) => s + r.cnt, 0);

  const sessionResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM behavior_log
     WHERE user_id = ? AND action = 'page_stay'
       AND created_at > ${sevenDaysAgo}`
  ).bind(userId).first();

  const shortProfile = {
    recent_tags: JSON.stringify(recentTags),
    recent_types: JSON.stringify(recentTypes),
    recent_actions: totalActions,
    recent_subjects: JSON.stringify(subjectIds),
    session_count: sessionResult?.cnt || 0,
    updated_at: new Date().toISOString(),
  };

  await db.prepare(
    `INSERT OR REPLACE INTO user_profile_short
     (user_id, recent_tags, recent_types, recent_actions, recent_subjects, session_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId, shortProfile.recent_tags, shortProfile.recent_types,
    shortProfile.recent_actions, shortProfile.recent_subjects,
    shortProfile.session_count, shortProfile.updated_at
  ).run();

  return shortProfile;
}