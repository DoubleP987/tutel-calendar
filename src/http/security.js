/** Bounded, process-local abuse protection; OAuth and writes have tighter budgets. */
export function protectRequests(app, origin) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
  }, 60000);
  cleanup.unref();
  app.use((req, res, next) => {
    if (
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/auth/') &&
      !req.path.startsWith('/internal/')
    )
      return next();
    const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (writes && !req.path.startsWith('/internal/') && req.get('origin') !== origin)
      return res.sendStatus(403);
    // Cloudflare supplies this header through the loopback-only tunnel connector.
    const address =
      process.env.CLOUDFLARE_TUNNEL === '1' ? req.get('cf-connecting-ip') || req.ip : req.ip;
    const kind = req.path.startsWith('/internal/')
      ? 'service'
      : req.path.startsWith('/auth/')
        ? 'auth'
        : writes
          ? 'write'
          : 'read';
    const key = `${address}:${kind}`,
      now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= 10000) return res.sendStatus(503);
      bucket = { count: 0, until: now + 60000 };
      buckets.set(key, bucket);
    }
    const limit = kind === 'service' ? 300 : kind === 'auth' ? 20 : kind === 'write' ? 60 : 240;
    if (++bucket.count > limit) {
      res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      return res.status(429).json({ error: 'คำขอมากเกินไป กรุณารอสักครู่' });
    }
    next();
  });
}
