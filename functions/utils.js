// JWT helper using Web Crypto API (Cloudflare Workers compatible)

async function createToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const data = { ...payload, iat: now, exp: now + 86400 * 7 }; // 7 days

  const enc = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(data)).replace(/=/g, '');
  const msg = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${msg}.${sigB64}`;
}

async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const enc = new TextEncoder();
  const msg = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );

  const sigStr = atob(sigB64.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - sigB64.length % 4) % 4));
  const sigBuf = new Uint8Array([...sigStr].map(c => c.charCodeAt(0)));

  const valid = await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(msg));
  if (!valid) return null;

  const payload = JSON.parse(atob(payloadB64 + '=='.slice(0, (4 - payloadB64.length % 4) % 4)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

async function getUser(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const secret = env.JWT_SECRET || 'dev-secret-change-me';
  return verifyToken(token, secret);
}

export { createToken, verifyToken, corsHeaders, jsonResponse, getUser };
