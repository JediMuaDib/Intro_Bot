const config = require('./config');
const express = require('express');
const { App } = require('@slack/bolt');

// ── Boot log ─────────────────────────────────────────────
console.log('--- ENV CHECK ---');
console.log('SLACK_APP_TOKEN:', config.SLACK_APP_TOKEN ? 'OK' : 'MISSING');
console.log('SLACK_BOT_TOKEN:', config.SLACK_BOT_TOKEN ? 'OK' : 'MISSING');
console.log('SLACK_SIGNING_SECRET:', config.SLACK_SIGNING_SECRET ? 'OK' : 'MISSING');
console.log('CH_INTRODUCTIONS:', config.CH_INTRODUCTIONS || 'NOT SET');
console.log('CH_RELEASES:', config.CH_RELEASES || 'NOT SET');
console.log('CH_MARKETING_DRAFTS:', config.CH_MARKETING_DRAFTS || 'NOT SET');
console.log('Twitter:', config.TWITTER_ENABLED ? 'ENABLED' : 'not configured');
console.log('Reddit:', config.REDDIT_ENABLED ? 'ENABLED' : 'not configured');
console.log('-----------------');

// ── Bolt app (Socket Mode) ──────────────────────────────
const app = new App({
  token: config.SLACK_BOT_TOKEN,
  signingSecret: config.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: config.SLACK_APP_TOKEN,
});

// ── Register handlers ────────────────────────────────────
require('./handlers/intro').register(app);
require('./handlers/releases').register(app);
require('./handlers/release-command').register(app);
require('./handlers/dashboard-command').register(app);

// ── Express dashboard (separate HTTP server) ─────────────
const web = express();
web.use('/', require('./routes/dashboard'));

// ── Boot ─────────────────────────────────────────────────
const { checkForStoreUpdates } = require('./handlers/releases');
const engagementTracker = require('./jobs/engagement-tracker');

(async () => {
  // Start Bolt (Socket Mode)
  await app.start();
  console.log('GridBot is running (Socket Mode)');

  // Start Express dashboard
  web.listen(config.PORT, () => {
    console.log(`Dashboard running on port ${config.PORT}`);
  });

  // Start store polling
  console.log('Polling: App Store + Play Store every 15 min (GitHub fallback)');
  console.log('Triggers: "what\'s new in offgrid", "test release", /release, /dashboard');
  await checkForStoreUpdates(app);
  setInterval(() => checkForStoreUpdates(app), config.CHECK_INTERVAL_MS);

  // Start engagement tracker
  engagementTracker.start();
})();
