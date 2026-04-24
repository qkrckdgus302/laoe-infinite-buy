// 무한매수법 계산기
(function () {
    'use strict';

    // --- 상태 ---
    const state = {
        ticker: 'TQQQ',
        divisions: 30,
        targetRate: 15,
        entryMode: 'new',
        principal: 0
    };

    // --- 버튼 그룹 토글 ---
    function setupButtonGroup(groupId, stateKey) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.addEventListener('click', function (e) {
            const btn = e.target.closest('.btn');
            if (!btn) return;
            group.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.dataset.value;
            state[stateKey] = isNaN(val) ? val : Number(val);
        });
    }

    setupButtonGroup('ticker-group', 'ticker');
    setupButtonGroup('division-group', 'divisions');
    setupButtonGroup('entry-group', 'entryMode');

    // --- 입력 바인딩 ---
    const targetRateInput = document.getElementById('target-rate');
    const principalInput = document.getElementById('principal');

    if (targetRateInput) {
        targetRateInput.addEventListener('input', function () {
            state.targetRate = Number(this.value) || 15;
        });
    }

    if (principalInput) {
        principalInput.addEventListener('input', function () {
            state.principal = Number(this.value) || 0;
        });
    }

    // --- 시작 버튼 ---
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
        btnStart.addEventListener('click', function () {
            if (state.principal <= 0) {
                alert('원금을 입력해주세요.');
                return;
            }
            calculate();
        });
    }

    // --- 무한매수법 계산 로직 ---
    function calculate() {
        const { divisions, targetRate, principal } = state;

        // 1회차 매수 금액 (원금 / 분할 수)
        const perBuy = principal / divisions;

        // 가상의 현재가 (편의상 $100 기준으로 시뮬레이션)
        const startPrice = 100;

        const rows = [];
        let totalInvested = 0;
        let totalShares = 0;

        for (let i = 1; i <= divisions; i++) {
            // 무한매수법: 매 회차 -3%씩 하락한다고 가정하여 매수 테이블 생성
            // 실제로는 매일 매수하며, 가격 변동에 따라 수량 조절
            const dropRate = (i - 1) * 0.03;
            const buyPrice = +(startPrice * (1 - dropRate)).toFixed(2);

            if (buyPrice <= 0) break;

            const shares = +(perBuy / buyPrice).toFixed(4);
            totalInvested += perBuy;
            totalShares += shares;
            const avgPrice = +(totalInvested / totalShares).toFixed(2);

            rows.push({
                round: i,
                buyPrice,
                shares,
                buyAmount: +perBuy.toFixed(2),
                totalInvested: +totalInvested.toFixed(2),
                avgPrice
            });
        }

        const lastRow = rows[rows.length - 1];
        const avgPrice = lastRow.avgPrice;
        const sellPrice = +(avgPrice * (1 + targetRate / 100)).toFixed(2);
        const totalValue = +(totalShares * sellPrice).toFixed(2);
        const profit = +(totalValue - totalInvested).toFixed(2);

        renderResult(rows, {
            perBuy: +perBuy.toFixed(2),
            avgPrice,
            sellPrice,
            totalInvested: +totalInvested.toFixed(2),
            totalShares: +totalShares.toFixed(4),
            totalValue,
            profit
        });
    }

    // --- 결과 렌더링 ---
    function renderResult(rows, info) {
        const resultSection = document.getElementById('result-section');
        const summary = document.getElementById('summary');
        const tbody = document.querySelector('#buy-table tbody');
        const sellInfo = document.getElementById('sell-info');

        if (!resultSection) return;

        resultSection.style.display = 'block';

        summary.innerHTML = `
            <div class="summary-card">
                <div class="label">1회 매수금액</div>
                <div class="value">$${info.perBuy}</div>
            </div>
            <div class="summary-card">
                <div class="label">평균 단가</div>
                <div class="value">$${info.avgPrice}</div>
            </div>
            <div class="summary-card">
                <div class="label">총 투자금</div>
                <div class="value">$${info.totalInvested}</div>
            </div>
            <div class="summary-card">
                <div class="label">총 보유 수량</div>
                <div class="value">${info.totalShares}주</div>
            </div>
        `;

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.round}</td>
                <td>$${r.buyPrice}</td>
                <td>${r.shares}</td>
                <td>$${r.buyAmount}</td>
                <td>$${r.totalInvested}</td>
                <td>$${r.avgPrice}</td>
            </tr>
        `).join('');

        sellInfo.innerHTML = `
            <h3>목표 매도 정보</h3>
            <p>평단가 <span class="highlight">$${info.avgPrice}</span> 기준, 
            목표 수익률 <span class="highlight">${state.targetRate}%</span> 달성 시</p>
            <p>매도가: <span class="highlight">$${info.sellPrice}</span></p>
            <p>예상 총 자산: <span class="highlight">$${info.totalValue}</span> 
            (수익: <span class="highlight">+$${info.profit}</span>)</p>
        `;

        resultSection.scrollIntoView({ behavior: 'smooth' });
    }
})();
