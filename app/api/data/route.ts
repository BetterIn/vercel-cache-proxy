// app/api/data/route.ts

export const runtime = 'edge'; // fast, and we're just proxying a public file

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

export async function GET(req: Request) {
  // Simple Bearer token auth for YOUR API
  const auth = req.headers.get('authorization') || '';
  const token = process.env.DATA_API_TOKEN || '';
  if (!token || !auth.startsWith('Bearer ') || auth.slice(7) !== token) {
    return unauthorized();
  }

  // Your Blob file lives at:
  //   https://<store-id>.public.blob.vercel-storage.com/cache/latest.json
  // We'll keep the base in an env var you set below.
  const base = process.env.BLOB_PUBLIC_BASE_URL; 
  if (!base) return new Response('Missing BLOB_PUBLIC_BASE_URL', { status: 500 });

  const url = new URL('cache/latest.json', base).toString();

  // Fetch and stream through with correct headers
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return new Response('Cache empty', { status: 503 });

  const headers = new Headers(r.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(r.body, { status: 200, headers });
}
