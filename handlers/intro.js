const config = require('../config');

function buildIntroBlocks(userId) {
  const CH = config.CH_INTRODUCTIONS;
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
        text: `*How this community works*\n\nThis isn't just a support channel. It's a place built around curiosity, sharing, and building together. Here's where things live:\n\n• <#${CH}> — say hello, that's what this message is about!\n• *#show-and-tell* — share what you've built, generated, or figured out\n• *#model-reviews* — honest benchmarks and comparisons from real devices\n• *#use-cases* — the workflows people are actually using Off Grid for\n• *#off-grid-life* — the bigger conversation about privacy, degoogling, and living without cloud dependency\n• *#feature-requests* — shape what gets built next\n• *#bugs* — spotted something wrong? let us know with your device + version`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Your first move — introduce yourself!*\n\nHead over to <#${CH}> and use this template. Copy it, fill it in, and post. It takes 2 minutes and the community genuinely loves hearing from new members.`,
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
          url: `https://slack.com/app_redirect?channel=${CH}`,
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
      elements: [{ type: 'mrkdwn', text: '— The Off Grid team' }],
    },
  ];
}

function register(app) {
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
}

module.exports = { register };
