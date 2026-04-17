const { TwitterApi } = require('twitter-api-v2');
const config = require('../config');
const { getTemplate } = require('../db');

let client = null;

function getClient() {
  if (!config.TWITTER_ENABLED) return null;
  if (!client) {
    client = new TwitterApi({
      appKey: config.TWITTER_API_KEY,
      appSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    });
  }
  return client;
}

function buildThread(releaseData) {
  const { version, type, iosNotes, androidNotes, platform } = releaseData;

  // Check for custom template
  const customTemplate = getTemplate.get('twitter', type);
  if (customTemplate) {
    const templateText = customTemplate.template
      .replace(/\{version\}/g, version)
      .replace(/\{ios_notes\}/g, iosNotes || '')
      .replace(/\{android_notes\}/g, androidNotes || '')
      .replace(/\{platform\}/g, platform);
    return templateText.split('---TWEET---').map((t) => t.trim()).filter(Boolean);
  }

  const notes = iosNotes || androidNotes || '';
  const highlights = notes
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 4)
    .map((l) => l.replace(/^[-*>\s]+/, '').trim())
    .filter(Boolean);

  const storeLinks = `\nApp Store: ${config.IOS_UPDATE_URL}\nPlay Store: ${config.ANDROID_UPDATE_URL}`;

  if (type === 'major') {
    const tweets = [
      `Off Grid v${version} is here.\n\nRun powerful AI entirely on your device. No cloud. No telemetry. No data leaves your phone.\n\nHere's what's new:`,
    ];
    if (highlights.length > 0) {
      tweets.push(highlights.map((h) => `- ${h}`).join('\n'));
    }
    tweets.push(`Privacy isn't a feature — it's how AI should work.\n\nOff Grid runs LLMs, image generation, vision AI, and voice transcription 100% on-device. Zero internet required.`);
    tweets.push(`Try it free on iOS and Android:${storeLinks}\n\n#OnDeviceAI #Privacy #LocalLLM #OffGrid`);
    return tweets;
  }

  // minor
  const tweets = [
    `Off Grid v${version} update:\n\n${highlights.length > 0 ? highlights.map((h) => `- ${h}`).join('\n') : 'Performance improvements and fixes.'}`,
  ];
  tweets.push(`Get it now:${storeLinks}\n\n#OnDeviceAI #OffGrid`);
  return tweets;
}

async function postThread(releaseData) {
  const api = getClient();
  if (!api) throw new Error('Twitter not configured');

  const tweets = buildThread(releaseData);
  const posted = [];
  let lastTweetId = null;

  for (const text of tweets) {
    const params = { text };
    if (lastTweetId) params.reply = { in_reply_to_tweet_id: lastTweetId };

    const result = await api.v2.tweet(params);
    lastTweetId = result.data.id;
    posted.push({
      tweetId: result.data.id,
      url: `https://x.com/i/status/${result.data.id}`,
      text,
    });
  }

  return posted;
}

async function fetchTweetMetrics(tweetIds) {
  const api = getClient();
  if (!api) return [];

  const ids = Array.isArray(tweetIds) ? tweetIds : [tweetIds];
  const result = await api.v2.tweets(ids, { 'tweet.fields': 'public_metrics' });

  return (result.data || []).map((tweet) => ({
    tweetId: tweet.id,
    likes: tweet.public_metrics?.like_count || 0,
    retweets: tweet.public_metrics?.retweet_count || 0,
    replies: tweet.public_metrics?.reply_count || 0,
  }));
}

module.exports = { postThread, fetchTweetMetrics, buildThread };
