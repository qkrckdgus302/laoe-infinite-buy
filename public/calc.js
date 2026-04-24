// ===== 라오어 무한매수법 V4.0 계산 엔진 =====

// T값 변화 배수 (리버스매도 시)
const REVERSE_RATIOS = { 20: 0.9, 30: 0.925, 40: 0.95 };

// 기본 목표수익률
function defaultTargetProfit(ticker) {
  return ticker === 'TQQQ' ? 15 : 20;
}

function getTargetProfit(ticker, custom) {
  return custom ?? defaultTargetProfit(ticker);
}

// T값 변화 계산
function updateTValue(t, type, splits) {
  switch (type) {
    case 'full_buy': return t + 1;
    case 'half_buy': return t + 0.5;
    case 'quarter_sell': return t * 0.75;
    case 'limit_sell': return t * 0.25;
    case 'limit_sell_buy_full': return t * 0.25 + 1;
    case 'limit_sell_buy_half': return t * 0.25 + 0.5;
    case 'buy_full_limit_sell': return t * 0.25 + 1;
    case 'buy_half_limit_sell': return t * 0.25 + 0.5;
    case 'reverse_sell': return t * (REVERSE_RATIOS[splits] ?? 0.9);
    case 'reverse_quarter_buy': return t + ((splits ?? 20) - t) * 0.25;
    case 'reverse_sell_buy': {
      const r = t * (REVERSE_RATIOS[splits] ?? 0.9);
      return r + ((splits ?? 20) - r) * 0.25;
    }
    default: return t;
  }
}

// 별% 계산: 목표수익률에서 T값에 따라 점진적으로 줄어듦
function calcStarPercent(ticker, splits, tValue, targetProfit) {
  const tp = getTargetProfit(ticker, targetProfit);
  return tp - tp * 2 / splits * tValue;
}

// 별가격 (매도 지점): 평단가 × (1 + 별%/100)
function calcStarPrice(avgPrice, starPercent) {
  return Math.round(avgPrice * (1 + starPercent / 100) * 100) / 100;
}

// 지정가매도 가격: 평단가 × (1 + 목표수익률/100)
function calcLimitSellPrice(avgPrice, ticker, targetProfit) {
  const tp = getTargetProfit(ticker, targetProfit);
  return Math.round(avgPrice * (1 + tp / 100) * 100) / 100;
}

// 1회 매수금
function calcBuyAmount(remainingCapital, splits, tValue) {
  const divisor = splits - tValue;
  return divisor <= 0 ? 0 : remainingCapital / divisor;
}

// 페이즈 판정
function calcPhase(tValue, splits, totalQuantity, hasTransactions) {
  if (totalQuantity === 0 && !hasTransactions) return '처음매수';
  if (totalQuantity === 0) return '종료';
  if (tValue >= splits - 1) return '소진모드';
  if (tValue < splits / 2) return '전반전';
  return '후반전';
}

