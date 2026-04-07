require('dotenv').config();

// ── ENV DEBUG (remove after confirming tokens are working) ──
console.log('--- ENV CHECK ---');
console.log('SLACK_APP_TOKEN:', process.env.SLACK_APP_TOKEN ? 'FOUND (' + process.env.SLACK_APP_TOKEN.slice(0,15) + '...)' : 'MISSING');
console.log('SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? 'FOUND (' + process.env.SLACK_BOT_TOKEN.slice(0,15) + '...)' : 'MISSING');
console.log('SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? 'FOUND (' + process.env.SLACK_SIGNING_SECRET.slice(0,8) + '...)' : 'MISSING');
console.log('CH_INTRODUCTIONS:', process.env.CH_INTRODUCTIONS || 'MISSING');
console.log('-----------------');

const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const INTRO_CHANNEL_ID = process.env.CH_INTRODUCTIONS;

app.event('team_join', async ({ event, client, logger }) => {
  try {
    const userId = event.user.id;

    await client.chat.postMessage({
      channel: userId,
      text: `Welcome to Off Grid! We're so glad you're here.`,
      blocks: [

        // ── Welcome ─────────────────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `👋 *Hey <@${userId}>, welcome to Off Grid!*\n\nWe're really glad you found your way here. Whether you stumbled across us on GitHub, heard about us from a friend, or have been quietly curious about on-device AI for a while — you're in the right place. Take a breath, look around, and know that this is a genuinely welcoming corner of the internet.`,
          },
        },

        { type: 'divider' },

        // ── What Off Grid is ─────────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📱 *What is Off Grid?*\n\nOff Grid is a mobile app (iOS + Android + macOS) that lets you run powerful AI entirely on your device. That means:\n\n• 🤖 Chat with LLMs like Qwen3, Llama 3.2, Gemma 3, and Phi-4\n• 🎨 Generate images with Stable Diffusion\n• 👁️ Use vision AI to understand photos\n• 🎙️ Transcribe voice with Whisper\n\nAnd the best part? *None of it touches the internet.* Not a single byte leaves your phone.`,
          },
        },

        { type: 'divider' },

        // ── Why privacy matters ──────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔒 *Why does this matter?*\n\nEvery time you use a cloud AI — ChatGPT, Claude, Gemini — your prompts travel to a server somewhere. They get logged, processed, and in some cases used to train future models. Your questions, your thoughts, your half-formed ideas — all of it leaves your device.\n\nOff Grid flips that entirely. The model runs on your CPU or GPU. Your words never leave. There's no account, no telemetry, no data collection. What you think stays yours.\n\nWe believe this isn't just a feature — it's how AI *should* work.`,
          },
        },

        { type: 'divider' },

        // ── How the community works ──────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🤝 *How this community works*\n\nThis isn't just a support channel. It's a place built around curiosity, sharing, and building together. Here's where things live:\n\n• <#${INTRO_CHANNEL_ID}> — say hello, that's what this message is about!\n• *#show-and-tell* — share what you've built, generated, or figured out\n• *#model-reviews* — honest benchmarks and comparisons from real devices\n• *#use-cases* — the workflows people are actually using Off Grid for\n• *#off-grid-life* — the bigger conversation about privacy, degoogling, and living without cloud dependency\n• *#feature-requests* — shape what gets built next\n• *#bugs* — spotted something wrong? let us know with your device + version`,
          },
        },

        { type: 'divider' },

        // ── Intro template ───────────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✍️ *Your first move — introduce yourself!*\n\nHead over to <#${INTRO_CHANNEL_ID}> and use this template. Copy it, fill it in, and post. It takes 2 minutes and the community genuinely loves hearing from new members.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "```\n👤 Name:\n   [Your name or handle]\n\n📍 Where I'm based:\n   [City / Country]\n\n📱 Device I run Off Grid on:\n   [e.g. iPhone 15 Pro / Pixel 8 / Samsung S24]\n\n🤖 Favourite model so far:\n   [e.g. Qwen3, Llama 3.2, Gemma 3 — or \"still exploring!\"]\n\n🔒 Why I care about on-device AI:\n   [Privacy / no internet needed / just curious / etc.]\n\n🛠️ What I'm building or using it for:\n   [e.g. coding assistant, travel tool, journalling, nothing yet]\n\n🔗 Anything else (GitHub, Twitter, blog):\n   [Optional]\n```",
          },
        },

        // ── CTA ──────────────────────────────────────────
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✍️ Post my introduction' },
              style: 'primary',
              url: `https://slack.com/app_redirect?channel=${INTRO_CHANNEL_ID}`,
              action_id: 'go_to_introductions',
            },
          ],
        },

        { type: 'divider' },

        // ── Sign off ─────────────────────────────────────
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💬 *One last thing*\n\nIf you ever have a question, get stuck with the app, or just want to chat about something AI or privacy related — this community has you covered. Reply to this message any time and we'll get back to you.\n\nSo glad you're here. Welcome to the family. 🙌`,
          },
        },

        // ── Footer ───────────────────────────────────────
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '— The Off Grid team · Built by Wednesday Solutions',
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

(async () => {
  await app.start();
  console.log('⚡ GridBot is running');
})();
