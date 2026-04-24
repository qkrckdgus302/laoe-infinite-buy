// ===== UI 렌더링 (ui.js) =====

const UI = {
  _priceData: null,
  _fearGreedData: null,
  _exchangeData: null,

  // --- View switching ---
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const el = document.getElementById(viewId);
    if (el) el.style.display = 'block';
  },

  // --- Session Tabs ---
  renderTabs() {
    const sessions = Store.getSessions();
    const activeId = Store.getActiveSessionId();
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;

    tabList.innerHTML = sessions.map(s => `
      <button class="tab ${s.id === activeId ? 'active' : ''}" data-id="${this._esc(s.id)}">
        ${this._esc(s.name || '세션')}
      </button>
    `).join('');
  },

  // --- Summary Cards ---
  renderSummary(state, session) {
    const el = document.getElementById('summary-cards');
    if (!el) return;

    const profitLoss = state.totalQuantity > 0 && this._priceData?.currentPrice
      ? ((this._priceData.currentPrice - state.avgPrice) * state.totalQuantity)
      : null;

    el.innerHTML = `
      <div class="summary-card">
        <div class="sc-label">T값</div>
        <div class="sc-value">${state.tValue}</div>
        <div class="sc-sub">${session.settings.splits}분할</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">평단가</div>
        <div class="sc-value">$${state.avgPrice > 0 ? state.avgPrice.toFixed(2) : '--'}</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">별%</div>
        <div class="sc-value ${state.starPercent >= 0 ? 'text-green' : 'text-red'}">${state.starPercent.toFixed(1)}%</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">별가격</div>
        <div class="sc-value">$${state.starPrice > 0 ? state.starPrice.toFixed(2) : '--'}</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">잔금</div>
        <div class="sc-value">$${state.remainingCapital.toFixed(0)}</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">보유수량</div>
        <div class="sc-value">${state.totalQuantity}주</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">1회 매수금</div>
        <div class="sc-value">$${state.buyAmount > 0 ? state.buyAmount.toFixed(0) : '--'}</div>
      </div>
      <div class="summary-card">
        <div class="sc-label">평가손익</div>
        <div class="sc-value ${profitLoss !== null ? (profitLoss >= 0 ? 'text-green' : 'text-red') : ''}">${profitLoss !== null ? (profitLoss >= 0 ? '+' : '') + '$' + profitLoss.toFixed(0) : '--'}</div>
      </div>
    `;
  },

  // --- Phase Badge ---
  renderPhase(state, session) {
    const el = document.getElementById('phase-badge');
    if (!el) return;

    const phaseColors = {
      '처음매수': 'phase-start',
      '전반전': 'phase-first',
      '후반전': 'phase-second',
      '소진모드': 'phase-exhausted',
      '종료': 'phase-end',
    };
    const displayPhase = session.isReverseMode ? '리버스' : state.phase;
    const cls = session.isReverseMode ? 'phase-reverse' : (phaseColors[state.phase] || '');

    el.innerHTML = `<span class="phase-tag ${cls}">${displayPhase}</span>`;
  },

  // --- Orders ---
  renderOrders(orders) {
    const el = document.getElementById('orders-content');
    if (!el) return;

    if (orders.length === 0) {
      el.innerHTML = '<p class="empty-text">표시할 주문이 없습니다.</p>';
      return;
    }

    const buyOrders = orders.filter(o => o.type === 'buy');
    const sellOrders = orders.filter(o => o.type === 'sell');

    let html = '';

    if (buyOrders.length > 0) {
      html += '<div class="order-group"><h4 class="order-group-title buy-title">매수 주문</h4><table class="order-table"><thead><tr><th></th><th>방식</th><th>가격</th><th>수량</th></tr></thead><tbody>';
      for (const o of buyOrders) {
        html += `<tr><td class="order-label">${this._esc(o.label)}</td><td>${this._esc(o.method)}</td><td>$${o.price > 0 ? o.price.toFixed(2) : 'MOC'}</td><td>${o.quantity}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    if (sellOrders.length > 0) {
      html += '<div class="order-group"><h4 class="order-group-title sell-title">매도 주문</h4><table class="order-table"><thead><tr><th></th><th>방식</th><th>가격</th><th>수량</th></tr></thead><tbody>';
      for (const o of sellOrders) {
        html += `<tr><td class="order-label">${this._esc(o.label)}</td><td>${this._esc(o.method)}</td><td>$${o.price > 0 ? o.price.toFixed(2) : 'MOC'}</td><td>${o.quantity}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    el.innerHTML = html;
  },

  // --- Transaction List ---
  renderTransactions(session) {
    const el = document.getElementById('tx-list');
    if (!el) return;

    if (session.transactions.length === 0) {
      el.innerHTML = '<p class="empty-text">거래 내역이 없습니다.</p>';
      return;
    }

    const allTypes = [...TRANSACTION_TYPES, ...getReverseTypes(session.settings.splits)];
    const typeMap = Object.fromEntries(allTypes.map(t => [t.type, t.label]));

    el.innerHTML = session.transactions.map((tx, i) => `
      <div class="tx-row" data-tx-id="${this._esc(tx.id)}">
        <div class="tx-info">
          <span class="tx-date">${this._esc(tx.date)}</span>
          <span class="tx-type-label">${this._esc(typeMap[tx.type] || tx.type)}</span>
        </div>
        <div class="tx-detail">
          $${tx.price?.toFixed(2) || '0'} × ${tx.quantity || 0}
          ${tx.sellPrice ? ` / 매도 $${tx.sellPrice.toFixed(2)} × ${tx.sellQuantity}` : ''}
        </div>
        <button class="tx-delete" data-tx-id="${this._esc(tx.id)}" title="삭제">&times;</button>
      </div>
    `).join('');
  },

  // --- Reverse Mode Button ---
  updateReverseButton(state, session) {
    const btn = document.getElementById('btn-reverse-toggle');
    if (!btn) return;

    if (session.isReverseMode) {
      btn.textContent = '리버스 종료';
      btn.style.display = '';
      btn.className = 'btn-danger';
    } else if (state.phase === '소진모드') {
      btn.textContent = '리버스 모드 진입';
      btn.style.display = '';
      btn.className = 'btn-secondary';
    } else {
      btn.style.display = 'none';
    }
  },

  // --- Transaction Modal ---
  openTxModal(session) {
    const modal = document.getElementById('modal-tx');
    modal.style.display = 'flex';
    document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);

    const types = session.isReverseMode
      ? getReverseTypes(session.settings.splits)
      : TRANSACTION_TYPES;

    const listEl = document.getElementById('tx-type-list');
    listEl.innerHTML = types.map((t, i) => `
      <button class="tx-type-btn ${i === 0 ? 'active' : ''}" data-type="${t.type}" data-group="${t.group}">
        <span class="tx-type-name">${this._esc(t.label)}</span>
        <span class="tx-type-desc">${this._esc(t.desc)}</span>
      </button>
    `).join('');

    this._updateTxFields(types[0]);
    document.getElementById('tx-price').value = '';
    document.getElementById('tx-qty').value = '';
    document.getElementById('tx-sell-price').value = '';
    document.getElementById('tx-sell-qty').value = '';
  },

  _updateTxFields(typeObj) {
    const sellFields = document.getElementById('tx-sell-fields');
    const priceLabel = document.querySelector('#tx-price-group label');
    const qtyLabel = document.querySelector('#tx-qty-group label');

    if (typeObj.group === 'sell') {
      priceLabel.textContent = '매도가 ($)';
      qtyLabel.textContent = '매도 수량';
      sellFields.style.display = 'none';
    } else if (typeObj.group === 'combined') {
      priceLabel.textContent = '매수가 ($)';
      qtyLabel.textContent = '매수 수량';
      sellFields.style.display = '';
    } else {
      priceLabel.textContent = '매수가 ($)';
      qtyLabel.textContent = '매수 수량';
      sellFields.style.display = 'none';
    }
  },

  getSelectedTxType() {
    const active = document.querySelector('#tx-type-list .tx-type-btn.active');
    return active?.dataset.type || null;
  },

  // --- Market Bar ---
  renderMarketBar(session) {
    const ticker = session?.settings?.ticker || '--';
    const priceEl = document.getElementById('market-price');
    if (priceEl) {
      const label = priceEl.querySelector('.market-label');
      const value = priceEl.querySelector('.market-value');
      label.textContent = ticker;
      if (this._priceData?.currentPrice) {
        value.textContent = '$' + this._priceData.currentPrice.toFixed(2);
      } else {
        value.textContent = '--';
      }
    }

    const fearEl = document.getElementById('market-fear');
    if (fearEl) {
      const value = fearEl.querySelector('.market-value');
      if (this._fearGreedData?.score != null) {
        value.textContent = `${this._fearGreedData.score} ${this._fearGreedData.ratingKo || ''}`;
      } else {
        value.textContent = '--';
      }
    }

    const exEl = document.getElementById('market-exchange');
    if (exEl) {
      const value = exEl.querySelector('.market-value');
      if (this._exchangeData?.KRW) {
        value.textContent = '₩' + this._exchangeData.KRW.toFixed(0);
      } else {
        value.textContent = '--';
      }
    }
  },

  // --- Chart ---
  renderChart(history, splits) {
    const canvas = document.getElementById('chart-canvas');
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth - 32;
    const H = 200;
    canvas.width = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 10, bottom: 25, left: 40 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const values = history.map(h => h.tValue);
    const maxT = Math.max(splits, ...values);
    const minT = 0;

    // Grid
    ctx.strokeStyle = '#2a2545';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((maxT - (maxT / 4) * i).toFixed(1), pad.left - 4, y + 4);
    }

    // Half line
    const halfY = pad.top + ch * (1 - (splits / 2) / maxT);
    ctx.strokeStyle = '#6c5ce744';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, halfY); ctx.lineTo(W - pad.right, halfY); ctx.stroke();
    ctx.setLineDash([]);

    // Line
    if (values.length > 1) {
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = pad.left + (cw / (values.length - 1)) * i;
        const y = pad.top + ch * (1 - (values[i] - minT) / (maxT - minT));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Dots
      ctx.fillStyle = '#a78bfa';
      for (let i = 0; i < values.length; i++) {
        const x = pad.left + (cw / (values.length - 1)) * i;
        const y = pad.top + ch * (1 - (values[i] - minT) / (maxT - minT));
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // X labels (show first, mid, last)
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    if (history.length > 0) {
      ctx.fillText(history[0].date.slice(5), pad.left, H - 4);
      if (history.length > 2) {
        const mid = Math.floor(history.length / 2);
        ctx.fillText(history[mid].date.slice(5), pad.left + (cw / (values.length - 1)) * mid, H - 4);
      }
      ctx.fillText(history[history.length - 1].date.slice(5), W - pad.right, H - 4);
    }
  },

  // --- Auth Modal ---
  openAuthModal() {
    const modal = document.getElementById('modal-auth');
    modal.style.display = 'flex';
    const loggedIn = Store.isLoggedIn();
    document.getElementById('auth-form').style.display = loggedIn ? 'none' : '';
    document.getElementById('auth-logged-in').style.display = loggedIn ? '' : 'none';
    if (loggedIn) {
      document.getElementById('auth-username').textContent = Store.getAuth().username;
    }
    document.getElementById('auth-error').style.display = 'none';
  },

  showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = '';
  },

  // --- Settings Modal ---
  openSettingsModal(session) {
    const modal = document.getElementById('modal-settings');
    modal.style.display = 'flex';
    document.getElementById('settings-name').value = session.name || '';
    this._setToggle('settings-ticker', session.settings.ticker);
    this._setToggle('settings-splits', String(session.settings.splits));
    document.getElementById('settings-capital').value = session.settings.totalCapital || '';
    document.getElementById('settings-target').value = session.settings.targetProfit || '';
  },

  // --- Modal helpers ---
  closeModal(id) {
    document.getElementById(id).style.display = 'none';
  },

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  },

  // --- Toggle helpers ---
  _setToggle(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.btn-toggle').forEach(b => {
      b.classList.toggle('active', b.dataset.value === value);
    });
  },

  getToggleValue(groupId) {
    const active = document.querySelector(`#${groupId} .btn-toggle.active`);
    return active?.dataset.value || null;
  },

  // --- Escape HTML ---
  _esc(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  },

  // --- Set market data ---
  setPriceData(data) { this._priceData = data; },
  setFearGreedData(data) { this._fearGreedData = data; },
  setExchangeData(data) { this._exchangeData = data; },
};

window.UI = UI;
