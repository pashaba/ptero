// api/ptero.js
// Generic proxy for the Pterodactyl Client API.
// The browser never talks to the panel directly (Pterodactyl panels don't
// send permissive CORS headers), so every request is relayed through here.
//
// Panel URL and API key are NOT stored on the server. They're sent from the
// browser (from localStorage) on every request as headers, and simply
// forwarded upstream. Nothing is persisted in this function.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Panel-Url, X-Api-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const panel = req.headers['x-panel-url'];
  const key = req.headers['x-api-key'];
  let path = req.query.path;
  if (Array.isArray(path)) path = path.join('');

  if (!panel || !key) {
    return res.status(400).json({ errors: [{ detail: 'Missing panel URL or API key.' }] });
  }
  if (!path) {
    return res.status(400).json({ errors: [{ detail: 'Missing target path.' }] });
  }

  let base = String(panel).trim();
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  base = base.replace(/\/+$/, '');

  const targetUrl = `${base}/api/client${path}`;

  const isBodyMethod = !['GET', 'HEAD'].includes(req.method);
  const contentType = req.headers['content-type'] || 'application/json';

  const upstreamHeaders = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  let body;
  if (isBodyMethod) {
    upstreamHeaders['Content-Type'] = contentType;
    if (contentType.includes('application/json')) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    } else {
      // raw text/binary (e.g. file writes)
      body = req.body;
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body,
    });

    const arrayBuf = await upstream.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    // Empty 204/download responses
    if (buf.length === 0) return res.end();
    return res.send(buf);
  } catch (err) {
    return res.status(502).json({ errors: [{ detail: `Proxy could not reach panel: ${err.message}` }] });
  }
}
