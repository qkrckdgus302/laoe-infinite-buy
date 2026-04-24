import { hashPassword } from '../../crypto.js';
import { corsHeaders, jsonResponse, getUser } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/auth/security-question — 현재 보안질문 조회
export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

    const row = await env.DB.prepare('SELECT security_question FROM users WHERE id = ?')
      .bind(user.userId).first();

    return jsonResponse({ securityQuestion: row?.security_question || null });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}

// POST /api/auth/security-question — 보안질문 설정/변경
export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

    const { securityQuestion, securityAnswer } = await request.json();

    if (!securityQuestion || !securityAnswer) {
      return jsonResponse({ error: '보안질문과 답변을 입력해주세요.' }, 400);
    }

    const answerHash = await hashPassword(securityAnswer.trim().toLowerCase());

    await env.DB.prepare('UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?')
      .bind(securityQuestion, answerHash, user.userId).run();

    return jsonResponse({ ok: true, message: '보안질문이 설정되었습니다.' });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
