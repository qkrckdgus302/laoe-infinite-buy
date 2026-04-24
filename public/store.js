// ===== 상태 관리 (store.js) =====
// localStorage persist + 서버 동기화

const Store = {
  STORAGE_KEY: 'laoe-store',
  AUTH_KEY: 'laoe-auth',
  _state: null,
  _auth: null,
  _listeners: [],
  _saveTimer: null,

  // --- 초기화 ---
  init() {
    this._state = this._load(this.STORAGE_KEY) || this._defaultState();
    this._auth = this._load(this.AUTH_KEY) || { token: null, username: null };
    if (this._auth.token) {
      API.setToken(this._auth.token);
    }
  },

  _defaultState() {
    return {
      sessions: [],
      activeSessionId: null,
    };
  },

  _load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },

  _persist(immediate) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state));
    this._notify();
    if (immediate) {
      this._syncNow();
    } else {
      this._scheduleSyncToServer();
    }
  },

  // --- Auth ---
  getAuth() { return { ...this._auth }; },

  setAuth(token, username) {
    this._auth = { token, username };
    localStorage.setItem(this.AUTH_KEY, JSON.stringify(this._auth));
    API.setToken(token);
  },

  clearAuth() {
    this._auth = { token: null, username: null };
    localStorage.removeItem(this.AUTH_KEY);
    API.clearToken();
  },

  // 로그아웃 시 세션 데이터 전부 초기화
  clearAllData() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this._state = this._defaultState();
    localStorage.removeItem(this.STORAGE_KEY);
    this._notify();
  },

  isLoggedIn() { return !!this._auth.token; },

  // --- Sessions ---
  getSessions() { return this._state.sessions; },

  getActiveSession() {
    return this._state.sessions.find(s => s.id === this._state.activeSessionId) || null;
  },

  getActiveSessionId() { return this._state.activeSessionId; },

  setActiveSession(id) {
    this._state.activeSessionId = id;
    this._persist();
  },

  createSession(name, settings) {
    const session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || `세션 ${this._state.sessions.length + 1}`,
      settings: {
        ticker: settings?.ticker || 'TQQQ',
        splits: settings?.splits || 20,
        totalCapital: settings?.totalCapital || 0,
        targetProfit: settings?.targetProfit || null,
      },
      transactions: [],
      isReverseMode: false,
      reverseStarPrice: null,
      archivedCycles: [],
      midEntry: null,
      createdAt: new Date().toISOString(),
    };
    this._state.sessions.push(session);
    this._state.activeSessionId = session.id;
    this._persist();
    return session;
  },

  updateSessionSettings(id, settings) {
    const s = this._state.sessions.find(s => s.id === id);
    if (!s) return;
    Object.assign(s.settings, settings);
    this._persist();
  },

  deleteSession(id) {
    this._state.sessions = this._state.sessions.filter(s => s.id !== id);
    if (this._state.activeSessionId === id) {
      this._state.activeSessionId = this._state.sessions[0]?.id || null;
    }
    this._persist(true);
  },

  renameSession(id, name) {
    const s = this._state.sessions.find(s => s.id === id);
    if (s) { s.name = name; this._persist(); }
  },

  // --- Transactions ---
  addTransaction(sessionId, tx) {
    const s = this._state.sessions.find(s => s.id === sessionId);
    if (!s) return;
    s.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString().slice(0, 10),
      ...tx,
    });
    this._persist();
  },

  updateTransaction(sessionId, txId, updates) {
    const s = this._state.sessions.find(s => s.id === sessionId);
    if (!s) return;
    const tx = s.transactions.find(t => t.id === txId);
    if (tx) { Object.assign(tx, updates); this._persist(); }
  },

  deleteTransaction(sessionId, txId) {
    const s = this._state.sessions.find(s => s.id === sessionId);
    if (!s) return;
    s.transactions = s.transactions.filter(t => t.id !== txId);
    this._persist(true);
  },

  // --- Reverse Mode ---
  enterReverseMode(sessionId, starPrice) {
    const s = this._state.sessions.find(s => s.id === sessionId);
    if (!s) return;
    s.isReverseMode = true;
    s.reverseStarPrice = starPrice;
    this._persist();
  },

  exitReverseMode(sessionId) {
    const s = this._state.sessions.find(s => s.id === sessionId);
    if (!s) return;
    // Archive current cycle
    s.archivedCycles.push({
      transactions: [...s.transactions],
      isReverseMode: true,
      reverseStarPrice: s.reverseStarPrice,
      archivedAt: new Date().toISOString(),
    });
    s.transactions = [];
    s.isReverseMode = false;
    s.reverseStarPrice = null;
    this._persist(true);
  },

  // --- Mid Entry ---
  setMidEntry(sessionId, midEntry) {
    const s = this._state.sessions.find(s => s.id === sessionId);
    if (!s) return;
    s.midEntry = midEntry;
    this._persist();
  },

  // --- Listeners ---
  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  },

  _notify() {
    for (const fn of this._listeners) fn(this._state);
  },

  // --- Server Sync ---
  _syncNow() {
    if (!this.isLoggedIn()) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    API.saveData(this._state).catch(() => {
      if (typeof UI !== 'undefined') UI.toast('데이터 저장에 실패했습니다.', 'error');
    });
  },

  _scheduleSyncToServer() {
    if (!this.isLoggedIn()) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      API.saveData(this._state).catch(() => {
        if (typeof UI !== 'undefined') UI.toast('데이터 저장에 실패했습니다.', 'error');
      });
    }, 2000);
  },

  async syncFromServer() {
    if (!this.isLoggedIn()) return;
    const data = await API.loadData();
    if (data && data.sessions) {
      this._state = data;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state));
      this._notify();
    }
  },

  // --- Import full state (for server load) ---
  importState(state) {
    this._state = state;
    this._persist();
  },

  getState() {
    return JSON.parse(JSON.stringify(this._state));
  },
};

window.Store = Store;
