const express = require('express');
const db = require('../db');
const config = require('../config');

const router = express.Router();

// ── HTML helpers ─────────────────────────────────────────
function typeBadge(type) {
  const colors = { major: '#22c55e', minor: '#eab308', bugfix: '#94a3b8' };
  return `<span style="background:${colors[type] || '#94a3b8'};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${type.toUpperCase()}</span>`;
}

function statusBadge(status) {
  const colors = { posted: '#22c55e', failed: '#ef4444', draft: '#3b82f6' };
  return `<span style="background:${colors[status] || '#94a3b8'};color:#fff;padding:2px 6px;border-radius:4px;font-size:11px">${status}</span>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — GridBot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #f8fafc; }
    h2 { font-size: 20px; margin: 24px 0 12px; color: #f8fafc; }
    .subtitle { color: #94a3b8; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .stat { background: #1e293b; padding: 16px 24px; border-radius: 8px; min-width: 140px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #f8fafc; }
    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 10px 12px; background: #1e293b; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e293b; font-size: 14px; }
    tr:hover td { background: #1e293b; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .notes { max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #94a3b8; }
    .back { display: inline-block; margin-bottom: 16px; color: #60a5fa; font-size: 14px; }
    .metric { display: inline-block; margin-right: 12px; font-size: 13px; color: #94a3b8; }
    .metric b { color: #e2e8f0; }
    .nav { display: flex; gap: 16px; margin-bottom: 24px; }
    .nav a { padding: 8px 16px; background: #1e293b; border-radius: 6px; font-size: 14px; }
    .nav a:hover { background: #334155; text-decoration: none; }
    .card { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .empty { color: #64748b; font-style: italic; padding: 24px; text-align: center; }
    textarea { width: 100%; min-height: 120px; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 10px; font-family: inherit; font-size: 14px; resize: vertical; }
    input[type="text"], select { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; font-size: 14px; }
    button, input[type="submit"] { background: #3b82f6; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:hover, input[type="submit"]:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>GridBot Dashboard</h1>
  <p class="subtitle">Off Grid Release Marketing Engine</p>
  <nav class="nav">
    <a href="/">Releases</a>
    <a href="/channels">Channels</a>
    <a href="/templates">Templates</a>
  </nav>
  ${body}
</body>
</html>`;
}

// ── GET / — Release history ──────────────────────────────
router.get('/', (req, res) => {
  const releases = db.getReleasesWithMetrics(30);
  const totalReleases = releases.length;
  const totalPosts = releases.reduce((sum, r) => sum + r.posts.length, 0);
  const lastRelease = releases[0];

  let rows = '';
  if (releases.length === 0) {
    rows = '<tr><td colspan="6" class="empty">No releases recorded yet. Use /release in Slack to tag one.</td></tr>';
  } else {
    rows = releases
      .map(
        (r) => `<tr>
        <td><a href="/release/${r.id}">v${escapeHtml(r.version)}</a></td>
        <td>${typeBadge(r.type)}</td>
        <td>${escapeHtml(r.platform)}</td>
        <td>${r.posts.filter((p) => p.status === 'posted').length} / ${r.posts.length}</td>
        <td class="notes">${escapeHtml((r.ios_notes || r.android_notes || '').slice(0, 80))}</td>
        <td>${new Date(r.created_at + 'Z').toLocaleDateString()}</td>
      </tr>`,
      )
      .join('');
  }

  res.send(
    layout(
      'Releases',
      `
    <div class="stats">
      <div class="stat"><div class="stat-value">${totalReleases}</div><div class="stat-label">Total Releases</div></div>
      <div class="stat"><div class="stat-value">${totalPosts}</div><div class="stat-label">Marketing Posts</div></div>
      <div class="stat"><div class="stat-value">${lastRelease ? 'v' + escapeHtml(lastRelease.version) : '—'}</div><div class="stat-label">Latest Release</div></div>
    </div>
    <h2>Release History</h2>
    <table>
      <tr><th>Version</th><th>Type</th><th>Platform</th><th>Posts</th><th>Notes</th><th>Date</th></tr>
      ${rows}
    </table>`,
    ),
  );
});

