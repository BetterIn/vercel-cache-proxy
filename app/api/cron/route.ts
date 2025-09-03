// app/api/cron/route.ts
import { put } from '@vercel/blob';

export const runtime = 'nodejs'; // use Node runtime for SDK convenience

function forbidden() {
  return new Response('Forbidden', { status: 403 });
}

export async function GET(req: Request) {
  // Allow either: Vercel Cron UA or a shared secret header (for manual runs)
  const ua = req.headers.get('user-agent') || '';
  const provided = req.headers.get('x-cron-secret') || '';
  const secret = process.env.CRON_SECRET || '';

  if (!(ua.includes('vercel-cron/1.0') || (secret && provided === secret))) {
    return forbidden();
  }

  const upstreamUrl = process.env.UPSTREAM_API_URL!;
  const upstreamKey = process.env.UPSTREAM_API_KEY!;
  if (!upstreamUrl || !upstreamKey) {
    return new Response('Missing UPSTREAM_API_URL/UPSTREAM_API_KEY', { status: 500 });
  }

  // Adjust the header below to match your upstream’s auth scheme
  const res = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${upstreamKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    return new Response(`Upstream error: ${res.status}`, { status: 502 });
  }

  const data = await res.json();
  const body = JSON.stringify({ fetchedAt: new Date().toISOString(), data });

  // Store at a stable path. Since May 2025, overwrites require allowOverwrite: true.
  const blob = await put('cache/latest.json', body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60, // at the blob CDN; you can tune this
  });

  return Response.json({ ok: true, bytes: body.length, url: blob.url });
}
