const config = require('../config');
const db = require('../db');
const { getCachedStoreInfo, fetchStoreVersions } = require('./releases');
const twitter = require('../engines/twitter');
const reddit = require('../engines/reddit');
const email = require('../engines/email');

function register(app) {
  app.command('/release', async ({ command, ack, client, logger }) => {
    await ack();

    const type = (command.text || '').trim().toLowerCase();
    if (!['major', 'minor', 'bugfix'].includes(type)) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Usage: `/release major`, `/release minor`, or `/release bugfix`',
      });
      return;
    }

    // Access control
    if (config.RELEASE_AUTHORIZED_USERS.length > 0 && !config.RELEASE_AUTHORIZED_USERS.includes(command.user_id)) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'You are not authorized to run this command.',
      });
      return;
    }

    // Get store info
    let storeInfo = getCachedStoreInfo();
    if (!storeInfo) {
      storeInfo = await fetchStoreVersions();
    }

    const iosVersion = storeInfo?.ios?.version;
    const androidVersion = storeInfo?.android?.version;
    const version = iosVersion || androidVersion || 'unknown';
    const iosNotes = storeInfo?.ios?.releaseNotes || '';
    const androidNotes = storeInfo?.android?.releaseNotes || '';
    const platform = storeInfo?.ios && storeInfo?.android ? 'both' : storeInfo?.ios ? 'ios' : 'android';

    // Record in DB
    const releaseResult = db.insertRelease.run({
      version,
      type,
      platform,
      iosNotes,
      androidNotes,
      triggeredBy: command.user_id,
    });
    const releaseId = releaseResult.lastInsertRowid;

    const releaseData = { version, type, iosNotes, androidNotes, platform, releaseId };

    // Bugfix — just note it
    if (type === 'bugfix') {
      if (config.CH_RELEASES) {
        await client.chat.postMessage({
          channel: config.CH_RELEASES,
          text: `v${version} tagged as *bugfix* by <@${command.user_id}> — no marketing actions triggered.`,
        });
      }
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `v${version} recorded as bugfix. No marketing engines fired.`,
      });
      return;
    }

    // Post processing message
    const processingMsg = await client.chat.postMessage({
      channel: config.CH_RELEASES || command.channel_id,
      text: `Processing /release ${type} for v${version}...`,
    });

    const results = [];

    // ── Twitter ──────────────────────────────────────────
    if (config.TWITTER_ENABLED) {
      try {
        const tweets = await twitter.postThread(releaseData);
        for (const tweet of tweets) {
          db.insertMarketingPost.run({
            releaseId,
            platform: 'twitter',
            subTarget: null,
            externalId: tweet.tweetId,
            externalUrl: tweet.url,
            content: tweet.text,
            status: 'posted',
            errorMessage: null,
          });
        }
        results.push(`*X/Twitter:* ${tweets.length}-tweet thread posted — <${tweets[0].url}|View thread>`);
      } catch (err) {
        logger.error('Twitter engine failed:', err.message);
        db.insertMarketingPost.run({
          releaseId,
          platform: 'twitter',
          subTarget: null,
          externalId: null,
          externalUrl: null,
          content: null,
          status: 'failed',
          errorMessage: err.message,
        });
        results.push(`*X/Twitter:* Failed — ${err.message}`);
      }
    } else {
      results.push('*X/Twitter:* Skipped (not configured)');
    }

    // ── Reddit ───────────────────────────────────────────
    if (config.REDDIT_ENABLED) {
      try {
        const posts = await reddit.postToSubreddits(releaseData);
        for (const post of posts) {
          db.insertMarketingPost.run({
            releaseId,
            platform: 'reddit',
            subTarget: post.subreddit,
            externalId: post.postId,
            externalUrl: post.url,
            content: post.title,
            status: post.error ? 'failed' : 'posted',
            errorMessage: post.error || null,
          });
        }
        const successful = posts.filter((p) => !p.error);
        const failed = posts.filter((p) => p.error);
        let line = `*Reddit:* ${successful.length} post(s)`;
        if (successful.length > 0) line += ' — ' + successful.map((p) => `<${p.url}|r/${p.subreddit}>`).join(', ');
        if (failed.length > 0) line += ` | ${failed.length} failed`;
        results.push(line);
      } catch (err) {
        logger.error('Reddit engine failed:', err.message);
        db.insertMarketingPost.run({
          releaseId,
          platform: 'reddit',
          subTarget: null,
          externalId: null,
          externalUrl: null,
          content: null,
          status: 'failed',
          errorMessage: err.message,
        });
        results.push(`*Reddit:* Failed — ${err.message}`);
      }
    } else {
      results.push('*Reddit:* Skipped (not configured)');
    }

    // ── Email Drafts (major only) ────────────────────────
    if (type === 'major') {
      try {
        const drafts = await email.generateEmailDrafts(releaseData, client);
        for (const draft of drafts) {
          db.insertMarketingPost.run({
            releaseId,
            platform: 'email_draft',
            subTarget: draft.draftType,
            externalId: draft.slackTs || null,
            externalUrl: null,
            content: draft.subject || null,
            status: draft.error ? 'failed' : 'draft',
            errorMessage: draft.error || null,
          });
        }
        const successful = drafts.filter((d) => !d.error);
        results.push(`*Email drafts:* ${successful.length} draft(s) posted to <#${config.CH_MARKETING_DRAFTS}>`);
      } catch (err) {
        logger.error('Email draft engine failed:', err.message);
        results.push(`*Email drafts:* Failed — ${err.message}`);
      }
    }

    // ── Update processing message with results ───────────
    const summaryText = `*Release v${version} — ${type.toUpperCase()}* tagged by <@${command.user_id}>\n\n${results.join('\n')}`;

    try {
      await client.chat.update({
        channel: processingMsg.channel,
        ts: processingMsg.ts,
        text: summaryText,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: summaryText } },
          { type: 'divider' },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Release #${releaseId} · ${new Date().toDateString()}` }],
          },
        ],
      });
    } catch (err) {
      // If update fails, post a new message
      await client.chat.postMessage({
        channel: config.CH_RELEASES || command.channel_id,
        text: summaryText,
      });
    }
  });
}

module.exports = { register };
