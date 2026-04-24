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

  // --- T Value Bar ---
  renderTBar(state, session) {
    const display = document.getElementById('t-value-display');
    const slider = document.getElementById('t-slider');
    const midLabel = document.getElementById('t-slider-mid');
    const maxLabel = document.getElementById('t-slider-max');
    if (!display) return;

    const splits = session.settings.splits;
    display.textContent = state.tValue.toFixed(5);
    slider.max = splits;
    slider.value = state.tValue;
    if (midLabel) midLabel.textContent = `${splits / 2} (전반전)`;
    if (maxLabel) maxLabel.textContent = splits;
  },

  // --- Summary Cards (3 columns) ---
  renderSummary(state, session) {
    const el = document.getElementById('summary-cards');
    if (!el) return;

    const krwRate = this._exchangeData?.KRW || 0;
    const buyAmountKrw = krwRate > 0 ? Math.round(state.buyAmount * krwRate).toLocaleString() : '';

    const profitLoss = state.totalQuantity > 0 && this._priceData?.currentPrice
      ? ((this._priceData.currentPrice - state.avgPrice) * state.totalQuantity)
      : null;
    const profitPct = state.totalQuantity > 0 && state.avgPrice > 0 && this._priceData?.currentPrice
      ? ((this._priceData.currentPrice - state.avgPrice) / state.avgPrice * 100)
      : null;

    el.innerHTML = `
      <div class="sc3">
        <div class="sc3-label">평단가</div>
        <div class="sc3-value">${state.avgPrice > 0 ? '$' + state.avgPrice.toFixed(2) : '-'}</div>
      </div>
      <div class="sc3">
        <div class="sc3-label">보유수량</div>
        <div class="sc3-value">${state.totalQuantity}<small>주</small></div>
      </div>
      <div class="sc3">
        <div class="sc3-label">잔금</div>
        <div class="sc3-value">$${state.remainingCapital.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
      </div>
      <div class="sc3">
        <div class="sc3-label">별%</div>
        <div class="sc3-value ${state.starPercent >= 0 ? 'text-green' : 'text-red'}">${state.starPercent >= 0 ? '+' : ''}${state.starPercent.toFixed(2)}%</div>
      </div>
      <div class="sc3">
        <div class="sc3-label">별지점</div>
        <div class="sc3-value">${state.starPrice > 0 ? '$' + state.starPrice.toFixed(2) : '-'}</div>
      </div>
      <div class="sc3">
        <div class="sc3-label">1회 매수금</div>
        <div class="sc3-value">$${state.buyAmount > 0 ? state.buyAmount.toFixed(2) : '-'}</div>
        ${buyAmountKrw ? `<div class="sc3-sub">(₩${buyAmountKrw})</div>` : ''}
      </div>
    `;

    // 보유수익률 + 평가금액 (2-column)
    const el2 = document.getElementById('summary-cards-2');
    if (el2) {
      const evalAmount = state.totalQuantity > 0 && this._priceData?.currentPrice
        ? state.totalQuantity * this._priceData.currentPrice : 0;
      const evalKrw = krwRate > 0 && evalAmount > 0 ? Math.round(evalAmount * krwRate).toLocaleString() : '';

      el2.innerHTML = `
        <div class="sc2">
          <div class="sc3-label">보유수익률</div>
          <div class="sc3-value ${profitPct !== null ? (profitPct >= 0 ? 'text-green' : 'text-red') : ''}">
            ${profitPct !== null ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%` : '-'}
          </div>
        </div>
        <div class="sc2">
          <div class="sc3-label">평가금액</div>
          <div class="sc3-value">${evalAmount > 0 ? '$' + evalAmount.toFixed(2) : '-'}</div>
          ${evalKrw ? `<div class="sc3-sub">(₩${evalKrw})</div>` : ''}
        </div>
      `;
    }
  },

  // --- Exchange Rate Inline ---
  renderExchangeInline() {
    const el = document.getElementById('exchange-inline');
    if (!el) return;
    if (this._exchangeData?.KRW) {
      let ts = '';
      try {
        if (this._exchangeData.timestamp) ts = ` (${new Date(this._exchangeData.timestamp).toISOString().slice(0, 10)})`;
      } catch {}
      el.innerHTML = `<span>USD/KRW</span> <strong>₩${this._exchangeData.KRW.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>${ts}`;
    } else {
      el.innerHTML = '';
    }
  },

  // --- Recent Prices ---
  renderRecentPrices(session) {
    const title = document.getElementById('recent-prices-title');
    const avg = document.getElementById('recent-avg');
    const grid = document.getElementById('recent-prices-grid');
    if (!grid) return;

    const ticker = session?.settings?.ticker || '';
    if (title) title.textContent = `${ticker} 최근 종가`;

    if (!this._priceData?.prices || this._priceData.prices.length === 0) {
      grid.innerHTML = '<p class="empty-text">데이터 로딩중...</p>';
      if (avg) avg.textContent = '';
      return;
    }

    const prices = this._priceData.prices.slice(-10);
    const last5 = prices.slice(-5);
    const avg5 = last5.reduce((s, p) => s + p.close, 0) / last5.length;
    if (avg) avg.innerHTML = `<span class="avg-badge">5일 평균</span> $${avg5.toFixed(2)}`;

    grid.innerHTML = prices.reverse().map((p, i) => {
      const prevClose = i < prices.length - 1 ? prices[i + 1]?.close : null;
      const change = prevClose ? ((p.close - prevClose) / prevClose * 100) : null;
      const changeClass = change !== null ? (change >= 0 ? 'text-green' : 'text-red') : '';
      const changeStr = change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : '';
      const dateStr = p.date.slice(5); // MM-DD
      const dayParts = p.date.split('-');
      const d = new Date(parseInt(dayParts[0]), parseInt(dayParts[1]) - 1, parseInt(dayParts[2]));
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;

      return `
        <div class="rp-item">
          <div class="rp-date">${dayLabel}</div>
          <div class="rp-price">$${p.close.toFixed(2)}</div>
          <div class="rp-change ${changeClass}">${changeStr}</div>
        </div>
      `;
    }).join('');
  },

  // --- Fear & Greed Gauge ---
  renderFearGreed() {
    const scoreEl = document.getElementById('fg-score');
    const ratingEl = document.getElementById('fg-rating');
    const pointer = document.getElementById('fg-pointer');
    const section = document.getElementById('fear-greed-section');
    if (!scoreEl) return;

    if (this._fearGreedData?.score != null) {
      const score = this._fearGreedData.score;
      scoreEl.textContent = score;
      ratingEl.textContent = this._fearGreedData.ratingKo || '';

      // Color based on score
      if (score <= 25) { scoreEl.className = 'fg-score text-red'; ratingEl.className = 'fg-rating text-red'; }
      else if (score <= 45) { scoreEl.className = 'fg-score text-yellow'; ratingEl.className = 'fg-rating text-yellow'; }
      else if (score <= 55) { scoreEl.className = 'fg-score'; ratingEl.className = 'fg-rating'; }
      else if (score <= 75) { scoreEl.className = 'fg-score text-green'; ratingEl.className = 'fg-rating text-green'; }
      else { scoreEl.className = 'fg-score text-green'; ratingEl.className = 'fg-rating text-green'; }

      // Move pointer (clamp to 2%-98% to stay within gauge)
      if (pointer) pointer.style.left = `${Math.max(2, Math.min(98, score))}%`;
      if (section) section.style.display = '';
    } else {
      if (section) section.style.display = 'none';
    }
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
  renderOrders(orders, state, session) {
    const el = document.getElementById('orders-content');
    const titleEl = document.getElementById('orders-title');
    if (!el) return;

    // 처음매수 안내
    if (state && state.phase === '처음매수') {
      const buyAmount = state.buyAmount;
      const prevClose = this._priceData?.previousClose;
      if (titleEl) titleEl.textContent = '처음 매수 안내';

      let html = `<div class="first-buy-info">`;
      html += `<div class="fbi-row"><span>1회 매수금</span><strong class="fbi-amount">$${buyAmount.toFixed(2)}</strong></div>`;

      if (prevClose) {
        html += `<div class="fbi-close">전일 종가 <strong>$${prevClose.toFixed(2)}</strong> 기준 (종가×1.12)</div>`;
      }

      // 주문표 표시 (orders에 처음매수 주문이 있음)
      if (orders.length > 0) {
        html += '<div class="order-group" style="margin-top:12px;"><div class="order-section-title"><span class="order-dot buy-dot"></span> 매수 주문표</div>';
        for (const o of orders) {
          const methodClass = 'badge-loc';
          html += `<div class="order-row">
            <div class="order-row-left">
              <span class="order-name">${this._esc(o.label || 'LOC')}</span>
              <span class="order-badge ${methodClass}">${this._esc(o.method)}</span>
            </div>
            <div class="order-row-right">
              <span class="order-price">$${o.price.toFixed(2)}</span>
              <span class="order-qty">${o.quantity}주</span>
            </div>
          </div>`;
        }
        html += '</div>';
        html += `<p class="fbi-hint">위 가격으로 <strong>LOC 매수</strong>를 걸어두세요.</p>`;
      } else {
        html += `<p class="fbi-hint">시세 데이터를 불러오면 주문표가 표시됩니다.</p>`;
      }

      html += `<p class="fbi-hint">체결되면 아래 <strong>오늘 기록하기</strong> 버튼으로 기록해주세요.</p>`;
      html += `</div>`;
      el.innerHTML = html;
      return;
    }

    if (titleEl) titleEl.textContent = '오늘의 주문';

    if (orders.length === 0) {
      el.innerHTML = '<p class="empty-text">표시할 주문이 없습니다.</p>';
      return;
    }

    const buyOrders = orders.filter(o => o.type === 'buy');
    const sellOrders = orders.filter(o => o.type === 'sell');

    let html = '';

    if (buyOrders.length > 0) {
      html += '<div class="order-group"><div class="order-section-title"><span class="order-dot buy-dot"></span> 매수</div>';
      for (const o of buyOrders) {
        const methodClass = o.method === 'LOC' ? 'badge-loc' : (o.method === 'MOC' ? 'badge-moc' : 'badge-limit');
        html += `<div class="order-row">
          <div class="order-row-left">
            <span class="order-name">${this._esc(o.label || 'LOC')}</span>
            <span class="order-badge ${methodClass}">${this._esc(o.method)}</span>
          </div>
          <div class="order-row-right">
            <span class="order-price">${o.price > 0 ? '$' + o.price.toFixed(2) : 'MOC'}</span>
            <span class="order-qty">${o.quantity}주</span>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    if (sellOrders.length > 0) {
      html += '<div class="order-group"><div class="order-section-title"><span class="order-dot sell-dot"></span> 매도</div>';
      for (const o of sellOrders) {
        const methodClass = o.method === 'LOC' ? 'badge-loc' : (o.method === 'MOC' ? 'badge-moc' : 'badge-limit');
        html += `<div class="order-row">
          <div class="order-row-left">
            <span class="order-name">${this._esc(o.label || 'LOC')}</span>
            <span class="order-badge ${methodClass}">${this._esc(o.method)}</span>
          </div>
          <div class="order-row-right">
            <span class="order-price sell-price">${o.price > 0 ? '$' + o.price.toFixed(2) : 'MOC'}</span>
            <span class="order-qty">${o.quantity}주</span>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    el.innerHTML = html;
  },

  // --- Transaction List ---
  renderTransactions(session) {
    const el = document.getElementById('tx-list');
    const titleEl = document.getElementById('tx-title');
    if (!el) return;

    const count = session.transactions.length;
    if (titleEl) titleEl.textContent = count > 0 ? `거래 히스토리 (${count}건)` : '거래 히스토리';

    if (count === 0) {
      el.innerHTML = '<p class="empty-text">거래 내역이 없습니다.</p>';
      return;
    }

    const allTypes = [...TRANSACTION_TYPES, ...getReverseTypes(session.settings.splits)];
    const typeMap = Object.fromEntries(allTypes.map(t => [t.type, t]));

    el.innerHTML = session.transactions.map((tx) => {
      const typeObj = typeMap[tx.type];
      const typeName = typeObj?.label || tx.type;
      const isBuy = typeObj?.group === 'buy';
      const isSell = typeObj?.group === 'sell';
      const badgeClass = isBuy ? 'tx-badge-buy' : (isSell ? 'tx-badge-sell' : 'tx-badge-combined');
      const dateStr = tx.date ? tx.date.replace(/^\d{4}-/, '').replace('-', '/') : '';

      let detail = `$${tx.price?.toFixed(2) || '0'} × ${tx.quantity || 0}`;
      if (typeObj?.group === 'combined' && tx.sellPrice) {
        detail += ` / 매도 $${tx.sellPrice.toFixed(2)} × ${tx.sellQuantity || 0}`;
      }

      return `<div class="tx-hist-row" data-tx-id="${this._esc(tx.id)}">
        <span class="tx-hist-date">${dateStr}</span>
        <span class="tx-hist-badge ${badgeClass}">${this._esc(typeName)}</span>
        <span class="tx-hist-detail">${detail}</span>
        <div class="tx-hist-actions">
          <button class="tx-edit" data-tx-id="${this._esc(tx.id)}" title="수정">✏️</button>
          <button class="tx-delete" data-tx-id="${this._esc(tx.id)}" title="삭제">✕</button>
        </div>
      </div>`;
    }).join('');
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
  openTxModal(session, editTx) {
    const modal = document.getElementById('modal-tx');
    modal.style.display = 'flex';

    // Reset to step 1
    document.getElementById('tx-step-action').style.display = '';
    document.getElementById('tx-step-detail').style.display = 'none';

    const state = window._lastCalcState;
    const types = session.isReverseMode
      ? getReverseTypes(session.settings.splits)
      : TRANSACTION_TYPES;

    // If editing, skip to step 2 with pre-filled values
    if (editTx) {
      const allTypes = [...TRANSACTION_TYPES, ...getReverseTypes(session.settings.splits)];
      const typeObj = allTypes.find(t => t.type === editTx.type);
      if (typeObj) {
        this._showTxDetail(typeObj);
        // Pre-fill original values
        if (editTx.date) document.getElementById('tx-date').value = editTx.date;
        if (editTx.price) document.getElementById('tx-price').value = editTx.price;
        if (editTx.quantity) document.getElementById('tx-qty').value = editTx.quantity;
        if (editTx.sellPrice) document.getElementById('tx-sell-price').value = editTx.sellPrice;
        if (editTx.sellQuantity) document.getElementById('tx-sell-qty').value = editTx.sellQuantity;
        return;
      }
    }

    // Filter types based on state
    let filteredTypes = types;
    if (state && !session.isReverseMode) {
      if (state.totalQuantity === 0) {
        // No holdings → only buy types
        filteredTypes = types.filter(t => t.group === 'buy');
      }
    }

    // Determine recommended type
    const recommended = state && state.totalQuantity > 0 ? null : 'full_buy';

    const listEl = document.getElementById('tx-type-list');
    listEl.innerHTML = filteredTypes.map((t) => {
      const isRec = t.type === recommended;
      return `<button class="tx-action-btn" data-type="${t.type}" data-group="${t.group}">
        <div class="tx-action-left">
          <span class="tx-action-name">${this._esc(t.label)}</span>
          ${isRec ? '<span class="tx-rec-badge">추천</span>' : ''}
        </div>
        <span class="tx-action-tag">${this._esc(t.desc)}</span>
      </button>`;
    }).join('');
  },

  _showTxDetail(typeObj) {
    document.getElementById('tx-step-action').style.display = 'none';
    document.getElementById('tx-step-detail').style.display = '';
    document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('tx-selected-label').textContent = typeObj.label;

    this._updateTxFields(typeObj);
    const prevClose = this._priceData?.previousClose;
    document.getElementById('tx-price').value = prevClose ? prevClose.toFixed(2) : '';
    document.getElementById('tx-qty').value = '';
    document.getElementById('tx-sell-price').value = prevClose ? prevClose.toFixed(2) : '';
    document.getElementById('tx-sell-qty').value = '';

    // Store selected type
    this._selectedTxType = typeObj.type;
  },  _updateTxFields(typeObj) {
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
    return this._selectedTxType || null;
  },

  // --- Market Bar ---
  renderMarketBar(session, tickerOverride) {
    const ticker = tickerOverride || session?.settings?.ticker || '--';
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

    // X labels
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
    document.getElementById('auth-tabs-wrap').style.display = loggedIn ? 'none' : '';
    document.getElementById('auth-logged-in').style.display = loggedIn ? '' : 'none';
    if (loggedIn) {
      document.getElementById('auth-username').textContent = Store.getAuth().username;
      document.getElementById('auth-title').textContent = '내 계정';
      document.getElementById('change-pw-section').style.display = 'none';
      document.getElementById('change-pw-error').style.display = 'none';
      document.getElementById('change-pw-success').style.display = 'none';
      document.getElementById('security-q-section').style.display = 'none';
    } else {
      document.getElementById('auth-title').textContent = '로그인';
      // Reset to login tab
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.auth-tab[data-tab="login"]')?.classList.add('active');
      document.querySelectorAll('.auth-tab-content').forEach(c => c.style.display = 'none');
      document.getElementById('auth-tab-login').style.display = '';
      // Reset reset-password steps
      document.getElementById('reset-step1').style.display = '';
      document.getElementById('reset-step2').style.display = 'none';
    }
    // Clear all errors and success messages
    document.querySelectorAll('#modal-auth .error-msg').forEach(e => e.style.display = 'none');
    document.querySelectorAll('#modal-auth .success-msg').forEach(e => e.style.display = 'none');
    // Clear all input fields
    document.querySelectorAll('#modal-auth input').forEach(i => i.value = '');
    document.querySelectorAll('#modal-auth select').forEach(s => s.selectedIndex = 0);
  },

  showAuthError(elementId, msg) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
  },

  // --- Toast Notification ---
  toast(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-success');
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 2500);
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
