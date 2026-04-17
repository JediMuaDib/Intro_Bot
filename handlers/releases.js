const https = require('https');
const gplay = require('google-play-scraper').default;
const config = require('../config');

// ── State ────────────────────────────────────────────────
let lastSeenIosVersion = null;
let lastSeenAndroidVersion = null;
let lastSeenGithubVersion = null;
let cachedStoreInfo = null;

function getCachedStoreInfo() {
  return cachedStoreInfo;
}

// ── Store fetchers ───────────────────────────────────────
function fetchIosVersion() {
  return new Promise((resolve, reject) => {
    https.get(`https://itunes.apple.com/lookup?id=${config.IOS_APP_ID}`, (res) => {
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
  const result = await gplay.app({ appId: config.ANDROID_APP_ID });
  return {
    version: result.version,
    releaseNotes: (result.recentChanges || '').replace(/<br\s*\/?>/gi, '\n'),
    updated: result.updated,
  };
}

async function fetchStoreVersions() {
  const [ios, android] = await Promise.allSettled([fetchIosVersion(), fetchAndroidVersion()]);
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
      path: `/repos/${config.GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'GridBot/1.0',
        Accept: 'application/vnd.github.v3+json',
        ...(config.GITHUB_TOKEN && { Authorization: `token ${config.GITHUB_TOKEN}` }),
      },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function githubReleaseToStoreInfo(release) {
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
      line.startsWith('-') || line.startsWith('*') ? `> ${line.replace(/^[-*]\s*/, '')}` : `> ${line}`,
    )
    .join('\n');
}

function buildReleaseMessage(storeInfo, { isTest = false, channel = config.CH_RELEASES, platform = 'both' } = {}) {
  const { ios, android } = storeInfo;
  const isGithubFallback = storeInfo.source === 'github';

  const version =
    platform === 'ios' ? ios?.version : platform === 'android' ? android?.version : ios?.version || android?.version;

  const testBanner = isTest ? '\n\n_This is a test message — not a real release notification._' : '';
  const fallbackNote = isGithubFallback ? '\n_Source: GitHub release (store fetch was unavailable)_' : '';

  const headerText =
    platform === 'both'
      ? `*Off Grid has a new update!*${testBanner}${fallbackNote}`
      : platform === 'ios'
        ? `*Off Grid v${ios?.version} is live on the App Store!*${testBanner}${fallbackNote}`
        : `*Off Grid v${android?.version} is live on the Play Store!*${testBanner}${fallbackNote}`;

  const blocks = [];

  if (isTest) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*TEST MODE* — Preview of the release notification.` } });
    blocks.push({ type: 'divider' });
  }

  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: headerText } });
  blocks.push({ type: 'divider' });

  if (ios && (platform === 'both' || platform === 'ios')) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*iOS — v${ios.version}*\n${formatNotes(ios.releaseNotes)}` } });
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Update on App Store' }, style: 'primary', url: config.IOS_UPDATE_URL, action_id: 'ios_update' },
        { type: 'button', text: { type: 'plain_text', text: 'Leave a Review' }, url: config.IOS_REVIEW_URL, action_id: 'ios_review' },
      ],
    });
  }

  if (android && (platform === 'both' || platform === 'android')) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Android — v${android.version}*\n${formatNotes(android.releaseNotes)}` } });
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Update on Play Store' }, style: 'primary', url: config.ANDROID_UPDATE_URL, action_id: 'android_update' },
        { type: 'button', text: { type: 'plain_text', text: 'Leave a Review' }, url: config.ANDROID_REVIEW_URL, action_id: 'android_review' },
      ],
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: isGithubFallback
        ? `<${config.GITHUB_RELEASE_URL}|View on GitHub> · ${new Date().toDateString()}`
        : `Detected from live store listings · ${new Date().toDateString()}`,
    }],
  });

  return { channel, text: `Off Grid v${version} is now live!`, blocks };
}

