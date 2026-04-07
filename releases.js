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
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

const IOS_UPDATE_URL     = 'https://apps.apple.com/in/app/off-grid-private-ai-chat/id6759299882';
const IOS_REVIEW_URL     = 'https://apps.apple.com/in/app/off-grid-private-ai-chat/id6759299882?action=write-review';
const ANDROID_UPDATE_URL = 'https://play.google.com/store/apps/details?id=ai.offgridmobile&hl=en_IN';
const ANDROID_REVIEW_URL = 'https://play.google.com/store/apps/details?id=ai.offgridmobile&hl=en_IN&reviewId=0';
const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases`;

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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── Build the Slack release message ──────────────────────
function buildReleaseMessage(release, isTest = false) {
  const notes = release.body
    ? release.body
        .split('\n')
        .filter(line => line.trim())
        .slice(0, 8)
        .map(line => line.startsWith('-') || line.startsWith('*')
          ? `→ ${line.replace(/^[-*]\s*/, '')}`
          : line)
        .join('\n')
    : 'See GitHub for full changelog.';

  const testBanner = isTest ? '\n\n⚠️ _This is a test message — not a real release notification._' : '';

  return {
    channel: RELEASES_CHANNEL_ID,
    text: `🚀 Off Grid ${release.tag_name} is now live!`,
    blocks: [

      // ── Test badge (only shown during test) ─────────────
      ...(isTest ? [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🧪 *TEST MODE* — This is a preview of the release notification format.`,
        },
      }, { type: 'divider' }] : []),

      // ── Header ─────────────────────────────────────────
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚀 *Off Grid ${release.tag_name} is now live!*${testBanner}`,
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
        text: { type: 'mrkdwn', text: `📱 *iOS*` },
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
        text: { type: 'mrkdwn', text: `🤖 *Android*` },
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

    if (lastSeenVersion === null) {
      lastSeenVersion = release.tag_name;
      console.log(`📌 Current version: ${lastSeenVersion} — watching for new releases...`);
      return;
    }

    if (release.tag_name !== lastSeenVersion) {
      console.log(`🚀 New release detected: ${release.tag_name}`);
      lastSeenVersion = release.tag_name;
      const message = buildReleaseMessage(release, false);
      await slack.client.chat.postMessage(message);
      console.log(`✅ Posted release ${release.tag_name} to #releases`);
    } else {
      console.log(`✓ No new release (still on ${lastSeenVersion})`);
    }

  } catch (err) {
    console.error('❌ Error checking GitHub releases:', err.message);
  }
}

// ── TEST TRIGGER — type "Test release" in any channel ─────
slack.message(/test release/i, async ({ message, client, logger }) => {
  try {
    logger.info(`🧪 Test release triggered by ${message.user}`);
    const release = await fetchLatestRelease();

    if (!release.tag_name) {
      await client.chat.postMessage({
        channel: message.channel,
        text: '⚠️ No releases found on GitHub yet.',
      });
      return;
    }

    const testMessage = buildReleaseMessage(release, true);
    testMessage.channel = message.channel; // reply in same channel
    await client.chat.postMessage(testMessage);
    logger.info(`✅ Test release message posted to channel ${message.channel}`);

  } catch (err) {
    logger.error('❌ Test trigger error:', err.message);
    await client.chat.postMessage({
      channel: message.channel,
      text: `❌ Test failed: ${err.message}`,
    });
  }
});

// ── Boot ──────────────────────────────────────────────────
(async () => {
  await slack.start();
  console.log('⚡ Releases bot running');
  console.log('💬 Tip: type "Test release" in any channel to preview the release message');

  await checkForNewRelease();
  setInterval(checkForNewRelease, CHECK_INTERVAL_MS);
})();
