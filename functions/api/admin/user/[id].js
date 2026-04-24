import { corsHeaders, jsonResponse, getAdmin } from '../../../utils.js';
import { hashPassword } from '../../../crypto.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/admin/user/:id — 사용자 상세 정보
export async function onRequestGet({ request, env, params }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);

    const userId = parseInt(params.id, 10);
    if (!userId) return jsonResponse({ error: '사용자 ID가 필요합니다.' }, 400);

    const user = await env.DB.prepare(
      `SELECT u.id, u.username, u.role, u.security_question, u.created_at,
              ud.data_json, ud.updated_at as data_updated_at
       FROM users u
       LEFT JOIN user_data ud ON u.id = ud.user_id
       WHERE u.id = ?`
    ).bind(userId).first();

    if (!user) return jsonResponse({ error: '사용자를 찾을 수 없습니다.' }, 404);

    // Parse data to get session count
    let sessionCount = 0;
    let dataSize = 0;
    try {
      const data = JSON.parse(user.data_json || '{}');
      sessionCount = data.sessions?.length || 0;
      dataSize = (user.data_json || '{}').length;
    } catch { /* ignore */ }

    return jsonResponse({
      id: user.id,
      username: user.username,
      role: user.role,
      securityQuestion: user.security_question,
      createdAt: user.created_at,
      dataUpdatedAt: user.data_updated_at,
      sessionCount,
      dataSize,
    });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}

// PUT /api/admin/user/:id — 사용자 정보 수정
export async function onRequestPut({ request, env, params }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);

    const userId = parseInt(params.id, 10);
    if (!userId) return jsonResponse({ error: '사용자 ID가 필요합니다.' }, 400);

    const user = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '사용자를 찾을 수 없습니다.' }, 404);

    const body = await request.json();
    const updates = [];
    const bindings = [];

    // Reset password
    if (body.newPassword) {
      if (body.newPassword.length < 6) {
        return jsonResponse({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400);
      }
      const hash = await hashPassword(body.newPassword);
      updates.push('password_hash = ?');
      bindings.push(hash);
    }

    // Change role
    if (body.role && ['user', 'admin'].includes(body.role)) {
      // Prevent removing own admin role
      if (userId === admin.userId && body.role !== 'admin') {
        return jsonResponse({ error: '자신의 관리자 권한은 해제할 수 없습니다.' }, 400);
      }
      updates.push('role = ?');
      bindings.push(body.role);
    }

    if (updates.length === 0) {
      return jsonResponse({ error: '변경할 항목이 없습니다.' }, 400);
    }

    bindings.push(userId);
    await env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    return jsonResponse({ ok: true, message: '사용자 정보가 수정되었습니다.' });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
