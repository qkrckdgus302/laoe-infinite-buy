// ===== 메인 앱 (app.js) =====
(function () {
  'use strict';

  // --- Init ---
  Store.init();

  let _lastClosePrice = null;

  function render() {
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

    if (capital <= 0) { alert('원금을 입력해주세요.'); return; }

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

  // Transaction type selection
  document.getElementById('tx-type-list')?.addEventListener('click', function (e) {
    const btn = e.target.closest('.tx-type-btn');
    if (!btn) return;
    this.querySelectorAll('.tx-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const session = Store.getActiveSession();
    const types = session?.isReverseMode
      ? getReverseTypes(session.settings.splits)
      : TRANSACTION_TYPES;
    const typeObj = types.find(t => t.type === btn.dataset.type);
    if (typeObj) UI._updateTxFields(typeObj);
  });

  // Save transaction
  document.getElementById('btn-save-tx')?.addEventListener('click', function () {
    const session = Store.getActiveSession();
    if (!session) return;

    const type = UI.getSelectedTxType();
    if (!type) { alert('거래 유형을 선택하세요.'); return; }

    const date = document.getElementById('tx-date').value;
    const price = Number(document.getElementById('tx-price').value);
    const qty = Number(document.getElementById('tx-qty').value);

    if (!price || !qty) { alert('가격과 수량을 입력하세요.'); return; }

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

    Store.addTransaction(session.id, tx);
    UI.closeModal('modal-tx');
  });

  // Delete transaction
  document.getElementById('tx-list')?.addEventListener('click', function (e) {
    const btn = e.target.closest('.tx-delete');
    if (!btn) return;
    const session = Store.getActiveSession();
    if (session && confirm('이 거래를 삭제하시겠습니까?')) {
      Store.deleteTransaction(session.id, btn.dataset.txId);
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

  // Login
  document.getElementById('btn-login')?.addEventListener('click', async function () {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value;
    if (!id || !pw) { UI.showAuthError('아이디와 비밀번호를 입력하세요.'); return; }
    try {
      const res = await API.login(id, pw);
      Store.setAuth(res.token, res.username);
      await Store.syncFromServer();
      UI.closeModal('modal-auth');
      render();
    } catch (e) {
      UI.showAuthError(e.message);
    }
  });

  // Register
  document.getElementById('btn-register')?.addEventListener('click', async function () {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value;
    if (!id || !pw) { UI.showAuthError('아이디와 비밀번호를 입력하세요.'); return; }
    try {
      const res = await API.register(id, pw);
      Store.setAuth(res.token, res.username);
      UI.closeModal('modal-auth');
      render();
    } catch (e) {
      UI.showAuthError(e.message);
    }
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', function () {
    Store.clearAuth();
    UI.closeModal('modal-auth');
    render();
  });

  // Sync from server
  document.getElementById('btn-sync')?.addEventListener('click', async function () {
    await Store.syncFromServer();
    UI.closeModal('modal-auth');
    render();
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

  // Initial data fetch
  const session = Store.getActiveSession();
  if (session?.settings?.ticker) {
    fetchPriceData(session.settings.ticker);
  }
  fetchMarketData();

  // Refresh market data every 5 minutes
  setInterval(fetchMarketData, 300000);

  // Sync from server on load if logged in
  if (Store.isLoggedIn()) {
    Store.syncFromServer().then(render);
  }
})();
