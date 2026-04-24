import { corsHeaders, jsonResponse, getAdmin } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/admin/users — 전체 사용자 목록
export async function onRequestGet({ request, env }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);

    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    let countQuery, dataQuery;

    if (search) {
      const like = `%${search}%`;
      countQuery = env.DB.prepare('SELECT COUNT(*) as total FROM users WHERE username LIKE ?').bind(like);
      dataQuery = env.DB.prepare(
        `SELECT u.id, u.username, u.role, u.created_at,
                LENGTH(COALESCE(ud.data_json, '{}')) as data_size
         FROM users u
         LEFT JOIN user_data ud ON u.id = ud.user_id
         WHERE u.username LIKE ?
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`
      ).bind(like, limit, offset);
    } else {
      countQuery = env.DB.prepare('SELECT COUNT(*) as total FROM users');
      dataQuery = env.DB.prepare(
        `SELECT u.id, u.username, u.role, u.created_at,
                LENGTH(COALESCE(ud.data_json, '{}')) as data_size
         FROM users u
         LEFT JOIN user_data ud ON u.id = ud.user_id
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`
      ).bind(limit, offset);
    }

    const [countResult, dataResult] = await Promise.all([countQuery.first(), dataQuery.all()]);

    return jsonResponse({
      users: dataResult.results,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit),
    });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}

// DELETE /api/admin/users?id=123 — 사용자 삭제
export async function onRequestDelete({ request, env }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);

    const url = new URL(request.url);
    const userId = parseInt(url.searchParams.get('id'), 10);
    if (!userId) return jsonResponse({ error: '사용자 ID가 필요합니다.' }, 400);

    // Prevent self-deletion
    if (userId === admin.userId) {
      return jsonResponse({ error: '자기 자신은 삭제할 수 없습니다.' }, 400);
    }

    // Check user exists
    const user = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '사용자를 찾을 수 없습니다.' }, 404);

    // Delete user data first, then user
    await env.DB.prepare('DELETE FROM user_data WHERE user_id = ?').bind(userId).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

    return jsonResponse({ ok: true, message: '사용자가 삭제되었습니다.' });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
