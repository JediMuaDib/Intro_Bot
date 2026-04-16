require('dotenv').config();
const https = require('https');
const { App } = require('@slack/bolt');

// ── ENV validation ───────────────────────────────────────
const REQUIRED_ENV = ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('--- ENV CHECK ---');
console.log('SLACK_APP_TOKEN:', process.env.SLACK_APP_TOKEN ? 'OK' : 'MISSING');
console.log('SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? 'OK' : 'MISSING');
console.log('SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? 'OK' : 'MISSING');
console.log('CH_INTRODUCTIONS:', process.env.CH_INTRODUCTIONS || 'NOT SET');
console.log('CH_RELEASES:', process.env.CH_RELEASES || 'NOT SET');
console.log('-----------------');

// ── Bolt app ─────────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ── Config ───────────────────────────────────────────────
const INTRO_CHANNEL_ID    = process.env.CH_INTRODUCTIONS;
const RELEASES_CHANNEL_ID = process.env.CH_RELEASES;
const GITHUB_REPO         = process.env.GITHUB_REPO || 'alichherawalla/off-grid-mobile-ai';
const CHECK_INTERVAL_MS   = 15 * 60 * 1000; // 15 minutes

const IOS_UPDATE_URL     = 'https://apps.apple.com/in/app/off-grid-private-ai-chat/id6759299882';
const IOS_REVIEW_URL     = 'https://apps.apple.com/in/app/off-grid-private-ai-chat/id6759299882?action=write-review';
const ANDROID_UPDATE_URL = 'https://play.google.com/store/apps/details?id=ai.offgridmobile&hl=en_IN';
const ANDROID_REVIEW_URL = 'https://play.google.com/store/apps/details?id=ai.offgridmobile&hl=en_IN&reviewId=0';
const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases`;

let lastSeenVersion = null;
let cachedRelease = null; // cached for trigger-word responses

// ═══════════════════════════════════════════════════════════
// 1. INTRO DM — sent to every new member on team_join
// ═══════════════════════════════════════════════════════════

function buildIntroBlocks(userId) {
  return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Hey <@${userId}>, welcome to Off Grid!*\n\nWe're really glad you found your way here. Whether you stumbled across us on GitHub, heard about us from a friend, or have been quietly curious about on-device AI for a while — you're in the right place. Take a breath, look around, and know that this is a genuinely welcoming corner of the internet.`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*What is Off Grid?*\n\nOff Grid is a mobile app (iOS + Android + macOS) that lets you run powerful AI entirely on your device. That means:\n\n• Chat with LLMs like Qwen3, Llama 3.2, Gemma 3, and Phi-4\n• Generate images with Stable Diffusion\n• Use vision AI to understand photos\n• Transcribe voice with Whisper\n\nAnd the best part? *None of it touches the internet.* Not a single byte leaves your phone.`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Why does this matter?*\n\nEvery time you use a cloud AI — ChatGPT, Claude, Gemini — your prompts travel to a server somewhere. They get logged, processed, and in some cases used to train future models. Your questions, your thoughts, your half-formed ideas — all of it leaves your device.\n\nOff Grid flips that entirely. The model runs on your CPU or GPU. Your words never leave. There's no account, no telemetry, no data collection. What you think stays yours.\n\nWe believe this isn't just a feature — it's how AI *should* work.`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*How this community works*\n\nThis isn't just a support channel. It's a place built around curiosity, sharing, and building together. Here's where things live:\n\n• <#${INTRO_CHANNEL_ID}> — say hello, that's what this message is about!\n• *#show-and-tell* — share what you've built, generated, or figured out\n• *#model-reviews* — honest benchmarks and comparisons from real devices\n• *#use-cases* — the workflows people are actually using Off Grid for\n• *#off-grid-life* — the bigger conversation about privacy, degoogling, and living without cloud dependency\n• *#feature-requests* — shape what gets built next\n• *#bugs* — spotted something wrong? let us know with your device + version`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Your first move — introduce yourself!*\n\nHead over to <#${INTRO_CHANNEL_ID}> and use this template. Copy it, fill it in, and post. It takes 2 minutes and the community genuinely loves hearing from new members.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "```\nName:\n   [Your name or handle]\n\nWhere I'm based:\n   [City / Country]\n\nDevice I run Off Grid on:\n   [e.g. iPhone 15 Pro / Pixel 8 / Samsung S24]\n\nFavourite model so far:\n   [e.g. Qwen3, Llama 3.2, Gemma 3 — or \"still exploring!\"]\n\nWhy I care about on-device AI:\n   [Privacy / no internet needed / just curious / etc.]\n\nWhat I'm building or using it for:\n   [e.g. coding assistant, travel tool, journalling, nothing yet]\n\nAnything else (GitHub, Twitter, blog):\n   [Optional]\n```",
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Post my introduction' },
              style: 'primary',
              url: `https://slack.com/app_redirect?channel=${INTRO_CHANNEL_ID}`,
              action_id: 'go_to_introductions',
            },
          ],
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*One last thing*\n\nIf you ever have a question, get stuck with the app, or just want to chat about something AI or privacy related — this community has you covered. Reply to this message any time and we'll get back to you.\n\nSo glad you're here. Welcome to the family.`,
          },
        },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '— The Off Grid team',
        },
      ],
    },
  ];
}

app.event('team_join', async ({ event, client, logger }) => {
  try {
    const userId = event.user.id;
    await client.chat.postMessage({
      channel: userId,
      text: `Welcome to Off Grid! We're so glad you're here.`,
      blocks: buildIntroBlocks(userId),
    });
    logger.info(`Intro DM sent to ${userId}`);
  } catch (error) {
    logger.error('Error sending intro DM:', error);
  }
});

// /test-intro — sends the intro DM to yourself for testing
app.command('/test-intro', async ({ command, ack, client, logger }) => {
  await ack();
  try {
    const userId = command.user_id;
    await client.chat.postMessage({
      channel: userId,
      text: `Welcome to Off Grid! We're so glad you're here.`,
      blocks: buildIntroBlocks(userId),
    });
    logger.info(`Test intro DM sent to ${userId}`);
  } catch (error) {
    logger.error('Error sending test intro DM:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// 2. RELEASES — poll GitHub and post to #releases
// ═══════════════════════════════════════════════════════════

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'GridBot/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        }),
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
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

function buildReleaseMessage(release, { isTest = false, channel = RELEASES_CHANNEL_ID } = {}) {
  const notes = release.body
    ? release.body
        .split('\n')
        .filter((line) => line.trim())
        .slice(0, 8)
        .map((line) =>
          line.startsWith('-') || line.startsWith('*')
            ? `> ${line.replace(/^[-*]\s*/, '')}`
            : line,
        )
        .join('\n')
    : 'See GitHub for full changelog.';

  const testBanner = isTest
    ? '\n\n_This is a test message — not a real release notification._'
    : '';

  return {
    channel,
    text: `Off Grid ${release.tag_name} is now live!`,
    blocks: [
      ...(isTest
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*TEST MODE* — This is a preview of the release notification format.`,
              },
            },
            { type: 'divider' },
          ]
        : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Off Grid ${release.tag_name} is now live!*${testBanner}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*What's new:*\n${notes}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*iOS*` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Update on App Store' },
            style: 'primary',
            url: IOS_UPDATE_URL,
            action_id: 'ios_update',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Leave a Review' },
            url: IOS_REVIEW_URL,
            action_id: 'ios_review',
          },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Android*` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Update on Play Store' },
            style: 'primary',
            url: ANDROID_UPDATE_URL,
            action_id: 'android_update',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Leave a Review' },
            url: ANDROID_REVIEW_URL,
            action_id: 'android_review',
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${GITHUB_RELEASE_URL}|View full changelog on GitHub>  ·  Released ${new Date(release.published_at).toDateString()}`,
          },
        ],
      },
    ],
  };
}