// 핵심: 전체 상태 계산 (Mf 함수)
function calcState(settings, transactions, midEntry) {
  let tValue = midEntry?.tValue ?? 0;
  let avgPrice = midEntry?.avgPrice ?? 0;
  let totalQuantity = midEntry?.totalQuantity ?? 0;
  let totalInvested = midEntry ? midEntry.avgPrice * midEntry.totalQuantity : 0;
  let totalReturned = 0;

  for (const tx of transactions) {
    tValue = updateTValue(tValue, tx.type, settings.splits);

    switch (tx.type) {
      case 'full_buy':
      case 'half_buy':
      case 'reverse_quarter_buy': {
        const newQty = totalQuantity + tx.quantity;
        avgPrice = newQty > 0 ? (avgPrice * totalQuantity + tx.price * tx.quantity) / newQty : tx.price;
        totalQuantity = newQty;
        totalInvested += tx.price * tx.quantity;
        break;
      }
      case 'quarter_sell':
      case 'limit_sell':
      case 'reverse_sell': {
        totalQuantity = Math.max(0, totalQuantity - tx.quantity);
        totalReturned += tx.price * tx.quantity;
        break;
      }
      case 'limit_sell_buy_full':
      case 'limit_sell_buy_half':
      case 'reverse_sell_buy': {
        totalQuantity = Math.max(0, totalQuantity - (tx.sellQuantity ?? 0));
        totalReturned += (tx.sellPrice ?? 0) * (tx.sellQuantity ?? 0);
        const newQty = totalQuantity + tx.quantity;
        avgPrice = newQty > 0 ? (avgPrice * totalQuantity + tx.price * tx.quantity) / newQty : tx.price;
        totalQuantity = newQty;
        totalInvested += tx.price * tx.quantity;
        break;
      }
      case 'buy_full_limit_sell':
      case 'buy_half_limit_sell': {
        const newQty = totalQuantity + tx.quantity;
        avgPrice = newQty > 0 ? (avgPrice * totalQuantity + tx.price * tx.quantity) / newQty : tx.price;
        totalQuantity = newQty;
        totalInvested += tx.price * tx.quantity;
        totalQuantity = Math.max(0, totalQuantity - (tx.sellQuantity ?? 0));
        totalReturned += (tx.sellPrice ?? 0) * (tx.sellQuantity ?? 0);
        break;
      }
    }
  }

  const remainingCapital = settings.totalCapital - totalInvested + totalReturned;
  const starPercent = calcStarPercent(settings.ticker, settings.splits, tValue, settings.targetProfit);
  const starPrice = avgPrice > 0 ? calcStarPrice(avgPrice, starPercent) : 0;
  const buyPoint = starPrice > 0 ? Math.round((starPrice - 0.01) * 100) / 100 : 0;
  const sellPoint = starPrice;
  const limitSellPrice = avgPrice > 0 ? calcLimitSellPrice(avgPrice, settings.ticker, settings.targetProfit) : 0;
  const buyAmount = calcBuyAmount(remainingCapital, settings.splits, tValue);
  const phase = calcPhase(tValue, settings.splits, totalQuantity, transactions.length > 0);

  return {
    tValue,
    avgPrice: Math.round(avgPrice * 1e4) / 1e4,
    totalQuantity,
    remainingCapital: Math.round(remainingCapital * 100) / 100,
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalReturned: Math.round(totalReturned * 100) / 100,
    starPercent: Math.round(starPercent * 100) / 100,
    starPrice,
    buyPoint,
    sellPoint,
    limitSellPrice,
    buyAmount: Math.round(buyAmount * 100) / 100,
    isFirstHalf: tValue < settings.splits / 2,
    phase
  };
}

// 주문 생성 (Ap 함수)
function generateOrders(state, settings, reverseInfo, lastClosePrice) {
  const orders = [];
  if (state.phase === '종료') return orders;

  // 처음매수: 큰수 LOC 매수 + 추가 하방 LOC
  if (state.phase === '처음매수') {
    if (!lastClosePrice || state.buyAmount <= 0) return orders;
    const bigNumPrice = Math.round(lastClosePrice * 1.12 * 100) / 100;
    const mainQty = Math.max(1, Math.floor(state.buyAmount / bigNumPrice));
    orders.push({ label: '큰수매수', type: 'buy', method: 'LOC', price: bigNumPrice, quantity: mainQty });
    for (let i = 1; i <= 8; i++) {
      const p = Math.floor(state.buyAmount / (mainQty + i) * 100) / 100;
      if (p < 1) break;
      orders.push({ label: '', type: 'buy', method: 'LOC', price: p, quantity: 1 });
    }
    return orders;
  }

  // 리버스 모드
  if (reverseInfo) {
    const halfSplits = settings.splits / 2;
    const sellQty = state.totalQuantity > 0 ? Math.max(1, Math.floor(state.totalQuantity / halfSplits)) : 0;

    if (reverseInfo.isFirstDay) {
      if (sellQty > 0) {
        orders.push({ label: 'MOC 처음매도', type: 'sell', method: 'MOC', price: 0, quantity: sellQty });
      }
    } else {
      if (sellQty > 0 && reverseInfo.starPrice > 0) {
        orders.push({ label: '★ 리버스매도', type: 'sell', method: 'LOC', price: reverseInfo.starPrice, quantity: sellQty });
      }
      const quarterBudget = state.remainingCapital / 4;
      if (quarterBudget > 0 && reverseInfo.starPrice > 0) {
        const buyPrice = Math.round((reverseInfo.starPrice - 0.01) * 100) / 100;
        const mainQty = Math.max(1, Math.floor(quarterBudget / buyPrice));
        orders.push({ label: '쿼터매수', type: 'buy', method: 'LOC', price: buyPrice, quantity: mainQty });
        for (let i = 1; i <= 8; i++) {
          const p = Math.floor(quarterBudget / (mainQty + i) * 100) / 100;
          if (p < 1) break;
          orders.push({ label: '', type: 'buy', method: 'LOC', price: p, quantity: 1 });
        }
      }
    }
    return orders;
  }

  // 일반 모드
  const { avgPrice, buyPoint, sellPoint, limitSellPrice, buyAmount, totalQuantity, isFirstHalf } = state;
  const bigNum = lastClosePrice ? Math.round(lastClosePrice * 1.12 * 100) / 100 : 0;
  const effectiveBuyPrice = (bigNum > 0 && bigNum < buyPoint) ? bigNum : buyPoint;
  const isBigNum = bigNum > 0 && bigNum < buyPoint;

  // 매수 주문
  if (buyAmount > 0 && buyPoint > 0) {
    let mainQty;
    const label = isBigNum ? '★ 큰수' : '★ 별지점';

    if (isFirstHalf) {
      const halfBudget = buyAmount / 2;
      const fullQty = Math.max(1, Math.floor(buyAmount / avgPrice));
      const starQty = Math.max(1, Math.floor(halfBudget / effectiveBuyPrice));
      const avgQty = Math.max(1, fullQty - starQty);
      mainQty = starQty + avgQty;
      orders.push({ label, type: 'buy', method: 'LOC', price: effectiveBuyPrice, quantity: starQty });
      orders.push({ label: '평단가', type: 'buy', method: 'LOC', price: avgPrice, quantity: avgQty });
    } else {
      mainQty = Math.max(1, Math.floor(buyAmount / effectiveBuyPrice));
      orders.push({ label, type: 'buy', method: 'LOC', price: effectiveBuyPrice, quantity: mainQty });
    }

    for (let i = 1; i <= 8; i++) {
      const p = Math.floor(buyAmount / (mainQty + i) * 100) / 100;
      if (p < 1) break;
      orders.push({ label: '', type: 'buy', method: 'LOC', price: p, quantity: 1 });
    }
  }

  // 매도 주문
  if (totalQuantity > 0 && sellPoint > 0) {
    const quarterQty = Math.max(1, Math.floor(totalQuantity / 4));
    const restQty = totalQuantity - quarterQty;
    orders.push({ label: '★ 쿼터매도', type: 'sell', method: 'LOC', price: sellPoint, quantity: quarterQty });
    if (restQty > 0) {
      const tp = getTargetProfit(settings.ticker, settings.targetProfit);
      orders.push({ label: `${tp}% 지정가`, type: 'sell', method: '지정가', price: limitSellPrice, quantity: restQty });
    }
  }

  return orders;
}

