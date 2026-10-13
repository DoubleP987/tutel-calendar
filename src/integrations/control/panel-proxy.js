import { request } from 'node:http';

/** Fixed loopback destination; the Panel retains its own admin authentication and CSRF. */
export function registerPanelProxy(app, publicOrigin) {
  const configured = process.env.CONTROL_PANEL_PROXY_URL;
  if (!configured) return;
  const target = new URL(configured);
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== '/'
  ) {
    throw new Error('CONTROL_PANEL_PROXY_URL must point to a loopback HTTP service');
  }
  app.use('/admin', (req, res) => {
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method))
      return res.sendStatus(405);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== publicOrigin)
      return res.sendStatus(403);
    const headers = {
      ...req.headers,
      host: new URL(publicOrigin).host,
      'x-forwarded-proto': 'https',
      'x-forwarded-for': req.get('cf-connecting-ip') || req.ip,
    };
    for (const name of [
      'connection',
      'upgrade',
      'proxy-authorization',
      'proxy-connection',
      'forwarded',
      'x-forwarded-host',
    ])
      delete headers[name];
    const upstream = request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        method: req.method,
        path: req.originalUrl,
        headers,
      },
      (response) => {
        res.status(response.statusCode || 502);
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined && !['connection', 'transfer-encoding', 'upgrade'].includes(name))
            res.setHeader(name, value);
        }
        res.setHeader('Cache-Control', 'no-store');
        response.pipe(res);
        response.on('error', () => res.destroy());
      },
    );
    upstream.setTimeout(25000, () => upstream.destroy(new Error('Panel request timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) res.status(503).json({ error: 'Control Panel ไม่พร้อมใช้งานชั่วคราว' });
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });
}