// ── GET /release/:id — Release detail ────────────────────
router.get('/release/:id', (req, res) => {
  const release = db.getReleaseById.get(req.params.id);
  if (!release) return res.status(404).send(layout('Not Found', '<p>Release not found.</p>'));

  const posts = db.getPostsForRelease.all(release.id);
  const postsWithMetrics = posts.map((p) => {
    const metrics = db.getLatestEngagement.get(p.id);
    return { ...p, metrics };
  });

  let postRows = '';
  if (postsWithMetrics.length === 0) {
    postRows = '<tr><td colspan="5" class="empty">No marketing posts for this release.</td></tr>';
  } else {
    postRows = postsWithMetrics
      .map((p) => {
        let metricsHtml = '—';
        if (p.metrics) {
          const parts = [];
          if (p.platform === 'twitter') {
            parts.push(`<b>${p.metrics.likes}</b> likes`, `<b>${p.metrics.retweets}</b> RTs`, `<b>${p.metrics.replies}</b> replies`);
          } else if (p.platform === 'reddit') {
            parts.push(`<b>${p.metrics.upvotes}</b> upvotes`, `<b>${p.metrics.comments}</b> comments`);
          }
          metricsHtml = parts.map((p) => `<span class="metric">${p}</span>`).join('');
        }

        return `<tr>
          <td>${escapeHtml(p.platform)}</td>
          <td>${escapeHtml(p.sub_target || '—')}</td>
          <td>${statusBadge(p.status)}</td>
          <td>${p.external_url ? `<a href="${escapeHtml(p.external_url)}" target="_blank">View</a>` : '—'}</td>
          <td>${metricsHtml}</td>
        </tr>`;
      })
      .join('');
  }

  res.send(
    layout(
      `Release v${release.version}`,
      `
    <a href="/" class="back">< Back to releases</a>
    <h2>Release v${escapeHtml(release.version)} ${typeBadge(release.type)}</h2>
    <p class="subtitle">Platform: ${escapeHtml(release.platform)} · ${new Date(release.created_at + 'Z').toLocaleString()}</p>

    <div class="card">
      <h2 style="margin-top:0">iOS Notes</h2>
      <pre style="white-space:pre-wrap;color:#94a3b8">${escapeHtml(release.ios_notes || 'None')}</pre>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Android Notes</h2>
      <pre style="white-space:pre-wrap;color:#94a3b8">${escapeHtml(release.android_notes || 'None')}</pre>
    </div>

    <h2>Marketing Posts</h2>
    <table>
      <tr><th>Platform</th><th>Target</th><th>Status</th><th>Link</th><th>Engagement</th></tr>
      ${postRows}
    </table>`,
    ),
  );
});

// ── GET /channels — Manage channels ──────────────────────
router.get('/channels', (req, res) => {
  const channels = db.getChannels.all();

  let rows = '';
  if (channels.length === 0) {
    rows = '<tr><td colspan="5" class="empty">No channels configured yet.</td></tr>';
  } else {
    rows = channels
      .map(
        (ch) => `<tr>
        <td>${escapeHtml(ch.platform)}</td>
        <td>${escapeHtml(ch.target)}</td>
        <td>${ch.enabled ? '<span style="color:#22c55e">Active</span>' : '<span style="color:#ef4444">Disabled</span>'}</td>
        <td><code style="font-size:12px;color:#94a3b8">${escapeHtml(ch.config)}</code></td>
        <td>
          <form method="POST" action="/channels/${ch.id}/toggle" style="display:inline">
            <button class="btn-sm">${ch.enabled ? 'Disable' : 'Enable'}</button>
          </form>
          <form method="POST" action="/channels/${ch.id}/delete" style="display:inline;margin-left:4px">
            <button class="btn-sm btn-danger">Delete</button>
          </form>
        </td>
      </tr>`,
      )
      .join('');
  }

  res.send(
    layout(
      'Channels',
      `
    <h2>Marketing Channels</h2>
    <p class="subtitle">Configure which platforms and targets the marketing engine posts to.</p>
    <table>
      <tr><th>Platform</th><th>Target</th><th>Status</th><th>Config</th><th>Actions</th></tr>
      ${rows}
    </table>
    <div class="card" style="margin-top:24px">
      <h2 style="margin-top:0">Add Channel</h2>
      <form method="POST" action="/channels" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <div>
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Platform</label>
          <select name="platform" required>
            <option value="twitter">Twitter/X</option>
            <option value="reddit">Reddit</option>
            <option value="discord">Discord</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Target (e.g. subreddit name, webhook URL)</label>
          <input type="text" name="target" required placeholder="e.g. LocalLLM" style="min-width:200px">
        </div>
        <div>
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Config (JSON, optional)</label>
          <input type="text" name="config" placeholder='{}' style="min-width:200px">
        </div>
        <input type="submit" value="Add Channel">
      </form>
    </div>`,
    ),
  );
});

