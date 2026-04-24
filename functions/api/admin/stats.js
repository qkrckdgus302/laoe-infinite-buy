import { corsHeaders, jsonResponse, getAdmin } from '../../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/admin/stats — 서비스 통계
export async function onRequestGet({ request, env }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);

    const [totalUsers, totalAdmins, recentUsers, dataStats] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM users').first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first(),
      env.DB.prepare(
        'SELECT id, username, created_at FROM users ORDER BY created_at DESC LIMIT 5'
      ).all(),
      env.DB.prepare(
        'SELECT COUNT(*) as count, SUM(LENGTH(data_json)) as total_size FROM user_data'
      ).first(),
    ]);

    return jsonResponse({
      totalUsers: totalUsers.count,
      totalAdmins: totalAdmins.count,
      recentUsers: recentUsers.results,
      dataStats: {
        usersWithData: dataStats.count,
        totalDataSize: dataStats.total_size || 0,
      },
    });
  } catch (e) {
    return jsonResponse({ error: '서버 오류가 발생했습니다.' }, 500);
  }
}
