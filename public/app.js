// ===== 메인 앱 (app.js) =====
(function () {
  'use strict';

  // --- Init ---
  Store.init();

  let _lastClosePrice = null;

  function render() {
    // 로그인 필수 — 비로그인 시 로그인 화면만 표시
    if (!Store.isLoggedIn()) {
      document.getElementById('session-tabs').style.display = 'none';
      document.getElementById('market-bar').style.display = 'none';
      document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
      document.getElementById('view-login-required').style.display = 'block';
      // 로그인 상태 아이콘 업데이트
      const authBtn = document.getElementById('btn-auth');
      if (authBtn) authBtn.classList.remove('logged-in');
      return;
    }

    // 로그인 상태 표시
    document.getElementById('view-login-required').style.display = 'none';
    document.getElementById('session-tabs').style.display = '';
    document.getElementById('market-bar').style.display = '';
    const authBtn = document.getElementById('btn-auth');
    if (authBtn) authBtn.classList.add('logged-in');

    const sessions = Store.getSessions();
    const session = Store.getActiveSession();

    UI.renderTabs();

    if (!session) {
      if (sessions.length === 0) {
        UI.showView('view-empty');
      } else {
        Store.setActiveSession(sessions[0].id);
        return;
      }
      UI.renderMarketBar(null);
      return;
    }

    if (!session.settings.totalCapital) {
      UI.showView('view-setup');
      // Use the currently selected ticker from toggle (not saved session)
      const setupTicker = UI.getToggleValue('setup-ticker') || session.settings.ticker;
      UI.renderMarketBar(session, setupTicker);
      return;
    }

    UI.showView('view-dashboard');

    const state = calcState(session.settings, session.transactions, session.midEntry);
    const reverseInfo = session.isReverseMode ? {
      isFirstDay: session.transactions.filter(t =>
        t.type === 'reverse_sell' || t.type === 'reverse_sell_buy'
      ).length === 0,
      starPrice: session.reverseStarPrice || state.starPrice,
    } : null;

    const orders = generateOrders(state, session.settings, reverseInfo, _lastClosePrice);

    // Store state globally for modal access
    window._lastCalcState = state;

    UI.renderTBar(state, session);
    UI.renderSummary(state, session);
    UI.renderPhase(state, session);
    UI.renderExchangeInline();
    UI.renderRecentPrices(session);
    UI.renderFearGreed();
    UI.renderOrders(orders, state, session);
    UI.renderTransactions(session);
    UI.updateReverseButton(state, session);
    UI.renderMarketBar(session);

    const history = calcHistory(session.settings, session.transactions, session.midEntry);
    UI.renderChart(history, session.settings.splits);
  }

  Store.subscribe(render);
  render();

  // --- Event Delegation ---

  // Toggle buttons (with ticker change detection)
  document.addEventListener('click', function (e) {
    const toggle = e.target.closest('.btn-toggle');
    if (toggle) {
      const group = toggle.parentElement;
      group.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
      toggle.classList.add('active');

      // Mid entry toggle
      if (group.id === 'setup-entry') {
        document.getElementById('mid-entry-fields').style.display =
          toggle.dataset.value === 'mid' ? '' : 'none';
      }

      // Ticker change in setup/settings → fetch new price + update UI immediately
      if (group.id === 'setup-ticker' || group.id === 'settings-ticker') {
        const newTicker = toggle.dataset.value;
        fetchPriceData(newTicker);
        // Immediately update the market bar label
        const priceEl = document.getElementById('market-price');
        if (priceEl) {
          const label = priceEl.querySelector('.market-label');
          if (label) label.textContent = newTicker;
          const value = priceEl.querySelector('.market-value');
          if (value) value.textContent = '...';
        }
      }

      // Update session name placeholder when ticker or splits change
      if (group.id === 'setup-ticker' || group.id === 'setup-splits') {
        const t = UI.getToggleValue('setup-ticker') || 'TQQQ';
        const s = UI.getToggleValue('setup-splits') || '30';
        const nameInput = document.getElementById('setup-name');
        if (nameInput) nameInput.placeholder = `예: ${t} ${s}분할`;
      }

      // Ticker change → auto-fill target profit + update hint
      if (group.id === 'setup-ticker') {
        const t = toggle.dataset.value;
        const defaultPct = t === 'SOXL' ? 20 : 15;
        const targetInput = document.getElementById('setup-target');
        if (targetInput) targetInput.value = defaultPct;
        const hintEl = document.getElementById('setup-target-default');
        if (hintEl) hintEl.textContent = `기본 ${defaultPct}% (라오어 원칙)`;
      }

      // Update setup preview on any toggle change
      if (group.id === 'setup-ticker' || group.id === 'setup-splits') {
        updateSetupPreview();
      }
    }
  });

  // Setup capital input → update preview
  document.getElementById('setup-capital')?.addEventListener('input', updateSetupPreview);

  function updateSetupPreview() {
    const capital = Number(document.getElementById('setup-capital')?.value) || 0;
    const splits = Number(UI.getToggleValue('setup-splits')) || 30;
    const preview = document.getElementById('setup-preview');
    if (!preview) return;
    if (capital > 0) {
      preview.style.display = '';
      document.getElementById('sp-capital').textContent = '$' + capital.toLocaleString();
      document.getElementById('sp-splits').textContent = splits + '회';
      document.getElementById('sp-buy-amount').textContent = '$' + (capital / splits).toFixed(2);
    } else {
      preview.style.display = 'none';
    }
  }

  // Session tabs
  document.getElementById('tab-list')?.addEventListener('click', function (e) {
    const tab = e.target.closest('.tab');
    if (tab) Store.setActiveSession(tab.dataset.id);
  });

  // Add session
  document.getElementById('btn-add-session')?.addEventListener('click', showSetup);
  document.getElementById('btn-create-first')?.addEventListener('click', showSetup);

  function showSetup() {
    Store.createSession('', { ticker: 'TQQQ', splits: 30, totalCapital: 0 });
    UI.showView('view-setup');
  }

  // Start session
  document.getElementById('btn-start-session')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (!session) return;

    const ticker = UI.getToggleValue('setup-ticker') || 'TQQQ';
    const splits = Number(UI.getToggleValue('setup-splits')) || 30;
    const capital = Number(document.getElementById('setup-capital').value) || 0;
    const target = Number(document.getElementById('setup-target').value) || null;
    const name = document.getElementById('setup-name').value || `${ticker} ${splits}분할`;

    if (capital <= 0) { UI.toast('원금을 입력해주세요.', 'error'); return; }

    Store.renameSession(session.id, name);
    Store.updateSessionSettings(session.id, { ticker, splits, totalCapital: capital, targetProfit: target });

    // Mid entry
    const entryMode = UI.getToggleValue('setup-entry');
    if (entryMode === 'mid') {
      const t = Number(document.getElementById('setup-mid-t').value) || 0;
      const avg = Number(document.getElementById('setup-mid-avg').value) || 0;
      const qty = Number(document.getElementById('setup-mid-qty').value) || 0;
      if (t > 0 && avg > 0 && qty > 0) {
        Store.setMidEntry(session.id, { tValue: t, avgPrice: avg, totalQuantity: qty });
      }
    }

    fetchPriceData(ticker);
    render();
  });

  // Transaction modal
  document.getElementById('btn-add-tx')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (session) UI.openTxModal(session);
  });

  // Transaction type selection → Step 2 (new 2-step modal)
  document.getElementById('tx-type-list')?.addEventListener('click', function (e) {
    const btn = e.target.closest('.tx-action-btn');
    if (!btn) return;

    const session = Store.getActiveSession();
    const types = session?.isReverseMode
      ? getReverseTypes(session.settings.splits)
      : TRANSACTION_TYPES;
    const typeObj = types.find(t => t.type === btn.dataset.type);
    if (typeObj) UI._showTxDetail(typeObj);
  });

  // Back button in step 2
  document.getElementById('tx-back')?.addEventListener('click', function () {
    document.getElementById('tx-step-action').style.display = '';
    document.getElementById('tx-step-detail').style.display = 'none';
  });

  // Save transaction
  document.getElementById('btn-save-tx')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (!session) return;

    const type = UI.getSelectedTxType();
    if (!type) { UI.toast('거래 유형을 선택하세요.', 'error'); return; }

    const date = document.getElementById('tx-date').value;
    const price = Number(document.getElementById('tx-price').value);
    const qty = Number(document.getElementById('tx-qty').value);

    if (!price || !qty) { UI.toast('가격과 수량을 입력하세요.', 'error'); return; }

    const tx = { type, date, price, quantity: qty };

    // Combined types need sell fields
    const allTypes = [...TRANSACTION_TYPES, ...getReverseTypes(session.settings.splits)];
    const typeObj = allTypes.find(t => t.type === type);
    if (typeObj?.group === 'combined') {
      tx.sellPrice = Number(document.getElementById('tx-sell-price').value) || 0;
      tx.sellQuantity = Number(document.getElementById('tx-sell-qty').value) || 0;
    }

    // For sell-only types, swap price/qty meaning
    if (typeObj?.group === 'sell') {
      // price and qty are already correct — they represent sell price/qty
    }

    // 수정 모드일 경우 기존 거래 삭제
    if (window._pendingEditTxId) {
      Store.deleteTransaction(session.id, window._pendingEditTxId);
      window._pendingEditTxId = null;
    }

    Store.addTransaction(session.id, tx);
    UI.closeModal('modal-tx');
  });

  // Delete transaction
  document.getElementById('tx-list')?.addEventListener('click', function (e) {
    const deleteBtn = e.target.closest('.tx-delete');
    if (deleteBtn) {
      const session = Store.getActiveSession();
      if (session && confirm('이 거래를 삭제하시겠습니까?')) {
        Store.deleteTransaction(session.id, deleteBtn.dataset.txId);
      }
      return;
    }
    // Edit transaction — store pending edit, delete only after save
    const editBtn = e.target.closest('.tx-edit');
    if (editBtn) {
      const session = Store.getActiveSession();
      if (!session) return;
      const txId = editBtn.dataset.txId;
      const tx = session.transactions.find(t => t.id === txId);
      if (!tx) return;
      // Store the pending edit tx id for deletion on save
      window._pendingEditTxId = txId;
      UI.openTxModal(session);
    }
  });

  // Reverse mode toggle
  document.getElementById('btn-reverse-toggle')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (!session) return;

    if (session.isReverseMode) {
      if (confirm('리버스 모드를 종료하고 새 사이클을 시작하시겠습니까?')) {
        Store.exitReverseMode(session.id);
      }
    } else {
      const state = calcState(session.settings, session.transactions, session.midEntry);
      Store.enterReverseMode(session.id, state.starPrice);
    }
  });

  // Auth modal
  document.getElementById('btn-auth')?.addEventListener('click', () => UI.openAuthModal());
  document.getElementById('btn-goto-login')?.addEventListener('click', () => UI.openAuthModal());

  // Auth tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll('.auth-tab-content').forEach(c => c.style.display = 'none');
      document.getElementById('auth-tab-' + this.dataset.tab).style.display = '';
      document.getElementById('auth-title').textContent =
        this.dataset.tab === 'login' ? '로그인' : this.dataset.tab === 'register' ? '회원가입' : '비밀번호 찾기';
    });
  });

  // Login
  document.getElementById('btn-login')?.addEventListener('click', async function () {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value;
    if (!id || !pw) { UI.showAuthError('auth-error', '아이디와 비밀번호를 입력하세요.'); return; }
    this.disabled = true; this.textContent = '로그인 중...';
    try {
      const res = await API.login(id, pw);
      Store.setAuth(res.token, res.username);
      try { await Store.syncFromServer(); } catch { /* 동기화 실패해도 로그인은 유지 */ }
      UI.closeModal('modal-auth');
      UI.toast('로그인되었습니다.');
      // 로그인 후 시장 데이터 가져오기
      const s = Store.getActiveSession();
      if (s?.settings?.ticker) fetchPriceData(s.settings.ticker);
      fetchMarketData();
      render();
    } catch (e) {
      UI.showAuthError('auth-error', e.message);
    } finally {
      this.disabled = false; this.textContent = '로그인';
    }
  });

  // Enter key for login
  document.getElementById('auth-pw')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });

  // Register
  document.getElementById('btn-register')?.addEventListener('click', async function () {
    const id = document.getElementById('reg-id').value.trim();
    const pw = document.getElementById('reg-pw').value;
    const pw2 = document.getElementById('reg-pw2').value;
    const sq = document.getElementById('reg-sq').value;
    const sa = document.getElementById('reg-sa').value.trim();
    if (!id || !pw) { UI.showAuthError('reg-error', '아이디와 비밀번호를 입력하세요.'); return; }
    if (pw !== pw2) { UI.showAuthError('reg-error', '비밀번호가 일치하지 않습니다.'); return; }
    if (!sq) { UI.showAuthError('reg-error', '보안질문을 선택하세요.'); return; }
    if (!sa) { UI.showAuthError('reg-error', '보안질문 답변을 입력하세요.'); return; }
    this.disabled = true; this.textContent = '가입 중...';
    try {
      const res = await API.register(id, pw, sq, sa);
      Store.setAuth(res.token, res.username);
      UI.closeModal('modal-auth');
      UI.toast('회원가입이 완료되었습니다.');
      render();
    } catch (e) {
      UI.showAuthError('reg-error', e.message);
    } finally {
      this.disabled = false; this.textContent = '회원가입';
    }
  });

  // Reset password - Step 1: Get security question
  document.getElementById('btn-reset-find')?.addEventListener('click', async function () {
    const id = document.getElementById('reset-id').value.trim();
    if (!id) { UI.showAuthError('reset-error', '아이디를 입력하세요.'); return; }
    this.disabled = true; this.textContent = '확인 중...';
    try {
      const res = await API.getSecurityQuestion(id);
      document.getElementById('reset-question').textContent = res.securityQuestion;
      document.getElementById('reset-step1').style.display = 'none';
      document.getElementById('reset-step2').style.display = '';
    } catch (e) {
      UI.showAuthError('reset-error', e.message);
    } finally {
      this.disabled = false; this.textContent = '보안질문 확인';
    }
  });

  // Reset password - Step 2: Submit answer + new password
  document.getElementById('btn-reset-submit')?.addEventListener('click', async function () {
    const id = document.getElementById('reset-id').value.trim();
    const answer = document.getElementById('reset-answer').value.trim();
    const newPw = document.getElementById('reset-new-pw').value;
    if (!answer || !newPw) { UI.showAuthError('reset-error2', '답변과 새 비밀번호를 입력하세요.'); return; }
    this.disabled = true; this.textContent = '재설정 중...';
    try {
      const res = await API.resetPassword(id, answer, newPw);
      document.getElementById('reset-success').textContent = res.message;
      document.getElementById('reset-success').style.display = '';
      document.getElementById('reset-error2').style.display = 'none';
    } catch (e) {
      UI.showAuthError('reset-error2', e.message);
    } finally {
      this.disabled = false; this.textContent = '비밀번호 재설정';
    }
  });

  // Reset password - Back button
  document.getElementById('btn-reset-back')?.addEventListener('click', function () {
    document.getElementById('reset-step1').style.display = '';
    document.getElementById('reset-step2').style.display = 'none';
    document.getElementById('reset-error').style.display = 'none';
  });

  // Security question setup (logged in)
  document.getElementById('btn-security-q-show')?.addEventListener('click', async function () {
    const sec = document.getElementById('security-q-section');
    if (sec.style.display === 'none') {
      sec.style.display = '';
      // Load current security question
      try {
        const res = await API.getMySecurityQuestion();
        const cur = document.getElementById('security-q-current');
        if (res.securityQuestion) {
          cur.textContent = '현재 설정: ' + res.securityQuestion;
        } else {
          cur.textContent = '⚠️ 보안질문이 설정되지 않았습니다. 비밀번호 찾기를 위해 설정해주세요.';
          cur.style.color = '#f59e0b';
        }
      } catch { /* ignore */ }
    } else {
      sec.style.display = 'none';
    }
  });

  document.getElementById('btn-security-q-save')?.addEventListener('click', async function () {
    const sq = document.getElementById('security-q-select').value;
    const sa = document.getElementById('security-q-answer').value.trim();
    if (!sq) { UI.showAuthError('security-q-error', '보안질문을 선택하세요.'); return; }
    if (!sa) { UI.showAuthError('security-q-error', '답변을 입력하세요.'); return; }
    this.disabled = true; this.textContent = '저장 중...';
    try {
      const res = await API.setSecurityQuestion(sq, sa);
      document.getElementById('security-q-success').textContent = res.message;
      document.getElementById('security-q-success').style.display = '';
      document.getElementById('security-q-error').style.display = 'none';
      document.getElementById('security-q-current').textContent = '현재 설정: ' + sq;
      document.getElementById('security-q-current').style.color = '';
      document.getElementById('security-q-answer').value = '';
    } catch (e) {
      UI.showAuthError('security-q-error', e.message);
    } finally {
      this.disabled = false; this.textContent = '보안질문 저장';
    }
  });

  // Change password (logged in)
  document.getElementById('btn-change-pw-show')?.addEventListener('click', function () {
    const sec = document.getElementById('change-pw-section');
    sec.style.display = sec.style.display === 'none' ? '' : 'none';
  });

  document.getElementById('btn-change-pw')?.addEventListener('click', async function () {
    const cur = document.getElementById('change-pw-current').value;
    const newPw = document.getElementById('change-pw-new').value;
    if (!cur || !newPw) { UI.showAuthError('change-pw-error', '현재 비밀번호와 새 비밀번호를 입력하세요.'); return; }
    this.disabled = true; this.textContent = '변경 중...';
    try {
      const res = await API.changePassword(cur, newPw);
      document.getElementById('change-pw-success').textContent = res.message;
      document.getElementById('change-pw-success').style.display = '';
      document.getElementById('change-pw-error').style.display = 'none';
      document.getElementById('change-pw-current').value = '';
      document.getElementById('change-pw-new').value = '';
    } catch (e) {
      UI.showAuthError('change-pw-error', e.message);
    } finally {
      this.disabled = false; this.textContent = '비밀번호 변경';
    }
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', function () {
    Store.clearAuth();
    Store.clearAllData();
    UI.setPriceData(null);
    UI.setFearGreedData(null);
    UI.setExchangeData(null);
    _lastClosePrice = null;
    UI.closeModal('modal-auth');
    UI.toast('로그아웃되었습니다.');
    render();
  });

  // ESC key to close modals
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') UI.closeAllModals();
  });

  // Settings modal
  document.getElementById('btn-settings')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (session) UI.openSettingsModal(session);
  });

  // Save settings
  document.getElementById('btn-save-settings')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (!session) return;
    const name = document.getElementById('settings-name').value;
    const ticker = UI.getToggleValue('settings-ticker');
    const splits = Number(UI.getToggleValue('settings-splits'));
    const capital = Number(document.getElementById('settings-capital').value);
    const target = Number(document.getElementById('settings-target').value) || null;

    if (name) Store.renameSession(session.id, name);
    Store.updateSessionSettings(session.id, { ticker, splits, totalCapital: capital, targetProfit: target });
    UI.closeModal('modal-settings');
    fetchPriceData(ticker);
  });

  // Delete session
  document.getElementById('btn-delete-session')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (session && confirm(`"${session.name}" 세션을 삭제하시겠습니까?`)) {
      Store.deleteSession(session.id);
      UI.closeModal('modal-settings');
    }
  });

  // Close modals
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('modal-close')) {
      window._pendingEditTxId = null;
      UI.closeAllModals();
    }
  });

  // --- Fetch Market Data ---
  async function fetchPriceData(ticker) {
    if (!ticker) return;
    try {
      const data = await API.getPrice(ticker);
      UI.setPriceData(data);
      _lastClosePrice = data.previousClose || null;
      render();
    } catch { /* silent */ }
  }

  async function fetchMarketData() {
    try {
      const [fg, ex] = await Promise.all([
        API.getFearGreed().catch(() => null),
        API.getExchangeRate().catch(() => null),
      ]);
      if (fg) UI.setFearGreedData(fg);
      if (ex) UI.setExchangeData(ex);

      UI.renderMarketBar(Store.getActiveSession());
    } catch { /* silent */ }
  }

  // Initial data fetch — 로그인 상태일 때만
  if (Store.isLoggedIn()) {
    const session = Store.getActiveSession();
    if (session?.settings?.ticker) {
      fetchPriceData(session.settings.ticker);
    }
    fetchMarketData();

    // Sync from server on load
    Store.syncFromServer().then(() => {
      render();
      // 동기화 후 세션 데이터로 가격 갱신
      const s = Store.getActiveSession();
      if (s?.settings?.ticker) fetchPriceData(s.settings.ticker);
    }).catch(() => {});
  }

  // Refresh market data every 5 minutes (로그인 상태만)
  setInterval(() => {
    if (Store.isLoggedIn()) fetchMarketData();
  }, 300000);
})();
