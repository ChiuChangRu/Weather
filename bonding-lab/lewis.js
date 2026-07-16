(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STAGE_W = 760;
  const STAGE_H = 520;

  // orb = 可用軌域數(決定二隅體/八隅體)；價電子先填未配對、再成對(洪德規則的簡化)
  const ELEMENTS = {
    H: { valence: 1, orb: 1, color: '#aab4f7', r: 22, name: '氫', en: 2.2, mass: 1.008 },
    C: { valence: 4, orb: 4, color: '#d6d6d6', r: 30, name: '碳', en: 2.55, mass: 12.011 },
    N: { valence: 5, orb: 4, color: '#a8e6b8', r: 30, name: '氮', en: 3.04, mass: 14.007 },
    O: { valence: 6, orb: 4, color: '#f5abc9', r: 30, name: '氧', en: 3.44, mass: 15.999 },
  };

  // 把十六進位色碼加深/加亮 amt(-255~255),用來做原子球的光澤漸層
  function shade(hex, amt) {
    const num = parseInt(hex.slice(1), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp((num >> 16) + amt);
    const g = clamp(((num >> 8) & 0xff) + amt);
    const b = clamp((num & 0xff) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // ---- 真實鍵長(Å)與 GVFF 近似力常數(mdyn/Å),供 3D 結構與振動計算使用 ----
  const BOND_PARAMS = {};
  function setBP(e1, e2, order, len, k) {
    BOND_PARAMS[[e1, e2].sort().join('') + '-' + order] = { len, k };
  }
  setBP('H', 'H', 1, 0.74, 5.76);
  setBP('C', 'H', 1, 1.09, 4.8);
  setBP('N', 'H', 1, 1.01, 6.4);
  setBP('O', 'H', 1, 0.96, 7.7);
  setBP('C', 'C', 1, 1.54, 4.5);
  setBP('C', 'C', 2, 1.34, 9.6);
  setBP('C', 'C', 3, 1.2, 15.6);
  setBP('C', 'N', 1, 1.47, 4.9);
  setBP('C', 'N', 2, 1.28, 10.0);
  setBP('C', 'O', 1, 1.43, 5.0);
  setBP('C', 'O', 2, 1.21, 12.1);
  setBP('N', 'N', 1, 1.45, 4.0);
  setBP('N', 'N', 2, 1.25, 13.0);
  setBP('N', 'N', 3, 1.1, 22.4);
  setBP('O', 'O', 1, 1.48, 3.8);
  setBP('O', 'O', 2, 1.21, 11.4);
  function bondParams(e1, e2, order) {
    return BOND_PARAMS[[e1, e2].sort().join('') + '-' + order] || { len: 1.4, k: 4.5 };
  }
  const LONE_WEIGHT = 1.35; // 孤對電子排斥比鍵結電子對強(VSEPR)
  const ANGLE_K = 0.55; // mdyn·Å,通用彎曲力常數(簡化)

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

  // 一鍵生成:原子種類 + 鍵結列表 [原子索引a, 原子索引b, 鍵級]
  const PRESETS = {
    H2: { els: ['H', 'H'], bonds: [[0, 1, 1]] },
    O2: { els: ['O', 'O'], bonds: [[0, 1, 2]] },
    N2: { els: ['N', 'N'], bonds: [[0, 1, 3]] },
    H2O1: { els: ['O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1]] },
    H3N1: { els: ['N', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] },
    C1H4: { els: ['C', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
    C1O2: { els: ['C', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 2]] },
    H2O2: { els: ['O', 'O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [1, 3, 1]] },
    C1H2O1: { els: ['C', 'H', 'H', 'O'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 2]] },
  };

  let atoms = [];
  let bonds = [];
  let nextId = 1;
  let selectedId = null;
  let drag = null;
  let paletteDrag = null;
  let trashHover = false;
  let cloudOn = false;
  let optimizing = false;
  const rigidAtoms = new Set(); // 最佳化後鎖定的原子:只能整顆分子一起移動,不可再斷鍵
  const rigidSlotOf = new Map(); // atomId -> {cx,cy,scale}:這顆原子所屬分子在畫布上的中心與縮放,3D 投影用
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

  // 一鍵生成上方清單裡的常見分子,不用自己拖,並自動跑最佳化直接看立體結構/振動/IR
  function buildPresetMolecule(key) {
    const spec = PRESETS[key];
    if (!spec) return;
    clearAll();
    const cx = STAGE_W / 2, cy = STAGE_H / 2;
    const newIds = spec.els.map((elKey, i) => {
      const info = ELEMENTS[elKey];
      const angle = (i / spec.els.length) * 2 * Math.PI;
      const id = nextId++;
      atoms.push({ id, el: elKey, x: cx + Math.cos(angle) * 70, y: cy + Math.sin(angle) * 70, electrons: info.valence });
      return id;
    });
    spec.bonds.forEach(([i, j, order]) => {
      bonds.push({ a: newIds[i], b: newIds[j], order });
    });
    const label = TARGETS.find((t) => t.key === key)?.label || key;
    setStatus(`已直接生成 ${label},正在自動最佳化…`, 'success');
    render();
    runOptimize();
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

  function invalidate3D() {
    mol3D = null;
    modes3D = [];
    vibPlaying = false;
    zpeKJ = 0;
    renderVibPanel();
    renderEnergyHeader();
    renderIRChart();
  }

  function cycleBond(b) {
    const a1 = atomById(b.a);
    const a2 = atomById(b.b);
    if (b.order < 3 && derived(a1).unpaired > 0 && derived(a2).unpaired > 0) {
      b.order++;
      setStatus(`${a1.el}−${a2.el} 升級為${b.order === 2 ? '雙' : '三'}鍵,共用 ${b.order} 對電子。再按一次⚛最佳化更新立體結構與振動模式。`, 'success');
    } else if (b.order > 1) {
      b.order = 1;
      setStatus(`${a1.el}−${a2.el} 還原為單鍵。`);
    } else {
      setStatus('無法升級:兩端原子都必須還有未配對電子才能再共用一對。');
    }
    invalidate3D();
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
    invalidate3D();
    render();
  }

  function deleteAtomById(id) {
    bonds = bonds.filter((b) => b.a !== id && b.b !== id);
    atoms = atoms.filter((a) => a.id !== id);
    if (selectedId === id) selectedId = null;
    rigidAtoms.delete(id);
    rigidSlotOf.delete(id);
    invalidate3D();
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
    rigidAtoms.clear();
    rigidSlotOf.clear();
    mol3D = null;
    modes3D = [];
    vibPlaying = false;
    zpeKJ = 0;
    view3D.rotX = -0.3;
    view3D.rotY = 0.5;
    setStatus('畫布已清空,從左側加入原子開始新的組合。');
    renderVibPanel();
    renderEnergyHeader();
    renderIRChart();
    render();
  }

  // ---- 簡易能量最小化(鍵長/鍵角最佳化) ----
  // 平衡鍵長:鍵級越高鍵越短
  function r0Of(b) {
    const a1 = atomById(b.a);
    const a2 = atomById(b.b);
    return ELEMENTS[a1.el].r + ELEMENTS[a2.el].r + 30 - 7 * (b.order - 1);
  }

  function neighborsOf(c) {
    const list = [];
    bonds.forEach((b) => {
      if (b.a === c.id) list.push(atomById(b.b));
      else if (b.b === c.id) list.push(atomById(b.a));
    });
    return list;
  }

  // 一次鬆弛迭代;apply=false 時只計算能量(任意單位)
  function relaxPass(apply, stepScale) {
    let E = 0;
    // 鍵長彈簧:偏離平衡距離就有能量
    bonds.forEach((b) => {
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const dx = a2.x - a1.x;
      const dy = a2.y - a1.y;
      const d = Math.hypot(dx, dy) || 1;
      const err = d - r0Of(b);
      E += 0.01 * err * err;
      if (apply) {
        const s = (err * 0.25 * stepScale) / d;
        a1.x += dx * s;
        a1.y += dy * s;
        a2.x -= dx * s;
        a2.y -= dy * s;
      }
    });
    // 鍵角:電子群(鍵+孤對)互相排斥,平均分開(簡化 VSEPR)
    atoms.forEach((c) => {
      const nb = neighborsOf(c);
      if (nb.length < 2) return;
      const rots = new Map();
      const add = (at, dt) => rots.set(at.id, (rots.get(at.id) || 0) + dt);
      if (nb.length === 2) {
        const lp = derived(c).pairs;
        const target = lp > 0 ? 360 / (2 + lp) : 180;
        const ang1 = Math.atan2(nb[0].y - c.y, nb[0].x - c.x);
        const ang2 = Math.atan2(nb[1].y - c.y, nb[1].x - c.x);
        let diff = ((ang2 - ang1) * 180) / Math.PI;
        while (diff < 0) diff += 360;
        const gap = diff > 180 ? 360 - diff : diff;
        const err = target - gap;
        E += 0.004 * err * err;
        const dir = diff > 180 ? -1 : 1;
        const dt = ((err * Math.PI) / 180) * 0.12 * stepScale;
        add(nb[0], -dir * dt);
        add(nb[1], dir * dt);
      } else {
        const items = nb
          .map((n) => ({ n, th: Math.atan2(n.y - c.y, n.x - c.x) }))
          .sort((p, q) => p.th - q.th);
        const target = (Math.PI * 2) / items.length;
        for (let i = 0; i < items.length; i++) {
          const cur = items[i];
          const nxt = items[(i + 1) % items.length];
          let gap = nxt.th - cur.th;
          if (gap <= 0) gap += Math.PI * 2;
          const errDeg = ((target - gap) * 180) / Math.PI;
          E += 0.004 * errDeg * errDeg;
          const dt = (target - gap) * 0.12 * stepScale;
          add(cur.n, -dt / 2);
          add(nxt.n, dt / 2);
        }
      }
      if (apply) {
        rots.forEach((dt, id) => {
          const n = atomById(id);
          const dx = n.x - c.x;
          const dy = n.y - c.y;
          const cos = Math.cos(dt);
          const sin = Math.sin(dt);
          n.x = c.x + dx * cos - dy * sin;
          n.y = c.y + dx * sin + dy * cos;
        });
      }
    });
    // 未鍵結原子太近時互相排斥
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const a1 = atoms[i];
        const a2 = atoms[j];
        if (bondBetween(a1.id, a2.id)) continue;
        const minD = ELEMENTS[a1.el].r + ELEMENTS[a2.el].r + 16;
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < minD) {
          E += 0.01 * (minD - d) * (minD - d);
          if (apply) {
            const s = ((minD - d) * 0.2 * stepScale) / d;
            a1.x -= dx * s;
            a1.y -= dy * s;
            a2.x += dx * s;
            a2.y += dy * s;
          }
        }
      }
    }
    if (apply) {
      atoms.forEach((a) => {
        a.x = Math.max(30, Math.min(STAGE_W - 30, a.x));
        a.y = Math.max(30, Math.min(STAGE_H - 30, a.y));
      });
    }
    return E;
  }

  // 最佳化完成後:把每個分子移到畫布中央,並縮放到適合視窗的大小
  // (多個分子並存時左右並排,避免互相重疊)
  function centerAndFitMolecules() {
    const comps = components().filter((c) => c.length >= 2);
    if (comps.length === 0) return;
    const slotW = STAGE_W / comps.length;
    comps.forEach((comp, idx) => {
      const cx = comp.reduce((s, a) => s + a.x, 0) / comp.length;
      const cy = comp.reduce((s, a) => s + a.y, 0) / comp.length;
      let maxR = 1;
      comp.forEach((a) => {
        maxR = Math.max(maxR, Math.hypot(a.x - cx, a.y - cy) + ELEMENTS[a.el].r);
      });
      const targetR = Math.min(slotW, STAGE_H) * 0.34;
      const scale = targetR / maxR;
      const centerX = slotW * (idx + 0.5);
      const centerY = STAGE_H / 2;
      comp.forEach((a) => {
        a.x = centerX + (a.x - cx) * scale;
        a.y = centerY + (a.y - cy) * scale;
        rigidSlotOf.set(a.id, { cx: centerX, cy: centerY, scale: Math.min(slotW, STAGE_H) * 0.42 });
      });
    });
  }

  function runOptimize() {
    if (optimizing) return;
    if (bonds.length === 0) {
      setStatus('先接出至少一個鍵,再進行鍵長最佳化!', 'warn');
      return;
    }
    optimizing = true;
    const btn = document.getElementById('btn-optimize');
    btn.disabled = true;
    const E0 = relaxPass(false, 0);
    const t0 = performance.now();
    const frame = () => {
      for (let i = 0; i < 6; i++) relaxPass(true, 1);
      render();
      const E = relaxPass(false, 0);
      if (performance.now() - t0 < 1500) {
        setStatus(`簡易能量最小化中… E = ${E.toFixed(2)}(任意單位,持續下降)`);
        requestAnimationFrame(frame);
      } else {
        optimizing = false;
        btn.disabled = false;
        bonds.forEach((b) => {
          rigidAtoms.add(b.a);
          rigidAtoms.add(b.b);
        });
        centerAndFitMolecules();
        setStatus(
          `最佳化完成!E:${E0.toFixed(2)} → ${E.toFixed(2)}。鍵長已落在能量最低的平衡距離(鍵級越高鍵越短),鍵角由電子對互斥(VSEPR)決定。` +
            `這顆分子現在完全鎖定,不能再移動或拉斷鍵。右側已產生立體結構與振動模式,可以點來看看。` +
            `真正的量子化學計算(如 Hartree–Fock)是解電子的薛丁格方程式,這裡是它的簡化示意。`,
          'success'
        );
        build3DAndVibrations();
        render();
      }
    };
    requestAnimationFrame(frame);
  }

  // ---- 幾何量測:鍵長與鍵角 ----
  function geometryInfo() {
    const bondsInfo = bonds.map((b) => {
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const sym = b.order === 1 ? '−' : b.order === 2 ? '=' : '≡';
      return {
        label: `${a1.el}${sym}${a2.el}`,
        len: Math.hypot(a2.x - a1.x, a2.y - a1.y),
        r0: r0Of(b),
      };
    });
    const angles = [];
    atoms.forEach((c) => {
      const nb = neighborsOf(c);
      if (nb.length < 2) return;
      const items = nb
        .map((n) => ({ n, th: Math.atan2(n.y - c.y, n.x - c.x) }))
        .sort((p, q) => p.th - q.th);
      const count = items.length === 2 ? 1 : items.length;
      for (let i = 0; i < count; i++) {
        const cur = items[i];
        const nxt = items[(i + 1) % items.length];
        let start = cur.th;
        let gap = nxt.th - cur.th;
        if (gap <= 0) gap += 2 * Math.PI;
        if (items.length === 2 && gap > Math.PI) {
          start = nxt.th;
          gap = 2 * Math.PI - gap;
        }
        angles.push({
          label: `${cur.n.el}−${c.el}−${nxt.n.el}`,
          deg: (gap * 180) / Math.PI,
          c,
          start,
          gap,
        });
      }
    });
    return { bondsInfo, angles };
  }

  function drawGeometryLabels(layer) {
    // 鍵長標在鍵旁(已最佳化鎖定的分子改由 3D 那一批畫真實的 Å/度數,這裡跳過)
    bonds.forEach((b) => {
      if (rigidAtoms.has(b.a) && rigidAtoms.has(b.b)) return;
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const d = Math.hypot(a2.x - a1.x, a2.y - a1.y) || 1;
      const px = -(a2.y - a1.y) / d;
      const py = (a2.x - a1.x) / d;
      const t = el('text', {
        x: (a1.x + a2.x) / 2 + px * 24,
        y: (a1.y + a2.y) / 2 + py * 24,
        'text-anchor': 'middle',
        'font-size': 10,
        fill: '#98a1b3',
      });
      t.textContent = d.toFixed(0);
      layer.appendChild(t);
    });
    // 鍵角弧線與度數
    geometryInfo().angles.forEach((ang) => {
      if (rigidAtoms.has(ang.c.id)) return;
      const c = ang.c;
      const rr = ELEMENTS[c.el].r + 20;
      const p1x = c.x + rr * Math.cos(ang.start);
      const p1y = c.y + rr * Math.sin(ang.start);
      const p2x = c.x + rr * Math.cos(ang.start + ang.gap);
      const p2y = c.y + rr * Math.sin(ang.start + ang.gap);
      layer.appendChild(
        el('path', {
          d: `M${p1x.toFixed(1)},${p1y.toFixed(1)} A${rr},${rr} 0 ${ang.gap > Math.PI ? 1 : 0} 1 ${p2x.toFixed(1)},${p2y.toFixed(1)}`,
          fill: 'none',
          stroke: '#b7bfd1',
          'stroke-width': 1.2,
        })
      );
      const mid = ang.start + ang.gap / 2;
      const t = el('text', {
        x: c.x + (rr + 14) * Math.cos(mid),
        y: c.y + (rr + 14) * Math.sin(mid),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': 10.5,
        fill: '#8a93a8',
      });
      t.textContent = `${ang.deg.toFixed(0)}°`;
      layer.appendChild(t);
    });
  }

  // ---- 電負度:部分電荷與偶極 ----
  // pull > 0:此原子把電子拉過來(δ−);< 0:電子被拉走(δ+)
  function pullOf(a) {
    let s = 0;
    bonds.forEach((b) => {
      if (b.a === a.id) s += b.order * (ELEMENTS[a.el].en - ELEMENTS[atomById(b.b).el].en);
      else if (b.b === a.id) s += b.order * (ELEMENTS[a.el].en - ELEMENTS[atomById(b.a).el].en);
    });
    return s;
  }

  // 淨偶極向量(依目前畫布幾何;方向由 δ+ 指向 δ−)
  function dipoleOf(comp) {
    let vx = 0;
    let vy = 0;
    const ids = new Set(comp.map((a) => a.id));
    bonds.forEach((b) => {
      if (!ids.has(b.a)) return;
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const dEN = ELEMENTS[a2.el].en - ELEMENTS[a1.el].en;
      const d = Math.hypot(a2.x - a1.x, a2.y - a1.y) || 1;
      vx += ((a2.x - a1.x) / d) * dEN * b.order;
      vy += ((a2.y - a1.y) / d) * dEN * b.order;
    });
    return { x: vx, y: vy, mag: Math.hypot(vx, vy) };
  }

  // ---- 價電子雲(仿靜電位能表面 ESP surface 的彩虹色階) ----

  // 真正的 ESP(靜電位能)表面慣例:電子密度高(δ−)→紅,居中→綠,電子密度低(δ+)→藍。
  // t 為 -1~1 的正規化拉力值。用固定刻度(不是每個分子各自的最大值)校準,
  // 這樣同樣程度的電負度差在不同分子之間顏色才會一致(例如 CO2 的 O 不會因為 C 同時接兩根雙鍵而被稀釋成黃綠色)。
  const PULL_NORM = 1.8;
  function espColor(t) {
    const clamped = Math.max(-1, Math.min(1, t));
    const hue = 120 * (1 - clamped); // t=+1(δ−極端)→0°紅;t=0→120°綠;t=-1(δ+極端)→240°藍
    const light = 50 - 6 * Math.abs(clamped);
    return `hsl(${hue.toFixed(0)}, 90%, ${light.toFixed(0)}%)`;
  }
  function espColorMix(t1, t2, frac) {
    return espColor(t1 + (t2 - t1) * frac);
  }

  function drawArrow(layer, x1, y1, x2, y2, color, width, withCross) {
    layer.appendChild(el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': width }));
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hl = 7 + width;
    [2.6, -2.6].forEach((da) => {
      layer.appendChild(
        el('line', {
          x1: x2,
          y1: y2,
          x2: x2 + hl * Math.cos(ang + da),
          y2: y2 + hl * Math.sin(ang + da),
          stroke: color,
          'stroke-width': width,
          'stroke-linecap': 'round',
        })
      );
    });
    if (withCross) {
      // 偶極箭頭的「⊕」尾巴:正端記號
      const cl = 4 + width * 1.4;
      const pxc = -Math.sin(ang);
      const pyc = Math.cos(ang);
      layer.appendChild(
        el('line', { x1: x1 - pxc * cl, y1: y1 - pyc * cl, x2: x1 + pxc * cl, y2: y1 + pyc * cl, stroke: color, 'stroke-width': width })
      );
    }
  }

  // 電子雲畫成連續、模糊邊緣的「海綿/棉花」狀電子密度表面(仿 ESP 電位表面圖),
  // 而不是一顆一顆的點:每個原子與每根鍵各給一顆模糊漸層的軟球,彼此重疊融合成一片。
  function drawCloud(layer) {
    // 已最佳化鎖定的原子現在是用 3D 旋轉投影畫的,螢幕位置跟 a.x/a.y(攤平座標)不一樣了 ——
    // 電子雲、偶極箭頭一定要用這份「目前實際畫在哪裡」的座標,才不會跟看得到的原子分家。
    const screenPos = rigidScreenPositions();
    const posOf = (id) => screenPos.get(id) || atomById(id);
    const tOf = (a) => Math.max(-1, Math.min(1, pullOf(a) / PULL_NORM));

    const defs = el('defs', {});
    layer.appendChild(defs);
    const blurId = 'cloud-blur';
    const filter = el('filter', { id: blurId, x: '-80%', y: '-80%', width: '260%', height: '260%' });
    filter.appendChild(el('feGaussianBlur', { stdDeviation: 4.5 }));
    defs.appendChild(filter);
    const cloudGroup = el('g', { filter: `url(#${blurId})` });

    function radialBlob(id, color, opacity) {
      const rg = el('radialGradient', { id, cx: '50%', cy: '50%', r: '50%' });
      rg.appendChild(el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': opacity }));
      rg.appendChild(el('stop', { offset: '62%', 'stop-color': color, 'stop-opacity': opacity * 0.85 }));
      rg.appendChild(el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
      defs.appendChild(rg);
    }

    atoms.forEach((a) => {
      const info = ELEMENTS[a.el];
      const d = derived(a);
      const tv = tOf(a);
      const color = espColor(tv);
      const gradId = `cloud-atom-${a.id}`;
      radialBlob(gradId, color, 0.94);
      const R = info.r + 22 + d.nonbonding * 6 + Math.abs(tv) * 14;
      const p = posOf(a.id);
      cloudGroup.appendChild(el('circle', { cx: p.x, cy: p.y, r: R, fill: `url(#${gradId})` }));
      // 90% 機率邊界(參考虛線圈,畫在模糊層外面才看得清楚)
      layer.appendChild(
        el('circle', { cx: p.x, cy: p.y, r: R * 1.15, fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3,5', 'stroke-opacity': 0.45 })
      );
      const pull = pullOf(a);
      if (pull > 0.2 || pull < -0.2) {
        const lp = polar(p.x, p.y, R + 20, 135);
        const labelEl = el('text', { x: lp.x, y: lp.y, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: color });
        labelEl.textContent = pull > 0 ? 'δ−' : 'δ+';
        layer.appendChild(labelEl);
      }
    });
    bonds.forEach((b) => {
      // 鍵中間補一顆軟球,讓兩個原子的雲在鍵上連成一片(不會斷開),顏色沿彩虹色階漸變
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const p1 = posOf(b.a), p2 = posOf(b.b);
      const midColor = espColorMix(tOf(a1), tOf(a2), 0.5);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const gradId = `cloud-bond-${b.a}-${b.b}`;
      radialBlob(gradId, midColor, 0.8);
      const R = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2 + 20 + 5 * b.order;
      cloudGroup.appendChild(el('circle', { cx: mx, cy: my, r: R, fill: `url(#${gradId})` }));
      // 鍵上四分之一/四分之三處再各補一顆較小的球,讓色階過渡更連續平滑(仿真正 ESP 表面的漸層)
      [0.25, 0.75].forEach((frac) => {
        const qx = p1.x + (p2.x - p1.x) * frac;
        const qy = p1.y + (p2.y - p1.y) * frac;
        const qColor = espColorMix(tOf(a1), tOf(a2), frac);
        const qGradId = `cloud-bondq-${b.a}-${b.b}-${frac}`;
        radialBlob(qGradId, qColor, 0.7);
        cloudGroup.appendChild(el('circle', { cx: qx, cy: qy, r: R * 0.72, fill: `url(#${qGradId})` }));
      });
    });
    layer.appendChild(cloudGroup);

    // 鍵偶極箭頭與淨偶極(清晰的圖層,不模糊)
    bonds.forEach((b) => {
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const p1 = posOf(b.a), p2 = posOf(b.b);
      const dEN = ELEMENTS[a2.el].en - ELEMENTS[a1.el].en; // >0:a2 是 δ−
      const polarBond = Math.abs(dEN) >= 0.4;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      // 鍵偶極箭頭(δ+ ⊕→ δ−)
      if (polarBond) {
        const mx = (p1.x + p2.x) / 2 + px * 34;
        const my = (p1.y + p2.y) / 2 + py * 34;
        const dir = dEN > 0 ? 1 : -1;
        drawArrow(layer, mx - ux * 22 * dir, my - uy * 22 * dir, mx + ux * 22 * dir, my + uy * 22 * dir, '#2b3038', 2.8, true);
      }
    });
    // 每個分子的淨偶極(用目前實際畫面上的座標重新算方向,跟著旋轉/振動走)
    components().forEach((comp) => {
      if (comp.length < 2) return;
      const ids = new Set(comp.map((a) => a.id));
      let vx = 0, vy = 0;
      bonds.forEach((b) => {
        if (!ids.has(b.a)) return;
        const a1 = atomById(b.a), a2 = atomById(b.b);
        const p1 = posOf(b.a), p2 = posOf(b.b);
        const dEN = ELEMENTS[a2.el].en - ELEMENTS[a1.el].en;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        vx += ((p2.x - p1.x) / d) * dEN * b.order;
        vy += ((p2.y - p1.y) / d) * dEN * b.order;
      });
      const mag = Math.hypot(vx, vy);
      const cx = comp.reduce((s, a) => s + posOf(a.id).x, 0) / comp.length;
      const cy = comp.reduce((s, a) => s + posOf(a.id).y, 0) / comp.length;
      const topY = Math.min(...comp.map((a) => posOf(a.id).y)) - 60;
      if (mag >= 0.35) {
        const ux = vx / mag;
        const uy = vy / mag;
        const L2 = 34 + Math.min(40, mag * 18);
        drawArrow(layer, cx - ux * L2, cy - uy * L2, cx + ux * L2, cy + uy * L2, '#e8940a', 4, true);
        const t = el('text', { x: cx, y: topY, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: '#e8940a' });
        t.textContent = '淨偶極 μ ≠ 0 → 極性分子';
        layer.appendChild(t);
      } else {
        const anyPolarBond = bonds.some((b) => {
          if (!ids.has(b.a)) return false;
          return Math.abs(ELEMENTS[atomById(b.a).el].en - ELEMENTS[atomById(b.b).el].en) >= 0.4;
        });
        const t = el('text', { x: cx, y: topY, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: '#4c6ef5' });
        t.textContent = anyPolarBond ? '鍵偶極對稱抵銷 → 非極性分子' : '鍵無極性 → 非極性分子';
        layer.appendChild(t);
      }
    });
  }

  // =====================================================================
  // 3D 立體結構(VSEPR 電子群排斥)與振動模式(真實力常數 Hessian 對角化)
  // =====================================================================
  let mol3D = null; // { atoms:[{id,el,x,y,z}], bonds, phantoms:{id:[{x,y,z},...]} }
  let modes3D = [];
  let selectedMode = 0;
  let vibPlaying = false;
  let vibT0 = 0;
  let vibLoopRunning = false;
  const view3D = { rotX: -0.3, rotY: 0.5 };
  let rotating = null;
  let zpeKJ = 0;
  const KJ_PER_MDYN_A = 602.214; // 1 mdyn·Å = 6.022e23 * 1e-18 J /mol /1000 = 602.2 kJ/mol
  const KJ_PER_CM1 = 0.0119627; // 1 cm⁻¹ = 11.96 J/mol

  function jacobiEigen(Ain, maxSweeps) {
    const n = Ain.length;
    const A = Ain.map((row) => row.slice());
    const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < (maxSweeps || 60); sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-14) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-15) continue;
          const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
          const sign = theta >= 0 ? 1 : -1;
          const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          const app = A[p][p], aqq = A[q][q], apq = A[p][q];
          A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
          A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
          A[p][q] = 0;
          A[q][p] = 0;
          for (let k = 0; k < n; k++) {
            if (k !== p && k !== q) {
              const akp = A[k][p], akq = A[k][q];
              A[k][p] = A[p][k] = c * akp - s * akq;
              A[k][q] = A[q][k] = s * akp + c * akq;
            }
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const eigenvalues = A.map((row, i) => row[i]);
    const order = eigenvalues.map((_, i) => i).sort((i, j) => eigenvalues[i] - eigenvalues[j]);
    return {
      values: order.map((i) => eigenvalues[i]),
      vectors: order.map((i) => V.map((row) => row[i])),
    };
  }

  function lonePairCountFor(atomLike) {
    return derived(atomLike).pairs;
  }

  // 用目前的 2D 連接關係(bonds/atoms)建立一組獨立的 3D 座標,
  // 以電子群排斥(VSEPR)+ 真實鍵長彈簧,從隨機起點鬆弛到平衡結構
  function build3DGeometry() {
    const real = atoms.map((a) => ({
      id: a.id,
      el: a.el,
      x: (Math.random() - 0.5) * 0.6,
      y: (Math.random() - 0.5) * 0.6,
      z: (Math.random() - 0.5) * 0.6,
    }));
    const byId = new Map(real.map((a) => [a.id, a]));
    const nbIds = new Map();
    atoms.forEach((a) => nbIds.set(a.id, []));
    bonds.forEach((b) => {
      nbIds.get(b.a).push(b.b);
      nbIds.get(b.b).push(b.a);
    });
    const phantoms = new Map();
    atoms.forEach((a) => {
      const n = lonePairCountFor(a);
      const arr = [];
      for (let i = 0; i < n; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        arr.push({ x: Math.sin(ph) * Math.cos(th), y: Math.sin(ph) * Math.sin(th), z: Math.cos(ph) });
      }
      phantoms.set(a.id, arr);
    });

    function norm(v) {
      const n = Math.hypot(v.x, v.y, v.z) || 1;
      return { x: v.x / n, y: v.y / n, z: v.z / n };
    }
    function sub(a, b) {
      return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }
    function dot(a, b) {
      return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    const STEPS = 1400;
    for (let step = 0; step < STEPS; step++) {
      const stepScale = 1 - step / STEPS;
      // 鍵長彈簧(真實 Å)
      bonds.forEach((b) => {
        const a1 = byId.get(b.a);
        const a2 = byId.get(b.b);
        const p = bondParams(a1.el, a2.el, b.order);
        const d = sub(a2, a1);
        const len = Math.hypot(d.x, d.y, d.z) || 1e-6;
        const err = len - p.len;
        const s = (err * 0.35 * stepScale) / len;
        a1.x += d.x * s; a1.y += d.y * s; a1.z += d.z * s;
        a2.x -= d.x * s; a2.y -= d.y * s; a2.z -= d.z * s;
      });
      // 電子群互斥(VSEPR):把鍵方向與孤對方向當成球面上互相排斥的點電荷
      // (真正的 Thomson 問題),讓線形/三角形/四面體角度自然浮現,不用硬套角度表
      atoms.forEach((c) => {
        const nb = nbIds.get(c.id);
        const lone = phantoms.get(c.id);
        const domainCount = nb.length + lone.length;
        if (domainCount < 2) return;
        const cPos = byId.get(c.id);
        const domains = [
          ...nb.map((id) => ({ kind: 'real', id, dir: norm(sub(byId.get(id), cPos)) })),
          ...lone.map((v, i) => ({ kind: 'lone', i, dir: norm(v) })),
        ];
        const forces = domains.map(() => ({ x: 0, y: 0, z: 0 }));
        for (let i = 0; i < domains.length; i++) {
          for (let j = i + 1; j < domains.length; j++) {
            const weight = (domains[i].kind === 'lone' ? LONE_WEIGHT : 1) * (domains[j].kind === 'lone' ? LONE_WEIGHT : 1);
            let dx = domains[i].dir.x - domains[j].dir.x;
            let dy = domains[i].dir.y - domains[j].dir.y;
            let dz = domains[i].dir.z - domains[j].dir.z;
            let d = Math.hypot(dx, dy, dz);
            if (d < 1e-4) {
              dx += (Math.random() - 0.5) * 0.02; dy += (Math.random() - 0.5) * 0.02; dz += (Math.random() - 0.5) * 0.02;
              d = Math.hypot(dx, dy, dz) || 1e-3;
            }
            const mag = weight / (d * d * d); // 反平方庫侖力(用弦長,等效於球面反平方排斥)
            const fx = (dx / d) * mag, fy = (dy / d) * mag, fz = (dz / d) * mag;
            forces[i].x += fx; forces[i].y += fy; forces[i].z += fz;
            forces[j].x -= fx; forces[j].y -= fy; forces[j].z -= fz;
          }
        }
        domains.forEach((dom, i) => {
          const f = forces[i];
          const radial = f.x * dom.dir.x + f.y * dom.dir.y + f.z * dom.dir.z;
          const tx = f.x - radial * dom.dir.x, ty = f.y - radial * dom.dir.y, tz = f.z - radial * dom.dir.z;
          const rate = 0.02 + 0.12 * stepScale;
          dom.dir = norm({ x: dom.dir.x + tx * rate, y: dom.dir.y + ty * rate, z: dom.dir.z + tz * rate });
        });
        domains.forEach((d) => {
          if (d.kind === 'real') {
            const p = bondParams(c.el, byId.get(d.id).el, (bonds.find((b) => (b.a === c.id && b.b === d.id) || (b.b === c.id && b.a === d.id)) || {}).order || 1);
            const target = byId.get(d.id);
            target.x = cPos.x + d.dir.x * p.len;
            target.y = cPos.y + d.dir.y * p.len;
            target.z = cPos.z + d.dir.z * p.len;
          } else {
            lone[d.i] = d.dir;
          }
        });
      });
      // 非鍵結原子間輕微排斥,避免不同分子/片段重疊
      for (let i = 0; i < real.length; i++) {
        for (let j = i + 1; j < real.length; j++) {
          const a1 = real[i], a2 = real[j];
          if (bondBetween(a1.id, a2.id)) continue;
          const minD = 1.6;
          const d = sub(a2, a1);
          const len = Math.hypot(d.x, d.y, d.z) || 1e-6;
          if (len < minD) {
            const s = ((minD - len) * 0.15 * stepScale) / len;
            a1.x -= d.x * s; a1.y -= d.y * s; a1.z -= d.z * s;
            a2.x += d.x * s; a2.y += d.y * s; a2.z += d.z * s;
          }
        }
      }
    }
    // 置中
    const cx = real.reduce((s, a) => s + a.x, 0) / real.length;
    const cy = real.reduce((s, a) => s + a.y, 0) / real.length;
    const cz = real.reduce((s, a) => s + a.z, 0) / real.length;
    real.forEach((a) => { a.x -= cx; a.y -= cy; a.z -= cz; });

    // 記錄鬆弛完成後「真正的」鍵角,供 Hessian 使用(只用真實原子,不含孤對虛點,
    // 這樣旋轉/平移絕對不變,孤對的影響已經反映在這個角度數值本身裡)
    const angleRefs = [];
    atoms.forEach((c) => {
      const nb = nbIds.get(c.id);
      if (nb.length < 2) return;
      const cPos = byId.get(c.id);
      for (let i = 0; i < nb.length; i++) {
        for (let j = i + 1; j < nb.length; j++) {
          const p1 = byId.get(nb[i]);
          const p2 = byId.get(nb[j]);
          const v1 = norm({ x: p1.x - cPos.x, y: p1.y - cPos.y, z: p1.z - cPos.z });
          const v2 = norm({ x: p2.x - cPos.x, y: p2.y - cPos.y, z: p2.z - cPos.z });
          const cosT = Math.max(-1, Math.min(1, dot(v1, v2)));
          angleRefs.push({ atomId: c.id, i: nb[i], j: nb[j], theta0: Math.acos(cosT) });
        }
      }
    });

    return { atoms: real, bonds: bonds.map((b) => ({ ...b })), phantoms, angleRefs };
  }

  // 以真實鍵長/力常數與 VSEPR 彎曲項組成的位能面(僅核座標),供數值 Hessian 使用
  function energy3D(flatCoords, mol) {
    const pos = mol.atoms.map((a, i) => ({ x: flatCoords[3 * i], y: flatCoords[3 * i + 1], z: flatCoords[3 * i + 2] }));
    const idx = new Map(mol.atoms.map((a, i) => [a.id, i]));
    let E = 0;
    mol.bonds.forEach((b) => {
      const a1 = mol.atoms[idx.get(b.a)];
      const p1 = pos[idx.get(b.a)];
      const a2 = mol.atoms[idx.get(b.b)];
      const p2 = pos[idx.get(b.b)];
      const bp = bondParams(a1.el, a2.el, b.order);
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      E += 0.5 * bp.k * (d - bp.len) * (d - bp.len);
    });
    // 彎曲項:只用「真實原子」之間的鍵角(相對於鬆弛後量到的平衡角),
    // 完全不涉及孤對虛點,因此對整體平移/旋轉絕對不變(不會污染振動模式)
    (mol.angleRefs || []).forEach((ref) => {
      const cPos = pos[idx.get(ref.atomId)];
      const p1 = pos[idx.get(ref.i)];
      const p2 = pos[idx.get(ref.j)];
      const v1 = { x: p1.x - cPos.x, y: p1.y - cPos.y, z: p1.z - cPos.z };
      const v2 = { x: p2.x - cPos.x, y: p2.y - cPos.y, z: p2.z - cPos.z };
      const n1 = Math.hypot(v1.x, v1.y, v1.z) || 1;
      const n2 = Math.hypot(v2.x, v2.y, v2.z) || 1;
      const cosT = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (n1 * n2)));
      const theta = Math.acos(cosT);
      const dth = theta - ref.theta0;
      E += 0.5 * ANGLE_K * dth * dth;
    });
    return E;
  }

  function numericalHessian(fn, x0, h) {
    const n = x0.length;
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    const f0 = fn(x0);
    for (let i = 0; i < n; i++) {
      const xp = x0.slice(); xp[i] += h;
      const xm = x0.slice(); xm[i] -= h;
      H[i][i] = (fn(xp) - 2 * f0 + fn(xm)) / (h * h);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const xpp = x0.slice(); xpp[i] += h; xpp[j] += h;
        const xpm = x0.slice(); xpm[i] += h; xpm[j] -= h;
        const xmp = x0.slice(); xmp[i] -= h; xmp[j] += h;
        const xmm = x0.slice(); xmm[i] -= h; xmm[j] -= h;
        const v = (fn(xpp) - fn(xpm) - fn(xmp) + fn(xmm)) / (4 * h * h);
        H[i][j] = v;
        H[j][i] = v;
      }
    }
    return H;
  }

  function isLinearMolecule(mol) {
    if (mol.atoms.length <= 2) return true;
    const nbIds = new Map();
    mol.atoms.forEach((a) => nbIds.set(a.id, []));
    mol.bonds.forEach((b) => {
      nbIds.get(b.a).push(b.b);
      nbIds.get(b.b).push(b.a);
    });
    let checked = false;
    let allLinear = true;
    mol.atoms.forEach((c) => {
      const nb = nbIds.get(c.id);
      if (nb.length !== 2) return;
      checked = true;
      const p0 = mol.atoms.find((a) => a.id === nb[0]);
      const p1 = mol.atoms.find((a) => a.id === nb[1]);
      const v1 = norm3(p0.x - c.x, p0.y - c.y, p0.z - c.z);
      const v2 = norm3(p1.x - c.x, p1.y - c.y, p1.z - c.z);
      const cosT = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      if (cosT >= -0.97) allLinear = false;
    });
    return checked && allLinear;
  }
  function norm3(x, y, z) {
    const n = Math.hypot(x, y, z) || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  function computeNormalModes(mol) {
    const N = mol.atoms.length;
    if (N < 2) return [];
    const x0 = [];
    mol.atoms.forEach((a) => x0.push(a.x, a.y, a.z));
    const H = numericalHessian((v) => energy3D(v, mol), x0, 0.015);
    const masses = mol.atoms.map((a) => ELEMENTS[a.el].mass);
    const Hmw = H.map((row, i) =>
      row.map((v, j) => v / Math.sqrt(masses[Math.floor(i / 3)] * masses[Math.floor(j / 3)]))
    );
    const { values, vectors } = jacobiEigen(Hmw, 80);
    const linear = isLinearMolecule(mol);
    const nZero = linear ? 5 : 6;
    const nModes = Math.max(0, 3 * N - nZero);
    const kept = values
      .map((v, i) => ({ v, vec: vectors[i] }))
      .slice(values.length - nModes); // 最大的 nModes 個(平移/旋轉的零模在最小處)

    return kept
      .map(({ v, vec }) => {
        const freq = v > 0 ? 1303 * Math.sqrt(v) : 0;
        const disp = mol.atoms.map((a, i) => ({
          x: vec[3 * i] / Math.sqrt(masses[i]),
          y: vec[3 * i + 1] / Math.sqrt(masses[i]),
          z: vec[3 * i + 2] / Math.sqrt(masses[i]),
        }));
        const maxD = Math.max(...disp.map((d) => Math.hypot(d.x, d.y, d.z)), 1e-6);
        disp.forEach((d) => { d.x /= maxD; d.y /= maxD; d.z /= maxD; });
        // 分類:看哪個鍵的鍵長變化量最大,標記是伸縮還是彎曲為主
        let bestBond = null;
        let bestStretch = 0;
        mol.bonds.forEach((b) => {
          const i1 = mol.atoms.findIndex((a) => a.id === b.a);
          const i2 = mol.atoms.findIndex((a) => a.id === b.b);
          const a1 = mol.atoms[i1], a2 = mol.atoms[i2];
          const bd = norm3(a2.x - a1.x, a2.y - a1.y, a2.z - a1.z);
          const rate = Math.abs((disp[i2].x - disp[i1].x) * bd.x + (disp[i2].y - disp[i1].y) * bd.y + (disp[i2].z - disp[i1].z) * bd.z);
          if (rate > bestStretch) {
            bestStretch = rate;
            bestBond = `${a1.el}-${a2.el}`;
          }
        });
        const totalMotion = disp.reduce((s, d) => s + Math.hypot(d.x, d.y, d.z), 0);
        const stretchFrac = totalMotion > 0 ? bestStretch / (totalMotion / mol.bonds.length || 1) : 0;
        const type = stretchFrac > 0.6 ? '伸縮' : '彎曲';
        // IR 強度的物理代理:這個模式的位移會不會改變分子偶極矩(dμ/dQ),
        // 用電負度差當作簡化的部分電荷,量出偶極對這個位移方向的導數
        let dmx = 0, dmy = 0, dmz = 0;
        mol.bonds.forEach((b) => {
          const i1 = mol.atoms.findIndex((a) => a.id === b.a);
          const i2 = mol.atoms.findIndex((a) => a.id === b.b);
          const dEN = ELEMENTS[mol.atoms[i2].el].en - ELEMENTS[mol.atoms[i1].el].en;
          dmx += dEN * (disp[i2].x - disp[i1].x);
          dmy += dEN * (disp[i2].y - disp[i1].y);
          dmz += dEN * (disp[i2].z - disp[i1].z);
        });
        const intensity = Math.hypot(dmx, dmy, dmz);
        return { freq, disp, type, bondLabel: bestBond, intensity };
      })
      .sort((a, b) => b.freq - a.freq);
  }

  function build3DAndVibrations() {
    mol3D = build3DGeometry();
    const allModes = computeNormalModes(mol3D);
    modes3D = importantModes(allModes);
    zpeKJ = zeroPointEnergyKJ(allModes);
    selectedMode = 0;
    // 立刻自動播放第一個振動模式,不用等使用者按按鈕才看得到動畫
    vibPlaying = modes3D.length > 0;
    vibT0 = performance.now();
    renderVibPanel();
    renderEnergyHeader();
    startVibLoop();
  }

  function renderEnergyHeader() {
    const el2 = document.getElementById('energy-header');
    if (!el2) return;
    if (!mol3D) {
      el2.textContent = '';
      el2.style.display = 'none';
      return;
    }
    el2.style.display = '';
    el2.textContent = `⚡ 分子零點振動能(ZPE)≈ ${zpeKJ.toFixed(1)} kJ/mol —— 由所有真實振動模式 ½Σhcω 加總換算而來`;
  }

  // 只要 vibPlaying 是 true,就持續重繪主畫布做出振動動畫;停止時自然結束,不留下多餘的 rAF
  function startVibLoop() {
    if (vibLoopRunning) return;
    vibLoopRunning = true;
    const loop = () => {
      if (!vibPlaying) {
        vibLoopRunning = false;
        return;
      }
      render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // 只留下有教學意義的模式:同一種鍵/類型且頻率相近的簡併模式合併成一個代表,
  // 並濾掉這個簡化力場常見的低頻扭轉/平面外雜訊模式(通常 <150 cm⁻¹,真正的鍵伸縮/彎曲都遠高於此)
  function importantModes(modes) {
    if (modes.length === 0) return [];
    const groups = [];
    modes.forEach((m) => {
      const g = groups.find(
        (gr) => gr.type === m.type && gr.bondLabel === m.bondLabel && Math.abs(gr.freq - m.freq) < Math.max(10, gr.freq * 0.02)
      );
      if (g) {
        g.freq = (g.freq * g.count + m.freq) / (g.count + 1);
        g.intensity += m.intensity;
        g.count++;
      } else {
        groups.push({ freq: m.freq, type: m.type, bondLabel: m.bondLabel, count: 1, disp: m.disp, intensity: m.intensity });
      }
    });
    const floor = Math.max(150, groups[0].freq * 0.06);
    const kept = groups.filter((g) => g.freq >= floor);
    return (kept.length ? kept : [groups[0]]).sort((a, b) => b.freq - a.freq);
  }

  // 零點振動能(ZPE)= ½Σhcω,換算成 kJ/mol —— 用「所有」模式(未合併簡併、未濾除雜訊),
  // 這是這顆分子真正的振動能量,跟教科書的鍵能數量級可以互相參照
  function zeroPointEnergyKJ(allModes) {
    return 0.5 * allModes.reduce((s, m) => s + m.freq, 0) * KJ_PER_CM1;
  }

  // 把 3D 模式的位移,依「沿著每個鍵在畫布上的實際方向」投影回 2D,
  // 這樣主畫布上的動畫看起來跟畫面上的鍵是一致的(伸縮沿著畫面上的鍵、同相/異相關係也保留)
  // 簡單的旋轉投影:繞 X、Y 軸轉,z 留著做景深排序與縮放
  function project3D(p) {
    const cy = Math.cos(view3D.rotY), sy = Math.sin(view3D.rotY);
    const cx = Math.cos(view3D.rotX), sx = Math.sin(view3D.rotX);
    const x1 = p.x * cy + p.z * sy;
    const z1 = -p.x * sy + p.z * cy;
    const y1 = p.y * cx - z1 * sx;
    const z2 = p.y * sx + z1 * cx;
    return { x: x1, y: y1, z: z2 };
  }

  // 目前這一幀,mol3D 每個原子的座標(含振動位移,單位是 3D 模型自己的 Å 尺度)
  function mol3DLivePositions() {
    const mode = vibPlaying ? modes3D[selectedMode] : null;
    let amp = 0;
    if (mode) {
      const t = (performance.now() - vibT0) / 220;
      amp = 0.4 * Math.sin(t);
    }
    return mol3D.atoms.map((a, i) => ({
      id: a.id,
      el: a.el,
      x: a.x + (mode ? mode.disp[i].x * amp : 0),
      y: a.y + (mode ? mode.disp[i].y * amp : 0),
      z: a.z + (mode ? mode.disp[i].z * amp : 0),
    }));
  }

  // 已最佳化鎖定的原子,目前應該畫在畫布上的哪個位置(套用 3D 旋轉投影後的螢幕座標)。
  // 電子雲、偶極箭頭等所有疊加圖層都要用這份座標,否則旋轉/振動時會跟看得到的原子分家。
  function rigidScreenPositions() {
    const map = new Map();
    if (!mol3D) return map;
    const slot = rigidSlotOf.get(mol3D.atoms[0]?.id) || { cx: STAGE_W / 2, cy: STAGE_H / 2, scale: 130 };
    let maxR = 1;
    mol3D.atoms.forEach((a) => { maxR = Math.max(maxR, Math.hypot(a.x, a.y, a.z) + 0.35); });
    const scale = slot.scale / maxR;
    mol3DLivePositions().forEach((a) => {
      const proj = project3D(a);
      map.set(a.id, { x: slot.cx + proj.x * scale, y: slot.cy - proj.y * scale, z: proj.z, scale });
    });
    return map;
  }

  // 把最佳化完成的分子畫成可拖曳旋轉的真實立體球棍圖,直接疊在主畫布上
  // (拖曳畫布空白處會旋轉視角);鍵長/鍵角標示用真正的 3D 數值(Å、度),
  // 不是攤平 2D 示意圖才會出現的 90° 假象
  function drawRigid3D(layer) {
    if (!mol3D) return;
    const slot = rigidSlotOf.get(mol3D.atoms[0]?.id) || { cx: STAGE_W / 2, cy: STAGE_H / 2, scale: 130 };
    let maxR = 1;
    mol3D.atoms.forEach((a) => { maxR = Math.max(maxR, Math.hypot(a.x, a.y, a.z) + 0.35); });
    const scale = slot.scale / maxR;
    const live = mol3DLivePositions();
    const positions = live.map((a) => ({ ...a, proj: project3D(a) }));
    const byId = new Map(positions.map((p) => [p.id, p]));

    // 每種元素各準備一顆「玻璃彈珠」光澤漸層(左上有亮點、右下加深),讓球看起來立體發亮
    const defs = el('defs', {});
    layer.appendChild(defs);
    Object.keys(ELEMENTS).forEach((elSym) => {
      const base = ELEMENTS[elSym].color;
      const rg = el('radialGradient', { id: `glossy-${elSym}`, cx: '32%', cy: '28%', r: '78%' });
      rg.appendChild(el('stop', { offset: '0%', 'stop-color': shade(base, 190) }));
      rg.appendChild(el('stop', { offset: '16%', 'stop-color': shade(base, 90) }));
      rg.appendChild(el('stop', { offset: '48%', 'stop-color': base }));
      rg.appendChild(el('stop', { offset: '80%', 'stop-color': shade(base, -55) }));
      rg.appendChild(el('stop', { offset: '100%', 'stop-color': shade(base, -110) }));
      defs.appendChild(rg);
    });
    const highlightId = 'glossy-highlight';
    const hg = el('radialGradient', { id: highlightId, cx: '50%', cy: '50%', r: '50%' });
    hg.appendChild(el('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 1 }));
    hg.appendChild(el('stop', { offset: '60%', 'stop-color': '#ffffff', 'stop-opacity': 0.5 }));
    hg.appendChild(el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }));
    defs.appendChild(hg);

    const items = [];
    mol3D.bonds.forEach((b) => {
      const p1 = byId.get(b.a), p2 = byId.get(b.b);
      if (!p1 || !p2) return;
      items.push({ kind: 'bond', b, p1, p2, z: (p1.proj.z + p2.proj.z) / 2 });
    });
    positions.forEach((p) => items.push({ kind: 'atom', p, z: p.proj.z }));
    items.sort((x, y) => x.z - y.z);

    items.forEach((item) => {
      if (item.kind === 'bond') {
        const { p1, p2, b } = item;
        const x1 = slot.cx + p1.proj.x * scale, y1 = slot.cy - p1.proj.y * scale;
        const x2 = slot.cx + p2.proj.x * scale, y2 = slot.cy - p2.proj.y * scale;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len;
        for (let i = 0; i < b.order; i++) {
          const off = (i - (b.order - 1) / 2) * 6;
          layer.appendChild(
            el('line', { x1: x1 + px * off, y1: y1 + py * off, x2: x2 + px * off, y2: y2 + py * off, stroke: '#8a8f9c', 'stroke-width': 3.2 })
          );
        }
      } else {
        const a = item.p;
        const info = ELEMENTS[a.el];
        const depthScale = 1 + a.proj.z * (0.9 / maxR) * 0.15;
        const r = info.r * 0.78 * depthScale;
        const x = slot.cx + a.proj.x * scale, y = slot.cy - a.proj.y * scale;
        // 主球體:玻璃彈珠光澤漸層(左上亮、右下深)
        layer.appendChild(el('circle', { cx: x, cy: y, r, fill: `url(#glossy-${a.el})`, stroke: shade(info.color, -90), 'stroke-width': 1.6 }));
        // 高光反射點,疊在球體左上方,做出打光的亮面感
        layer.appendChild(
          el('ellipse', { cx: x - r * 0.36, cy: y - r * 0.4, rx: r * 0.46, ry: r * 0.32, fill: `url(#${highlightId})` })
        );
        const t = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': r * 0.95, 'font-weight': 800, fill: '#222' });
        t.textContent = a.el;
        layer.appendChild(t);
      }
    });

    // 真實鍵長(Å)標示(用未加振動位移的基準座標,避免文字跟著抖動)
    const basePos = mol3D.atoms.map((a) => ({ ...a, proj: project3D(a) }));
    const baseById = new Map(basePos.map((p) => [p.id, p]));
    mol3D.bonds.forEach((b) => {
      const p1 = baseById.get(b.a), p2 = baseById.get(b.b);
      if (!p1 || !p2) return;
      const len = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      const x1 = slot.cx + p1.proj.x * scale, y1 = slot.cy - p1.proj.y * scale;
      const x2 = slot.cx + p2.proj.x * scale, y2 = slot.cy - p2.proj.y * scale;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const dlen = Math.hypot(dx, dy) || 1;
      const t = el('text', {
        x: mx - (dy / dlen) * 12,
        y: my + (dx / dlen) * 12,
        'text-anchor': 'middle',
        'font-size': 15,
        'font-weight': 700,
        fill: '#5c6270',
      });
      t.textContent = `${len.toFixed(2)} Å`;
      layer.appendChild(t);
    });
    // 真實鍵角(°)標示
    const nbIds = new Map();
    mol3D.atoms.forEach((a) => nbIds.set(a.id, []));
    mol3D.bonds.forEach((b) => {
      nbIds.get(b.a).push(b.b);
      nbIds.get(b.b).push(b.a);
    });
    mol3D.atoms.forEach((c) => {
      const nb = nbIds.get(c.id);
      if (nb.length < 2) return;
      // 2 個鍵夥伴:顯示那唯一的夾角;3 個以上(通常對稱,如 CH4/NH3):取所有兩兩夾角平均,標一個代表值
      let sum = 0, count = 0;
      for (let i = 0; i < nb.length; i++) {
        for (let j = i + 1; j < nb.length; j++) {
          const p1 = mol3D.atoms.find((a) => a.id === nb[i]);
          const p2 = mol3D.atoms.find((a) => a.id === nb[j]);
          const v1 = norm3(p1.x - c.x, p1.y - c.y, p1.z - c.z);
          const v2 = norm3(p2.x - c.x, p2.y - c.y, p2.z - c.z);
          const cosT = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y + v1.z * v2.z));
          sum += (Math.acos(cosT) * 180) / Math.PI;
          count++;
        }
      }
      const deg = sum / count;
      const cProj = baseById.get(c.id).proj;
      const cx2 = slot.cx + cProj.x * scale, cy2 = slot.cy - cProj.y * scale;
      const t = el('text', { x: cx2, y: cy2 - 18, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: '#4c6ef5' });
      t.textContent = nb.length === 2 ? `${deg.toFixed(1)}°` : `≈${deg.toFixed(1)}°(平均)`;
      layer.appendChild(t);
    });

    const hint = el('text', { x: slot.cx, y: slot.cy + slot.scale + 26, 'text-anchor': 'middle', 'font-size': 11, fill: '#98a1b3' });
    hint.textContent = '拖曳可旋轉立體結構';
    layer.appendChild(hint);
  }

  function planckLewis(w, T) {
    const x = (1.4388 * w) / T;
    return (w * w * w) / (Math.expm1(x) || 1e-12);
  }

  // 溫室效應相關波數範圍(粗略):地球 288K 熱輻射主要落在這裡(~4~50微米)
  const GHG_LO = 200, GHG_HI = 2500;

  function greenhouseAssessment() {
    if (!modes3D.length) return null;
    const maxI = Math.max(...modes3D.map((m) => m.intensity), 1e-9);
    const hits = modes3D.filter((m) => m.intensity / maxI > 0.12 && m.freq >= GHG_LO && m.freq <= GHG_HI);
    return { isGHG: hits.length > 0, hits };
  }

  function renderGhgVerdict() {
    const p = document.getElementById('ghg-verdict');
    if (!p) return;
    const ga = greenhouseAssessment();
    if (!ga) {
      p.textContent = '';
      p.className = 'status-line';
      return;
    }
    if (ga.isGHG) {
      const list = ga.hits.map((m) => `${m.freq.toFixed(0)} cm⁻¹`).join('、');
      p.innerHTML = `🌍 <b>是溫室氣體</b> —— 這顆分子有振動模式(${list})同時①改變偶極矩(IR 活躍)②頻率落在地球熱輻射的範圍內,會吸收地球往外散的熱。`;
      p.className = 'status-line warn';
    } else {
      p.innerHTML = '🌍 <b>不是溫室氣體</b>(以這幾個振動模式來看)—— 沒有模式同時符合「改變偶極矩」與「落在地球熱輻射範圍內」這兩個條件。';
      p.className = 'status-line success';
    }
  }

  function renderIRChart() {
    const svg = document.getElementById('svg-lewis-ir');
    if (!svg) return;
    svg.innerHTML = '';
    renderGhgVerdict();
    if (!mol3D || modes3D.length === 0) return;
    const xHi = 4000, xLo = 400;
    const L = 68, Rm = 20, T = 46, Bm = 46, W = 720, Hh = 230;
    const xPx = (w) => L + ((xHi - w) / (xHi - xLo)) * (W - L - Rm);
    const yPx = (pct) => T + ((100 - pct) / 100) * (Hh - T - Bm);
    const g = el('g', {});

    g.appendChild(el('line', { x1: L, y1: T, x2: L, y2: Hh - Bm, stroke: '#99a1b3', 'stroke-width': 1 }));
    g.appendChild(el('line', { x1: L, y1: Hh - Bm, x2: W - Rm, y2: Hh - Bm, stroke: '#99a1b3', 'stroke-width': 1 }));
    [4000, 3000, 2000, 1000, 400].forEach((w) => {
      const x = xPx(w);
      g.appendChild(el('line', { x1: x, y1: Hh - Bm, x2: x, y2: Hh - Bm + 4, stroke: '#99a1b3', 'stroke-width': 1 }));
      const t = el('text', { x, y: Hh - Bm + 20, 'text-anchor': 'middle', 'font-size': 15, fill: '#495057' });
      t.textContent = w;
      g.appendChild(t);
    });
    const xl = el('text', { x: (L + W - Rm) / 2, y: Hh - 6, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#495057' });
    xl.textContent = '波數(cm⁻¹)';
    g.appendChild(xl);
    [0, 50, 100].forEach((pct) => {
      const y = yPx(pct);
      g.appendChild(el('line', { x1: L - 4, y1: y, x2: L, y2: y, stroke: '#99a1b3', 'stroke-width': 1 }));
      const t = el('text', { x: L - 8, y: y + 5, 'text-anchor': 'end', 'font-size': 15, fill: '#495057' });
      t.textContent = pct;
      g.appendChild(t);
    });
    const yl = el('text', {
      x: 16, y: (T + Hh - Bm) / 2, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#495057',
      transform: `rotate(-90 16 ${(T + Hh - Bm) / 2})`,
    });
    yl.textContent = '穿透率 %T';
    g.appendChild(yl);

    // 疊上地球熱輻射(288K)與太陽輻射尾端(5778K)黑體曲線(各自歸一化,示意)
    const y0 = yPx(0);
    let earthMax = 0;
    for (let w = xLo; w <= xHi; w += 10) earthMax = Math.max(earthMax, planckLewis(w, 288));
    const earthH = (Hh - T - Bm) * 0.55;
    let dEarth = `M${xPx(xHi).toFixed(1)},${y0.toFixed(1)} `;
    for (let w = xHi; w >= xLo; w -= 10) dEarth += `L${xPx(w).toFixed(1)},${(y0 - (planckLewis(w, 288) / earthMax) * earthH).toFixed(1)} `;
    dEarth += `L${xPx(xLo).toFixed(1)},${y0.toFixed(1)} Z`;
    g.appendChild(el('path', { d: dEarth, fill: 'rgba(232,148,10,.16)', stroke: '#e8940a', 'stroke-width': 1.2 }));
    const sunRef = planckLewis(xHi, 5778);
    const sunH = (Hh - T - Bm) * 0.3;
    let dSun = `M${xPx(xHi).toFixed(1)},${y0.toFixed(1)} `;
    for (let w = xHi; w >= xLo; w -= 10) dSun += `L${xPx(w).toFixed(1)},${(y0 - (planckLewis(w, 5778) / sunRef) * sunH).toFixed(1)} `;
    dSun += `L${xPx(xLo).toFixed(1)},${y0.toFixed(1)} Z`;
    g.appendChild(el('path', { d: dSun, fill: 'rgba(250,204,21,.15)', stroke: '#d4a90a', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
    const legE = el('text', { x: L + 8, y: T - 26, 'font-size': 13, 'font-weight': 700, fill: '#e8940a' });
    legE.textContent = '━ 地球熱輻射(288K)';
    g.appendChild(legE);
    const legS = el('text', { x: L + 8, y: T - 10, 'font-size': 13, fill: '#b8930a' });
    legS.textContent = '┅ 太陽輻射尾端(5778K)';
    g.appendChild(legS);

    // 這顆分子的 IR 吸收峰(Lorentzian),強度來自 dμ/dQ(偶極對這個模式的變化率)
    const maxI = Math.max(...modes3D.map((m) => m.intensity), 1e-9);
    const gamma = 40;
    let d = '';
    for (let w = xHi; w >= xLo; w -= 6) {
      let pct = 100;
      modes3D.forEach((m) => {
        const inten = m.intensity / maxI;
        const z = (w - m.freq) / gamma;
        pct -= inten * 88 * (1 / (1 + z * z));
      });
      d += (d ? 'L' : 'M') + xPx(w).toFixed(1) + ',' + yPx(Math.max(pct, 2)).toFixed(1) + ' ';
    }
    g.appendChild(el('path', { d, fill: 'none', stroke: '#1f2430', 'stroke-width': 2.2 }));

    modes3D.forEach((m, i) => {
      const px = xPx(m.freq);
      const inten = m.intensity / maxI;
      if (inten < 0.04) return; // 幾乎不吸收就不特別標
      const py = yPx(100 - inten * 88);
      const t = el('text', { x: px, y: py - 10, 'text-anchor': 'middle', 'font-size': 13, fill: i === selectedMode ? '#3b5bdb' : '#495057', 'font-weight': i === selectedMode ? 700 : 600 });
      t.textContent = m.freq.toFixed(0);
      g.appendChild(t);
    });
    // 選取模式標記
    const sel = modes3D[selectedMode];
    if (sel) {
      const spx = xPx(sel.freq);
      g.appendChild(el('line', { x1: spx, y1: T, x2: spx, y2: Hh - Bm, stroke: '#3b5bdb', 'stroke-width': 1.5, 'stroke-dasharray': '5,4' }));
    }

    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.appendChild(g);
  }

  function renderVibPanel() {
    const wrap = document.getElementById('vib-mode-list');
    const axisWrap = document.getElementById('vib-axis-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!mol3D || modes3D.length === 0) {
      wrap.innerHTML = '<p class="tiny">按「⚛ 鍵長最佳化」後,這裡會列出這顆分子真正算出來的重要振動模式(依真實原子質量與鍵力常數,對位能面做 Hessian 對角化;簡併模式與雜訊模式已自動省略),動畫會直接顯示在左邊的分子上,下面也會畫出這顆分子的 IR 光譜。</p>';
      if (axisWrap) axisWrap.style.display = 'none';
      renderIRChart();
      return;
    }
    if (axisWrap) axisWrap.style.display = '';
    modes3D.forEach((m, i) => {
      const btn = document.createElement('button');
      btn.className = 'orb-btn vib-btn' + (i === selectedMode ? ' active' : '');
      const ir = m.intensity >= 0.04 * Math.max(...modes3D.map((mm) => mm.intensity), 1e-9) ? '✔IR' : '✘IR';
      btn.textContent = `${m.bondLabel || ''} ${m.type} ${m.freq.toFixed(0)} cm⁻¹${m.count > 1 ? `(${m.count}重簡併)` : ''} ${ir}`;
      btn.addEventListener('click', () => {
        selectedMode = i;
        vibPlaying = true;
        vibT0 = performance.now();
        renderVibPanel();
        startVibLoop();
      });
      wrap.appendChild(btn);
    });
    renderIRChart();
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
    // 只有第一次或勾選狀態真的變了才重建按鈕,避免振動動畫每一幀都重新產生 DOM
    if (chipsEl.childElementCount !== TARGETS.length) {
      chipsEl.innerHTML = '';
      TARGETS.forEach((t) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.title = '點一下直接生成這個分子並自動最佳化';
        chip.dataset.key = t.key;
        chip.addEventListener('click', () => buildPresetMolecule(t.key));
        chipsEl.appendChild(chip);
      });
    }
    Array.from(chipsEl.children).forEach((chip, i) => {
      const t = TARGETS[i];
      const done = doneTargets.has(t.key);
      chip.className = 'chip' + (done ? ' done' : '');
      chip.textContent = (done ? '✓ ' : '') + t.label;
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
      const dip = dipoleOf(comp);
      const polarText = dip.mag >= 0.35 ? ',依目前幾何為<b>極性分子</b>' : ',依目前幾何為<b>非極性分子</b>';
      if (allSat && net === 0) {
        lines.push(`${meter(0)} ✓ <b>${name}</b> — 每個原子都達成八隅體(H 為二隅體),能量低、結構穩定,可以存在${polarText}(先按⚛最佳化再判斷極性才準)。`);
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

    // 幾何面板:鍵長與鍵角
    const geomEl = document.getElementById('geom-panel');
    if (geomEl) {
      if (mol3D) {
        const bl3 = mol3D.bonds
          .map((b) => {
            const a1 = mol3D.atoms.find((a) => a.id === b.a);
            const a2 = mol3D.atoms.find((a) => a.id === b.b);
            const sym = b.order === 1 ? '−' : b.order === 2 ? '=' : '≡';
            const len = Math.hypot(a1.x - a2.x, a1.y - a2.y, a1.z - a2.z);
            return `${a1.el}${sym}${a2.el}:${len.toFixed(2)} Å`;
          })
          .join('<br>');
        const nbIds = new Map();
        mol3D.atoms.forEach((a) => nbIds.set(a.id, []));
        mol3D.bonds.forEach((b) => { nbIds.get(b.a).push(b.b); nbIds.get(b.b).push(b.a); });
        const al3 = [];
        mol3D.atoms.forEach((c) => {
          const nb = nbIds.get(c.id);
          if (nb.length < 2) return;
          let sum = 0, count = 0;
          for (let i = 0; i < nb.length; i++) {
            for (let j = i + 1; j < nb.length; j++) {
              const p1 = mol3D.atoms.find((a) => a.id === nb[i]);
              const p2 = mol3D.atoms.find((a) => a.id === nb[j]);
              const v1 = norm3(p1.x - c.x, p1.y - c.y, p1.z - c.z);
              const v2 = norm3(p2.x - c.x, p2.y - c.y, p2.z - c.z);
              const cosT = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y + v1.z * v2.z));
              sum += (Math.acos(cosT) * 180) / Math.PI;
              count++;
            }
          }
          al3.push(`以 ${c.el} 為中心:${(sum / count).toFixed(1)}°${nb.length > 2 ? '(平均)' : ''}`);
        });
        geomEl.innerHTML =
          `<h4>真實立體幾何(3D)</h4>` +
          `<p class="tiny"><b>鍵長</b>(真實鍵長,Å)<br>${bl3}</p>` +
          `<p class="tiny"><b>鍵角</b>(真實立體角度,拖曳畫布可旋轉觀察)<br>${al3.join('<br>') || '(無)'}</p>`;
      } else {
        const { bondsInfo, angles } = geometryInfo();
        if (bondsInfo.length === 0) {
          geomEl.innerHTML =
            '<h4>目前的幾何:鍵長與鍵角</h4><p class="tiny">接出鍵之後,這裡與畫布上會即時顯示鍵長(相對單位)與鍵角;按「⚛ 鍵長最佳化」讓它們收斂到平衡值,並換算成真實的 Å 與立體角度。</p>';
        } else {
          const bl = bondsInfo
            .map((b) => `${b.label}:${b.len.toFixed(0)}(平衡 ${b.r0.toFixed(0)})`)
            .join('<br>');
          const al = angles.length
            ? angles.map((a2) => `${a2.label}:${a2.deg.toFixed(1)}°`).join('<br>')
            : '(尚無鍵角:需要一個原子接兩個以上的鍵)';
          geomEl.innerHTML =
            `<h4>目前的幾何:鍵長與鍵角</h4>` +
            `<p class="tiny"><b>鍵長</b>(相對單位,括號為平衡值;鍵級越高越短)<br>${bl}</p>` +
            `<p class="tiny"><b>鍵角</b>(攤平的 2D 示意圖,只是暫時的建構畫面)<br>${al}</p>`;
        }
      }
    }

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
    const rigidLayer = el('g', {});
    stage.appendChild(bondLayer);
    stage.appendChild(atomLayer);
    stage.appendChild(rigidLayer);

    drawTrash(bondLayer);
    if (cloudOn) drawCloud(bondLayer);
    drawGeometryLabels(bondLayer);
    drawRigid3D(rigidLayer);

    bonds.forEach((b) => {
      if (rigidAtoms.has(b.a) && rigidAtoms.has(b.b)) return; // 已最佳化的鍵改由 3D 那一批畫
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
      if (rigidAtoms.has(a.id)) return; // 已最佳化的原子改由 3D 那一批畫
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
      const enDiv = document.createElement('div');
      enDiv.className = 'pname pen';
      enDiv.textContent = `電負度 ${info.en.toFixed(2)}`;
      btn.appendChild(enDiv);
      // 按住拖進畫布;只點一下則自動放入
      btn.addEventListener('pointerdown', (e) => {
        paletteDrag = { key, sx: e.clientX, sy: e.clientY, spawned: false };
        e.preventDefault();
      });
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
    document.getElementById('btn-optimize').addEventListener('click', runOptimize);
    const cloudBtn = document.getElementById('btn-cloud');
    cloudBtn.addEventListener('click', () => {
      cloudOn = !cloudOn;
      cloudBtn.classList.toggle('active', cloudOn);
      setStatus(
        cloudOn
          ? '顯示價電子雲:點狀(網狀)分布表示電子出現的機率,虛線圈約包住 90% 的機率密度;鍵上的雲比較密,就是共用電子的地方。'
          : '已隱藏電子雲。'
      );
      render();
    });

    stage.addEventListener('pointerdown', (e) => {
      if (mol3D) {
        rotating = { sx: e.clientX, sy: e.clientY, rx: view3D.rotX, ry: view3D.rotY };
        e.preventDefault();
        return;
      }
      if (e.target === stage) {
        selectedId = null;
        render();
      }
    });
    document.addEventListener('pointermove', (e) => {
      if (rotating) {
        view3D.rotY = rotating.ry + (e.clientX - rotating.sx) * 0.012;
        view3D.rotX = Math.max(-1.4, Math.min(1.4, rotating.rx + (e.clientY - rotating.sy) * 0.012));
        render();
        return;
      }
      // 從原子盒拖出:移動超過門檻才在指標位置生成原子
      if (paletteDrag && !paletteDrag.spawned) {
        if (Math.hypot(e.clientX - paletteDrag.sx, e.clientY - paletteDrag.sy) < 8) return;
        const p = toSvgPoint(e.clientX, e.clientY);
        const info = ELEMENTS[paletteDrag.key];
        const a = {
          id: nextId++,
          el: paletteDrag.key,
          x: Math.max(30, Math.min(STAGE_W - 30, p.x)),
          y: Math.max(30, Math.min(STAGE_H - 30, p.y)),
          electrons: info.valence,
        };
        atoms.push(a);
        drag = { id: a.id, sx: p.x, sy: p.y, moved: true };
        paletteDrag.spawned = true;
        setStatus(`拖曳 ${info.name} ${paletteDrag.key} 到定位後放開。`);
        render();
        return;
      }
      if (!drag) return;
      const a = atomById(drag.id);
      if (!a) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 6) return;
      const justStartedMoving = !drag.moved;
      drag.moved = true;
      if (rigidAtoms.has(a.id)) {
        // 已最佳化的分子:完全鎖定,不可再移動(整顆或個別都不行)
        if (justStartedMoving) {
          setStatus('這顆分子已經最佳化鎖定,無法再移動。要重來的話按「清空畫布」,或選取原子用右側面板刪除。', 'warn');
        }
      } else {
        a.x = Math.max(30, Math.min(STAGE_W - 30, p.x));
        a.y = Math.max(30, Math.min(STAGE_H - 30, p.y));
        trashHover = Math.hypot(a.x - TRASH.x, a.y - TRASH.y) < TRASH.r + 10;
        checkBreak(a);
        if (!trashHover) checkForm(a);
      }
      render();
    });
    const endDrag = () => {
      if (rotating) {
        rotating = null;
        return;
      }
      if (paletteDrag) {
        if (!paletteDrag.spawned) addAtom(paletteDrag.key);
        paletteDrag = null;
      }
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
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);

    // 測試用鉤子(不影響使用)
    window.__lewis = {
      atoms: () => atoms.map((a) => ({ ...a, ...derived(a) })),
      bonds: () => bonds.map((b) => ({ ...b })),
      isRigid: (id) => rigidAtoms.has(id),
      modes: () => modes3D.map((m) => ({ freq: m.freq, type: m.type, bondLabel: m.bondLabel, intensity: m.intensity, count: m.count })),
      mol3D: () => mol3D,
      zpeKJ: () => zpeKJ,
      buildPreset: (key) => buildPresetMolecule(key),
    };

    renderVibPanel();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
