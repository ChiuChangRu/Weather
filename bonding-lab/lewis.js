(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STAGE_W = 900, STAGE_H = 520;
  const CENTER = { x: STAGE_W / 2, y: STAGE_H / 2 };
  const R_BOND = 130;
  const SNAP_DIST = 105;
  const TWEEN_MS = 280;

  const ELEMENTS = {
    H: { valence: 1, color: '#aab4f7', r: 24 },
    O: { valence: 6, color: '#f5abc9', r: 36 },
    N: { valence: 5, color: '#a8e6b8', r: 36 },
    C: { valence: 4, color: '#d3d3d3', r: 36 },
  };

  const MOLECULES = {
    H2: {
      label: '氫氣 H₂',
      centralId: 'a',
      atoms: [
        { id: 'a', el: 'H', loneAngles: [] },
        { id: 'b', el: 'H', angle: 0, loneAngles: [] },
      ],
      bonds: [{ a: 'a', b: 'b', order: 1 }],
    },
    O2: {
      label: '氧氣 O₂',
      centralId: 'a',
      atoms: [
        { id: 'a', el: 'O', loneAngles: [90, 270] },
        { id: 'b', el: 'O', angle: 0, loneAngles: [90, 270] },
      ],
      bonds: [{ a: 'a', b: 'b', order: 2 }],
    },
    N2: {
      label: '氮氣 N₂',
      centralId: 'a',
      atoms: [
        { id: 'a', el: 'N', loneAngles: [180] },
        { id: 'b', el: 'N', angle: 0, loneAngles: [0] },
      ],
      bonds: [{ a: 'a', b: 'b', order: 3 }],
    },
    H2O: {
      label: '水 H₂O',
      centralId: 'o',
      atoms: [
        { id: 'o', el: 'O', loneAngles: [215, 325] },
        { id: 'h1', el: 'H', angle: 145, loneAngles: [] },
        { id: 'h2', el: 'H', angle: 35, loneAngles: [] },
      ],
      bonds: [
        { a: 'o', b: 'h1', order: 1 },
        { a: 'o', b: 'h2', order: 1 },
      ],
    },
    NH3: {
      label: '氨 NH₃',
      centralId: 'n',
      atoms: [
        { id: 'n', el: 'N', loneAngles: [30] },
        { id: 'h1', el: 'H', angle: 90, loneAngles: [] },
        { id: 'h2', el: 'H', angle: 210, loneAngles: [] },
        { id: 'h3', el: 'H', angle: 330, loneAngles: [] },
      ],
      bonds: [
        { a: 'n', b: 'h1', order: 1 },
        { a: 'n', b: 'h2', order: 1 },
        { a: 'n', b: 'h3', order: 1 },
      ],
    },
    CH4: {
      label: '甲烷 CH₄',
      centralId: 'c',
      atoms: [
        { id: 'c', el: 'C', loneAngles: [] },
        { id: 'h1', el: 'H', angle: 45, loneAngles: [] },
        { id: 'h2', el: 'H', angle: 135, loneAngles: [] },
        { id: 'h3', el: 'H', angle: 225, loneAngles: [] },
        { id: 'h4', el: 'H', angle: 315, loneAngles: [] },
      ],
      bonds: [
        { a: 'c', b: 'h1', order: 1 },
        { a: 'c', b: 'h2', order: 1 },
        { a: 'c', b: 'h3', order: 1 },
        { a: 'c', b: 'h4', order: 1 },
      ],
    },
    CO2: {
      label: '二氧化碳 CO₂',
      centralId: 'c',
      atoms: [
        { id: 'c', el: 'C', loneAngles: [] },
        { id: 'o1', el: 'O', angle: 180, loneAngles: [90, 270] },
        { id: 'o2', el: 'O', angle: 0, loneAngles: [90, 270] },
      ],
      bonds: [
        { a: 'c', b: 'o1', order: 2 },
        { a: 'c', b: 'o2', order: 2 },
      ],
    },
  };

  function polar(cx, cy, radius, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  }

  function dist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  function el(tag, attrs, children) {
    const node = document.createElementNS(SVGNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  let stage, statusEl, moleculeButtonsEl, resetBtn;
  let currentDef = null;
  let atomsState = {};
  let bondsState = [];
  let dragging = null;
  let rafId = null;

  function toSvgPoint(clientX, clientY) {
    const pt = stage.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = stage.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function loadMolecule(key) {
    currentDef = MOLECULES[key];
    atomsState = {};
    const count = currentDef.atoms.length - 1;
    let idx = 0;
    currentDef.atoms.forEach((a) => {
      if (a.id === currentDef.centralId) {
        atomsState[a.id] = { el: a.el, x: CENTER.x, y: CENTER.y, locked: true, def: a };
      } else {
        const baseAngle = idx * (360 / Math.max(count, 1)) + (Math.random() * 30 - 15);
        const radius = 250 + Math.random() * 110;
        const p = polar(CENTER.x, CENTER.y, radius, baseAngle);
        atomsState[a.id] = { el: a.el, x: p.x, y: p.y, locked: false, def: a };
        idx++;
      }
    });
    bondsState = currentDef.bonds.map((b) => ({ ...b, formed: false }));
    startLoop();
    updateStatus();
  }

  function checkBonds() {
    let changed = false;
    bondsState.forEach((b) => {
      if (b.formed) return;
      const central = atomsState[b.a];
      const term = atomsState[b.b];
      if (dist(central, term) < SNAP_DIST) {
        b.formed = true;
        changed = true;
        const target = polar(CENTER.x, CENTER.y, R_BOND, term.def.angle);
        term.tween = { fromX: term.x, fromY: term.y, toX: target.x, toY: target.y, start: performance.now() };
        term.locked = true;
      }
    });
    if (changed) updateStatus();
  }

  function updateTweens(now) {
    Object.values(atomsState).forEach((a) => {
      if (!a.tween) return;
      const t = Math.min(1, (now - a.tween.start) / TWEEN_MS);
      const ease = t * (2 - t);
      a.x = a.tween.fromX + (a.tween.toX - a.tween.fromX) * ease;
      a.y = a.tween.fromY + (a.tween.toY - a.tween.fromY) * ease;
      if (t >= 1) delete a.tween;
    });
  }

  function bondSlotAngleFor(atomId) {
    const a = atomsState[atomId];
    if (atomId === currentDef.centralId) return null;
    return (a.def.angle + 180) % 360;
  }

  function drawDotPair(group, center, angleDeg, radiusOffset, tangentSpread) {
    const base = polar(center.x, center.y, radiusOffset, angleDeg);
    const tangentRad = ((angleDeg + 90) * Math.PI) / 180;
    const dx = Math.cos(tangentRad) * tangentSpread;
    const dy = -Math.sin(tangentRad) * tangentSpread;
    [-1, 1].forEach((s) => {
      group.appendChild(
        el('circle', { cx: base.x + dx * s, cy: base.y + dy * s, r: 3.4, fill: '#222' })
      );
    });
  }

  function drawSingleDot(group, center, angleDeg, radiusOffset) {
    const p = polar(center.x, center.y, radiusOffset, angleDeg);
    group.appendChild(el('circle', { cx: p.x, cy: p.y, r: 3.4, fill: '#222' }));
  }

  function render() {
    stage.innerHTML = '';
    const bondLayer = el('g', {});
    const atomLayer = el('g', {});
    stage.appendChild(bondLayer);
    stage.appendChild(atomLayer);

    if (currentDef) {
      const central = atomsState[currentDef.centralId];
      const dashRing = el('circle', {
        cx: central.x,
        cy: central.y,
        r: R_BOND,
        fill: 'none',
        stroke: '#c9cfe6',
        'stroke-width': 1.5,
        'stroke-dasharray': '5,6',
      });
      bondLayer.appendChild(dashRing);

      bondsState.forEach((b) => {
        if (!b.formed) return;
        const a1 = atomsState[b.a];
        const a2 = atomsState[b.b];
        bondLayer.appendChild(
          el('line', { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y, stroke: '#666', 'stroke-width': 2 })
        );
        const mid = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
        const bondAngle = (Math.atan2(-(a2.y - a1.y), a2.x - a1.x) * 180) / Math.PI;
        const perpAngle = bondAngle + 90;
        for (let i = 0; i < b.order; i++) {
          const offset = (i - (b.order - 1) / 2) * 14;
          const shifted = polar(mid.x, mid.y, offset, perpAngle);
          drawDotPair(bondLayer, shifted, bondAngle, 0, 5);
        }
      });

      Object.entries(atomsState).forEach(([id, a]) => {
        const info = ELEMENTS[a.el];
        const g = el('g', { class: 'atom-group' + (a.locked ? ' locked' : '') });
        g.appendChild(el('circle', { cx: a.x, cy: a.y, r: info.r, fill: info.color, stroke: '#555', 'stroke-width': 1.5 }));
        const label = el('text', {
          x: a.x,
          y: a.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': info.r * 0.85,
          'font-weight': '700',
          fill: '#222',
        });
        label.textContent = a.el;
        g.appendChild(label);

        (a.def.loneAngles || []).forEach((angle) => {
          drawDotPair(g, a, angle, info.r + 12, 6);
        });

        if (id !== currentDef.centralId) {
          const bond = bondsState.find((b) => b.b === id);
          if (bond && !bond.formed) {
            const slotAngle = bondSlotAngleFor(id);
            for (let i = 0; i < bond.order; i++) {
              drawSingleDot(g, a, slotAngle + (i - (bond.order - 1) / 2) * 18, info.r + 10);
            }
          }
        } else {
          bondsState.forEach((bond) => {
            if (bond.formed) return;
            const term = atomsState[bond.b];
            for (let i = 0; i < bond.order; i++) {
              drawSingleDot(g, a, term.def.angle + (i - (bond.order - 1) / 2) * 18, info.r + 10);
            }
          });
        }

        if (!a.locked) {
          g.addEventListener('pointerdown', (e) => {
            dragging = id;
            e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
            e.preventDefault();
          });
        }
        atomLayer.appendChild(g);
      });
    }
  }

  function loop(now) {
    updateTweens(now);
    checkBonds();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function updateStatus() {
    if (!currentDef) {
      statusEl.textContent = '請選擇一個分子開始。';
      statusEl.className = 'status-line';
      return;
    }
    const total = bondsState.length;
    const formed = bondsState.filter((b) => b.formed).length;
    if (formed < total) {
      statusEl.textContent = `${currentDef.label}：已形成 ${formed} / ${total} 個鍵，把剩下的原子拖近中心原子試試看。`;
      statusEl.className = 'status-line';
    } else {
      const loneSummary = Object.values(atomsState)
        .filter((a) => (a.def.loneAngles || []).length > 0)
        .map((a) => `${a.el} 上 ${a.def.loneAngles.length} 對孤對電子`)
        .join('、');
      const bondSummary = {};
      bondsState.forEach((b) => {
        bondSummary[b.order] = (bondSummary[b.order] || 0) + 1;
      });
      const orderNames = { 1: '單鍵', 2: '雙鍵', 3: '三鍵' };
      const bondText = Object.entries(bondSummary)
        .map(([order, n]) => `${n} 個${orderNames[order] || order + '鍵'}`)
        .join('、');
      statusEl.textContent = `${currentDef.label} 形成完成！共價鍵：${bondText}。${loneSummary ? '孤對電子：' + loneSummary + '。' : ''}`;
      statusEl.className = 'status-line success';
    }
  }

  function init() {
    stage = document.getElementById('lewis-stage');
    statusEl = document.getElementById('lewis-status');
    moleculeButtonsEl = document.getElementById('molecule-buttons');
    resetBtn = document.getElementById('lewis-reset');

    Object.entries(MOLECULES).forEach(([key, def]) => {
      const btn = document.createElement('button');
      btn.className = 'mol-btn';
      btn.textContent = def.label;
      btn.dataset.key = key;
      btn.addEventListener('click', () => {
        moleculeButtonsEl.querySelectorAll('.mol-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        loadMolecule(key);
      });
      moleculeButtonsEl.appendChild(btn);
    });

    resetBtn.addEventListener('click', () => {
      const activeKey = moleculeButtonsEl.querySelector('.mol-btn.active');
      if (activeKey) loadMolecule(activeKey.dataset.key);
    });

    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      atomsState[dragging].x = p.x;
      atomsState[dragging].y = p.y;
    });
    const endDrag = () => {
      dragging = null;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', endDrag);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
