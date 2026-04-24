// ===== API 클라이언트 =====

const API = {
  _token: null,

  setToken(token) { this._token = token; },
  getToken() { return this._token; },
  clearToken() { this._token = null; },

  async _fetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    const resp = await fetch(url, { ...options, headers });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  },

  // Auth
  async register(username, password) {
    return this._fetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
  },

  async login(username, password) {
    return this._fetch('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
  },

  // User data
  async loadData() {
    return this._fetch('/api/data');
  },

  async saveData(data) {
    return this._fetch('/api/data', {
      method: 'PUT', body: JSON.stringify(data)
    });
  },

  // Price
  async getPrice(ticker, days = 10) {
    return this._fetch(`/api/price?ticker=${encodeURIComponent(ticker)}&days=${days}`);
  },

  // Fear & Greed
  async getFearGreed() {
    return this._fetch('/api/fear-greed');
  },

  // Exchange Rate
  async getExchangeRate() {
    return this._fetch('/api/exchange-rate');
  },
};

window.API = API;
