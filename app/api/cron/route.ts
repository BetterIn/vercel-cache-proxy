// app/api/cron/route.ts
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

// Run only at the chosen Berlin time (00:05)
const TARGET_HOUR = Number(process.env.CRON_BERLIN_HOUR ?? 0);   // 0 = midnight
const TARGET_MINUTE = Number(process.env.CRON_BERLIN_MINUTE ?? 5);

function isBerlinTargetTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return (
    parseInt(get('hour'), 10) === TARGET_HOUR &&
    parseInt(get('minute'), 10) === TARGET_MINUTE
  );
}


export async function GET(req: Request) {
  // Gate: only allow Vercel Cron UA or a shared secret header
  const ua = req.headers.get('user-agent') || '';
  const provided = req.headers.get('x-cron-secret') || '';
  const secret = process.env.CRON_SECRET || '';
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('force') === '1';
  if (!(ua.includes('vercel-cron/1.0') || (secret && provided === secret))) {
    return new Response('Forbidden', { status: 403 });
  }

  // Optional Berlin-time guard (only run at the intended local hour)
  if (!isBerlinTargetTime()) {
  return new Response('Skip: not 00:05 Berlin', { status: 200 });
  }


  // ---- Meteonomiqs config ----
  const apiKey = process.env.MNQ_API_KEY!;
  const lang = process.env.MNQ_LANG || 'de-de';

  // Choose either coordinates OR by-location (postcode)
  const lat = process.env.MNQ_LAT;
  const lon = process.env.MNQ_LON;
  const country = process.env.MNQ_COUNTRY_CODE; // e.g. "DE"
  const postcode = process.env.MNQ_POSTCODE;     // e.g. "10115"

  if (!apiKey) return new Response('Missing MNQ_API_KEY', { status: 500 });

  let url: string;
  if (country && postcode) {
    // GET /v4_0/forecast/byLocation/{countryCode}/{postCode}
    url = `https://forecast.meteonomiqs.com/v4_0/forecast/byLocation/${encodeURIComponent(country)}/${encodeURIComponent(postcode)}/`;
  } else {
    if (!lat || !lon) {
      return new Response('Missing MNQ_LAT/MNQ_LON (or set MNQ_COUNTRY_CODE + MNQ_POSTCODE)', { status: 500 });
    }
    // GET /v4_0/forecast/{latitude}/{longitude}
    url = `https://forecast.meteonomiqs.com/v4_0/forecast/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}/`;
  }

  const res = await fetch(url, {
    headers: {
      'x-api-key': apiKey,                 // Meteonomiqs auth
      'Accept': 'application/json',
      'Accept-Language': lang,             // e.g. "de-de" or "en-us"
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return new Response(`Upstream error ${res.status}: ${text.slice(0, 300)}`, { status: 502 });
  }

  // Wrap with metadata and cache to Blob
  const data = await res.json();
  const payload = JSON.stringify({
    source: 'meteonomiqs_v4',
    url,
    fetchedAt: new Date().toISOString(),
    data,
  });

  const blob = await put('cache/latest.json', payload, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });

  return Response.json({ ok: true, bytes: payload.length, url: blob.url });
}