// ── Polling ──────────────────────────────────────────────
async function checkForStoreUpdates(app) {
  try {
    const storeInfo = await fetchStoreVersions();
    const iosVersion = storeInfo.ios?.version || null;
    const androidVersion = storeInfo.android?.version || null;
    const bothFailed = !storeInfo.ios && !storeInfo.android;

    console.log(`Store check — iOS: ${iosVersion || 'FAILED'}, Android: ${androidVersion || 'FAILED'}`);

    if (bothFailed) {
      console.log('Both store fetches failed — falling back to GitHub');
      try {
        const ghRelease = await fetchGithubRelease();
        if (!ghRelease.tag_name) { console.log('GitHub fallback also returned no release'); return; }

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
          if (config.CH_RELEASES) {
            await app.client.chat.postMessage(buildReleaseMessage(ghStoreInfo));
            console.log(`Posted GitHub fallback release ${ghRelease.tag_name} to #releases`);
          }
        }
      } catch (ghErr) {
        console.error('GitHub fallback also failed:', ghErr.message);
      }
      return;
    }

    if (storeInfo.failures.length > 0) {
      console.log(`Partial store failure: ${storeInfo.failures.join(', ')}`);
    }

    cachedStoreInfo = storeInfo;

    if (lastSeenIosVersion === null && lastSeenAndroidVersion === null) {
      lastSeenIosVersion = iosVersion;
      lastSeenAndroidVersion = androidVersion;
      console.log(`Watching — iOS: ${iosVersion}, Android: ${androidVersion}`);
      return;
    }

    const iosChanged = iosVersion && iosVersion !== lastSeenIosVersion;
    const androidChanged = androidVersion && androidVersion !== lastSeenAndroidVersion;

    if (!iosChanged && !androidChanged) { console.log('No store updates detected'); return; }

    let platform = 'both';
    if (iosChanged && !androidChanged) platform = 'ios';
    if (!iosChanged && androidChanged) platform = 'android';

    if (iosChanged) { console.log(`New iOS version: ${lastSeenIosVersion} -> ${iosVersion}`); lastSeenIosVersion = iosVersion; }
    if (androidChanged) { console.log(`New Android version: ${lastSeenAndroidVersion} -> ${androidVersion}`); lastSeenAndroidVersion = androidVersion; }

    if (config.CH_RELEASES) {
      await app.client.chat.postMessage(buildReleaseMessage(storeInfo, { platform }));
      console.log(`Posted ${platform} release to #releases`);
    }
  } catch (err) {
    console.error('Error in checkForStoreUpdates:', err.message);
  }
}

// ── Register trigger words ───────────────────────────────
function register(app) {
  app.message(/what'?s new in off\s?grid/i, async ({ message, client, logger }) => {
    try {
      if (!cachedStoreInfo) {
        const storeInfo = await fetchStoreVersions();
        if (storeInfo.ios || storeInfo.android) {
          cachedStoreInfo = storeInfo;
        } else {
          const ghRelease = await fetchGithubRelease();
          if (ghRelease.tag_name) cachedStoreInfo = githubReleaseToStoreInfo(ghRelease);
        }
      }
      if (!cachedStoreInfo || (!cachedStoreInfo.ios && !cachedStoreInfo.android)) {
        await client.chat.postMessage({ channel: message.channel, thread_ts: message.ts, text: "No release info available yet — stay tuned!" });
        return;
      }
      const msg = buildReleaseMessage(cachedStoreInfo, { channel: message.channel });
      msg.thread_ts = message.ts;
      await client.chat.postMessage(msg);
      logger.info(`Replied to "what's new" trigger from ${message.user} in ${message.channel}`);
    } catch (err) {
      logger.error('Error handling whats-new trigger:', err.message);
    }
  });

  app.message(/test release/i, async ({ message, client, logger }) => {
    try {
      logger.info(`Test release triggered by ${message.user}`);
      let storeInfo = await fetchStoreVersions();
      if (!storeInfo.ios && !storeInfo.android) {
        const ghRelease = await fetchGithubRelease();
        if (ghRelease.tag_name) { storeInfo = githubReleaseToStoreInfo(ghRelease); }
        else { await client.chat.postMessage({ channel: message.channel, text: 'Could not fetch release info.' }); return; }
      }
      const testMessage = buildReleaseMessage(storeInfo, { isTest: true, channel: message.channel });
      await client.chat.postMessage(testMessage);
      logger.info(`Test release message posted to channel ${message.channel}`);
    } catch (err) {
      logger.error('Test trigger error:', err.message);
      await client.chat.postMessage({ channel: message.channel, text: `Test failed: ${err.message}` });
    }
  });
}

module.exports = { register, checkForStoreUpdates, getCachedStoreInfo, fetchStoreVersions, fetchGithubRelease, githubReleaseToStoreInfo, buildReleaseMessage, formatNotes };
