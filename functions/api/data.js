import { corsHeaders, jsonResponse, getUser } from '../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/data — 사용자 데이터 로드
export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

    const row = await env.DB.prepare('SELECT data_json FROM user_data WHERE user_id = ?').bind(user.userId).first();
    const data = row ? JSON.parse(row.data_json) : {};

    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}

// PUT /api/data — 사용자 데이터 저장
export async function onRequestPut({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

    const body = await request.text();
    // Validate JSON
    JSON.parse(body);

    // Size limit: 1MB
    if (body.length > 1048576) {
      return jsonResponse({ error: '데이터 크기가 제한을 초과했습니다.' }, 413);
    }

    await env.DB.prepare(
      'INSERT INTO user_data (user_id, data_json, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(user_id) DO UPDATE SET data_json = ?, updated_at = datetime(\'now\')'
    ).bind(user.userId, body, body).run();

    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError) {
      return jsonResponse({ error: '잘못된 데이터 형식입니다.' }, 400);
    }
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
