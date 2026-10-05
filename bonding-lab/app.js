// 分頁①「拼拼看」:週期表、拖拉成鍵、電子記帳面板、範例分子、動手畫題目
(() => {
  const C = window.Chem;
  const { CATS, PRESETS, byKey } = window.Presets;
  const W = 640, H = 440;
  const TRASH = { x: W - 62, y: H - 62, w: 48, h: 48 };

  const svg = document.getElementById('stage');
  const S = {
    mol: C.newMol(),
    view: C.newView(W / 2, H / 2),
    selectedId: null,
    candidateId: null,
    preset: null,
    presetIds: null,
    formIdx: 0,
    question: null,
    drag: null,
    anim: 0,
  };
  const opts = () => ({
    bondStyle: document.getElementById('bond-style').value,
    showFC: document.getElementById('tg-fc').checked,
    marks: document.getElementById('tg-marks').checked,
    partial: document.getElementById('tg-partial').checked,
    selectedId: S.selectedId,
    candidateId: S.candidateId,
  });

  function setStatus(msg, cls = '') {
    const p = document.getElementById('status');
    p.innerHTML = msg;
    p.className = 'status-line ' + cls;
  }

  // ---------------------------------------------------------------------------
  // 繪圖
  // ---------------------------------------------------------------------------
  function draw() {
    C.render(svg, S.mol, S.view, opts());
    drawTrash();
    updateAtomCard();
    updateMolCard();
  }
  function drawTrash() {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    const active = S.drag && S.drag.type === 'atom' && S.drag.overTrash;
    const r = document.createElementNS(NS, 'rect');
    Object.entries({ x: TRASH.x, y: TRASH.y, width: TRASH.w, height: TRASH.h, rx: 10, fill: active ? '#ffe3e3' : '#f8f9fa', stroke: active ? '#e03131' : '#ced4da', 'stroke-dasharray': '4 3' })
      .forEach(([k, v]) => r.setAttribute(k, v));
    g.appendChild(r);
    const t = document.createElementNS(NS, 'text');
    Object.entries({ x: TRASH.x + TRASH.w / 2, y: TRASH.y + 31, 'text-anchor': 'middle', 'font-size': 22 }).forEach(([k, v]) => t.setAttribute(k, v));
    t.textContent = '🗑';
    g.appendChild(t);
    svg.appendChild(g);
  }

  // 結構改變後,動畫式地鬆弛到正確形狀,再平滑地轉到看得清楚的方向
  function settle(orientAfter = true, force = false) {
    cancelAnimationFrame(S.anim);
    let frames = 0;
    let improved = false;
    const step = () => {
      const m = C.relax(S.mol, 14, S.drag && S.drag.type === 'atom' ? S.drag.id : null);
      frames++;
      if ((m < 0.04 || frames > 80) && !improved) {
        // 連續鬆弛可能卡在局部最小值(5、6 個電子域),試一次孤對/鍵對調
        improved = true;
        if (C.improveDomains(S.mol)) { frames = 40; S.anim = requestAnimationFrame(step); return; }
      }
      if (m < 0.04 || frames > 80) {
        draw();
        if (orientAfter) animateOrient(force);
        return;
      }
      draw();
      S.anim = requestAnimationFrame(step);
    };
    S.anim = requestAnimationFrame(step);
  }
  function animateOrient(force) {
    const plans = C.orientPlan(S.mol, S.view, force).map((pl) => ({ ...pl, aa: C.toAxisAngle(pl.M) }));
    if (!plans.length) { keepInView(); draw(); return; }
    const N = 14;
    let k = 0;
    const step = () => {
      k++;
      plans.forEach((pl) => {
        if (!pl.aa) { if (k === N) C.rotateFragment(S.mol, pl.ids, pl.cen, pl.M); return; }
        C.rotateFragment(S.mol, pl.ids, pl.cen, C.axisAngle(pl.aa.axis, pl.aa.ang / N));
      });
      if (k >= N) { keepInView(); draw(); return; }
      draw();
      S.anim = requestAnimationFrame(step);
    };
    S.anim = requestAnimationFrame(step);
  }
  // 原子跑出畫面就整體拉回來
  function keepInView() {
    if (!S.mol.atoms.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    S.mol.atoms.forEach((a) => {
      const p = C.project(S.view, [a.x, a.y, a.z]);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
    const pad = 50;
    let dx = 0, dy = 0;
    if (x1 - x0 < W - 2 * pad) { if (x0 < pad) dx = pad - x0; else if (x1 > W - pad) dx = W - pad - x1; }
    if (y1 - y0 < H - 2 * pad) { if (y0 < pad) dy = pad - y0; else if (y1 > H - pad) dy = H - pad - y1; }
    if (dx || dy) {
      const d = C.unprojectDelta(S.view, dx, dy, S.view.scale);
      S.mol.atoms.forEach((a) => { a.x += d[0]; a.y += d[1]; a.z += d[2]; });
    }
  }

  // ---------------------------------------------------------------------------
  // 週期表
  // ---------------------------------------------------------------------------
  function buildTable() {
    const box = document.getElementById('ptable');
    box.innerHTML = '';
    box.appendChild(document.createElement('div'));
    for (let g = 1; g <= 8; g++) {
      const h = document.createElement('div');
      h.className = 'pt-head';
      h.textContent = g + 'A';
      box.appendChild(h);
    }
    C.TABLE.forEach((row, r) => {
      const lab = document.createElement('div');
      lab.className = 'pt-row';
      lab.textContent = r + 1;
      box.appendChild(lab);
      row.forEach((sym) => {
        if (!sym) {
          const e = document.createElement('div');
          e.className = 'pt-empty';
          box.appendChild(e);
          return;
        }
        const info = C.ELEMENTS[sym];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pt-cell' + (info.metal ? ' metal' : '') + (C.NOBLE_INERT.has(sym) ? ' noble' : '');
        b.style.background = info.color;
        b.title = `${info.name} ${sym}:${info.group}A 族,價電子 ${info.valence}${info.en ? `,電負度 ${info.en}` : ''}`;
        b.innerHTML = `${sym}<span class="pt-v">${info.valence}</span>`;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          S.drag = { type: 'palette', el: sym, x: e.clientX, y: e.clientY, created: false };
        });
        box.appendChild(b);
      });
    });
  }

  function svgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: W / 2, y: H / 2 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function overStage(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }
  function freeSpot() {
    for (let k = 0; k < 200; k++) {
      const ang = k * 2.4, rad = 30 + 16 * Math.sqrt(k) * 4;
      const x = W / 2 - 120 + Math.cos(ang) * rad, y = H / 2 + Math.sin(ang) * rad * 0.7;
      if (x < 50 || x > W - 80 || y < 50 || y > H - 50) continue;
      const ok = S.mol.atoms.every((a) => {
        const p = C.project(S.view, [a.x, a.y, a.z]);
        return Math.hypot(p.x - x, p.y - y) > 95;
      });
      if (ok) return { x, y };
    }
    return { x: 80 + Math.random() * 200, y: 80 + Math.random() * 200 };
  }
  function placeAtom(sym, sx, sy) {
    leavePreset();
    const w = C.screenToWorld(S.view, sx, sy);
    const a = C.addAtom(S.mol, sym, w[0], w[1], w[2]);
    S.selectedId = a.id;
    const info = C.ELEMENTS[sym];
    const i = C.atomInfo(S.mol, a);
    let msg = `放入 ${info.name} ${sym}:${info.group}A 族,價電子 ${info.valence} 個`;
    if (info.metal) msg += `。金屬:拉到非金屬旁邊,會把電子轉移過去形成離子`;
    else if (C.NOBLE_INERT.has(sym)) msg += `,已經是${sym === 'He' ? '二' : '八'}隅體,不會成鍵`;
    else msg += `,其中 ${i.unpaired} 個未配對電子 → 可以形成 ${i.unpaired} 個共價鍵`;
    setStatus(msg + '。');
    return a;
  }

  // ---------------------------------------------------------------------------
  // 拖拉
  // ---------------------------------------------------------------------------
  function bondsOf(id) { return S.mol.bonds.filter((b) => b.a === id || b.b === id); }

  function moveAtom(a, clientX, clientY) {
    const p = svgPoint(clientX, clientY);
    const cur = C.project(S.view, [a.x, a.y, a.z]);
    const d = C.unprojectDelta(S.view, p.x - cur.x, p.y - cur.y, cur.s);
    a.x += d[0]; a.y += d[1]; a.z += d[2];
    S.drag.overTrash = p.x > TRASH.x - 6 && p.x < TRASH.x + TRASH.w + 6 && p.y > TRASH.y - 6 && p.y < TRASH.y + TRASH.h + 6;
    // 拉太遠就斷鍵
    const me = C.project(S.view, [a.x, a.y, a.z]);
    bondsOf(a.id).forEach((b) => {
      const o = C.atomById(S.mol, C.otherOf(b, a.id));
      const q = C.project(S.view, [o.x, o.y, o.z]);
      if (Math.hypot(me.x - q.x, me.y - q.y) > (C.drawR(a.el) + C.drawR(o.el)) * me.s + 150) {
        C.breakBond(S.mol, b);
        setStatus(`${a.el}−${o.el} 的鍵斷了,共用電子回到原本出電子的原子身上。`, 'warn');
      }
    });
    S.mol.links.filter((l) => l.a === a.id || l.b === a.id).forEach((l) => {
      const o = C.atomById(S.mol, C.otherOf(l, a.id));
      const q = C.project(S.view, [o.x, o.y, o.z]);
      if (Math.hypot(me.x - q.x, me.y - q.y) > 260) {
        C.breakLink(S.mol, l);
        setStatus(`${a.el} 和 ${o.el} 分開了(離子各自保留電荷)。`, 'warn');
      }
    });
    // 找附近可以成鍵的原子
    // 範圍內優先選「接得起來」的原子,再比距離
    let best = null, bestD = Infinity;
    S.mol.atoms.forEach((o) => {
      if (o.id === a.id || C.bondBetween(S.mol, a.id, o.id) || C.linkBetween(S.mol, a.id, o.id)) return;
      const q = C.project(S.view, [o.x, o.y, o.z]);
      const dist = Math.hypot(me.x - q.x, me.y - q.y);
      if (dist > (C.drawR(a.el) + C.drawR(o.el)) * me.s + 50) return;
      const score = dist + (C.canConnect(S.mol, a, o) ? 0 : 1000);
      if (score < bestD) { best = o; bestD = score; }
    });
    S.candidateId = best ? best.id : null;
    C.relax(S.mol, 3, a.id);
    draw();
  }

  function finishAtomDrag() {
    const d = S.drag;
    const a = C.atomById(S.mol, d.id);
    S.drag = null;
    if (!a) { draw(); return; }
    if (d.overTrash) {
      C.deleteAtom(S.mol, a.id);
      S.selectedId = null;
      S.candidateId = null;
      setStatus(`刪除了 ${a.el}。`);
      leavePreset();
      settle(false);
      return;
    }
    if (!d.moved) {
      S.selectedId = S.selectedId === a.id ? null : a.id;
      draw();
      return;
    }
    if (S.candidateId) {
      const o = C.atomById(S.mol, S.candidateId);
      S.candidateId = null;
      const r = C.connect(S.mol, a, o);
      setStatus(r.msg + (r.ok && r.kind !== 'ionic' ? '。點一下鍵可以改成雙鍵/三鍵。' : ''), r.ok ? 'success' : 'warn');
      if (r.ok) leavePreset();
      settle(true);
      return;
    }
    settle(true);
  }

  svg.addEventListener('pointerdown', (e) => {
    const atomEl = e.target.closest('[data-atom]');
    const bondEl = e.target.closest('[data-bond]');
    if (atomEl) {
      const id = Number(atomEl.getAttribute('data-atom'));
      S.drag = { type: 'atom', id, x: e.clientX, y: e.clientY, moved: false };
    } else if (bondEl) {
      S.drag = { type: 'bond', idx: Number(bondEl.getAttribute('data-bond')), x: e.clientX, y: e.clientY, moved: false };
    } else {
      S.drag = { type: 'rotate', x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    }
    cancelAnimationFrame(S.anim);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    const d = S.drag;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
    if (d.type === 'palette') {
      if (!d.created && d.moved && overStage(e.clientX, e.clientY)) {
        const p = svgPoint(e.clientX, e.clientY);
        const a = placeAtom(d.el, p.x, p.y);
        S.drag = { type: 'atom', id: a.id, x: e.clientX, y: e.clientY, moved: true };
        draw();
      }
      return;
    }
    if (d.type === 'atom' && d.moved) {
      const a = C.atomById(S.mol, d.id);
      if (a) moveAtom(a, e.clientX, e.clientY);
    } else if (d.type === 'rotate' && d.moved) {
      const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
      d.lx = e.clientX; d.ly = e.clientY;
      S.view.R = C.mm(C.mm(C.rotX(-dy * 0.01), C.rotY(dx * 0.01)), S.view.R);
      draw();
    }
  });

  window.addEventListener('pointerup', () => {
    const d = S.drag;
    if (!d) return;
    if (d.type === 'palette') {
      S.drag = null;
      if (!d.created) {
        const p = freeSpot();
        placeAtom(d.el, p.x, p.y);
        draw();
      }
      return;
    }
    if (d.type === 'atom') { finishAtomDrag(); return; }
    S.drag = null;
    if (d.type === 'bond' && !d.moved) {
      const b = S.mol.bonds[d.idx];
      if (b) {
        const r = C.cycleBond(S.mol, b);
        setStatus(r.msg, r.ok ? 'success' : 'warn');
        if (r.ok) leavePreset();
        settle(true);
      }
      return;
    }
    if (d.type === 'rotate' && !d.moved) {
      S.selectedId = null;
      draw();
    }
  });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedId && document.activeElement === document.body) {
      C.deleteAtom(S.mol, S.selectedId);
      S.selectedId = null;
      leavePreset();
      settle(false);
    }
  });

  // ---------------------------------------------------------------------------
  // 右側:原子電子記帳
  // ---------------------------------------------------------------------------
  const STATE_LABEL = { ok: '穩定', exc: '例外(合理)', warn: '還沒接完', error: '不合理', idle: '待反應' };
  function updateAtomCard() {
    const box = document.getElementById('atom-card');
    const a = S.selectedId && C.atomById(S.mol, S.selectedId);
    if (!a) {
      box.innerHTML = '<h4>⚛ 原子的電子記帳</h4><p class="tiny">點選畫布上的原子,看它的價電子分到哪裡去了:孤對、共用、還是轉給別人。</p>';
      return;
    }
    const ana = C.analyze(S.mol);
    const i = ana.infos.get(a.id);
    const info = C.ELEMENTS[a.el];
    const gained = a.own - info.valence;
    const rows = [
      ['價電子(本來有)', `${info.valence} 個`],
    ];
    if (gained) rows.push([gained > 0 ? '得到電子' : '失去電子', `${Math.abs(gained)} 個`]);
    if (i.degree) {
      rows.push(['共價鍵(共用電子對)', `${i.bondSum} 對`]);
      rows.push(['　其中自己出的電子', `${i.contributed} 個`]);
    }
    rows.push(['孤對電子', `${i.pairs} 對(${2 * i.pairs} 個)`]);
    rows.push(['未配對電子', `${i.unpaired} 個`]);
    const target = C.octetTarget(a.el);
    rows.push(['周圍電子 = 2×鍵 + 非鍵', `${2 * i.bondSum} + ${i.nb} = ${i.shell}${i.shell === target ? ' ✔' : ''}`]);
    rows.push(['形式電荷 = 價電子 − 非鍵 − 鍵', `${info.valence} − ${i.nb} − ${i.bondSum} = ${C.fmtFC(i.fc)}`]);
    const up = C.neighborEl(a.el, 0, -1), down = C.neighborEl(a.el, 0, 1);
    const left = C.neighborEl(a.el, -1, 0), right = C.neighborEl(a.el, 1, 0);
    box.innerHTML = `
      <h4>⚛ ${info.name} ${a.el}(${info.group}A 族,第 ${info.period} 週期)
        <span class="state-pill" style="background:${C.STATUS_COLOR[i.status]}">${STATE_LABEL[i.status]}</span></h4>
      <table class="acct">${rows.map(([k, v], n) => `<tr class="${n === rows.length - 2 ? 'sum' : ''}"><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <p class="tiny">${i.msg}</p>
      <div class="atom-btns">
        <button class="btn sm" data-act="e+">+1 e⁻</button>
        <button class="btn sm" data-act="e-">−1 e⁻</button>
        <button class="btn sm" data-act="up" ${up ? '' : 'disabled'} title="同族元素價電子相同,可以直接互換">↑ 同族 ${up || ''}</button>
        <button class="btn sm" data-act="down" ${down ? '' : 'disabled'} title="同族元素價電子相同,可以直接互換">↓ 同族 ${down || ''}</button>
        <button class="btn sm" data-act="left" ${left ? '' : 'disabled'} title="電子數不變,換成少一個價電子的元素 → 形式電荷 −1(等電子)">← ${left || ''}</button>
        <button class="btn sm" data-act="right" ${right ? '' : 'disabled'} title="電子數不變,換成多一個價電子的元素 → 形式電荷 +1(等電子)">${right || ''} →</button>
        <button class="btn sm" data-act="del">刪除</button>
      </div>`;
    box.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => atomAction(a, btn.dataset.act, { up, down, left, right })));
  }
  function atomAction(a, act, nb) {
    let r;
    if (act === 'e+') r = C.changeElectron(S.mol, a, 1);
    else if (act === 'e-') r = C.changeElectron(S.mol, a, -1);
    else if (act === 'up' || act === 'down') r = C.swapElement(S.mol, a, nb[act], true);
    else if (act === 'left' || act === 'right') r = C.swapElement(S.mol, a, nb[act], false);
    else if (act === 'del') {
      C.deleteAtom(S.mol, a.id);
      S.selectedId = null;
      setStatus('刪除了一個原子。');
      leavePreset();
      settle(false);
      return;
    }
    setStatus(r.msg, r.ok ? 'success' : 'warn');
    if (r.ok) { leavePreset(); settle(true); } else draw();
  }

  // 右側:整個分子的電子總帳
  function nameOf(f) {
    const key = C.countsKey(f.counts);
    const hit = PRESETS.find((p) => {
      const c = {};
      p.els.forEach((e) => { c[e] = (c[e] || 0) + 1; });
      const q = Object.values(p.forms[0].fc || {}).reduce((s, v) => s + v, 0);
      return C.countsKey(c) === key && q === f.charge;
    });
    return hit ? hit.label.split(' ').slice(1).join(' ') : '';
  }
  function updateMolCard() {
    const box = document.getElementById('mol-card');
    const ana = C.analyze(S.mol);
    const frags = ana.frags.filter((f) => f.ids.length > 1 || f.charge !== 0);
    if (!frags.length) {
      box.innerHTML = '<h4>🧮 分子的電子總帳</h4><p class="tiny">把兩個以上的原子接起來,這裡會列出整個分子的價電子怎麼分配。</p>';
      return;
    }
    box.innerHTML = '<h4>🧮 分子的電子總帳</h4>' + frags.map((f) => {
      const atoms = f.ids.map((id) => C.atomById(S.mol, id));
      const vSum = atoms.map((a) => C.ELEMENTS[a.el].valence);
      const parts = Object.keys(f.counts).map((el) => `${el} ${C.ELEMENTS[el].valence}${f.counts[el] > 1 ? `×${f.counts[el]}` : ''}`).join(' + ');
      const total = vSum.reduce((s, v) => s + v, 0) - f.charge;
      const infos = f.ids.map((id) => ({ a: C.atomById(S.mol, id), i: ana.infos.get(id) }));
      const bad = infos.filter(({ i }) => i.status === 'warn' || i.status === 'error');
      const exc = infos.filter(({ i }) => i.status === 'exc');
      let verdict;
      if (!bad.length) verdict = `<span class="fb-ok">✔ 結構完成${exc.length ? '(含合理例外)' : ''}</span>`;
      else verdict = `<span class="fb-bad">還沒完成:</span><ul class="tiny">${bad.map(({ a, i }) => `<li>${a.el}:${i.msg}</li>`).join('')}</ul>`;
      const nm = nameOf(f);
      return `<div class="frag">
        <div class="frag-formula">${f.formula} <span class="tiny">${nm}</span></div>
        <div class="eq">價電子總數 = ${parts}${f.charge ? ` ${f.charge > 0 ? '−' : '+'} ${Math.abs(f.charge)}(電荷)` : ''} = ${total}</div>
        ${f.ids.length > 1 ? `<div class="eq">= 共用 ${f.sharedPairs} 對 × 2 + 非鍵 ${f.nonbond} 個 = ${2 * f.sharedPairs + f.nonbond}</div>` : ''}
        <div style="margin-top:4px">${verdict}</div>
      </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // 範例分子
  // ---------------------------------------------------------------------------
  function fillSelects() {
    const ps = document.getElementById('preset-select');
    const qs = document.getElementById('question-select');
    ps.innerHTML = '<option value="">📚 範例分子(依講義分類)</option>';
    qs.innerHTML = '<option value="">✏️ 動手畫:選一題</option>';
    CATS.forEach((c) => {
      const g1 = document.createElement('optgroup');
      g1.label = c.label;
      const g2 = document.createElement('optgroup');
      g2.label = c.label;
      PRESETS.filter((p) => p.cat === c.key).forEach((p) => {
        const o = document.createElement('option');
        o.value = p.key; o.textContent = p.label;
        g1.appendChild(o);
        const o2 = document.createElement('option');
        o2.value = p.key; o2.textContent = p.label.split(' ')[0].replace(/\(.*$/, '');
        g2.appendChild(o2);
      });
      ps.appendChild(g1);
      qs.appendChild(g2);
    });
    ps.addEventListener('change', () => {
      if (ps.value) { endQuestion(); loadPreset(ps.value); }
    });
    qs.addEventListener('change', () => { if (qs.value) startQuestion(qs.value); });
  }

  function loadPreset(key, keepView = false) {
    const spec = byKey[key];
    cancelAnimationFrame(S.anim);
    const { mol, ids } = C.buildSpec(spec, spec.forms[0]);
    S.mol = mol;
    S.preset = spec;
    S.presetIds = ids;
    S.formIdx = 0;
    S.selectedId = null;
    if (!keepView) S.view = C.newView(W / 2, H / 2);
    C.orient(S.mol, S.view, true);
    C.centerMol(S.mol);
    C.fitView(S.mol, S.view, W, H);
    const cat = CATS.find((c) => c.key === spec.cat);
    const tip = document.getElementById('cat-tip');
    tip.style.display = '';
    tip.innerHTML = `<b>${cat.label}</b>:${cat.tip}`;
    updateResonanceBtn();
    describePreset();
    draw();
  }
  function describePreset() {
    const spec = S.preset;
    const form = spec.forms[S.formIdx];
    const ana = C.analyze(S.mol);
    const f = ana.frags.find((x) => x.ids.length === Math.max(...ana.frags.map((y) => y.ids.length)));
    let msg = `${spec.label}:價電子總數 ${f ? f.electrons : ''} 個。`;
    if (spec.forms.length > 1) msg += form.alt ? '(擴張八隅體的畫法:形式電荷較小)' : `(共振結構 ${S.formIdx + 1})`;
    setStatus(msg, 'success');
  }
  function updateResonanceBtn() {
    const b = document.getElementById('btn-resonance');
    const spec = S.preset;
    if (!spec || spec.forms.length < 2) { b.style.display = 'none'; return; }
    b.style.display = '';
    const prim = spec.forms.filter((f) => !f.alt).length;
    const next = spec.forms[(S.formIdx + 1) % spec.forms.length];
    b.textContent = next.alt ? '↔ 另一種畫法(擴張八隅體)' : prim > 1 ? `↔ 下一個共振結構(${(S.formIdx + 1) % spec.forms.length + 1}/${prim})` : '↔ 八隅體畫法';
  }
  function leavePreset() {
    if (!S.preset) return;
    S.preset = null;
    S.presetIds = null;
    document.getElementById('preset-select').value = '';
    document.getElementById('btn-resonance').style.display = 'none';
  }

  document.getElementById('btn-resonance').addEventListener('click', () => {
    const spec = S.preset;
    if (!spec) return;
    S.formIdx = (S.formIdx + 1) % spec.forms.length;
    C.applyForm(S.mol, S.presetIds, spec.forms[S.formIdx]);
    updateResonanceBtn();
    describePreset();
    settle(true);
  });
  document.getElementById('btn-clear').addEventListener('click', () => {
    cancelAnimationFrame(S.anim);
    S.mol = C.newMol();
    S.selectedId = null;
    S.view = C.newView(W / 2, H / 2);
    leavePreset();
    document.getElementById('cat-tip').style.display = 'none';
    setStatus('畫布清空了,從左邊週期表拉原子進來吧!');
    draw();
  });
  document.getElementById('btn-view').addEventListener('click', () => {
    S.view.R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    C.orient(S.mol, S.view, true);
    keepInView();
    draw();
  });
  ['bond-style', 'tg-fc', 'tg-marks', 'tg-partial'].forEach((id) => document.getElementById(id).addEventListener('change', draw));

  // ---------------------------------------------------------------------------
  // 動手畫題目:檢查骨架、電子數、八隅體與形式電荷
  // ---------------------------------------------------------------------------
  function specCharge(spec, form = spec.forms[0]) { return Object.values(form.fc || {}).reduce((s, v) => s + v, 0); }
  function specCounts(spec) { const c = {}; spec.els.forEach((e) => { c[e] = (c[e] || 0) + 1; }); return c; }
  function specValence(spec) { return spec.els.reduce((s, e) => s + C.ELEMENTS[e].valence, 0) - specCharge(spec); }
  function skeletonSig(els, bonds) {
    const nb = els.map(() => []);
    bonds.forEach(([i, j]) => { nb[i].push(els[j]); nb[j].push(els[i]); });
    return els.map((e, k) => `${e}:${nb[k].sort().join(',')}`).sort().join('|');
  }

  function startQuestion(key) {
    const spec = byKey[key];
    S.question = spec;
    cancelAnimationFrame(S.anim);
    S.mol = C.newMol();
    S.view = C.newView(W / 2, H / 2);
    S.selectedId = null;
    leavePreset();
    const name = spec.label.split(' ')[0].replace(/\(.*$/, '');
    document.getElementById('question-banner').style.display = '';
    document.getElementById('question-text').textContent = `✏️ 請用週期表拼出 ${name} 的路易斯結構`;
    document.getElementById('question-feedback').innerHTML = '<span class="tiny">完成後按「檢查」。提示:先算價電子總數,再決定中心原子。</span>';
    const cat = CATS.find((c) => c.key === spec.cat);
    const tip = document.getElementById('cat-tip');
    tip.style.display = '';
    tip.innerHTML = `<b>${cat.label}</b>:${cat.tip}`;
    setStatus('畫布已清空,開始作答吧!');
    draw();
  }
  function endQuestion() {
    S.question = null;
    document.getElementById('question-banner').style.display = 'none';
    document.getElementById('question-select').value = '';
  }
  function checkQuestion() {
    const spec = S.question;
    if (!spec) return;
    const fb = document.getElementById('question-feedback');
    const ana = C.analyze(S.mol);
    const want = specCounts(spec);
    const wantKey = C.countsKey(want);
    const wantQ = specCharge(spec);
    const isIonic = spec.cat === 'ionic';
    // 離子化合物看全部原子;分子看最大的那一塊
    const all = S.mol.atoms.map((a) => a.id);
    const have = C.countsOf(S.mol, all);
    let frag = isIonic ? null : ana.frags.find((f) => C.countsKey(f.counts) === wantKey);
    const lines = [];
    if (C.countsKey(have) !== wantKey && !frag) {
      const miss = [], extra = [];
      new Set([...Object.keys(want), ...Object.keys(have)]).forEach((el) => {
        const d = (want[el] || 0) - (have[el] || 0);
        if (d > 0) miss.push(`${el}×${d}`);
        if (d < 0) extra.push(`${el}×${-d}`);
      });
      fb.innerHTML = `<span class="fb-bad">原子種類或數量不對。</span>${miss.length ? ` 還缺:${miss.join('、')}。` : ''}${extra.length ? ` 多了:${extra.join('、')}。` : ''}`;
      return;
    }
    if (isIonic) {
      const bad = [];
      S.mol.atoms.forEach((a) => {
        const i = ana.infos.get(a.id);
        if (i.status === 'warn' || i.status === 'error' || i.status === 'idle') bad.push(`${a.el}:${i.msg}`);
      });
      if (S.mol.bonds.some((b) => C.ELEMENTS[C.atomById(S.mol, b.a).el].metal || C.ELEMENTS[C.atomById(S.mol, b.b).el].metal)) bad.unshift('金屬不應該有共用電子對');
      fb.innerHTML = bad.length ? `<span class="fb-bad">還沒完成:</span><ul>${bad.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<span class="fb-ok">🎉 正確!金屬的價電子全部轉移給非金屬,陰陽離子都達到鈍氣組態。</span>';
      return;
    }
    if (!frag) {
      fb.innerHTML = '<span class="fb-bad">原子都在畫布上了,但還沒全部接成同一個分子。</span>';
      return;
    }
    if (frag.charge !== wantQ) {
      lines.push(`電荷不對:你的結構總電荷是 ${frag.charge || 0},${spec.label.split(' ')[0]} 應該是 ${wantQ || 0}(價電子總數應為 ${specValence(spec)} 個,你的是 ${frag.electrons} 個)。可以用「±1 e⁻」調整。`);
    }
    const idsIdx = new Map(frag.ids.map((id, k) => [id, k]));
    const myEls = frag.ids.map((id) => C.atomById(S.mol, id).el);
    const myBonds = S.mol.bonds.filter((b) => idsIdx.has(b.a)).map((b) => [idsIdx.get(b.a), idsIdx.get(b.b)]);
    if (skeletonSig(myEls, myBonds) !== skeletonSig(spec.els, spec.forms[0].bonds || [])) {
      lines.push('骨架(誰接誰)跟正確答案不一樣:想一想誰當中心原子?(通常是數量少、能接最多鍵的那個;H 一定在外圍)');
    }
    frag.ids.forEach((id) => {
      const i = ana.infos.get(id);
      if (i.status === 'warn' || i.status === 'error') lines.push(`${C.atomById(S.mol, id).el}:${i.msg}`);
    });
    if (lines.length) {
      const hint = '<p class="tiny">提示:先算價電子總數;中心原子電子不夠成鍵時,可以讓它「−1 e⁻」(形式電荷 +1);外圍原子多一個未配對電子時,可以「+1 e⁻」(形式電荷 −1),總電荷要等於離子的電荷。</p>';
      fb.innerHTML = `<span class="fb-bad">再檢查一下:</span><ul>${[...new Set(lines)].map((x) => `<li>${x}</li>`).join('')}</ul>${hint}`;
      return;
    }
    // 形式電荷比較
    const myFC = frag.ids.reduce((s, id) => s + Math.abs(ana.infos.get(id).fc), 0);
    const prim = spec.forms.filter((f) => !f.alt);
    const minFC = Math.min(...prim.map((f) => Object.values(f.fc || {}).reduce((s, v) => s + Math.abs(v), 0)));
    let msg = '<span class="fb-ok">🎉 正確!</span> 每個原子都達到八隅體(或合理的例外),電子總數也對。';
    if (myFC > minFC) msg = `<span class="fb-ok">結構合理</span>,但形式電荷的總和(${myFC})比較大,試試換個位置放雙鍵,讓形式電荷更小(最小可到 ${minFC})。`;
    else if (myFC < minFC) msg += ' 你用的是擴張八隅體的畫法(形式電荷較小),兩種畫法都常見。';
    if (prim.length > 1) msg += ` 這個分子有 ${prim.length} 個共振結構,按「看答案」再按「↔」可以全部看一遍。`;
    fb.innerHTML = msg;
  }
  document.getElementById('btn-check').addEventListener('click', checkQuestion);
  document.getElementById('btn-answer').addEventListener('click', () => {
    const spec = S.question;
    if (!spec) return;
    loadPreset(spec.key);
    document.getElementById('question-feedback').innerHTML = '這是參考答案。看完可以按「清空畫布」自己再拼一次,或從上面選下一題。';
  });
  document.getElementById('btn-quit').addEventListener('click', () => {
    endQuestion();
    setStatus('已結束題目。');
  });

  buildTable();
  fillSelects();
  draw();

  window.BuildApp = { loadPreset, draw, S };
})();
