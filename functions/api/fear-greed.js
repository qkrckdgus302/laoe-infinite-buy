import { corsHeaders, jsonResponse } from '../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

const RATING_KO = {
  'extreme fear': '극단적 공포',
  'fear': '공포',
  'neutral': '중립',
  'greed': '탐욕',
  'extreme greed': '극단적 탐욕',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.cnn.com/markets/fear-and-greed',
};

// Try CNN production API
async function tryCNN() {
  const urls = [
    'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
    'https://production.dataviz.cnn.io/index/fearandgreed/current',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers: HEADERS });
      if (!resp.ok) continue;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const data = await resp.json();
      const fg = data?.fear_and_greed || data;
      const score = fg?.score;
      const rating = fg?.rating;
      if (score == null) continue;
      return {
        score: Math.round(score),
        rating: rating || null,
        ratingKo: RATING_KO[rating?.toLowerCase()] || rating || null,
        timestamp: fg?.timestamp || null,
      };
    } catch { continue; }
  }
  return null;
}

// Fallback: scrape CNN fear & greed page
async function tryCNNScrape() {
  try {
    const resp = await fetch('https://www.cnn.com/markets/fear-and-greed', {
      headers: HEADERS,
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // Look for fear greed score in page data
    const match = html.match(/"score"\s*:\s*([\d.]+)/);
    const ratingMatch = html.match(/"rating"\s*:\s*"([^"]+)"/);
    if (!match) return null;
    const score = Math.round(parseFloat(match[1]));
    const rating = ratingMatch ? ratingMatch[1] : null;
    return {
      score,
      rating,
      ratingKo: RATING_KO[rating?.toLowerCase()] || rating || null,
      timestamp: null,
    };
  } catch { return null; }
}

// GET /api/fear-greed
export async function onRequestGet() {
  try {
    const cnnResult = await tryCNN();
    if (cnnResult) return jsonResponse(cnnResult);

    const scrapeResult = await tryCNNScrape();
    if (scrapeResult) return jsonResponse(scrapeResult);

    return jsonResponse({ error: '공포탐욕지수를 가져올 수 없습니다.' }, 502);
  } catch (e) {
    return jsonResponse({ error: '공포탐욕지수 조회 중 오류가 발생했습니다: ' + e.message }, 500);
  }
}
