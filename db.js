const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'gridbot.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ── Schema ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS releases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    version       TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('major', 'minor', 'bugfix')),
    platform      TEXT DEFAULT 'both',
    ios_notes     TEXT,
    android_notes TEXT,
    triggered_by  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS marketing_posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id    INTEGER NOT NULL REFERENCES releases(id),
    platform      TEXT NOT NULL,
    sub_target    TEXT,
    external_id   TEXT,
    external_url  TEXT,
    content       TEXT,
    status        TEXT DEFAULT 'posted',
    error_message TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS engagement_metrics (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    marketing_post_id INTEGER NOT NULL REFERENCES marketing_posts(id),
    likes             INTEGER DEFAULT 0,
    retweets          INTEGER DEFAULT 0,
    replies           INTEGER DEFAULT 0,
    upvotes           INTEGER DEFAULT 0,
    comments          INTEGER DEFAULT 0,
    fetched_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    platform    TEXT NOT NULL,
    target      TEXT NOT NULL,
    enabled     INTEGER DEFAULT 1,
    config      TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    platform    TEXT NOT NULL,
    release_type TEXT NOT NULL CHECK(release_type IN ('major', 'minor', 'bugfix')),
    template    TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ── Releases ─────────────────────────────────────────────
const insertRelease = db.prepare(`
  INSERT INTO releases (version, type, platform, ios_notes, android_notes, triggered_by)
  VALUES (@version, @type, @platform, @iosNotes, @androidNotes, @triggeredBy)
`);

const getRecentReleases = db.prepare(`
  SELECT * FROM releases ORDER BY created_at DESC LIMIT ?
`);

const getReleaseById = db.prepare(`SELECT * FROM releases WHERE id = ?`);

// ── Marketing Posts ──────────────────────────────────────
const insertMarketingPost = db.prepare(`
  INSERT INTO marketing_posts (release_id, platform, sub_target, external_id, external_url, content, status, error_message)
  VALUES (@releaseId, @platform, @subTarget, @externalId, @externalUrl, @content, @status, @errorMessage)
`);

const getPostsForRelease = db.prepare(`
  SELECT * FROM marketing_posts WHERE release_id = ? ORDER BY created_at ASC
`);

const getRecentPosts = db.prepare(`
  SELECT * FROM marketing_posts WHERE created_at > datetime('now', '-14 days') AND status = 'posted'
`);

// ── Engagement ───────────────────────────────────────────
const insertEngagement = db.prepare(`
  INSERT INTO engagement_metrics (marketing_post_id, likes, retweets, replies, upvotes, comments)
  VALUES (@marketingPostId, @likes, @retweets, @replies, @upvotes, @comments)
`);

const getLatestEngagement = db.prepare(`
  SELECT * FROM engagement_metrics WHERE marketing_post_id = ? ORDER BY fetched_at DESC LIMIT 1
`);

// ── Channels ─────────────────────────────────────────────
const getChannels = db.prepare(`SELECT * FROM channels ORDER BY platform, target`);
const getEnabledChannels = db.prepare(`SELECT * FROM channels WHERE enabled = 1 ORDER BY platform, target`);
const insertChannel = db.prepare(`INSERT INTO channels (platform, target, config) VALUES (@platform, @target, @config)`);
const updateChannel = db.prepare(`UPDATE channels SET enabled = @enabled, config = @config WHERE id = @id`);
const deleteChannel = db.prepare(`DELETE FROM channels WHERE id = ?`);

// ── Message Templates ────────────────────────────────────
const getTemplate = db.prepare(`SELECT * FROM message_templates WHERE platform = ? AND release_type = ?`);
const getAllTemplates = db.prepare(`SELECT * FROM message_templates ORDER BY platform, release_type`);
const upsertTemplate = db.prepare(`
  INSERT INTO message_templates (platform, release_type, template, updated_at)
  VALUES (@platform, @releaseType, @template, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET template = @template, updated_at = datetime('now')
`);
const deleteTemplate = db.prepare(`DELETE FROM message_templates WHERE id = ?`);
const insertOrReplaceTemplate = db.prepare(`
  INSERT INTO message_templates (platform, release_type, template, updated_at)
  VALUES (@platform, @releaseType, @template, datetime('now'))
`);

// ── Dashboard query: releases with posts and metrics ─────
function getReleasesWithMetrics(limit = 20) {
  const releases = getRecentReleases.all(limit);
  return releases.map((release) => {
    const posts = getPostsForRelease.all(release.id);
    const postsWithMetrics = posts.map((post) => {
      const metrics = getLatestEngagement.get(post.id);
      return { ...post, metrics: metrics || null };
    });
    return { ...release, posts: postsWithMetrics };
  });
}

module.exports = {
  db,
  insertRelease,
  getRecentReleases,
  getReleaseById,
  insertMarketingPost,
  getPostsForRelease,
  getRecentPosts,
  insertEngagement,
  getLatestEngagement,
  getChannels,
  getEnabledChannels,
  insertChannel,
  updateChannel,
  deleteChannel,
  getTemplate,
  getAllTemplates,
  upsertTemplate,
  deleteTemplate,
  insertOrReplaceTemplate,
  getReleasesWithMetrics,
};
