import { corsHeaders, jsonResponse } from '../utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/fear-greed
export async function onRequestGet() {
  try {
    const resp = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!resp.ok) {
      return jsonResponse({ error: '공포탐욕지수를 가져올 수 없습니다.' }, 502);
    }

    const data = await resp.json();
    const score = data?.fear_and_greed?.score;
    const rating = data?.fear_and_greed?.rating;

    const ratingKo = {
      'extreme fear': '극단적 공포',
      'fear': '공포',
      'neutral': '중립',
      'greed': '탐욕',
      'extreme greed': '극단적 탐욕',
    };

    return jsonResponse({
      score: score != null ? Math.round(score) : null,
      rating: rating || null,
      ratingKo: ratingKo[rating?.toLowerCase()] || rating || null,
      timestamp: data?.fear_and_greed?.timestamp || null,
    });
  } catch (e) {
    return jsonResponse({ error: '공포탐욕지수 조회 중 오류가 발생했습니다.' }, 500);
  }
}
