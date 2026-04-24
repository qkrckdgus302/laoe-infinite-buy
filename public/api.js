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
  async register(username, password, securityQuestion, securityAnswer) {
    return this._fetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ username, password, securityQuestion, securityAnswer })
    });
  },

  async login(username, password) {
    return this._fetch('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
  },

  // Password reset (2-step)
  async getSecurityQuestion(username) {
    return this._fetch('/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ username })
    });
  },

  async resetPassword(username, securityAnswer, newPassword) {
    return this._fetch('/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ username, securityAnswer, newPassword })
    });
  },

  // Change password (logged in)
  async changePassword(currentPassword, newPassword) {
    return this._fetch('/api/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  // Security question (logged in)
  async getMySecurityQuestion() {
    return this._fetch('/api/auth/security-question');
  },

  async setSecurityQuestion(securityQuestion, securityAnswer) {
    return this._fetch('/api/auth/security-question', {
      method: 'POST', body: JSON.stringify({ securityQuestion, securityAnswer })
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
