import { hashPassword } from '../../crypto.js';
import { corsHeaders, jsonResponse } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// POST /api/auth/force-reset — 임시 비밀번호 초기화 (배포 후 삭제 예정)
export async function onRequestPost({ request, env }) {
  try {
    const { username, newPassword, secret } = await request.json();

    // 간단한 시크릿 키로 보호
    if (secret !== 'laoe-temp-reset-2026') {
      return jsonResponse({ error: 'Unauthorized' }, 403);
    }

    if (!username || !newPassword) {
      return jsonResponse({ error: '아이디와 새 비밀번호를 입력해주세요.' }, 400);
    }

    const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
      .bind(username).first();
    if (!user) return jsonResponse({ error: '존재하지 않는 아이디입니다.' }, 404);

    const passwordHash = await hashPassword(newPassword);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, user.id).run();

    return jsonResponse({ ok: true, message: '비밀번호가 초기화되었습니다.' });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
