import { hashPassword, verifyPassword } from '../../crypto.js';
import { corsHeaders, jsonResponse, getUser } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// POST /api/auth/change-password — 로그인 상태에서 비밀번호 변경
export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return jsonResponse({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, 400);
    }

    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(user.userId).first();
    if (!row) return jsonResponse({ error: '사용자를 찾을 수 없습니다.' }, 404);

    const valid = await verifyPassword(currentPassword, row.password_hash);
    if (!valid) {
      return jsonResponse({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401);
    }

    const passwordHash = await hashPassword(newPassword);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, user.userId).run();

    return jsonResponse({ ok: true, message: '비밀번호가 변경되었습니다.' });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
