require('dotenv').config();
const { App } = require('@slack/bolt');
const https = require('https');

// ── Clients ───────────────────────────────────────────────
const slack = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const RELEASES_CHANNEL_ID = process.env.CH_RELEASES;
const GITHUB_REPO = 'alichherawalla/off-grid-mobile-ai';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // check every 15 minutes

const IOS_UPDATE_URL   = 'https://apps.apple.com/in/app/off-grid-private-ai-chat/id6759299882';
const IOS_REVIEW_URL   = 'https://apps.apple.com/in/app/off-grid-private-ai-chat/id6759299882?action=write-review';
const ANDROID_UPDATE_URL = 'https://play.google.com/store/apps/details?id=ai.offgridmobile&hl=en_IN';
const ANDROID_REVIEW_URL = 'https://play.google.com/store/apps/details?id=ai.offgridmobile&hl=en_IN&reviewId=0';
const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases`;

// ── Track last seen release ───────────────────────────────
let lastSeenVersion = null;

// ── Fetch latest GitHub release ───────────────────────────
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'GridBot/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`
        })
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ── Build the Slack release message ──────────────────────
function buildReleaseMessage(release) {
  // Clean up GitHub release notes
  const notes = release.body
    ? release.body
        .split('\n')
        .filter(line => line.trim())
        .slice(0, 8) // cap at 8 lines
        .map(line => line.startsWith('-') || line.startsWith('*')
          ? `→ ${line.replace(/^[-*]\s*/, '')}`
          : line)
        .join('\n')
    : 'See GitHub for full changelog.';

  return {
    channel: RELEASES_CHANNEL_ID,
    text: `🚀 Off Grid ${release.tag_name} is now live!`,
    blocks: [

      // ── Header ─────────────────────────────────────────
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚀 *Off Grid ${release.tag_name} is now live!*`,
        },
      },

      { type: 'divider' },

      // ── Release notes ───────────────────────────────────
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*What's new:*\n${notes}`,
        },
      },

      { type: 'divider' },

      // ── iOS ─────────────────────────────────────────────
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📱 *iOS*`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '⬆️ Update on App Store' },
            style: 'primary',
            url: IOS_UPDATE_URL,
            action_id: 'ios_update',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '⭐ Leave a Review' },
            url: IOS_REVIEW_URL,
            action_id: 'ios_review',
          },
        ],
      },

      // ── Android ─────────────────────────────────────────
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🤖 *Android*`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '⬆️ Update on Play Store' },
            style: 'primary',
            url: ANDROID_UPDATE_URL,
            action_id: 'android_update',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '⭐ Leave a Review' },
            url: ANDROID_REVIEW_URL,
            action_id: 'android_review',
          },
        ],
      },

      { type: 'divider' },

      // ── GitHub link ──────────────────────────────────────
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🐙 <${GITHUB_RELEASE_URL}|View full changelog on GitHub>  ·  Released ${new Date(release.published_at).toDateString()}`,
          },
        ],
      },

    ],
  };
}

// ── Poll GitHub every 15 minutes ─────────────────────────
async function checkForNewRelease() {
  try {
    const release = await fetchLatestRelease();

    if (!release.tag_name) {
      console.log('⚠️  No release found yet on GitHub');
      return;
    }

    // First run — just store the version, don't post
    if (lastSeenVersion === null) {
      lastSeenVersion = release.tag_name;
      console.log(`📌 Current version: ${lastSeenVersion} — watching for new releases...`);
      return;
    }

    // New release detected
    if (release.tag_name !== lastSeenVersion) {
      console.log(`🚀 New release detected: ${release.tag_name}`);
      lastSeenVersion = release.tag_name;

      const message = buildReleaseMessage(release);
      await slack.client.chat.postMessage(message);
      console.log(`✅ Posted release ${release.tag_name} to #releases`);
    } else {
      console.log(`✓ No new release (still on ${lastSeenVersion})`);
    }

  } catch (err) {
    console.error('❌ Error checking GitHub releases:', err.message);
  }
}

// ── Boot ──────────────────────────────────────────────────
(async () => {
  await slack.start();
  console.log('⚡ Releases bot running');

  // Check immediately on start
  await checkForNewRelease();

  // Then check every 15 minutes
  setInterval(checkForNewRelease, CHECK_INTERVAL_MS);
})();