// 히스토리 차트 데이터
function calcHistory(settings, transactions, midEntry) {
  const result = [];
  for (let i = 1; i <= transactions.length; i++) {
    const s = calcState(settings, transactions.slice(0, i), midEntry);
    result.push({
      date: transactions[i - 1].date,
      tValue: s.tValue,
      avgPrice: s.avgPrice,
      remainingCapital: s.remainingCapital,
      totalQuantity: s.totalQuantity
    });
  }
  return result;
}

// 거래유형 목록
const TRANSACTION_TYPES = [
  { type: 'full_buy', label: '1회 매수', desc: 'T + 1', group: 'buy' },
  { type: 'half_buy', label: '절반 매수', desc: 'T + 0.5', group: 'buy' },
  { type: 'quarter_sell', label: '쿼터매도', desc: 'T × 0.75', group: 'sell' },
  { type: 'limit_sell', label: '지정가매도', desc: 'T × 0.25', group: 'sell' },
  { type: 'limit_sell_buy_full', label: '지정가매도 + 1회매수', desc: 'T×0.25 + 1', group: 'combined' },
  { type: 'limit_sell_buy_half', label: '지정가매도 + 절반매수', desc: 'T×0.25 + 0.5', group: 'combined' },
  { type: 'buy_full_limit_sell', label: '1회매수 + 지정가매도(애프터)', desc: 'T×0.25 + 1', group: 'combined' },
  { type: 'buy_half_limit_sell', label: '절반매수 + 지정가매도(애프터)', desc: 'T×0.25 + 0.5', group: 'combined' }
];

function getReverseTypes(splits) {
  const ratio = REVERSE_RATIOS[splits] ?? 0.9;
  return [
    { type: 'reverse_sell', label: '리버스 매도', desc: `T × ${ratio}`, group: 'sell' },
    { type: 'reverse_quarter_buy', label: '쿼터매수', desc: `T+(${splits}-T)×0.25`, group: 'buy' },
    { type: 'reverse_sell_buy', label: '리버스매도 + 쿼터매수', desc: '매도+매수', group: 'combined' }
  ];
}
