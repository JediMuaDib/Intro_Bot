require('dotenv').config();
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ── Replace with your actual #introductions channel ID ──
const INTRO_CHANNEL_ID = process.env.CH_INTRODUCTIONS;

// ── Fires every time someone joins the workspace ────────
app.event('team_join', async ({ event, client, logger }) => {
  try {
    const userId = event.user.id;

    await client.chat.postMessage({
      channel: userId, // DM directly to the new member
      text: `Welcome to Off Grid! Here's how to introduce yourself.`,
      blocks: [

        // ── Header ──────────────────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `👋 *Hey <@${userId}>, welcome to the Off Grid community!*\n\nWe'd love for the community to meet you. Head over to <#${INTRO_CHANNEL_ID}> and introduce yourself using the template below — just copy, fill in, and post.`,
          },
        },

        { type: 'divider' },

        // ── Template ─────────────────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📋 Introduction Template*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              '```',
              '👤 Name:',
              '   [Your name or handle]',
              '',
              '📍 Where I\'m based:',
              '   [City / Country]',
              '',
              '📱 Device I run Off Grid on:',
              '   [e.g. iPhone 15 Pro / Pixel 8 / Samsung S24]',
              '',
              '🤖 Favourite model so far:',
              '   [e.g. Qwen3, Llama 3.2, Gemma 3 — or "still exploring!"]',
              '',
              '🔒 Why I care about on-device AI:',
              '   [Privacy / no internet needed / just curious / etc.]',
              '',
              '🛠️ What I\'m building or using it for:',
              '   [e.g. coding assistant, travel tool, journalling, nothing yet]',
              '',
              '🔗 Anything else (GitHub, Twitter, blog):',
              '   [Optional]',
              '```',
            ].join('\n'),
          },
        },

        { type: 'divider' },

        // ── CTA button ───────────────────────────────────
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✍️ Go to #introductions' },
              style: 'primary',
              url: `https://slack.com/app_redirect?channel=${INTRO_CHANNEL_ID}`,
              action_id: 'go_to_introductions',
            },
          ],
        },

        // ── Footer ───────────────────────────────────────
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'No pressure on length — a few lines is totally fine. Questions? Just reply here and we\'ll get back to you.',
            },
          ],
        },

      ],
    });

    logger.info(`✅ Intro DM sent to ${userId}`);

  } catch (error) {
    logger.error('❌ Error sending intro DM:', error);
  }
});

// ── Start ────────────────────────────────────────────────
(async () => {
  await app.start();
  console.log('⚡ GridBot is running');
})();
