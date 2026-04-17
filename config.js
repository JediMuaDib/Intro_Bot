require('dotenv').config();

// ── ENV validation ───────────────────────────────────────
const REQUIRED_ENV = ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  // Slack
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
  CH_INTRODUCTIONS: process.env.CH_INTRODUCTIONS,
  CH_RELEASES: process.env.CH_RELEASES,
  CH_MARKETING_DRAFTS: process.env.CH_MARKETING_DRAFTS,

  // Store IDs
  IOS_APP_ID: '6759299882',
  ANDROID_APP_ID: 'ai.offgridmobile',

  // URLs
  get IOS_UPDATE_URL() {
    return `https://apps.apple.com/in/app/off-grid-private-ai-chat/id${this.IOS_APP_ID}`;
  },
  get IOS_REVIEW_URL() {
    return `https://apps.apple.com/in/app/off-grid-private-ai-chat/id${this.IOS_APP_ID}?action=write-review`;
  },
  get ANDROID_UPDATE_URL() {
    return `https://play.google.com/store/apps/details?id=${this.ANDROID_APP_ID}&hl=en_IN`;
  },
  get ANDROID_REVIEW_URL() {
    return `https://play.google.com/store/apps/details?id=${this.ANDROID_APP_ID}&hl=en_IN&reviewId=0`;
  },

  // GitHub fallback
  GITHUB_REPO: process.env.GITHUB_REPO || 'alichherawalla/off-grid-mobile-ai',
  get GITHUB_RELEASE_URL() {
    return `https://github.com/${this.GITHUB_REPO}/releases`;
  },
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,

  // Polling
  CHECK_INTERVAL_MS: 15 * 60 * 1000,

  // Twitter / X
  TWITTER_API_KEY: process.env.TWITTER_API_KEY,
  TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,
  get TWITTER_ENABLED() {
    return !!(this.TWITTER_API_KEY && this.TWITTER_API_SECRET && this.TWITTER_ACCESS_TOKEN && this.TWITTER_ACCESS_SECRET);
  },

  // Reddit
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
  REDDIT_USERNAME: process.env.REDDIT_USERNAME,
  REDDIT_PASSWORD: process.env.REDDIT_PASSWORD,
  REDDIT_SUBREDDITS: (process.env.REDDIT_SUBREDDITS || 'LocalLLM,privacy,androidapps').split(',').map((s) => s.trim()),
  get REDDIT_ENABLED() {
    return !!(this.REDDIT_CLIENT_ID && this.REDDIT_CLIENT_SECRET && this.REDDIT_USERNAME && this.REDDIT_PASSWORD);
  },

  // Email alerts
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  ALERT_EMAILS: ['saiganesh.menon@gmail.com', 'saiganesh.menon@wednesday.is'],

  // Access control
  RELEASE_AUTHORIZED_USERS: process.env.RELEASE_AUTHORIZED_USERS
    ? process.env.RELEASE_AUTHORIZED_USERS.split(',').map((s) => s.trim())
    : [],

  // Dashboard
  DASHBOARD_URL: process.env.DASHBOARD_URL || '',
  PORT: process.env.PORT || 3000,
};
