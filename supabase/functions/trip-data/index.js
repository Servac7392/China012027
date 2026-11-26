const siteOrigin = 'https://servac7392.github.io';
const cors = {
  'Access-Control-Allow-Origin': siteOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cache-Control': 'no-store',
};
const dates = new Set(['15', '16', '17', '18–20', '20', '21–22', '23–24', '25', '26']);
const fields = {
  transfer: ['route', 'transport', 'time'],
  ticket: ['service', 'airline', 'departureAirport', 'departureTime', 'arrivalAirport', 'arrivalTime', 'time', 'price', 'url'],
  hotel: ['name', 'address', 'addressZh', 'stay', 'price', 'url'],
};
const revisionPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const response = (data, status = 200) => Response.json(data, { status, headers: cors });

function record(key, value) {
  const [date, type, extra] = key.split(':');
  if (extra !== undefined || !dates.has(date) || !Object.hasOwn(fields, type)) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || !entries.every(([field, text]) =>
    fields[type].includes(field) && typeof text === 'string' && text.length <= 500
  ) || !entries.some(([, text]) => text.trim())) return null;
  return { key, value, revision: crypto.randomUUID() };
}

async function matchesPassword(candidate, configured) {
  const input = new TextEncoder();
  const [left, right] = await Promise.all([candidate, configured].map(value =>
    crypto.subtle.digest('SHA-256', input.encode(value))
  ));
  const actual = new Uint8Array(left), expected = new Uint8Array(right);
  return actual.reduce((difference, byte, i) => difference | (byte ^ expected[i]), 0) === 0;
}

async function table(query = '', options = {}) {
  const url = Deno.env.get('SUPABASE_URL');
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const key = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json', ...options.headers };
  if (!keys.default) headers.Authorization = 'Bearer ' + key;
  return fetch(url + '/rest/v1/shared_trip_records' + query, {
    ...options, headers, signal: AbortSignal.timeout(6500),
  });
}

async function hotelTable(path, options = {}) {
  const url = Deno.env.get('SUPABASE_URL');
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const key = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!keys.default) headers.Authorization = 'Bearer ' + key;
  return fetch(url + '/rest/v1/' + path, { ...options, headers, signal: AbortSignal.timeout(6500) });
}

async function readTrip() {
  const [records, hotels, pending] = await Promise.all([table('?select=key,value,revision'), hotelTable('hotel_mail_meta?select=key,info'),
    hotelTable('hotel_mail_bookings?select=hotel,reason&state=in.(review,review_cancelled)&target_key=is.null')]);
  if (!records.ok || !hotels.ok || !pending.ok) return response({ error: 'storage' }, 502);
  return response({ records: await records.json(), hotelMeta: await hotels.json(), mailPending: await pending.json() });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (request.method === 'GET') {
      return await readTrip();
    }
    if (request.method !== 'POST') return response({ error: 'method' }, 405);
    const password = Deno.env.get('TRIP_EDIT_PASSWORD');
    if (!password || [...password].length < 16) return response({ error: 'setup' }, 503);
    const bytes = await request.text();
    if (bytes.length > 13000) return response({ error: 'invalid' }, 413);
    let data;
    try { data = JSON.parse(bytes); }
    catch { return response({ error: 'invalid' }, 400); }
    if (!data || typeof data !== 'object') return response({ error: 'invalid' }, 400);
    if (typeof data.password !== 'string' || data.password.length > 2048 || !await matchesPassword(data.password, password)) {
      return response({ error: 'password' }, 403);
    }
    if (data.operation === 'resolve-hotel-import') {
      if (typeof data.key !== 'string' || !record(data.key, { name: 'check' }) ||
          !['apply', 'keep'].includes(data.decision) ||
          (data.revision !== null && !revisionPattern.test(data.revision))) return response({ error: 'invalid' }, 400);
      const resolved = await hotelTable('rpc/resolve_mail_hotel', {method:'POST', body:JSON.stringify({
        p_key:data.key,p_revision:data.revision,p_accept:data.decision==='apply'
      })});
      if (!resolved.ok) return response({error:'storage'},502);
      const result = await resolved.json();
      if (result.error) return response(result, result.error === 'conflict' ? 409 : 400);
      return await readTrip();
    }
    if (data.operation === 'import') {
      if (!data.records || typeof data.records !== 'object' || Array.isArray(data.records)) return response({ error: 'invalid' }, 400);
      const rows = Object.entries(data.records).map(([key, value]) => record(key, value));
      if (!rows.length || rows.length > 27 || rows.includes(null)) return response({ error: 'invalid' }, 400);
      const result = await table('?on_conflict=key', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(rows),
      });
      if (!result.ok) return response({ error: 'storage' }, 502);
      return response({ records: await result.json() });
    }
    const row = typeof data.key === 'string' && record(data.key, data.value);
    if (!row || (data.revision !== null && (typeof data.revision !== 'string' || !revisionPattern.test(data.revision)))) {
      return response({ error: 'invalid' }, 400);
    }
    const headers = { Prefer: 'return=representation' };
    const query = new URLSearchParams({ key: 'eq.' + row.key, revision: 'eq.' + data.revision });
    const result = data.revision === null
      ? await table('', { method: 'POST', headers, body: JSON.stringify(row) })
      : await table('?' + query, { method: 'PATCH', headers, body: JSON.stringify({ value: row.value, revision: row.revision }) });
    if (result.status === 409) return response({ error: 'conflict' }, 409);
    if (!result.ok) return response({ error: 'storage' }, 502);
    const [saved] = await result.json();
    return saved ? response({ records: [saved] }) : response({ error: 'conflict' }, 409);
  } catch {
    return response({ error: 'storage' }, 502);
  }
});
