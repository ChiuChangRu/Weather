(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const PLUS = '#e8734a';
  const MINUS = '#4a7de8';
  const NUCLEUS = '#22262f';

  const ORBITAL_TYPES = [
    { key: 's-s', label: 's + s（σ 軌域）' },
    { key: 'p-sigma', label: 'p + p，首尾相接（σ 軌域）' },
    { key: 'p-pi', label: 'p + p，側邊相疊（π 軌域）' },
  ];

  const state = { kind: 's-s', R: 120, electrons: 2 };

  function el(tag, attrs, children) {
    const node = document.createElementNS(SVGNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function lobeCircle(cx, cy, r, color) {
    return el('circle', { cx, cy, r, fill: color, 'fill-opacity': 0.55, stroke: color, 'stroke-width': 1.5 });
  }
  function lobeEllipse(cx, cy, rx, ry, color) {
    return el('ellipse', { cx, cy, rx, ry, fill: color, 'fill-opacity': 0.55, stroke: color, 'stroke-width': 1.5 });
  }
  function nucleusMarker(cx, cy, label) {
    const g = el('g', {});
    g.appendChild(el('circle', { cx, cy, r: 4.5, fill: NUCLEUS }));
    const t = el('text', { x: cx, y: cy + 24, 'text-anchor': 'middle', 'font-size': 13, fill: '#555' });
    t.textContent = `原子核 ${label}`;
    g.appendChild(t);
    return g;
  }
  function nodeLineVertical(x, cy, halfLen) {
    const g = el('g', {});
    g.appendChild(
      el('line', { x1: x, y1: cy - halfLen, x2: x, y2: cy + halfLen, stroke: '#888', 'stroke-width': 1.5, 'stroke-dasharray': '4,4' })
    );
    const t = el('text', { x, y: cy - halfLen - 8, 'text-anchor': 'middle', 'font-size': 12, fill: '#888' });
    t.textContent = '節面';
    g.appendChild(t);
    return g;
  }
  function nodeLineHorizontal(x1, x2, y, pad) {
    const g = el('g', {});
    g.appendChild(
      el('line', { x1: x1 - pad * 0.3, y1: y, x2: x2 + pad * 0.3, y2: y, stroke: '#888', 'stroke-width': 1.5, 'stroke-dasharray': '4,4' })
    );
    const t = el('text', { x: (x1 + x2) / 2, y: y - 8, 'text-anchor': 'middle', 'font-size': 12, fill: '#888' });
    t.textContent = '節面';
    g.appendChild(t);
    return g;
  }

  function buildOrbitalPanel(kind, R, mode) {
    const cy = 120;
    const half = Math.min(Math.max(R, 60), 200) / 2;
    const Ax = 220 - half;
    const Bx = 220 + half;
    const g = el('g', {});

    if (kind === 's-s') {
      const colorB = mode === 'bonding' ? PLUS : MINUS;
      g.appendChild(lobeCircle(Ax, cy, 42, PLUS));
      g.appendChild(lobeCircle(Bx, cy, 42, colorB));
      if (mode === 'antibonding') g.appendChild(nodeLineVertical((Ax + Bx) / 2, cy, 70));
    } else if (kind === 'p-sigma') {
      const off = 26, rx = 30, ry = 20;
      g.appendChild(lobeEllipse(Ax - off, cy, rx, ry, MINUS));
      g.appendChild(lobeEllipse(Ax + off, cy, rx, ry, PLUS));
      const innerB = mode === 'bonding' ? PLUS : MINUS;
      const outerB = mode === 'bonding' ? MINUS : PLUS;
      g.appendChild(lobeEllipse(Bx - off, cy, rx, ry, innerB));
      g.appendChild(lobeEllipse(Bx + off, cy, rx, ry, outerB));
      if (mode === 'antibonding') g.appendChild(nodeLineVertical((Ax + Bx) / 2, cy, 70));
    } else {
      const off = 26, rx = 20, ry = 30;
      g.appendChild(lobeEllipse(Ax, cy - off, rx, ry, PLUS));
      g.appendChild(lobeEllipse(Ax, cy + off, rx, ry, MINUS));
      const topB = mode === 'bonding' ? PLUS : MINUS;
      const bottomB = mode === 'bonding' ? MINUS : PLUS;
      g.appendChild(lobeEllipse(Bx, cy - off, rx, ry, topB));
      g.appendChild(lobeEllipse(Bx, cy + off, rx, ry, bottomB));
      if (mode === 'antibonding') g.appendChild(nodeLineHorizontal(Ax, Bx, cy, 40));
    }

    g.appendChild(nucleusMarker(Ax, cy, 'A'));
    g.appendChild(nucleusMarker(Bx, cy, 'B'));
    return g;
  }

  function renderOrbitalPanels() {
    const bondingSvg = document.getElementById('svg-bonding');
    const antibondingSvg = document.getElementById('svg-antibonding');
    bondingSvg.innerHTML = '';
    antibondingSvg.innerHTML = '';
    bondingSvg.appendChild(buildOrbitalPanel(state.kind, state.R, 'bonding'));
    antibondingSvg.appendChild(buildOrbitalPanel(state.kind, state.R, 'antibonding'));
  }

  function levelLabel(kind) {
    if (kind === 'p-pi') return { bonding: 'π', antibonding: 'π*' };
    return { bonding: 'σ', antibonding: 'σ*' };
  }

  function electronArrow(cx, cy, up) {
    const y1 = up ? cy + 10 : cy - 10;
    const y2 = up ? cy - 10 : cy + 10;
    const g = el('g', {});
    g.appendChild(el('line', { x1: cx, y1, x2: cx, y2, stroke: '#1f2430', 'stroke-width': 2 }));
    const headY = y2;
    const dir = up ? -1 : 1;
    g.appendChild(
      el('polygon', {
        points: `${cx - 4},${headY - dir * 6} ${cx + 4},${headY - dir * 6} ${cx},${headY}`,
        fill: '#1f2430',
      })
    );
    return g;
  }

  function renderEnergyDiagram() {
    const svg = document.getElementById('svg-energy');
    svg.innerHTML = '';
    const g = el('g', {});
    const yAO = 130, yBonding = 190, yAntibonding = 70;
    const xAOLeft = 130, xAORight = 770, xMOLeft = 380, xMORight = 520;
    const labels = levelLabel(state.kind);

    [
      [xAOLeft, yBonding], [xAOLeft, yAntibonding],
      [xAORight, yBonding], [xAORight, yAntibonding],
    ].forEach(([ax, my]) => {
      g.appendChild(el('line', { x1: ax, y1: yAO, x2: (ax < 450 ? xMOLeft : xMORight), y2: my, stroke: '#c9cfe6', 'stroke-width': 1.5, 'stroke-dasharray': '3,4' }));
    });

    function levelLine(x1, x2, y, color, text) {
      g.appendChild(el('line', { x1, y1: y, x2, y2: y, stroke: color, 'stroke-width': 3 }));
      const t = el('text', { x: (x1 + x2) / 2, y: y - 10, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': '700', fill: color });
      t.textContent = text;
      g.appendChild(t);
    }

    levelLine(xAOLeft - 40, xAOLeft + 40, yAO, '#667085', '原子軌域 A');
    levelLine(xAORight - 40, xAORight + 40, yAO, '#667085', '原子軌域 B');
    levelLine(xMOLeft, xMORight, yBonding, '#1e824c', labels.bonding + '（鍵結）');
    levelLine(xMOLeft, xMORight, yAntibonding, '#b3541e', labels.antibonding + '（反鍵結）');

    const nBonding = Math.min(state.electrons, 2);
    const nAntibonding = Math.max(state.electrons - 2, 0);
    const cx = (xMOLeft + xMORight) / 2;
    if (nBonding >= 1) g.appendChild(electronArrow(cx - 10, yBonding, true));
    if (nBonding >= 2) g.appendChild(electronArrow(cx + 10, yBonding, false));
    if (nAntibonding >= 1) g.appendChild(electronArrow(cx - 10, yAntibonding, true));
    if (nAntibonding >= 2) g.appendChild(electronArrow(cx + 10, yAntibonding, false));

    svg.appendChild(g);

    const bondOrder = (nBonding - nAntibonding) / 2;
    const textEl = document.getElementById('bond-order-text');
    let msg = `鍵級 = (鍵結電子數 − 反鍵結電子數) / 2 = (${nBonding} − ${nAntibonding}) / 2 = ${bondOrder}。`;
    if (bondOrder <= 0) {
      msg += ' 鍵級為 0（或以下），代表反鍵結抵消了鍵結效果，這兩個原子不會形成穩定共價鍵（例如 He₂ 的情形）。';
      textEl.className = 'status-line warn';
    } else {
      msg += ` 鍵級大於 0，代表可以形成穩定的 ${labels.bonding} 共價鍵。`;
      textEl.className = 'status-line success';
    }
    textEl.textContent = msg;
  }

  function lennardJones(x) {
    return Math.pow(1 / x, 12) - 2 * Math.pow(1 / x, 6);
  }

  function renderPotentialCurve() {
    const svg = document.getElementById('svg-curve');
    svg.innerHTML = '';
    const g = el('g', {});

    const xMin = 40, xMax = 860, yTop = 20, yBottom = 160;
    const normMin = 0.45, normMax = 3.0;
    const eMin = -1.3, eMax = 1.3;

    function xToPx(xNorm) {
      return xMin + ((xNorm - normMin) / (normMax - normMin)) * (xMax - xMin);
    }
    function eToPx(e) {
      const clamped = Math.max(eMin, Math.min(eMax, e));
      return yTop + ((eMax - clamped) / (eMax - eMin)) * (yBottom - yTop);
    }

    const zeroY = eToPx(0);
    g.appendChild(el('line', { x1: xMin, y1: zeroY, x2: xMax, y2: zeroY, stroke: '#c9cfe6', 'stroke-width': 1 }));
    const zeroLabel = el('text', { x: xMax, y: zeroY - 6, 'text-anchor': 'end', 'font-size': 11, fill: '#888' });
    zeroLabel.textContent = 'E = 0（原子相距無限遠）';
    g.appendChild(zeroLabel);

    const eqX = xToPx(1);
    g.appendChild(el('line', { x1: eqX, y1: yTop, x2: eqX, y2: yBottom, stroke: '#c9cfe6', 'stroke-width': 1, 'stroke-dasharray': '3,4' }));
    const eqLabel = el('text', { x: eqX, y: yTop - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#888' });
    eqLabel.textContent = '平衡鍵長 Rₑ';
    g.appendChild(eqLabel);

    let d = '';
    for (let i = 0; i <= 200; i++) {
      const xNorm = normMin + (i / 200) * (normMax - normMin);
      const e = lennardJones(xNorm);
      const px = xToPx(xNorm);
      const py = eToPx(e);
      d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1) + ' ';
    }
    g.appendChild(el('path', { d, fill: 'none', stroke: '#3b5bdb', 'stroke-width': 2.5 }));

    const xNormCurrent = 0.5 + ((state.R - 60) / (220 - 60)) * (2.5 - 0.5);
    const curPx = xToPx(xNormCurrent);
    const curE = lennardJones(xNormCurrent);
    const curPy = eToPx(curE);
    g.appendChild(el('line', { x1: curPx, y1: curPy, x2: curPx, y2: yBottom, stroke: '#e8734a', 'stroke-width': 1.5, 'stroke-dasharray': '3,3' }));
    g.appendChild(el('circle', { cx: curPx, cy: curPy, r: 5.5, fill: '#e8734a' }));

    svg.appendChild(g);

    const textEl = document.getElementById('curve-text');
    if (xNormCurrent < 0.8) {
      textEl.textContent = '目前距離過近：原子核之間的排斥力上升，位能升高，系統不穩定。';
      textEl.className = 'status-line warn';
    } else if (xNormCurrent <= 1.25) {
      textEl.textContent = '目前距離接近平衡鍵長，位能接近最低點，是最穩定的鍵結距離。';
      textEl.className = 'status-line success';
    } else {
      textEl.textContent = '目前距離過遠：軌域重疊太少，鍵結作用很弱，位能趨近於 0。';
      textEl.className = 'status-line';
    }
  }

  function renderAll() {
    renderOrbitalPanels();
    renderEnergyDiagram();
    renderPotentialCurve();
  }

  // ---- 真實 Hartree–Fock:H₂ / STO-3G 基底 ----
  // 即時計算高斯基底的重疊/動能/核吸引/電子互斥積分,組出 RHF 能量
  const HF = (() => {
    const ALPHA = [3.42525091, 0.62391373, 0.1688554];
    const DCOEF = [0.15432897, 0.53532814, 0.44463454].map(
      (d, i) => d * Math.pow((2 * ALPHA[i]) / Math.PI, 0.75)
    );

    function erf(x) {
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x);
      const t = 1 / (1 + 0.3275911 * x);
      const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
          t *
          Math.exp(-x * x);
      return sign * y;
    }
    function F0(t) {
      if (t < 1e-8) return 1 - t / 3;
      return 0.5 * Math.sqrt(Math.PI / t) * erf(Math.sqrt(t));
    }
    function sPrim(a, b, rab2) {
      const p = a + b;
      return Math.pow(Math.PI / p, 1.5) * Math.exp((-a * b * rab2) / p);
    }
    function tPrim(a, b, rab2) {
      const p = a + b;
      const mu = (a * b) / p;
      return mu * (3 - 2 * mu * rab2) * Math.pow(Math.PI / p, 1.5) * Math.exp(-mu * rab2);
    }
    function vPrim(a, b, xa, xb, xc) {
      const p = a + b;
      const xp = (a * xa + b * xb) / p;
      return ((-2 * Math.PI) / p) * Math.exp((-a * b * (xa - xb) * (xa - xb)) / p) * F0(p * (xp - xc) * (xp - xc));
    }
    function eriPrim(a, b, c, d, xa, xb, xc, xd) {
      const p = a + b;
      const q = c + d;
      const xp = (a * xa + b * xb) / p;
      const xq = (c * xc + d * xd) / q;
      return (
        ((2 * Math.pow(Math.PI, 2.5)) / (p * q * Math.sqrt(p + q))) *
        Math.exp((-a * b * (xa - xb) * (xa - xb)) / p - (c * d * (xc - xd) * (xc - xd)) / q) *
        F0(((p * q) / (p + q)) * (xp - xq) * (xp - xq))
      );
    }
    function contract2(fn, xa, xb) {
      let s = 0;
      const rab2 = (xa - xb) * (xa - xb);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += DCOEF[i] * DCOEF[j] * fn(ALPHA[i], ALPHA[j], rab2);
      return s;
    }
    function contractV(xa, xb, xc) {
      let s = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += DCOEF[i] * DCOEF[j] * vPrim(ALPHA[i], ALPHA[j], xa, xb, xc);
      return s;
    }
    function contractERI(xa, xb, xc, xd) {
      let s = 0;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          for (let k = 0; k < 3; k++)
            for (let l = 0; l < 3; l++)
              s += DCOEF[i] * DCOEF[j] * DCOEF[k] * DCOEF[l] * eriPrim(ALPHA[i], ALPHA[j], ALPHA[k], ALPHA[l], xa, xb, xc, xd);
      return s;
    }
    // H₂ 在核間距 R(bohr)的 RHF 總能量(hartree)
    // 對稱雙原子的最低 MO = (φ1+φ2)/√(2(1+S)),即為收斂的 SCF 解
    function energy(R) {
      const x1 = 0;
      const x2 = R;
      const s = contract2(sPrim, x1, x2);
      const h11 = contract2(tPrim, x1, x1) + contractV(x1, x1, x1) + contractV(x1, x1, x2);
      const h12 = contract2(tPrim, x1, x2) + contractV(x1, x2, x1) + contractV(x1, x2, x2);
      const A = contractERI(x1, x1, x1, x1); // (11|11)
      const B = contractERI(x1, x1, x2, x2); // (11|22)
      const C = contractERI(x1, x2, x1, x2); // (12|12)
      const D = contractERI(x1, x1, x1, x2); // (11|12)
      const Eelec = (2 * (h11 + h12)) / (1 + s) + (A + B + 2 * C + 4 * D) / (2 * (1 + s) * (1 + s));
      return Eelec + 1 / R;
    }
    return { energy };
  })();

  const BOHR = 0.529177;

  function runHF() {
    const btn = document.getElementById('btn-hf');
    const svg = document.getElementById('svg-hf');
    const textEl = document.getElementById('hf-text');
    btn.disabled = true;

    const pts = [];
    for (let R = 0.7; R <= 5.0001; R += 0.043) pts.push({ R, E: HF.energy(R) });
    let best = pts[0];
    pts.forEach((p) => {
      if (p.E < best.E) best = p;
    });
    let bR = best.R;
    let bE = best.E;
    for (let R = best.R - 0.06; R <= best.R + 0.06; R += 0.001) {
      const E = HF.energy(R);
      if (E < bE) {
        bE = E;
        bR = R;
      }
    }

    // 繪圖範圍
    const xMinA = 0.3;
    const xMaxA = 2.7;
    const eMax = Math.max(...pts.filter((p) => p.R * BOHR <= xMaxA).map((p) => p.E)) + 0.02;
    const eMin = bE - 0.02;
    const L = 70, Rm = 20, T = 14, Bm = 34;
    const W = 900, Hh = 240;
    const xPx = (Ra) => L + ((Ra - xMinA) / (xMaxA - xMinA)) * (W - L - Rm);
    const yPx = (E) => T + ((eMax - E) / (eMax - eMin)) * (Hh - T - Bm);

    svg.innerHTML = '';
    const g = el('g', {});
    svg.appendChild(g);
    // 座標軸
    g.appendChild(el('line', { x1: L, y1: T, x2: L, y2: Hh - Bm, stroke: '#99a1b3', 'stroke-width': 1 }));
    g.appendChild(el('line', { x1: L, y1: Hh - Bm, x2: W - Rm, y2: Hh - Bm, stroke: '#99a1b3', 'stroke-width': 1 }));
    for (let xa = 0.5; xa <= 2.6; xa += 0.5) {
      const px = xPx(xa);
      g.appendChild(el('line', { x1: px, y1: Hh - Bm, x2: px, y2: Hh - Bm + 4, stroke: '#99a1b3', 'stroke-width': 1 }));
      const t = el('text', { x: px, y: Hh - Bm + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#667085' });
      t.textContent = xa.toFixed(1);
      g.appendChild(t);
    }
    const xl = el('text', { x: (L + W - Rm) / 2, y: Hh - 4, 'text-anchor': 'middle', 'font-size': 11, fill: '#667085' });
    xl.textContent = '核間距 R(Å)';
    g.appendChild(xl);
    for (let ev = Math.ceil(eMin * 10) / 10; ev <= eMax; ev += 0.1) {
      const py = yPx(ev);
      g.appendChild(el('line', { x1: L - 4, y1: py, x2: L, y2: py, stroke: '#99a1b3', 'stroke-width': 1 }));
      const t = el('text', { x: L - 7, y: py + 3.5, 'text-anchor': 'end', 'font-size': 10.5, fill: '#667085' });
      t.textContent = ev.toFixed(1);
      g.appendChild(t);
    }
    const yl = el('text', {
      x: 14, y: (T + Hh - Bm) / 2, 'text-anchor': 'middle', 'font-size': 11, fill: '#667085',
      transform: `rotate(-90 14 ${(T + Hh - Bm) / 2})`,
    });
    yl.textContent = 'E(hartree)';
    g.appendChild(yl);
    // 實驗鍵長參考線
    const expX = xPx(0.741);
    g.appendChild(el('line', { x1: expX, y1: T, x2: expX, y2: Hh - Bm, stroke: '#e8940a', 'stroke-width': 1, 'stroke-dasharray': '4,4' }));
    const expT = el('text', { x: expX + 4, y: T + 12, 'font-size': 10.5, fill: '#e8940a' });
    expT.textContent = '實驗值 0.741 Å';
    g.appendChild(expT);

    const path = el('path', { d: '', fill: 'none', stroke: '#3b5bdb', 'stroke-width': 2.5 });
    g.appendChild(path);

    // 逐點掃描動畫
    let i = 0;
    let d = '';
    const drawn = pts.filter((p) => p.R * BOHR <= xMaxA);
    const frame = () => {
      for (let k = 0; k < 3 && i < drawn.length; k++, i++) {
        const p = drawn[i];
        d += (d ? 'L' : 'M') + xPx(p.R * BOHR).toFixed(1) + ',' + yPx(p.E).toFixed(1) + ' ';
      }
      path.setAttribute('d', d);
      if (i < drawn.length) {
        textEl.textContent = `掃描中… R = ${(drawn[Math.min(i, drawn.length - 1)].R * BOHR).toFixed(2)} Å,每一點都即時計算所有積分`;
        textEl.className = 'status-line';
        requestAnimationFrame(frame);
      } else {
        const mpx = xPx(bR * BOHR);
        const mpy = yPx(bE);
        g.appendChild(el('line', { x1: mpx, y1: mpy, x2: mpx, y2: Hh - Bm, stroke: '#1e824c', 'stroke-width': 1, 'stroke-dasharray': '3,3' }));
        g.appendChild(el('circle', { cx: mpx, cy: mpy, r: 5, fill: '#1e824c' }));
        const mt = el('text', { x: mpx + 8, y: mpy + 14, 'font-size': 11.5, 'font-weight': 700, fill: '#1e824c' });
        mt.textContent = `Rₑ = ${(bR * BOHR).toFixed(3)} Å`;
        g.appendChild(mt);
        textEl.innerHTML =
          `計算完成(${pts.length} 個距離點 × 每點完整積分):最佳化鍵長 <b>Rₑ = ${(bR * BOHR).toFixed(3)} Å</b>` +
          `(實驗值 0.741 Å),最低能量 <b>E = ${bE.toFixed(4)} hartree</b>。` +
          `與實驗的小差異來自最小基底(STO-3G)與 HF 平均場近似 —— 這正是計算化學要處理的課題。`;
        textEl.className = 'status-line success';
        btn.disabled = false;
      }
    };
    requestAnimationFrame(frame);
  }

  // ---- 分子振動模式 與 IR 光譜 ----
  const VIB_COLORS = { H: '#aab4f7', C: '#d6d6d6', N: '#a8e6b8', O: '#f5abc9' };
  const VIB_R = { H: 13, C: 17, N: 17, O: 17 };

  const VIBS = {
    H2: {
      label: 'H₂',
      atoms: [
        { el: 'H', x: -40, y: 0 },
        { el: 'H', x: 40, y: 0 },
      ],
      links: [[0, 1]],
      modes: [
        {
          name: '伸縮振動',
          freq: 0,
          fromHF: true,
          activeIR: false,
          inten: 0,
          reason: '兩個相同的原子對稱伸縮,偶極矩始終為零,不吸收紅外光 —— 這就是 H₂、N₂、O₂ 不是溫室氣體的原因',
          disp: [[-1, 0], [1, 0]],
        },
      ],
    },
    H2O: {
      label: 'H₂O',
      atoms: [
        { el: 'O', x: 0, y: 16 },
        { el: 'H', x: -38, y: -14 },
        { el: 'H', x: 38, y: -14 },
      ],
      links: [[0, 1], [0, 2]],
      modes: [
        {
          name: '對稱伸縮 ν₁',
          freq: 3657,
          activeIR: true,
          inten: 0.35,
          reason: '兩個 O–H 鍵同時伸長縮短,偶極矩大小改變 → IR 活躍',
          disp: [[0, 0.3], [-0.78, -0.62], [0.78, -0.62]],
        },
        {
          name: '彎曲(剪刀式)ν₂',
          freq: 1595,
          activeIR: true,
          inten: 0.7,
          reason: '鍵角開合改變偶極矩 → IR 活躍;水蒸氣因此是最重要的天然溫室氣體',
          disp: [[0, -0.35], [-0.62, 0.78], [0.62, 0.78]],
        },
        {
          name: '不對稱伸縮 ν₃',
          freq: 3756,
          activeIR: true,
          inten: 0.85,
          reason: '一邊伸長、一邊縮短,偶極矩方向改變 → IR 活躍',
          disp: [[0.35, 0], [-0.78, -0.62], [-0.78, 0.62]],
        },
      ],
    },
    CO2: {
      label: 'CO₂',
      atoms: [
        { el: 'O', x: -64, y: 0 },
        { el: 'C', x: 0, y: 0 },
        { el: 'O', x: 64, y: 0 },
      ],
      links: [[0, 1], [1, 2]],
      modes: [
        {
          name: '對稱伸縮 ν₁',
          freq: 1333,
          activeIR: false,
          inten: 0,
          reason: '兩個 C=O 對稱伸縮,偶極矩保持為零 → IR 不活躍(光譜上看不到這個峰)',
          disp: [[-1, 0], [0, 0], [1, 0]],
        },
        {
          name: '彎曲 ν₂',
          freq: 667,
          activeIR: true,
          inten: 0.7,
          reason: '分子彎折產生偶極矩 → IR 活躍;這是 CO₂ 吸收地球輻射的主要頻道之一',
          disp: [[0, -0.6], [0, 1.6], [0, -0.6]],
        },
        {
          name: '不對稱伸縮 ν₃',
          freq: 2349,
          activeIR: true,
          inten: 0.9,
          reason: '兩個 O 往同方向、C 反方向,偶極矩改變 → IR 活躍(CO₂ 是溫室氣體的關鍵吸收峰)',
          disp: [[0.5, 0], [-1.4, 0], [0.5, 0]],
        },
      ],
    },
  };

  const vibState = { mol: 'H2O', mode: 1 };
  let h2FreqCache = null;

  // 由 HF 曲線在谷底的二階導數(力常數)+ 諧振子近似求 H₂ 振動頻率
  function h2Frequency() {
    if (h2FreqCache) return h2FreqCache;
    let bR = 1.4;
    let bE = Infinity;
    for (let R = 1.0; R <= 1.8; R += 0.002) {
      const E = HF.energy(R);
      if (E < bE) {
        bE = E;
        bR = R;
      }
    }
    const h = 0.01;
    const k = (HF.energy(bR + h) - 2 * HF.energy(bR) + HF.energy(bR - h)) / (h * h); // hartree/bohr²
    const HARTREE = 4.3597447e-18;
    const BOHR_M = 5.29177e-11;
    const MU = 0.5 * 1.6735575e-27; // H₂ 約化質量(kg)
    const omega = Math.sqrt((k * HARTREE) / (BOHR_M * BOHR_M) / MU); // rad/s
    const cm = omega / (2 * Math.PI * 2.99792458e10);
    h2FreqCache = Math.round(cm);
    return h2FreqCache;
  }

  function currentMode() {
    const mol = VIBS[vibState.mol];
    const mode = mol.modes[vibState.mode];
    if (mode.fromHF && !mode.freq) mode.freq = h2Frequency();
    return { mol, mode };
  }

  function drawVibFrame(now) {
    const svg = document.getElementById('svg-vib');
    if (!svg) return;
    const { mol, mode } = currentMode();
    const periodMs = (900 * 1600) / Math.max(mode.freq, 400);
    const amp = 13 * Math.sin((2 * Math.PI * now) / periodMs);
    const cx = 220;
    const cy = 100;
    svg.innerHTML = '';
    const g = el('g', {});
    svg.appendChild(g);
    const pos = mol.atoms.map((a, i) => ({
      x: cx + a.x + mode.disp[i][0] * amp,
      y: cy + a.y + mode.disp[i][1] * amp,
    }));
    mol.links.forEach(([i, j]) => {
      g.appendChild(el('line', { x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, stroke: '#8a8f9c', 'stroke-width': 4 }));
    });
    mol.atoms.forEach((a, i) => {
      g.appendChild(el('circle', { cx: pos[i].x, cy: pos[i].y, r: VIB_R[a.el], fill: VIB_COLORS[a.el], stroke: '#666', 'stroke-width': 1.5 }));
      const t = el('text', { x: pos[i].x, y: pos[i].y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13, 'font-weight': 700, fill: '#222' });
      t.textContent = a.el;
      g.appendChild(t);
    });
    // 位移箭頭(靜態方向提示)
    mol.atoms.forEach((a, i) => {
      const [dx, dy] = mode.disp[i];
      if (!dx && !dy) return;
      const n = Math.hypot(dx, dy);
      const sx = cx + a.x + (dx / n) * (VIB_R[a.el] + 4);
      const sy = cy + a.y + (dy / n) * (VIB_R[a.el] + 4);
      const ex = cx + a.x + (dx / n) * (VIB_R[a.el] + 18);
      const ey = cy + a.y + (dy / n) * (VIB_R[a.el] + 18);
      g.appendChild(el('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: '#e8940a', 'stroke-width': 2 }));
      const ang = Math.atan2(ey - sy, ex - sx);
      const a1 = ang + 2.6;
      const a2 = ang - 2.6;
      g.appendChild(
        el('path', {
          d: `M${ex},${ey} L${ex + 6 * Math.cos(a1)},${ey + 6 * Math.sin(a1)} M${ex},${ey} L${ex + 6 * Math.cos(a2)},${ey + 6 * Math.sin(a2)}`,
          stroke: '#e8940a',
          'stroke-width': 2,
          fill: 'none',
        })
      );
    });
    requestAnimationFrame(drawVibFrame);
  }

  function drawIR() {
    const svg = document.getElementById('svg-ir');
    const { mol, mode } = currentMode();
    const xHi = vibState.mol === 'H2' ? 6200 : 4000;
    const xLo = 400;
    const L = 64, Rm = 20, T = 16, Bm = 40;
    const W = 900, Hh = 220;
    const xPx = (w) => L + ((xHi - w) / (xHi - xLo)) * (W - L - Rm); // 左高右低
    const yPx = (Tpct) => T + ((100 - Tpct) / 100) * (Hh - T - Bm);

    svg.innerHTML = '';
    const g = el('g', {});
    svg.appendChild(g);
    g.appendChild(el('line', { x1: L, y1: T, x2: L, y2: Hh - Bm, stroke: '#99a1b3', 'stroke-width': 1 }));
    g.appendChild(el('line', { x1: L, y1: Hh - Bm, x2: W - Rm, y2: Hh - Bm, stroke: '#99a1b3', 'stroke-width': 1 }));
    const tickStep = vibState.mol === 'H2' ? 1000 : 500;
    for (let w = Math.floor(xHi / tickStep) * tickStep; w >= xLo; w -= tickStep) {
      const px = xPx(w);
      g.appendChild(el('line', { x1: px, y1: Hh - Bm, x2: px, y2: Hh - Bm + 4, stroke: '#99a1b3', 'stroke-width': 1 }));
      const t = el('text', { x: px, y: Hh - Bm + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#667085' });
      t.textContent = w;
      g.appendChild(t);
    }
    const xl = el('text', { x: (L + W - Rm) / 2, y: Hh - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#667085' });
    xl.textContent = '波數(cm⁻¹)';
    g.appendChild(xl);
    [0, 50, 100].forEach((pct) => {
      const py = yPx(pct);
      g.appendChild(el('line', { x1: L - 4, y1: py, x2: L, y2: py, stroke: '#99a1b3', 'stroke-width': 1 }));
      const t = el('text', { x: L - 7, y: py + 3.5, 'text-anchor': 'end', 'font-size': 10.5, fill: '#667085' });
      t.textContent = pct;
      g.appendChild(t);
    });
    const yl = el('text', { x: 14, y: (T + Hh - Bm) / 2, 'text-anchor': 'middle', 'font-size': 11, fill: '#667085', transform: `rotate(-90 14 ${(T + Hh - Bm) / 2})` });
    yl.textContent = '穿透率 %T';
    g.appendChild(yl);

    // 光譜曲線(Lorentzian 吸收峰)
    const gamma = 42;
    let d = '';
    for (let w = xHi; w >= xLo; w -= 6) {
      let Tpct = 100;
      mol.modes.forEach((m) => {
        if (!m.activeIR) return;
        const f = m.fromHF ? h2Frequency() : m.freq;
        const z = (w - f) / gamma;
        Tpct -= m.inten * 96 * (1 / (1 + z * z));
      });
      d += (d ? 'L' : 'M') + xPx(w).toFixed(1) + ',' + yPx(Math.max(Tpct, 2)).toFixed(1) + ' ';
    }
    g.appendChild(el('path', { d, fill: 'none', stroke: '#1f2430', 'stroke-width': 2 }));

    // 各活躍峰標籤
    mol.modes.forEach((m) => {
      if (!m.activeIR) return;
      const px = xPx(m.freq);
      const t = el('text', { x: px, y: yPx(100 - m.inten * 96) + 14, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#667085' });
      t.textContent = m.freq;
      g.appendChild(t);
    });
    // 選取模式標記
    const selF = mode.fromHF ? h2Frequency() : mode.freq;
    const spx = xPx(selF);
    g.appendChild(el('line', { x1: spx, y1: T, x2: spx, y2: Hh - Bm, stroke: '#3b5bdb', 'stroke-width': 1.5, 'stroke-dasharray': '5,4' }));
    const st = el('text', { x: spx, y: T - 3, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#3b5bdb' });
    st.textContent = `${mode.name} ${selF} cm⁻¹${mode.activeIR ? '' : '(IR 不活躍,無吸收峰)'}`;
    g.appendChild(st);
  }

  function updateVibText() {
    const { mode } = currentMode();
    const f = mode.fromHF ? h2Frequency() : mode.freq;
    const textEl = document.getElementById('vib-text');
    const src = mode.fromHF
      ? `ω = ${f} cm⁻¹ —— 由上方 HF/STO-3G 能量曲線的力常數(二階導數)+ 諧振子近似即時算出;實驗值 4401 cm⁻¹,HF 一如預期偏高`
      : `ω = ${f} cm⁻¹(實驗值)`;
    textEl.innerHTML = `<b>${mode.name}</b>:${src}。${mode.activeIR ? '✔ IR 活躍' : '✘ IR 不活躍'} —— ${mode.reason}。`;
    textEl.className = 'status-line ' + (mode.activeIR ? 'success' : 'warn');
  }

  function buildVibButtons() {
    const molWrap = document.getElementById('vib-mol-buttons');
    const modeWrap = document.getElementById('vib-mode-buttons');
    molWrap.innerHTML = '';
    Object.entries(VIBS).forEach(([key, m]) => {
      const btn = document.createElement('button');
      btn.className = 'orb-btn' + (key === vibState.mol ? ' active' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        vibState.mol = key;
        vibState.mode = 0;
        buildVibButtons();
        drawIR();
        updateVibText();
      });
      molWrap.appendChild(btn);
    });
    modeWrap.innerHTML = '';
    VIBS[vibState.mol].modes.forEach((m, i) => {
      const btn = document.createElement('button');
      const f = m.fromHF ? h2Frequency() : m.freq;
      btn.className = 'orb-btn' + (i === vibState.mode ? ' active' : '');
      btn.textContent = `${m.name} ${f} cm⁻¹ ${m.activeIR ? '✔IR' : '✘IR'}`;
      btn.addEventListener('click', () => {
        vibState.mode = i;
        buildVibButtons();
        drawIR();
        updateVibText();
      });
      modeWrap.appendChild(btn);
    });
  }

  function init() {
    const orbitalButtonsEl = document.getElementById('orbital-buttons');
    ORBITAL_TYPES.forEach((o, idx) => {
      const btn = document.createElement('button');
      btn.className = 'orb-btn' + (idx === 0 ? ' active' : '');
      btn.textContent = o.label;
      btn.dataset.key = o.key;
      btn.addEventListener('click', () => {
        orbitalButtonsEl.querySelectorAll('.orb-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.kind = o.key;
        renderAll();
      });
      orbitalButtonsEl.appendChild(btn);
    });

    const slider = document.getElementById('distance-slider');
    slider.addEventListener('input', () => {
      state.R = Number(slider.value);
      renderAll();
    });

    const electronSelect = document.getElementById('electron-select');
    electronSelect.addEventListener('change', () => {
      state.electrons = Number(electronSelect.value);
      renderAll();
    });

    document.getElementById('btn-hf').addEventListener('click', runHF);
    window.__hf = HF; // 測試用鉤子
    window.__vib = { state: vibState, h2Frequency }; // 測試用鉤子

    buildVibButtons();
    drawIR();
    updateVibText();
    requestAnimationFrame(drawVibFrame);

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