async function checkForNewRelease() {
  try {
    const release = await fetchLatestRelease();

    if (!release.tag_name) {
      console.log('No release found yet on GitHub');
      return;
    }

    cachedRelease = release;

    if (lastSeenVersion === null) {
      lastSeenVersion = release.tag_name;
      console.log(`Current version: ${lastSeenVersion} — watching for new releases...`);
      return;
    }

    if (release.tag_name !== lastSeenVersion) {
      console.log(`New release detected: ${release.tag_name}`);
      lastSeenVersion = release.tag_name;

      if (RELEASES_CHANNEL_ID) {
        const message = buildReleaseMessage(release);
        await app.client.chat.postMessage(message);
        console.log(`Posted release ${release.tag_name} to #releases`);
      } else {
        console.log('CH_RELEASES not set — skipping channel post');
      }
    } else {
      console.log(`No new release (still on ${lastSeenVersion})`);
    }
  } catch (err) {
    console.error('Error checking GitHub releases:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// 3. TRIGGER WORDS
// ═══════════════════════════════════════════════════════════

// "what's new in offgrid" — responds in whatever channel it's posted
app.message(/what'?s new in off\s?grid/i, async ({ message, client, logger }) => {
  try {
    if (!cachedRelease) {
      const release = await fetchLatestRelease();
      if (release.tag_name) cachedRelease = release;
    }

    if (!cachedRelease || !cachedRelease.tag_name) {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: "No releases found yet — stay tuned!",
      });
      return;
    }

    const msg = buildReleaseMessage(cachedRelease, {
      channel: message.channel,
    });
    msg.thread_ts = message.ts; // reply in thread to keep channels clean
    await client.chat.postMessage(msg);
    logger.info(`Replied to "what's new" trigger from ${message.user} in ${message.channel}`);
  } catch (err) {
    logger.error('Error handling whats-new trigger:', err.message);
  }
});

// "test release" — preview the release message format (for testing)
app.message(/test release/i, async ({ message, client, logger }) => {
  try {
    logger.info(`Test release triggered by ${message.user}`);
    const release = await fetchLatestRelease();

    if (!release.tag_name) {
      await client.chat.postMessage({
        channel: message.channel,
        text: 'No releases found on GitHub yet.',
      });
      return;
    }

    const testMessage = buildReleaseMessage(release, {
      isTest: true,
      channel: message.channel,
    });
    await client.chat.postMessage(testMessage);
    logger.info(`Test release message posted to channel ${message.channel}`);
  } catch (err) {
    logger.error('Test trigger error:', err.message);
    await client.chat.postMessage({
      channel: message.channel,
      text: `Test failed: ${err.message}`,
    });
  }
});

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════

(async () => {
  await app.start();
  console.log('GridBot is running');
  console.log('Triggers: "what\'s new in offgrid" (any channel), "test release" (preview)');

  await checkForNewRelease();
  setInterval(checkForNewRelease, CHECK_INTERVAL_MS);
})();
