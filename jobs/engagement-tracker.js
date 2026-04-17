const db = require('../db');
const config = require('../config');

let twitter = null;
let reddit = null;

try { twitter = require('../engines/twitter'); } catch (e) { /* optional */ }
try { reddit = require('../engines/reddit'); } catch (e) { /* optional */ }

const TRACK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function updateEngagement() {
  const posts = db.getRecentPosts.all();
  if (posts.length === 0) {
    console.log('Engagement: no recent posts to check');
    return;
  }

  console.log(`Engagement: checking ${posts.length} recent posts`);

  // Twitter metrics
  if (config.TWITTER_ENABLED && twitter) {
    const twitterPosts = posts.filter((p) => p.platform === 'twitter' && p.external_id);
    if (twitterPosts.length > 0) {
      try {
        const ids = twitterPosts.map((p) => p.external_id);
        const metrics = await twitter.fetchTweetMetrics(ids);
        for (const m of metrics) {
          const post = twitterPosts.find((p) => p.external_id === m.tweetId);
          if (post) {
            db.insertEngagement.run({
              marketingPostId: post.id,
              likes: m.likes,
              retweets: m.retweets,
              replies: m.replies,
              upvotes: 0,
              comments: 0,
            });
          }
        }
        console.log(`Engagement: updated ${metrics.length} Twitter posts`);
      } catch (err) {
        console.error('Engagement: Twitter fetch failed:', err.message);
      }
    }
  }

  // Reddit metrics
  if (config.REDDIT_ENABLED && reddit) {
    const redditPosts = posts.filter((p) => p.platform === 'reddit' && p.external_id);
    if (redditPosts.length > 0) {
      try {
        const ids = redditPosts.map((p) => p.external_id);
        const metrics = await reddit.fetchPostMetrics(ids);
        for (const m of metrics) {
          const post = redditPosts.find((p) => p.external_id === m.postId);
          if (post) {
            db.insertEngagement.run({
              marketingPostId: post.id,
              likes: 0,
              retweets: 0,
              replies: 0,
              upvotes: m.upvotes,
              comments: m.comments,
            });
          }
        }
        console.log(`Engagement: updated ${metrics.length} Reddit posts`);
      } catch (err) {
        console.error('Engagement: Reddit fetch failed:', err.message);
      }
    }
  }
}

function start() {
  console.log('Engagement tracker: running every 4 hours');
  // Run once after a short delay (don't block boot)
  setTimeout(updateEngagement, 30000);
  setInterval(updateEngagement, TRACK_INTERVAL_MS);
}

module.exports = { start, updateEngagement };
