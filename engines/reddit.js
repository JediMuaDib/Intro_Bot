const Snoowrap = require('snoowrap');
const config = require('../config');
const { getTemplate } = require('../db');

let client = null;

function getClient() {
  if (!config.REDDIT_ENABLED) return null;
  if (!client) {
    client = new Snoowrap({
      userAgent: 'GridBot/2.0 (by /u/' + config.REDDIT_USERNAME + ')',
      clientId: config.REDDIT_CLIENT_ID,
      clientSecret: config.REDDIT_CLIENT_SECRET,
      username: config.REDDIT_USERNAME,
      password: config.REDDIT_PASSWORD,
    });
    client.config({ requestDelay: 1000 });
  }
  return client;
}

// Tailor the post body to the subreddit audience
const SUBREDDIT_ANGLES = {
  LocalLLM: {
    focus: 'model support and on-device inference',
    hook: 'For anyone running local models on mobile',
  },
  localllama: {
    focus: 'model support and on-device inference',
    hook: 'For anyone running local models on mobile',
  },
  privacy: {
    focus: 'zero telemetry, no cloud, no data collection',
    hook: 'For those who believe AI should respect your privacy',
  },
  androidapps: {
    focus: 'Android app update and features',
    hook: 'Off Grid just got an update on the Play Store',
  },
};

function buildPost(releaseData, subreddit) {
  const { version, type, iosNotes, androidNotes } = releaseData;

  // Check for custom template
  const customTemplate = getTemplate.get('reddit', type);
  if (customTemplate) {
    return {
      title: customTemplate.template.split('\n')[0]
        .replace(/\{version\}/g, version)
        .replace(/\{subreddit\}/g, subreddit),
      text: customTemplate.template.split('\n').slice(1).join('\n')
        .replace(/\{version\}/g, version)
        .replace(/\{ios_notes\}/g, iosNotes || '')
        .replace(/\{android_notes\}/g, androidNotes || '')
        .replace(/\{subreddit\}/g, subreddit),
    };
  }

  const angle = SUBREDDIT_ANGLES[subreddit] || SUBREDDIT_ANGLES[subreddit.toLowerCase()] || {
    focus: 'on-device AI',
    hook: 'Off Grid just released a new version',
  };

  const notes = iosNotes || androidNotes || '';
  const highlights = notes
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 6)
    .map((l) => `- ${l.replace(/^[-*>\s]+/, '').trim()}`)
    .filter((l) => l !== '-')
    .join('\n');

  if (type === 'major') {
    return {
      title: `Off Grid v${version} — Run AI entirely on your phone, no cloud needed`,
      text: `${angle.hook}:\n\n**What's new in v${version}:**\n${highlights || 'Major improvements across the board.'}\n\n**What is Off Grid?**\nA mobile app (iOS + Android + macOS) that runs LLMs, image generation, vision AI, and whisper transcription 100% on-device. No internet. No telemetry. No data leaves your phone.\n\nFocused on ${angle.focus}.\n\n**Links:**\n- iOS: ${config.IOS_UPDATE_URL}\n- Android: ${config.ANDROID_UPDATE_URL}\n- GitHub: ${config.GITHUB_RELEASE_URL}`,
    };
  }

  // minor
  return {
    title: `Off Grid v${version} update — ${highlights.split('\n')[0]?.replace(/^- /, '') || 'improvements and fixes'}`,
    text: `${angle.hook}:\n\n${highlights || 'Various improvements and fixes.'}\n\n- iOS: ${config.IOS_UPDATE_URL}\n- Android: ${config.ANDROID_UPDATE_URL}`,
  };
}

async function postToSubreddits(releaseData, subreddits) {
  const api = getClient();
  if (!api) throw new Error('Reddit not configured');

  const targets = subreddits || config.REDDIT_SUBREDDITS;
  const posted = [];

  for (const sub of targets) {
    try {
      const { title, text } = buildPost(releaseData, sub);
      const submission = await api.getSubreddit(sub).submitSelfpost({ title, text });
      posted.push({
        subreddit: sub,
        postId: submission.name,
        url: `https://reddit.com${submission.permalink}`,
        title,
        text,
      });
      console.log(`Posted to r/${sub}`);
    } catch (err) {
      console.error(`Failed to post to r/${sub}:`, err.message);
      posted.push({
        subreddit: sub,
        postId: null,
        url: null,
        error: err.message,
      });
    }
  }

  return posted;
}

async function fetchPostMetrics(postIds) {
  const api = getClient();
  if (!api) return [];

  const ids = Array.isArray(postIds) ? postIds : [postIds];
  const metrics = [];

  for (const id of ids) {
    try {
      const post = await api.getSubmission(id).fetch();
      metrics.push({
        postId: id,
        upvotes: post.ups || 0,
        comments: post.num_comments || 0,
      });
    } catch (err) {
      console.error(`Failed to fetch metrics for ${id}:`, err.message);
    }
  }

  return metrics;
}

module.exports = { postToSubreddits, fetchPostMetrics, buildPost };
