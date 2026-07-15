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

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
