// ===== 관리자 페이지 (admin.js) =====
(function () {
  'use strict';

  const AUTH_KEY = 'laoe-auth';
  let _token = null;
  let _username = null;
  let _currentPage = 1;
  let _searchQuery = '';
  let _detailUserId = null;

  // --- Init ---
  async function init() {
    const auth = loadAuth();
    if (auth?.token) {
      _token = auth.token;
      _username = auth.username;
      API.setToken(_token);
      // 관리자 권한 확인 후 대시보드 표시
      try {
        await adminFetch('/api/admin/stats');
        showDashboard();
      } catch {
        clearAuth();
        showLogin();
      }
    } else {
      showLogin();
    }
    bindEvents();
  }

  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
  }

  function saveAuth(token, username) {
    _token = token;
    _username = username;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, username }));
    API.setToken(token);
  }

  function clearAuth() {
    _token = null;
    _username = null;
    localStorage.removeItem(AUTH_KEY);
    API.clearToken();
  }

  // --- Views ---
  function showLogin() {
    document.getElementById('admin-login').style.display = '';
    document.getElementById('admin-dashboard').style.display = 'none';
  }

  function showDashboard() {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = '';
    document.getElementById('admin-name').textContent = _username;
    loadStats();
    loadUsers();
  }

  function showList() {
    document.getElementById('view-list').style.display = '';
    document.getElementById('view-detail').style.display = 'none';
  }

  function showDetail(userId) {
    _detailUserId = userId;
    document.getElementById('view-list').style.display = 'none';
    document.getElementById('view-detail').style.display = '';
    loadUserDetail(userId);
  }

  // --- API calls ---
  async function adminFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const resp = await fetch(url, { ...options, headers });
    const data = await resp.json();
    if (resp.status === 401 || resp.status === 403) {
      toast('세션이 만료되었거나 권한이 없습니다.', 'error');
      clearAuth();
      showLogin();
      throw new Error('Unauthorized');
    }
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  async function loadStats() {
    try {
      const stats = await adminFetch('/api/admin/stats');
      renderStats(stats);
    } catch (e) {
      if (e.message !== 'Unauthorized') toast('통계를 불러오지 못했습니다.', 'error');
    }
  }

  async function loadUsers() {
    try {
      const params = new URLSearchParams({ page: _currentPage, limit: 20 });
      if (_searchQuery) params.set('search', _searchQuery);
      const data = await adminFetch(`/api/admin/users?${params}`);
      renderUsers(data);
    } catch (e) {
      if (e.message !== 'Unauthorized') toast('사용자 목록을 불러오지 못했습니다.', 'error');
    }
  }

  async function loadUserDetail(userId) {
    try {
      const data = await adminFetch(`/api/admin/user/${userId}`);
      renderDetail(data);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // --- Render ---
  function renderStats(stats) {
    const el = document.getElementById('stats-section');
    const dataKB = Math.round((stats.dataStats.totalDataSize || 0) / 1024);
    el.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${stats.totalUsers}</div>
        <div class="stat-label">전체 사용자</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalAdmins}</div>
        <div class="stat-label">관리자</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.dataStats.usersWithData}</div>
        <div class="stat-label">데이터 보유</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${dataKB > 1024 ? (dataKB / 1024).toFixed(1) + 'MB' : dataKB + 'KB'}</div>
        <div class="stat-label">총 데이터</div>
      </div>
    `;

    const recentEl = document.getElementById('recent-users');
    recentEl.innerHTML = (stats.recentUsers || []).map(u => `
      <li>
        <span class="name">${esc(u.username)}</span>
        <span class="date">${formatDate(u.created_at)}</span>
      </li>
    `).join('') || '<li style="color:var(--text-dim)">가입한 사용자가 없습니다.</li>';
  }

  function renderUsers(data) {
    const tbody = document.getElementById('user-tbody');
    tbody.innerHTML = data.users.map(u => {
      const roleClass = u.role === 'admin' ? 'role-admin' : 'role-user';
      const roleLabel = u.role === 'admin' ? '관리자' : '사용자';
      const sizeKB = Math.round((u.data_size || 0) / 1024);
      return `<tr>
        <td>${u.id}</td>
        <td>${esc(u.username)}</td>
        <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
        <td>${formatDate(u.created_at)}</td>
        <td>${sizeKB}KB</td>
        <td>
          <div class="action-btns">
            <button class="btn-sm" data-action="detail" data-id="${u.id}">상세</button>
          </div>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px;">사용자가 없습니다.</td></tr>`;

    const pagination = document.getElementById('pagination');
    if (data.totalPages > 1) {
      pagination.innerHTML = `
        <button id="btn-prev" ${data.page <= 1 ? 'disabled' : ''}>이전</button>
        <span class="page-info">${data.page} / ${data.totalPages}</span>
        <button id="btn-next" ${data.page >= data.totalPages ? 'disabled' : ''}>다음</button>
      `;
    } else {
      pagination.innerHTML = '';
    }
  }

  function renderDetail(user) {
    const el = document.getElementById('user-detail');
    const sizeKB = Math.round((user.dataSize || 0) / 1024);
    el.innerHTML = `
      <div class="detail-row"><span class="detail-label">ID</span><span class="detail-value">${user.id}</span></div>
      <div class="detail-row"><span class="detail-label">아이디</span><span class="detail-value">${esc(user.username)}</span></div>
      <div class="detail-row"><span class="detail-label">권한</span><span class="detail-value">${user.role === 'admin' ? '관리자' : '사용자'}</span></div>
      <div class="detail-row"><span class="detail-label">보안질문</span><span class="detail-value">${user.securityQuestion ? esc(user.securityQuestion) : '미설정'}</span></div>
      <div class="detail-row"><span class="detail-label">가입일</span><span class="detail-value">${formatDate(user.createdAt)}</span></div>
      <div class="detail-row"><span class="detail-label">세션 수</span><span class="detail-value">${user.sessionCount}개</span></div>
      <div class="detail-row"><span class="detail-label">데이터 크기</span><span class="detail-value">${sizeKB}KB</span></div>
      <div class="detail-row"><span class="detail-label">데이터 수정일</span><span class="detail-value">${user.dataUpdatedAt ? formatDate(user.dataUpdatedAt) : '-'}</span></div>
    `;

    // Set role toggle
    document.querySelectorAll('#role-toggle .btn-toggle').forEach(b => {
      b.classList.toggle('active', b.dataset.value === user.role);
    });

    document.getElementById('new-pw').value = '';
  }

  // --- Events ---
  function bindEvents() {
    // Login
    document.getElementById('btn-login').addEventListener('click', async () => {
      document.getElementById('login-error').style.display = 'none';
      const id = document.getElementById('login-id').value.trim();
      const pw = document.getElementById('login-pw').value;
      if (!id || !pw) { showError('아이디와 비밀번호를 입력하세요.'); return; }
      try {
        const res = await API.login(id, pw);
        saveAuth(res.token, res.username);
        // Verify admin access
        await adminFetch('/api/admin/stats');
        showDashboard();
      } catch (e) {
        showError(e.message === 'Unauthorized' ? '관리자 계정이 아닙니다.' : e.message);
      }
    });

    // Enter key for login
    document.getElementById('login-pw').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-login').click();
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      clearAuth();
      showLogin();
    });

    // Search
    document.getElementById('btn-search').addEventListener('click', () => {
      _searchQuery = document.getElementById('search-input').value.trim();
      _currentPage = 1;
      loadUsers();
    });
    document.getElementById('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-search').click();
    });

    // Table actions
    document.getElementById('user-tbody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'detail') showDetail(id);
    });

    // Pagination
    document.getElementById('pagination').addEventListener('click', (e) => {
      if (e.target.id === 'btn-prev' && _currentPage > 1) { _currentPage--; loadUsers(); }
      if (e.target.id === 'btn-next') { _currentPage++; loadUsers(); }
    });

    // Back
    document.getElementById('btn-back').addEventListener('click', () => {
      showList();
      loadUsers();
    });

    // Role toggle
    document.getElementById('role-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-toggle');
      if (!btn) return;
      document.querySelectorAll('#role-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // Reset password
    document.getElementById('btn-reset-pw').addEventListener('click', async () => {
      if (!_detailUserId) return;
      const pw = document.getElementById('new-pw').value;
      if (!pw || pw.length < 6) { toast('비밀번호는 6자 이상 입력하세요.', 'error'); return; }
      if (!confirm('비밀번호를 변경하시겠습니까?')) return;
      try {
        await adminFetch(`/api/admin/user/${_detailUserId}`, {
          method: 'PUT',
          body: JSON.stringify({ newPassword: pw }),
        });
        toast('비밀번호가 변경되었습니다.');
        document.getElementById('new-pw').value = '';
      } catch (e) { toast(e.message, 'error'); }
    });

    // Save role
    document.getElementById('btn-save-role').addEventListener('click', async () => {
      if (!_detailUserId) return;
      const active = document.querySelector('#role-toggle .btn-toggle.active');
      if (!active) return;
      if (!confirm('권한을 변경하시겠습니까?')) return;
      try {
        await adminFetch(`/api/admin/user/${_detailUserId}`, {
          method: 'PUT',
          body: JSON.stringify({ role: active.dataset.value }),
        });
        toast('권한이 변경되었습니다.');
        loadUserDetail(_detailUserId);
      } catch (e) { toast(e.message, 'error'); }
    });

    // Delete user
    document.getElementById('btn-delete-user').addEventListener('click', async () => {
      if (!_detailUserId) return;
      if (!confirm('정말 이 사용자를 삭제하시겠습니까? 모든 데이터가 삭제됩니다.')) return;
      try {
        await adminFetch(`/api/admin/users?id=${_detailUserId}`, { method: 'DELETE' });
        toast('사용자가 삭제되었습니다.');
        showList();
        loadStats();
        loadUsers();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // --- Helpers ---
  function showError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = '';
  }

  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--green)';
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.includes('T') || dateStr.includes('Z') ? dateStr : dateStr + 'Z');
    if (isNaN(d)) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- Start ---
  init();
})();
