(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STAGE_W = 760;
  const STAGE_H = 520;

  // orb = 可用軌域數(決定二隅體/八隅體)；價電子先填未配對、再成對(洪德規則的簡化)
  const ELEMENTS = {
    H: { valence: 1, orb: 1, color: '#aab4f7', r: 22, name: '氫' },
    C: { valence: 4, orb: 4, color: '#d6d6d6', r: 30, name: '碳' },
    N: { valence: 5, orb: 4, color: '#a8e6b8', r: 30, name: '氮' },
    O: { valence: 6, orb: 4, color: '#f5abc9', r: 30, name: '氧' },
  };

  const SUBSCRIPT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

  const TARGETS = [
    { key: 'H2', label: 'H₂ 氫氣' },
    { key: 'O2', label: 'O₂ 氧氣' },
    { key: 'N2', label: 'N₂ 氮氣' },
    { key: 'H2O1', label: 'H₂O 水' },
    { key: 'H3N1', label: 'NH₃ 氨' },
    { key: 'C1H4', label: 'CH₄ 甲烷' },
    { key: 'C1O2', label: 'CO₂ 二氧化碳' },
    { key: 'H2O2', label: 'H₂O₂ 過氧化氫' },
    { key: 'C1H2O1', label: 'CH₂O 甲醛' },
  ];

  let atoms = [];
  let bonds = [];
  let nextId = 1;
  let selectedId = null;
  let drag = null;
  let trashHover = false;
  const TRASH = { x: STAGE_W - 54, y: STAGE_H - 54, r: 32 };
  const doneTargets = new Set();

  let stage, statusEl, readoutEl, chipsEl, selPanelEl;

  const toRad = (d) => (d * Math.PI) / 180;
  function polar(cx, cy, radius, deg) {
    return { x: cx + radius * Math.cos(toRad(deg)), y: cy - radius * Math.sin(toRad(deg)) };
  }
  function angDist(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }
  function el(tag, attrs, children) {
    const node = document.createElementNS(SVGNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function atomById(id) {
    return atoms.find((a) => a.id === id);
  }
  function bondBetween(id1, id2) {
    return bonds.find((b) => (b.a === id1 && b.b === id2) || (b.a === id2 && b.b === id1));
  }

  // 由目前電子數與鍵結數推出:孤對、未配對、形式電荷、八隅體是否完成
  function derived(a) {
    const info = ELEMENTS[a.el];
    const bondCount = bonds.reduce((s, b) => s + (b.a === a.id || b.b === a.id ? b.order : 0), 0);
    const nonbonding = a.electrons - bondCount;
    const availOrb = Math.max(info.orb - bondCount, 0);
    const pairs = Math.max(0, nonbonding - availOrb);
    const unpaired = nonbonding - 2 * pairs;
    const targetE = info.orb * 2;
    const shellE = bondCount * 2 + nonbonding;
    const satisfied = shellE === targetE && unpaired === 0;
    const fc = info.valence - nonbonding - bondCount;
    return { bondCount, nonbonding, pairs, unpaired, satisfied, fc, targetE, shellE };
  }

  function bondAnglesOf(a) {
    return bonds
      .filter((b) => b.a === a.id || b.b === a.id)
      .map((b) => {
        const other = atomById(b.a === a.id ? b.b : b.a);
        return (Math.atan2(-(other.y - a.y), other.x - a.x) * 180) / Math.PI;
      });
  }

  // 電子群(孤對/未配對)避開鍵的方向、彼此分散排列
  function chooseAngles(bondAngles, n) {
    const candidates = [];
    for (let d = 90; d < 450; d += 15) candidates.push(d % 360);
    const chosen = [];
    for (let i = 0; i < n; i++) {
      let best = candidates[0];
      let bestScore = -1;
      candidates.forEach((c) => {
        let score = 360;
        bondAngles.forEach((b) => (score = Math.min(score, angDist(c, b))));
        chosen.forEach((g) => (score = Math.min(score, angDist(c, g))));
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      });
      chosen.push(best);
    }
    return chosen;
  }

  function drawElectrons(parent, cx, cy, radius, pairs, unpaired, bondAngles, dotR) {
    const angles = chooseAngles(bondAngles, pairs + unpaired);
    angles.forEach((ang, i) => {
      if (i < pairs) {
        const base = polar(cx, cy, radius, ang);
        const t = toRad(ang + 90);
        const dx = Math.cos(t) * dotR * 1.9;
        const dy = -Math.sin(t) * dotR * 1.9;
        [-1, 1].forEach((s) => {
          parent.appendChild(el('circle', { cx: base.x + dx * s, cy: base.y + dy * s, r: dotR, fill: '#222' }));
        });
      } else {
        const p = polar(cx, cy, radius, ang);
        parent.appendChild(el('circle', { cx: p.x, cy: p.y, r: dotR, fill: '#222' }));
      }
    });
  }

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status-line' + (cls ? ' ' + cls : '');
  }

  function toSvgPoint(clientX, clientY) {
    const pt = stage.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = stage.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  }

  function addAtom(elKey) {
    const info = ELEMENTS[elKey];
    let x = STAGE_W / 2;
    let y = STAGE_H / 2;
    for (let t = 0; t < 40; t++) {
      const tx = 110 + Math.random() * (STAGE_W - 220);
      const ty = 90 + Math.random() * (STAGE_H - 180);
      if (atoms.every((a) => Math.hypot(a.x - tx, a.y - ty) > 95)) {
        x = tx;
        y = ty;
        break;
      }
    }
    atoms.push({ id: nextId++, el: elKey, x, y, electrons: info.valence });
    setStatus(`加入 ${info.name} ${elKey}(價電子 ${info.valence} 個),拖曳靠近其他原子就能成鍵。`);
    render();
  }

  function formDist(a, b) {
    return ELEMENTS[a.el].r + ELEMENTS[b.el].r + 34;
  }
  function breakDist(a, b) {
    return ELEMENTS[a.el].r + ELEMENTS[b.el].r + 115;
  }

  function checkBreak(a) {
    for (let i = bonds.length - 1; i >= 0; i--) {
      const b = bonds[i];
      if (b.a !== a.id && b.b !== a.id) continue;
      const other = atomById(b.a === a.id ? b.b : b.a);
      if (Math.hypot(a.x - other.x, a.y - other.y) > breakDist(a, other)) {
        bonds.splice(i, 1);
        setStatus(`${a.el}−${other.el} 的鍵斷開了,電子回到各自的原子上。`, 'warn');
      }
    }
  }

  function checkForm(a) {
    let best = null;
    let bestD = Infinity;
    atoms.forEach((o) => {
      if (o.id === a.id || bondBetween(a.id, o.id)) return;
      const d = Math.hypot(a.x - o.x, a.y - o.y);
      if (d < formDist(a, o) && d < bestD && derived(a).unpaired > 0 && derived(o).unpaired > 0) {
        best = o;
        bestD = d;
      }
    });
    if (!best) return;
    bonds.push({ a: a.id, b: best.id, order: 1 });
    const len = ELEMENTS[a.el].r + ELEMENTS[best.el].r + 26;
    const ang = Math.atan2(a.y - best.y, a.x - best.x);
    a.x = best.x + Math.cos(ang) * len;
    a.y = best.y + Math.sin(ang) * len;
    setStatus(`${a.el}−${best.el} 形成單鍵!兩邊各出 1 個電子變成共用電子對。點一下鍵可試著升級成雙鍵/三鍵。`, 'success');
  }

  function cycleBond(b) {
    const a1 = atomById(b.a);
    const a2 = atomById(b.b);
    if (b.order < 3 && derived(a1).unpaired > 0 && derived(a2).unpaired > 0) {
      b.order++;
      setStatus(`${a1.el}−${a2.el} 升級為${b.order === 2 ? '雙' : '三'}鍵,共用 ${b.order} 對電子。`, 'success');
    } else if (b.order > 1) {
      b.order = 1;
      setStatus(`${a1.el}−${a2.el} 還原為單鍵。`);
    } else {
      setStatus('無法升級:兩端原子都必須還有未配對電子才能再共用一對。');
    }
    render();
  }

  function changeElectron(delta) {
    const a = atomById(selectedId);
    if (!a) return;
    const info = ELEMENTS[a.el];
    const d = derived(a);
    if (delta > 0) {
      if (d.nonbonding + 1 > 2 * Math.max(info.orb - d.bondCount, 0)) {
        setStatus('軌域已滿,無法再加入電子。', 'warn');
        return;
      }
      a.electrons++;
      setStatus(`${a.el} 得到 1 個電子(變成陰離子方向),注意形式電荷的變化。`);
    } else {
      if (d.nonbonding <= 0) {
        setStatus('沒有非鍵結電子可移除(鍵上的電子要先斷鍵才能拿走)。', 'warn');
        return;
      }
      a.electrons--;
      setStatus(`${a.el} 失去 1 個電子(變成陽離子方向),注意形式電荷的變化。`);
    }
    render();
  }

  function deleteAtomById(id) {
    bonds = bonds.filter((b) => b.a !== id && b.b !== id);
    atoms = atoms.filter((a) => a.id !== id);
    if (selectedId === id) selectedId = null;
  }

  function deleteSelected() {
    if (selectedId == null) return;
    deleteAtomById(selectedId);
    setStatus('已刪除原子。');
    render();
  }

  function drawTrash(layer) {
    const { x, y } = TRASH;
    const col = trashHover ? '#e03131' : '#909aa8';
    const g = el('g', { 'pointer-events': 'none' });
    g.appendChild(
      el('circle', {
        cx: x,
        cy: y,
        r: TRASH.r,
        fill: trashHover ? '#ffe3e3' : '#f1f3f5',
        stroke: trashHover ? '#e03131' : '#d5dae2',
        'stroke-width': 1.5,
      })
    );
    // 桶身
    g.appendChild(
      el('path', {
        d: `M${x - 9},${y - 5} h18 l-2.5,16 a3,3 0 0 1 -3,2.5 h-7 a3,3 0 0 1 -3,-2.5 z`,
        fill: 'none',
        stroke: col,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      })
    );
    // 桶蓋與提把
    g.appendChild(el('line', { x1: x - 12, y1: y - 8, x2: x + 12, y2: y - 8, stroke: col, 'stroke-width': 2, 'stroke-linecap': 'round' }));
    g.appendChild(el('path', { d: `M${x - 4},${y - 8} v-3.5 h8 v3.5`, fill: 'none', stroke: col, 'stroke-width': 2 }));
    // 直紋
    [-4, 0, 4].forEach((dx) => {
      g.appendChild(el('line', { x1: x + dx, y1: y - 1, x2: x + dx, y2: y + 9, stroke: col, 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
    });
    const t = el('text', { x, y: y + TRASH.r + 13, 'text-anchor': 'middle', 'font-size': 11, fill: col });
    t.textContent = trashHover ? '放開即刪除' : '拖到這裡刪除';
    g.appendChild(t);
    layer.appendChild(g);
  }

  function clearAll() {
    atoms = [];
    bonds = [];
    selectedId = null;
    setStatus('畫布已清空,從左側加入原子開始新的組合。');
    render();
  }

  function components() {
    const seen = new Set();
    const comps = [];
    atoms.forEach((a) => {
      if (seen.has(a.id)) return;
      seen.add(a.id);
      const stack = [a.id];
      const ids = [];
      while (stack.length) {
        const id = stack.pop();
        ids.push(id);
        bonds.forEach((b) => {
          if (b.a === id && !seen.has(b.b)) {
            seen.add(b.b);
            stack.push(b.b);
          }
          if (b.b === id && !seen.has(b.a)) {
            seen.add(b.a);
            stack.push(b.a);
          }
        });
      }
      comps.push(ids.map(atomById));
    });
    return comps;
  }

  function countsOf(comp) {
    const counts = {};
    comp.forEach((a) => (counts[a.el] = (counts[a.el] || 0) + 1));
    return counts;
  }
  function formulaKey(counts) {
    return ['C', 'H', 'N', 'O']
      .filter((e) => counts[e])
      .map((e) => e + counts[e])
      .join('');
  }
  function sub(n) {
    return String(n)
      .split('')
      .map((c) => SUBSCRIPT[c])
      .join('');
  }
  // 小型能量條:penalty 0 = 穩定(綠),越大越不穩定(橘→紅)
  function meter(penalty) {
    const pct = Math.min(100, 8 + penalty * 16);
    const color = penalty === 0 ? '#2f9e44' : penalty <= 2 ? '#e8940a' : '#e03131';
    const label = penalty === 0 ? '能量低' : penalty <= 2 ? '能量中' : '能量高';
    return (
      `<span class="ebar" title="相對能量(示意)"><span style="width:${pct}%;background:${color}"></span></span>` +
      `<span class="etext" style="color:${color}">${label}</span>`
    );
  }

  function formulaDisplay(counts) {
    if (counts.O === 1 && counts.H === 1 && !counts.C && !counts.N) return 'OH';
    return ['C', 'N', 'H', 'O']
      .filter((e) => counts[e])
      .map((e) => e + (counts[e] > 1 ? sub(counts[e]) : ''))
      .join('');
  }

  function updatePanels() {
    // 目標分子勾選
    const comps = components();
    comps.forEach((comp) => {
      if (comp.length < 2) return;
      if (!comp.every((a) => derived(a).satisfied)) return;
      const net = comp.reduce((s, a) => s + derived(a).fc, 0);
      if (net !== 0) return;
      const key = formulaKey(countsOf(comp));
      if (TARGETS.some((t) => t.key === key)) doneTargets.add(key);
    });
    chipsEl.innerHTML = '';
    TARGETS.forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (doneTargets.has(t.key) ? ' done' : '');
      chip.textContent = (doneTargets.has(t.key) ? '✓ ' : '') + t.label;
      chipsEl.appendChild(chip);
    });

    // 畫布上的分子清單
    const lines = [];
    const singles = {};
    comps.forEach((comp) => {
      if (comp.length === 1) {
        singles[comp[0].el] = (singles[comp[0].el] || 0) + 1;
        return;
      }
      const counts = countsOf(comp);
      const key = formulaKey(counts);
      const target = TARGETS.find((t) => t.key === key);
      const net = comp.reduce((s, a) => s + derived(a).fc, 0);
      const allSat = comp.every((a) => derived(a).satisfied);
      // 簡化的「相對能量」:未配對電子與形式電荷越多,能量越高越不穩定
      const penalty = comp.reduce((s, a) => {
        const d = derived(a);
        return s + d.unpaired * 2 + Math.abs(d.fc);
      }, 0);
      let name = target ? target.label : formulaDisplay(counts);
      if (net !== 0) name += net > 0 ? `(離子,電荷 +${net})` : `(離子,電荷 −${-net})`;
      if (allSat && net === 0) {
        lines.push(`${meter(0)} ✓ <b>${name}</b> — 每個原子都達成八隅體(H 為二隅體),能量低、結構穩定,可以存在!`);
      } else if (allSat) {
        lines.push(`${meter(Math.max(penalty, 1))} ✓ <b>${name}</b> — 八隅體完成但整體帶電,是離子:能量稍高,通常要和相反電荷的離子一起存在。`);
      } else {
        const need = {};
        comp.forEach((a) => {
          const u = derived(a).unpaired;
          if (u > 0) need[a.el] = (need[a.el] || 0) + u;
        });
        const needText = Object.entries(need)
          .map(([e, n]) => `${e} 還有 ${n} 個未配對電子`)
          .join('、');
        lines.push(
          `${meter(penalty)} ⚠ <b>${name}</b> — 這樣接不穩定!${needText || '電子排列不完整'},能量偏高,會繼續反應直到八隅體完成。`
        );
      }
    });
    const singleText = Object.entries(singles)
      .map(([e, n]) => `${e}×${n}`)
      .join('、');
    if (singleText) {
      const singleCount = Object.values(singles).reduce((s, n) => s + n, 0);
      lines.push(`${meter(singleCount * 2)} 未鍵結原子:${singleText} — 單獨的原子能量高、不穩定,拖去找伴成鍵吧!`);
    }
    readoutEl.innerHTML = lines.length
      ? lines.map((l) => `<div>${l}</div>`).join('')
      : '<div>畫布是空的。</div>';

    // 選取原子面板
    const a = atomById(selectedId);
    if (!a) {
      selPanelEl.innerHTML =
        '<h4>選取的原子</h4><p class="tiny">點一下畫布上的原子,這裡會顯示它的形式電荷計算,並可增減電子做出離子(例如 H₃O⁺、OH⁻)。</p>';
      return;
    }
    const info = ELEMENTS[a.el];
    const d = derived(a);
    selPanelEl.innerHTML = `
      <h4>選取的原子:${info.name} ${a.el}</h4>
      <div class="fc-formula">
        形式電荷 FC = V − N − B<br>
        = ${info.valence} − ${d.nonbonding} − ${d.bondCount} = <b>${d.fc > 0 ? '+' + d.fc : d.fc}</b>
      </div>
      <p class="tiny">
        V(原始價電子)= ${info.valence}<br>
        B(鍵結數)= ${d.bondCount},共用 ${d.bondCount} 對電子<br>
        N(非鍵結電子)= ${d.nonbonding}(孤對 ${d.pairs} 對+未配對 ${d.unpaired} 個)<br>
        ${d.targetE === 2 ? '二隅體' : '八隅體'}:${d.shellE} / ${d.targetE} ${d.satisfied ? '✓ 完成' : ''}
      </p>
      <div class="sel-actions">
        <button id="btn-add-e">＋1 e⁻</button>
        <button id="btn-sub-e">−1 e⁻</button>
        <button id="btn-del-atom">刪除原子</button>
      </div>`;
    document.getElementById('btn-add-e').addEventListener('click', () => changeElectron(1));
    document.getElementById('btn-sub-e').addEventListener('click', () => changeElectron(-1));
    document.getElementById('btn-del-atom').addEventListener('click', deleteSelected);
  }

  function render() {
    stage.innerHTML = '';
    const bondLayer = el('g', {});
    const atomLayer = el('g', {});
    stage.appendChild(bondLayer);
    stage.appendChild(atomLayer);

    drawTrash(bondLayer);

    bonds.forEach((b) => {
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      bondLayer.appendChild(
        el('line', { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y, stroke: '#8a8f9c', 'stroke-width': 2 })
      );
      const mid = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
      const bondAngle = (Math.atan2(-(a2.y - a1.y), a2.x - a1.x) * 180) / Math.PI;
      for (let i = 0; i < b.order; i++) {
        const off = (i - (b.order - 1) / 2) * 15;
        const c = polar(mid.x, mid.y, off, bondAngle + 90);
        bondLayer.appendChild(
          el('ellipse', {
            cx: c.x,
            cy: c.y,
            rx: 11,
            ry: 6.5,
            fill: '#ffe999',
            'fill-opacity': 0.9,
            transform: `rotate(${-bondAngle} ${c.x} ${c.y})`,
          })
        );
        [-1, 1].forEach((s) => {
          const p = polar(c.x, c.y, 4.5 * s, bondAngle);
          bondLayer.appendChild(el('circle', { cx: p.x, cy: p.y, r: 3.1, fill: '#222' }));
        });
      }
      const hit = el('line', {
        x1: a1.x,
        y1: a1.y,
        x2: a2.x,
        y2: a2.y,
        stroke: 'transparent',
        'stroke-width': 24,
        style: 'cursor:pointer',
        class: 'bond-hit',
      });
      hit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        cycleBond(b);
      });
      bondLayer.appendChild(hit);
    });

    atoms.forEach((a) => {
      const info = ELEMENTS[a.el];
      const d = derived(a);
      const g = el('g', { class: 'atom-group', 'data-id': a.id });
      if (a.id === selectedId) {
        g.appendChild(
          el('circle', {
            cx: a.x,
            cy: a.y,
            r: info.r + 9,
            fill: 'none',
            stroke: '#3b5bdb',
            'stroke-width': 2,
            'stroke-dasharray': '4,4',
          })
        );
      }
      g.appendChild(
        el('circle', {
          cx: a.x,
          cy: a.y,
          r: info.r,
          fill: info.color,
          stroke: d.satisfied ? '#2f9e44' : d.unpaired > 0 ? '#e8940a' : '#666',
          'stroke-width': d.satisfied ? 3 : d.unpaired > 0 ? 2.5 : 1.5,
        })
      );
      const label = el('text', {
        x: a.x,
        y: a.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': info.r * 0.8,
        'font-weight': 700,
        fill: '#222',
      });
      label.textContent = a.el;
      g.appendChild(label);

      drawElectrons(g, a.x, a.y, info.r + 11, d.pairs, d.unpaired, bondAnglesOf(a), 3.1);

      if (d.fc !== 0) {
        const bp = polar(a.x, a.y, info.r + 4, 45);
        g.appendChild(el('circle', { cx: bp.x, cy: bp.y, r: 9, fill: d.fc > 0 ? '#e03131' : '#1971c2' }));
        const t = el('text', {
          x: bp.x,
          y: bp.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': 10,
          'font-weight': 700,
          fill: '#fff',
        });
        t.textContent = (d.fc > 0 ? '+' : '') + d.fc;
        g.appendChild(t);
      }

      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const p = toSvgPoint(e.clientX, e.clientY);
        drag = { id: a.id, sx: p.x, sy: p.y, moved: false };
        try {
          stage.setPointerCapture(e.pointerId);
        } catch (_) {}
        e.preventDefault();
      });
      atomLayer.appendChild(g);
    });

    updatePanels();
  }

  function buildPalette() {
    const wrap = document.getElementById('palette-buttons');
    Object.entries(ELEMENTS).forEach(([key, info]) => {
      const btn = document.createElement('button');
      btn.className = 'palette-btn';
      btn.dataset.el = key;
      btn.title = `${info.name} ${key}:價電子 ${info.valence} 個`;
      const rr = key === 'H' ? 13 : 17;
      const svg = el('svg', { viewBox: '-32 -32 64 64' });
      svg.appendChild(el('circle', { cx: 0, cy: 0, r: rr, fill: info.color, stroke: '#666', 'stroke-width': 1.2 }));
      const t = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': rr * 0.95,
        'font-weight': 700,
        fill: '#222',
      });
      t.textContent = key;
      svg.appendChild(t);
      const pairs = Math.max(0, info.valence - info.orb);
      const unpaired = info.valence - 2 * pairs;
      drawElectrons(svg, 0, 0, rr + 7, pairs, unpaired, [], 2.4);
      btn.appendChild(svg);
      const nameDiv = document.createElement('div');
      nameDiv.className = 'pname';
      nameDiv.textContent = `${info.name}·價電子${info.valence}`;
      btn.appendChild(nameDiv);
      btn.addEventListener('click', () => addAtom(key));
      wrap.appendChild(btn);
    });
  }

  function init() {
    stage = document.getElementById('lewis-stage');
    statusEl = document.getElementById('lewis-status');
    readoutEl = document.getElementById('component-readout');
    chipsEl = document.getElementById('target-chips');
    selPanelEl = document.getElementById('selected-panel');

    buildPalette();
    document.getElementById('lewis-clear').addEventListener('click', clearAll);

    stage.addEventListener('pointerdown', (e) => {
      if (e.target === stage) {
        selectedId = null;
        render();
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const a = atomById(drag.id);
      if (!a) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 6) return;
      drag.moved = true;
      a.x = Math.max(30, Math.min(STAGE_W - 30, p.x));
      a.y = Math.max(30, Math.min(STAGE_H - 30, p.y));
      trashHover = Math.hypot(a.x - TRASH.x, a.y - TRASH.y) < TRASH.r + 10;
      checkBreak(a);
      if (!trashHover) checkForm(a);
      render();
    });
    const endDrag = () => {
      if (drag && !drag.moved) {
        selectedId = selectedId === drag.id ? null : drag.id;
        render();
      } else if (drag && drag.moved && trashHover) {
        const a = atomById(drag.id);
        deleteAtomById(drag.id);
        setStatus(`已把 ${a ? a.el : ''} 原子丟進垃圾桶刪除。`);
        trashHover = false;
        render();
      } else if (trashHover) {
        trashHover = false;
        render();
      }
      drag = null;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // 測試用鉤子(不影響使用)
    window.__lewis = {
      atoms: () => atoms.map((a) => ({ ...a, ...derived(a) })),
      bonds: () => bonds.map((b) => ({ ...b })),
    };

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
