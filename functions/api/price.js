import { corsHeaders, jsonResponse } from '../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Try Yahoo v8 chart API
async function tryYahooChart(ticker, days) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400 * 1.5;
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${Math.floor(from)}&period2=${to}&interval=1d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${Math.floor(from)}&period2=${to}&interval=1d`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers: HEADERS });
      if (!resp.ok) continue;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const data = await resp.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      const meta = result.meta || {};

      const prices = timestamps.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: quotes.open?.[i] ? Math.round(quotes.open[i] * 100) / 100 : null,
        high: quotes.high?.[i] ? Math.round(quotes.high[i] * 100) / 100 : null,
        low: quotes.low?.[i] ? Math.round(quotes.low[i] * 100) / 100 : null,
        close: quotes.close?.[i] ? Math.round(quotes.close[i] * 100) / 100 : null,
        volume: quotes.volume?.[i] || 0,
      })).filter(p => p.close !== null).slice(-days);

      // previousClose = 전일 종가 (미국 장 개장 여부에 따라 다름)
      // 장중: prices[-1]이 실시간 미확정 → prices[-2] 사용
      // 장외(주말/공휴일/장후): prices[-1]이 마지막 확정 종가 → prices[-1] 사용
      const now = new Date();
      const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
      const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const et = new Date(etStr);
      const day = et.getDay(); // 0=Sun, 6=Sat
      const mins = et.getHours() * 60 + et.getMinutes();
      const marketOpen = day >= 1 && day <= 5 && mins >= 570 && mins < 960; // Mon-Fri 9:30-16:00
      const lastDate = prices[prices.length - 1]?.date;

      // 장중 + 오늘 데이터가 있으면 → 전날 종가 (prices[-2])
      // 그 외 → 마지막 확정 종가 (prices[-1])
      const previousClose = (marketOpen && lastDate === todayET && prices.length >= 2)
        ? prices[prices.length - 2].close
        : (prices[prices.length - 1]?.close ?? null);

      return {
        ticker: meta.symbol || ticker,
        currency: meta.currency || 'USD',
        currentPrice: meta.regularMarketPrice ? Math.round(meta.regularMarketPrice * 100) / 100 : null,
        previousClose,
        prices,
      };
    } catch { continue; }
  }
  return null;
}

// Fallback: Yahoo quote page scraping (get current price from HTML meta)
async function tryYahooScrape(ticker) {
  try {
    const resp = await fetch(`https://finance.yahoo.com/quote/${ticker}/`, {
      headers: HEADERS,
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // Look for regularMarketPrice in the page data
    const match = html.match(/"regularMarketPrice":\s*\{[^}]*"raw":\s*([\d.]+)/);
    const prevMatch = html.match(/"regularMarketPreviousClose":\s*\{[^}]*"raw":\s*([\d.]+)/);
    if (!match) return null;
    return {
      ticker,
      currency: 'USD',
      currentPrice: Math.round(parseFloat(match[1]) * 100) / 100,
      previousClose: prevMatch ? Math.round(parseFloat(prevMatch[1]) * 100) / 100 : null,
      prices: [],
    };
  } catch { return null; }
}

// GET /api/price?ticker=TQQQ&days=10
export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const ticker = url.searchParams.get('ticker');
    const days = parseInt(url.searchParams.get('days') || '10', 10);

    if (!ticker || !/^[A-Z]{1,10}$/.test(ticker)) {
      return jsonResponse({ error: '올바른 종목 코드를 입력하세요.' }, 400);
    }

    // Try Yahoo chart API first (query2 then query1)
    const chartResult = await tryYahooChart(ticker, days);
    if (chartResult) return jsonResponse(chartResult);

    // Fallback: scrape Yahoo quote page
    const scrapeResult = await tryYahooScrape(ticker);
    if (scrapeResult) return jsonResponse(scrapeResult);

    return jsonResponse({ error: '주가 데이터를 가져올 수 없습니다. Yahoo Finance 접근이 제한되었습니다.' }, 502);
  } catch (e) {
    return jsonResponse({ error: '주가 조회 중 오류가 발생했습니다: ' + e.message }, 500);
  }
}
