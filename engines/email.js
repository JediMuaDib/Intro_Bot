const config = require('../config');
const { getTemplate } = require('../db');

function buildDrafts(releaseData) {
  const { version, type, iosNotes, androidNotes } = releaseData;

  // Check for custom template
  const customTemplate = getTemplate.get('email', type);
  if (customTemplate) {
    const text = customTemplate.template
      .replace(/\{version\}/g, version)
      .replace(/\{ios_notes\}/g, iosNotes || '')
      .replace(/\{android_notes\}/g, androidNotes || '');
    return [{ type: 'custom', subject: `Off Grid v${version}`, body: text }];
  }

  const notes = iosNotes || androidNotes || 'Various improvements.';
  const highlights = notes
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 6)
    .map((l) => `- ${l.replace(/^[-*>\s]+/, '').trim()}`)
    .join('\n');

  return [
    {
      type: 'press',
      subject: `Off Grid v${version} — Major Update to On-Device AI App`,
      body: `Hi,\n\nOff Grid, the mobile app that runs AI models entirely on-device with zero cloud dependency, has released version ${version}.\n\nKey highlights:\n${highlights}\n\nOff Grid runs LLMs (Qwen3, Llama 3.2, Gemma 3), image generation (Stable Diffusion), vision AI, and voice transcription — all without any data leaving the user's device.\n\nAvailable on:\n- iOS: ${config.IOS_UPDATE_URL}\n- Android: ${config.ANDROID_UPDATE_URL}\n- GitHub: ${config.GITHUB_RELEASE_URL}\n\nHappy to provide more details, screenshots, or arrange a demo.\n\nBest,\nThe Off Grid Team`,
    },
    {
      type: 'influencer',
      subject: `Thought you'd find this interesting — Off Grid v${version}`,
      body: `Hey,\n\nWe just shipped Off Grid v${version} and thought you might find it interesting given your work in the on-device AI / privacy space.\n\nQuick highlights:\n${highlights}\n\nThe whole thing runs 100% on-device — no internet, no telemetry, no data collection. Models run on the phone's CPU/GPU directly.\n\nWould love to hear your thoughts if you get a chance to try it:\n- iOS: ${config.IOS_UPDATE_URL}\n- Android: ${config.ANDROID_UPDATE_URL}\n\nCheers,\nThe Off Grid Team`,
    },
    {
      type: 'newsletter',
      subject: `What's new in Off Grid v${version}`,
      body: `Hi there,\n\nWe've just released Off Grid v${version}! Here's what's new:\n\n${highlights}\n\nAs always, everything runs entirely on your device. No cloud. No tracking. Your data stays yours.\n\nUpdate now:\n- iOS: ${config.IOS_UPDATE_URL}\n- Android: ${config.ANDROID_UPDATE_URL}\n\nThanks for being part of the Off Grid community.\n\n— The Off Grid Team`,
    },
  ];
}

async function generateEmailDrafts(releaseData, slackClient) {
  const channel = config.CH_MARKETING_DRAFTS;
  if (!channel) {
    console.log('CH_MARKETING_DRAFTS not set — skipping email drafts');
    return [];
  }

  const drafts = buildDrafts(releaseData);
  const posted = [];

  for (const draft of drafts) {
    try {
      const result = await slackClient.chat.postMessage({
        channel,
        text: `Email draft: ${draft.subject}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Email Draft — ${draft.type.toUpperCase()}*` },
          },
          { type: 'divider' },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Subject:* ${draft.subject}` },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '```\n' + draft.body + '\n```' },
          },
          { type: 'divider' },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `_Copy and customize before sending. Target audience: ${draft.type}_` },
            ],
          },
        ],
      });

      posted.push({
        draftType: draft.type,
        slackTs: result.ts,
        subject: draft.subject,
        body: draft.body,
      });
    } catch (err) {
      console.error(`Failed to post ${draft.type} email draft:`, err.message);
      posted.push({ draftType: draft.type, error: err.message });
    }
  }

  return posted;
}

module.exports = { generateEmailDrafts, buildDrafts };
