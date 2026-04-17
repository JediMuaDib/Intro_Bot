const db = require('../db');
const config = require('../config');

function register(app) {
  app.command('/dashboard', async ({ command, ack, client }) => {
    await ack();

    const releases = db.getReleasesWithMetrics(5);

    if (releases.length === 0) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'No releases recorded yet. Use `/release major`, `/release minor`, or `/release bugfix` to tag one.',
      });
      return;
    }

    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*GridBot Dashboard — Recent Releases*' },
      },
      { type: 'divider' },
    ];

    for (const release of releases) {
      const typeEmoji = release.type === 'major' ? ':large_green_circle:' : release.type === 'minor' ? ':large_yellow_circle:' : ':white_circle:';
      const date = new Date(release.created_at + 'Z').toLocaleDateString();

      let postSummary = '';
      if (release.posts.length === 0) {
        postSummary = '  _No marketing posts_';
      } else {
        const lines = [];
        // Group by platform
        const twitterPosts = release.posts.filter((p) => p.platform === 'twitter');
        const redditPosts = release.posts.filter((p) => p.platform === 'reddit');
        const emailPosts = release.posts.filter((p) => p.platform === 'email_draft');

        if (twitterPosts.length > 0) {
          const posted = twitterPosts.filter((p) => p.status === 'posted');
          let line = `  X: ${posted.length} tweet(s)`;
          if (posted[0]?.metrics) {
            line += ` (${posted[0].metrics.likes} likes, ${posted[0].metrics.retweets} RTs)`;
          }
          if (posted[0]?.external_url) line += ` — <${posted[0].external_url}|view>`;
          lines.push(line);
        }

        if (redditPosts.length > 0) {
          for (const rp of redditPosts) {
            let line = `  Reddit r/${rp.sub_target || '?'}: ${rp.status}`;
            if (rp.metrics) {
              line += ` (${rp.metrics.upvotes} upvotes, ${rp.metrics.comments} comments)`;
            }
            if (rp.external_url) line += ` — <${rp.external_url}|view>`;
            lines.push(line);
          }
        }

        if (emailPosts.length > 0) {
          const count = emailPosts.filter((p) => p.status === 'draft').length;
          lines.push(`  Email: ${count} draft(s) in <#${config.CH_MARKETING_DRAFTS}>`);
        }

        postSummary = lines.join('\n');
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${typeEmoji} *v${release.version}* — ${release.type} — ${date}\n${postSummary}`,
        },
      });
    }

    // Footer with dashboard link
    blocks.push({ type: 'divider' });
    const dashUrl = config.DASHBOARD_URL;
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: dashUrl ? `<${dashUrl}|Open full dashboard> · Showing last ${releases.length} releases` : `Showing last ${releases.length} releases`,
        },
      ],
    });

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: 'GridBot Dashboard',
      blocks,
    });
  });
}

module.exports = { register };
