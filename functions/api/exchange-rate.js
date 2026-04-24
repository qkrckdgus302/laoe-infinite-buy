import { corsHeaders, jsonResponse } from '../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/exchange-rate
export async function onRequestGet() {
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!resp.ok) {
      return jsonResponse({ error: '환율 정보를 가져올 수 없습니다.' }, 502);
    }

    const data = await resp.json();
    const krw = data?.rates?.KRW;

    return jsonResponse({
      base: 'USD',
      KRW: krw ? Math.round(krw * 100) / 100 : null,
      timestamp: data?.time_last_update_utc || null,
    });
  } catch (e) {
    return jsonResponse({ error: '환율 조회 중 오류가 발생했습니다.' }, 500);
  }
}
