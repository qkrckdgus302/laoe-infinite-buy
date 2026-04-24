import { corsHeaders, jsonResponse } from '../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
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

    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86400 * 1.5; // extra buffer for weekends

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(from)}&period2=${to}&interval=1d`;

    const resp = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!resp.ok) {
      return jsonResponse({ error: '주가 데이터를 가져올 수 없습니다.' }, 502);
    }

    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return jsonResponse({ error: '종목을 찾을 수 없습니다.' }, 404);
    }

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

    return jsonResponse({
      ticker: meta.symbol || ticker,
      currency: meta.currency || 'USD',
      currentPrice: meta.regularMarketPrice ? Math.round(meta.regularMarketPrice * 100) / 100 : null,
      previousClose: meta.chartPreviousClose ? Math.round(meta.chartPreviousClose * 100) / 100 : null,
      prices,
    });
  } catch (e) {
    return jsonResponse({ error: '주가 조회 중 오류가 발생했습니다.' }, 500);
  }
}
