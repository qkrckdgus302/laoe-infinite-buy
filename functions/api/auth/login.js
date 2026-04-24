import { verifyPassword } from '../../crypto.js';
import { createToken, corsHeaders, jsonResponse } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return jsonResponse({ error: '아이디와 비밀번호를 입력해주세요.' }, 400);
    }

    const user = await env.DB.prepare('SELECT id, password_hash FROM users WHERE username = ?').bind(username).first();
    if (!user) {
      return jsonResponse({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return jsonResponse({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    const secret = env.JWT_SECRET || 'dev-secret-change-me';
    const token = await createToken({ userId: user.id, username }, secret);

    return jsonResponse({ token, username });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
