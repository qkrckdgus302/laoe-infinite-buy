import { hashPassword } from '../../crypto.js';
import { createToken, corsHeaders, jsonResponse } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { username, password, securityQuestion, securityAnswer } = await request.json();

    if (!username || !password) {
      return jsonResponse({ error: '아이디와 비밀번호를 입력해주세요.' }, 400);
    }
    if (username.length < 3 || username.length > 20) {
      return jsonResponse({ error: '아이디는 3~20자여야 합니다.' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return jsonResponse({ error: '아이디는 영문, 숫자, 밑줄만 사용 가능합니다.' }, 400);
    }
    if (!securityQuestion || !securityAnswer) {
      return jsonResponse({ error: '보안질문과 답변을 입력해주세요.' }, 400);
    }
    if (securityAnswer.trim().length < 1) {
      return jsonResponse({ error: '보안질문 답변을 입력해주세요.' }, 400);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) {
      return jsonResponse({ error: '이미 사용 중인 아이디입니다.' }, 409);
    }

    const passwordHash = await hashPassword(password);
    const answerHash = await hashPassword(securityAnswer.trim().toLowerCase());
    const result = await env.DB.prepare(
      'INSERT INTO users (username, password_hash, security_question, security_answer_hash) VALUES (?, ?, ?, ?)'
    ).bind(username, passwordHash, securityQuestion, answerHash).run();

    const userId = result.meta.last_row_id;
    await env.DB.prepare(
      'INSERT INTO user_data (user_id, data_json) VALUES (?, ?)'
    ).bind(userId, '{}').run();

    const secret = env.JWT_SECRET;
    if (!secret) return jsonResponse({ error: '서버 설정 오류입니다.' }, 500);
    const token = await createToken({ userId, username }, secret);

    return jsonResponse({ token, username });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