router.post('/channels', express.urlencoded({ extended: false }), (req, res) => {
  const { platform, target, config: cfg } = req.body;
  if (platform && target) {
    db.insertChannel.run({ platform, target, config: cfg || '{}' });
  }
  res.redirect('/channels');
});

router.post('/channels/:id/toggle', (req, res) => {
  const ch = db.db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (ch) {
    db.updateChannel.run({ id: ch.id, enabled: ch.enabled ? 0 : 1, config: ch.config });
  }
  res.redirect('/channels');
});

router.post('/channels/:id/delete', (req, res) => {
  db.deleteChannel.run(req.params.id);
  res.redirect('/channels');
});

// ── GET /templates — Message templates ───────────────────
router.get('/templates', (req, res) => {
  const templates = db.getAllTemplates.all();

  let rows = '';
  if (templates.length === 0) {
    rows = '<tr><td colspan="4" class="empty">No custom templates. Default templates will be used.</td></tr>';
  } else {
    rows = templates
      .map(
        (t) => `<tr>
        <td>${escapeHtml(t.platform)}</td>
        <td>${typeBadge(t.release_type)}</td>
        <td><pre style="white-space:pre-wrap;max-width:500px;color:#94a3b8;margin:0;font-size:12px">${escapeHtml(t.template.slice(0, 200))}${t.template.length > 200 ? '...' : ''}</pre></td>
        <td>
          <form method="POST" action="/templates/${t.id}/delete" style="display:inline">
            <button class="btn-sm btn-danger">Delete</button>
          </form>
        </td>
      </tr>`,
      )
      .join('');
  }

  res.send(
    layout(
      'Templates',
      `
    <h2>Message Templates</h2>
    <p class="subtitle">Customize the messages posted to each platform. Use placeholders: <code>{version}</code>, <code>{ios_notes}</code>, <code>{android_notes}</code>, <code>{platform}</code>, <code>{subreddit}</code>. For Twitter, separate tweets with <code>---TWEET---</code>.</p>
    <table>
      <tr><th>Platform</th><th>Release Type</th><th>Template</th><th>Actions</th></tr>
      ${rows}
    </table>
    <div class="card" style="margin-top:24px">
      <h2 style="margin-top:0">Add / Update Template</h2>
      <form method="POST" action="/templates" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:12px">
          <div>
            <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Platform</label>
            <select name="platform" required>
              <option value="twitter">Twitter/X</option>
              <option value="reddit">Reddit</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Release Type</label>
            <select name="release_type" required>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="bugfix">Bugfix</option>
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Template</label>
          <textarea name="template" required placeholder="Enter your template here..."></textarea>
        </div>
        <div><input type="submit" value="Save Template"></div>
      </form>
    </div>`,
    ),
  );
});

router.post('/templates', express.urlencoded({ extended: false }), (req, res) => {
  const { platform, release_type, template } = req.body;
  if (platform && release_type && template) {
    db.insertOrReplaceTemplate.run({ platform, releaseType: release_type, template });
  }
  res.redirect('/templates');
});

router.post('/templates/:id/delete', (req, res) => {
  db.deleteTemplate.run(req.params.id);
  res.redirect('/templates');
});

// ── JSON API ─────────────────────────────────────────────
router.get('/api/releases', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json(db.getReleasesWithMetrics(limit));
});

module.exports = router;
