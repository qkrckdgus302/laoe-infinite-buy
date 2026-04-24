import { hashPassword, verifyPassword } from '../../crypto.js';
import { corsHeaders, jsonResponse } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// POST /api/auth/reset-password
// Step 1: { username } → returns { securityQuestion }
// Step 2: { username, securityAnswer, newPassword } → resets password
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { username, securityAnswer, newPassword } = body;

    if (!username) {
      return jsonResponse({ error: '아이디를 입력해주세요.' }, 400);
    }

    const user = await env.DB.prepare(
      'SELECT id, security_question, security_answer_hash FROM users WHERE username = ?'
    ).bind(username).first();

    if (!user) {
      return jsonResponse({ error: '존재하지 않는 아이디입니다.' }, 404);
    }

    // Step 1: Return security question
    if (!securityAnswer && !newPassword) {
      if (!user.security_question) {
        return jsonResponse({ error: '보안질문이 설정되지 않은 계정입니다. 관리자에게 문의하세요.' }, 400);
      }
      return jsonResponse({ securityQuestion: user.security_question });
    }

    // Step 2: Verify answer and reset password
    if (!securityAnswer || !newPassword) {
      return jsonResponse({ error: '보안질문 답변과 새 비밀번호를 입력해주세요.' }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400);
    }

    if (!user.security_answer_hash) {
      return jsonResponse({ error: '보안질문이 설정되지 않은 계정입니다.' }, 400);
    }

    const valid = await verifyPassword(securityAnswer.trim().toLowerCase(), user.security_answer_hash);
    if (!valid) {
      return jsonResponse({ error: '보안질문 답변이 올바르지 않습니다.' }, 401);
    }

    const passwordHash = await hashPassword(newPassword);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, user.id).run();

    return jsonResponse({ ok: true, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.' });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
