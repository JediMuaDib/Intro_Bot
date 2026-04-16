require('dotenv').config();
const https = require('https');
const { App } = require('@slack/bolt');
const gplay = require('google-play-scraper').default;
const nodemailer = require('nodemailer');

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
const CHECK_INTERVAL_MS   = 15 * 60 * 1000; // 15 minutes

const IOS_APP_ID         = '6759299882';
const ANDROID_APP_ID     = 'ai.offgridmobile';
const GITHUB_REPO        = process.env.GITHUB_REPO || 'alichherawalla/off-grid-mobile-ai';
const IOS_UPDATE_URL     = `https://apps.apple.com/in/app/off-grid-private-ai-chat/id${IOS_APP_ID}`;
const IOS_REVIEW_URL     = `https://apps.apple.com/in/app/off-grid-private-ai-chat/id${IOS_APP_ID}?action=write-review`;
const ANDROID_UPDATE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}&hl=en_IN`;
const ANDROID_REVIEW_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}&hl=en_IN&reviewId=0`;
const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases`;

const ALERT_EMAILS = [
  'saiganesh.menon@gmail.com',
  'saiganesh.menon@wednesday.is',
];

// Track versions per platform
let lastSeenIosVersion = null;
let lastSeenAndroidVersion = null;
let lastSeenGithubVersion = null;
let cachedStoreInfo = null; // cached for trigger-word responses

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
// 2. RELEASES — poll App Store + Play Store (GitHub fallback)
// ═══════════════════════════════════════════════════════════

// ── Email alerts ─────────────────────────────────────────
const mailer = process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendAlertEmail(subject, body) {
  if (!mailer) {
    console.log('SMTP not configured — skipping email alert');
    return;
  }
  try {
    await mailer.sendMail({
      from: process.env.SMTP_USER,
      to: ALERT_EMAILS.join(', '),
      subject: `[GridBot] ${subject}`,
      text: body,
    });
    console.log(`Alert email sent: ${subject}`);
  } catch (err) {
    console.error('Failed to send alert email:', err.message);
  }
}

// ── Store fetchers ───────────────────────────────────────
function fetchIosVersion() {
  return new Promise((resolve, reject) => {
    https.get(`https://itunes.apple.com/lookup?id=${IOS_APP_ID}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.results && json.results[0];
          if (!result) return resolve(null);
          resolve({
            version: result.version,
            releaseNotes: result.releaseNotes || '',
            releaseDate: result.currentVersionReleaseDate,
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAndroidVersion() {
  const result = await gplay.app({ appId: ANDROID_APP_ID });
  return {
    version: result.version,
    releaseNotes: (result.recentChanges || '').replace(/<br\s*\/?>/gi, '\n'),
    updated: result.updated,
  };
}

async function fetchStoreVersions() {
  const [ios, android] = await Promise.allSettled([
    fetchIosVersion(),
    fetchAndroidVersion(),
  ]);

  const failures = [];
  if (ios.status === 'rejected') failures.push(`iOS App Store: ${ios.reason?.message || 'unknown error'}`);
  if (android.status === 'rejected') failures.push(`Google Play Store: ${android.reason?.message || 'unknown error'}`);

  return {
    ios: ios.status === 'fulfilled' ? ios.value : null,
    android: android.status === 'fulfilled' ? android.value : null,
    failures,
  };
}

// ── GitHub fallback ──────────────────────────────────────
function fetchGithubRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'GridBot/1.0',
        Accept: 'application/vnd.github.v3+json',
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

function githubReleaseToStoreInfo(release) {
  // Convert GitHub release into the same shape as store info
  // so buildReleaseMessage works with either source
  const notes = release.body || 'See GitHub for full changelog.';
  return {
    ios: { version: release.tag_name, releaseNotes: notes, releaseDate: release.published_at },
    android: { version: release.tag_name, releaseNotes: notes, updated: release.published_at },
    source: 'github',
  };
}

// ── Message builder ──────────────────────────────────────
function formatNotes(notes) {
  if (!notes) return '_No release notes provided._';
  return notes
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, 8)
    .map((line) =>
      line.startsWith('-') || line.startsWith('*')
        ? `> ${line.replace(/^[-*]\s*/, '')}`
        : `> ${line}`,
    )
    .join('\n');
}

function buildReleaseMessage(storeInfo, { isTest = false, channel = RELEASES_CHANNEL_ID, platform = 'both' } = {}) {
  const { ios, android } = storeInfo;
  const isGithubFallback = storeInfo.source === 'github';

  const version = platform === 'ios'
    ? ios?.version
    : platform === 'android'
      ? android?.version
      : ios?.version || android?.version;

  const testBanner = isTest
    ? '\n\n_This is a test message — not a real release notification._'
    : '';

  const fallbackNote = isGithubFallback
    ? '\n_Source: GitHub release (store fetch was unavailable)_'
    : '';

  const headerText = platform === 'both'
    ? `*Off Grid has a new update!*${testBanner}${fallbackNote}`
    : platform === 'ios'
      ? `*Off Grid v${ios?.version} is live on the App Store!*${testBanner}${fallbackNote}`
      : `*Off Grid v${android?.version} is live on the Play Store!*${testBanner}${fallbackNote}`;

  const blocks = [];

  if (isTest) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*TEST MODE* — This is a preview of the release notification format.` },
    });
    blocks.push({ type: 'divider' });
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: headerText },
  });
  blocks.push({ type: 'divider' });

  // iOS section
  if (ios && (platform === 'both' || platform === 'ios')) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*iOS — v${ios.version}*\n${formatNotes(ios.releaseNotes)}`,
      },
    });
    blocks.push({
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
    });
  }

  // Android section
  if (android && (platform === 'both' || platform === 'android')) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Android — v${android.version}*\n${formatNotes(android.releaseNotes)}`,
      },
    });
    blocks.push({
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
    });
  }

  // Footer
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: isGithubFallback
          ? `<${GITHUB_RELEASE_URL}|View on GitHub> · ${new Date().toDateString()}`
          : `Detected from live store listings · ${new Date().toDateString()}`,
      },
    ],
  });

  return {
    channel,
    text: `Off Grid v${version} is now live!`,
    blocks,
  };
}

// ── Polling logic ────────────────────────────────────────
async function checkForStoreUpdates() {
  try {
    const storeInfo = await fetchStoreVersions();
    const iosVersion = storeInfo.ios?.version || null;
    const androidVersion = storeInfo.android?.version || null;
    const bothFailed = !storeInfo.ios && !storeInfo.android;

    console.log(`Store check — iOS: ${iosVersion || 'FAILED'}, Android: ${androidVersion || 'FAILED'}`);

    // ── If both stores failed, try GitHub fallback ──
    if (bothFailed) {
      console.log('Both store fetches failed — falling back to GitHub');
      await sendAlertEmail(
        'Store fetch failed — using GitHub fallback',
        `Both App Store and Play Store fetches failed.\n\nFailures:\n${storeInfo.failures.join('\n')}\n\nFalling back to GitHub releases API.\n\nTimestamp: ${new Date().toISOString()}`,
      );

      try {
        const ghRelease = await fetchGithubRelease();
        if (!ghRelease.tag_name) {
          console.log('GitHub fallback also returned no release');
          return;
        }

        const ghStoreInfo = githubReleaseToStoreInfo(ghRelease);
        cachedStoreInfo = ghStoreInfo;

        if (lastSeenGithubVersion === null) {
          lastSeenGithubVersion = ghRelease.tag_name;
          console.log(`GitHub fallback — current version: ${ghRelease.tag_name}`);
          return;
        }

        if (ghRelease.tag_name !== lastSeenGithubVersion) {
          console.log(`GitHub fallback — new version: ${lastSeenGithubVersion} -> ${ghRelease.tag_name}`);
          lastSeenGithubVersion = ghRelease.tag_name;

          if (RELEASES_CHANNEL_ID) {
            const message = buildReleaseMessage(ghStoreInfo);
            await app.client.chat.postMessage(message);
            console.log(`Posted GitHub fallback release ${ghRelease.tag_name} to #releases`);
          }
        }
      } catch (ghErr) {
        console.error('GitHub fallback also failed:', ghErr.message);
        await sendAlertEmail(
          'All release sources failed',
          `App Store, Play Store, AND GitHub releases API all failed.\n\nStore failures:\n${storeInfo.failures.join('\n')}\n\nGitHub error: ${ghErr.message}\n\nThe bot cannot detect new releases right now. Please investigate.\n\nTimestamp: ${new Date().toISOString()}`,
        );
      }
      return;
    }

    // ── If one store failed, alert but continue with the working one ──
    if (storeInfo.failures.length > 0) {
      console.log(`Partial store failure: ${storeInfo.failures.join(', ')}`);
      await sendAlertEmail(
        'Partial store fetch failure',
        `One store fetch failed (the other is still working).\n\nFailure:\n${storeInfo.failures.join('\n')}\n\nThe bot will continue using the working store.\n\nTimestamp: ${new Date().toISOString()}`,
      );
    }

    // Cache for trigger-word responses
    cachedStoreInfo = storeInfo;

    // First run — record current versions, don't announce
    if (lastSeenIosVersion === null && lastSeenAndroidVersion === null) {
      lastSeenIosVersion = iosVersion;
      lastSeenAndroidVersion = androidVersion;
      console.log(`Watching — iOS: ${iosVersion}, Android: ${androidVersion}`);
      return;
    }

    const iosChanged = iosVersion && iosVersion !== lastSeenIosVersion;
    const androidChanged = androidVersion && androidVersion !== lastSeenAndroidVersion;

    if (!iosChanged && !androidChanged) {
      console.log('No store updates detected');
      return;
    }

    let platform = 'both';
    if (iosChanged && !androidChanged) platform = 'ios';
    if (!iosChanged && androidChanged) platform = 'android';

    if (iosChanged) {
      console.log(`New iOS version: ${lastSeenIosVersion} -> ${iosVersion}`);
      lastSeenIosVersion = iosVersion;
    }
    if (androidChanged) {
      console.log(`New Android version: ${lastSeenAndroidVersion} -> ${androidVersion}`);
      lastSeenAndroidVersion = androidVersion;
    }

    if (RELEASES_CHANNEL_ID) {
      const message = buildReleaseMessage(storeInfo, { platform });
      await app.client.chat.postMessage(message);
      console.log(`Posted ${platform} release to #releases`);
    } else {
      console.log('CH_RELEASES not set — skipping channel post');
    }
  } catch (err) {
    console.error('Error in checkForStoreUpdates:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// 3. TRIGGER WORDS
// ═══════════════════════════════════════════════════════════

// "what's new in offgrid" — responds in whatever channel it's posted
app.message(/what'?s new in off\s?grid/i, async ({ message, client, logger }) => {
  try {
    if (!cachedStoreInfo) {
      const storeInfo = await fetchStoreVersions();
      if (storeInfo.ios || storeInfo.android) {
        cachedStoreInfo = storeInfo;
      } else {
        // Try GitHub as fallback for trigger too
        const ghRelease = await fetchGithubRelease();
        if (ghRelease.tag_name) cachedStoreInfo = githubReleaseToStoreInfo(ghRelease);
      }
    }

    if (!cachedStoreInfo || (!cachedStoreInfo.ios && !cachedStoreInfo.android)) {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: "No release info available yet — stay tuned!",
      });
      return;
    }

    const msg = buildReleaseMessage(cachedStoreInfo, {
      channel: message.channel,
    });
    msg.thread_ts = message.ts;
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
    let storeInfo = await fetchStoreVersions();

    // If both stores failed, try GitHub
    if (!storeInfo.ios && !storeInfo.android) {
      logger.info('Stores unavailable for test — trying GitHub fallback');
      const ghRelease = await fetchGithubRelease();
      if (ghRelease.tag_name) {
        storeInfo = githubReleaseToStoreInfo(ghRelease);
      } else {
        await client.chat.postMessage({
          channel: message.channel,
          text: 'Could not fetch release info from stores or GitHub.',
        });
        return;
      }
    }

    const testMessage = buildReleaseMessage(storeInfo, {
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
  console.log('Polling: App Store + Play Store every 15 min (GitHub fallback if stores fail)');
  console.log('Alerts:', mailer ? `emails to ${ALERT_EMAILS.join(', ')}` : 'SMTP not configured — email alerts disabled');
  console.log('Triggers: "what\'s new in offgrid" (any channel), "test release" (preview)');

  await checkForStoreUpdates();
  setInterval(checkForStoreUpdates, CHECK_INTERVAL_MS);
})();
