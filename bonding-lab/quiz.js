// 分頁②「題目練習」:反推族數(範例 1)、找出錯誤的結構(範例 2)、辨識元素(範例 3)
(() => {
  const C = window.Chem;
  const { byKey } = window.Presets;
  const NS = 'http://www.w3.org/2000/svg';
  const body = document.getElementById('quiz-body');
  const LETTERS = ['W', 'X', 'Y', 'Z'];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const score = { group: [0, 0], wrong: [0, 0], ident: [0, 0] };

  // 畫一個小分子到新的 svg
  function miniSvg(mol, w, h, ropts = {}, cls = '') {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (cls) svg.setAttribute('class', cls);
    const view = C.newView(w / 2, h / 2);
    C.orient(mol, view, true);
    C.centerMol(mol);
    C.fitView(mol, view, w, h, 16);
    C.render(svg, mol, view, Object.assign({ showFC: false, noStatus: true }, ropts));
    return svg;
  }
  function expectedElectrons(els, charge) { return els.reduce((s, e) => s + C.ELEMENTS[e].valence, 0) - charge; }

  // 一個結構哪裡錯(空陣列 = 正確)
  function problemsOf(mol, els, charge, label) {
    const ana = C.analyze(mol);
    const out = [];
    mol.atoms.forEach((a) => {
      const i = ana.infos.get(a.id);
      if (i.status === 'error' || i.status === 'warn') out.push(`${a.el}:${i.msg}`);
    });
    const have = mol.atoms.reduce((s, a) => s + a.own, 0);
    const want = expectedElectrons(els, charge);
    if (have !== want) out.push(`${label} 的價電子總數應該是 ${want} 個,這個圖畫了 ${have} 個`);
    return [...new Set(out)];
  }

  // ---------------------------------------------------------------------------
  // 題型 1:反推族數
  // ---------------------------------------------------------------------------
  const GROUP_ITEMS = [
    ['NH3', 0], ['H2O', 0], ['CH4', 0], ['BF3', 0], ['BeCl2', 0], ['PCl5', 0], ['SF6', 0], ['XeF4', 0],
    ['ClF3', 0], ['NH4+', 0], ['BF4-', 0], ['H3O+', 0], ['HCN', 2], ['CO2', 1], ['SF4', 0], ['XeF2', 0], ['CH2O', 1], ['HCl', 0],
  ];
  function quizGroup() {
    const [key, idx] = pick(GROUP_ITEMS);
    const spec = byKey[key];
    const { mol, ids } = C.buildSpec(spec, spec.forms[0]);
    const xId = ids[idx];
    const x = C.atomById(mol, xId);
    const svg = miniSvg(mol, 520, 300, { hidden: { [xId]: 'X' }, crossIds: [xId] }, 'quiz-svg');
    body.innerHTML = `<span class="score">答對 ${score.group[0]} / ${score.group[1]}</span>
      <h3>🔍 反推族數</h3>
      <p class="tiny">下圖是某分子(或離子)的路易斯結構,X 代表某個元素,它自己的電子用 × 表示、其他原子的電子用 • 表示。X 是第幾族元素?</p>`;
    body.appendChild(svg);
    const row = document.createElement('div');
    row.className = 'choice-row';
    const fb = document.createElement('div');
    fb.className = 'feedback';
    for (let g = 1; g <= 8; g++) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${g}A`;
      b.addEventListener('click', () => {
        if (row.dataset.done) return;
        row.dataset.done = 1;
        const ans = C.ELEMENTS[x.el].group;
        const ok = g === ans;
        score.group[1]++;
        if (ok) score.group[0]++;
        const i = C.atomInfo(mol, x);
        const charge = C.analyze(mol).frags[0].charge;
        fb.innerHTML = `<span class="${ok ? 'fb-ok' : 'fb-bad'}">${ok ? '✔ 答對了!' : `✘ 正確答案是 ${ans}A`}</span>
          <ul>
            <li>X 接了 ${i.degree} 個原子、共用 ${i.bondSum} 對電子,其中 X 自己出了 ${i.contributed} 個(×)</li>
            <li>X 還有 ${i.pairs} 對孤對電子${i.unpaired ? `、${i.unpaired} 個未配對電子` : ''},共 ${i.nb} 個非鍵電子</li>
            <li>X 自己的電子 = ${i.contributed} + ${i.nb} = ${x.own} 個 → 價電子 ${C.ELEMENTS[x.el].valence} → 第 ${ans}A 族(例如 ${x.el})</li>
            ${charge ? `<li>注意中括號外的電荷 ${C.chargeText(charge)}:整個離子${charge > 0 ? '少了' : '多了'} ${Math.abs(charge)} 個電子,要確認是不是加在 X 身上</li>` : ''}
          </ul>
          <p class="tiny">這是 ${spec.label}。</p>`;
        row.querySelectorAll('button').forEach((bb) => { if (bb.textContent === `${ans}A`) bb.classList.add('primary'); });
        nextBtn.style.display = '';
      });
      row.appendChild(b);
    }
    body.appendChild(row);
    body.appendChild(fb);
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn primary';
    nextBtn.textContent = '下一題 →';
    nextBtn.style.display = 'none';
    nextBtn.addEventListener('click', quizGroup);
    body.appendChild(nextBtn);
  }

  // ---------------------------------------------------------------------------
  // 題型 2:哪些路易斯結構是錯的
  // ---------------------------------------------------------------------------
  const CORRECT_POOL = ['H2O', 'NH3', 'CO2', 'N2', 'HCN', 'CH4', 'NH4+', 'BF3', 'O2', 'HCl', 'CH2O', 'Cl2', 'BeCl2', 'PCl5', 'C2H4', 'H2O2', 'CO', 'O3', 'NO'];
  const WRONG_POOL = [
    { label: 'NaCl', els: ['Na', 'Cl'], bonds: [[0, 1, 1]], nb: { 0: 0, 1: 6 } },
    { label: 'CO₂', els: ['C', 'O', 'O'], bonds: [[0, 1, 1], [0, 2, 1]], nb: { 0: 0, 1: 6, 2: 6 } },
    { label: 'NH₃', els: ['N', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]], nb: { 0: 0 } },
    { label: 'H₂O', els: ['O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1]], nb: { 0: 6 } },
    { label: 'N₂', els: ['N', 'N'], bonds: [[0, 1, 2]], nb: { 0: 4, 1: 4 } },
    { label: 'HCN', els: ['C', 'H', 'N'], bonds: [[0, 1, 1], [0, 2, 3]], nb: { 0: 2, 2: 2 } },
    { label: 'H₂O', els: ['H', 'H', 'O'], bonds: [[0, 1, 1], [1, 2, 1]], nb: { 0: 0, 1: 0, 2: 6 } },
    { label: 'O₂', els: ['O', 'O'], bonds: [[0, 1, 1]], nb: { 0: 6, 1: 6 } },
    { label: 'BF₃', els: ['B', 'F', 'F', 'F'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]], nb: { 0: 2 } },
    { label: 'Cl₂', els: ['Cl', 'Cl'], bonds: [[0, 1, 2]], nb: { 0: 4, 1: 4 } },
    { label: 'HF', els: ['F', 'H'], bonds: [[0, 1, 1]], nb: { 1: 2 } },
    { label: 'CH₄', els: ['C', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]], nb: { 0: 2 } },
  ];
  function buildOption(o) {
    if (o.key) {
      const spec = byKey[o.key];
      const { mol } = C.buildSpec(spec, spec.forms[0]);
      const charge = Object.values(spec.forms[0].fc || {}).reduce((s, v) => s + v, 0);
      return { mol, label: spec.label.split(' ')[0], els: spec.els, charge };
    }
    const spec = { els: o.els, forms: [{ bonds: o.bonds, nb: o.nb }] };
    const { mol } = C.buildSpec(spec, spec.forms[0]);
    return { mol, label: o.label, els: o.els, charge: 0 };
  }
  function quizWrong() {
    const nWrong = 1 + Math.floor(Math.random() * 3);
    const wrong = shuffle(WRONG_POOL).slice(0, nWrong);
    const usedLabels = new Set(wrong.map((w) => w.label));
    const right = shuffle(CORRECT_POOL).filter((k) => !usedLabels.has(byKey[k].label.split(' ')[0])).slice(0, 5 - nWrong).map((key) => ({ key }));
    const opts = shuffle([...wrong, ...right]).map(buildOption);
    opts.forEach((o) => { o.problems = problemsOf(o.mol, o.els, o.charge, o.label); });
    body.innerHTML = `<span class="score">全對 ${score.wrong[0]} / ${score.wrong[1]} 回</span>
      <h3>❌ 下列路易斯結構,哪些是錯的?(可複選)</h3>
      <p class="tiny">點選你認為錯誤的結構,再按「檢查」。提示:數一數價電子總數、每個原子周圍的電子數,還有 H 只能接一個鍵。</p>`;
    const grid = document.createElement('div');
    grid.className = 'quiz-grid';
    opts.forEach((o, k) => {
      const card = document.createElement('div');
      card.className = 'opt';
      card.innerHTML = `<div class="opt-label">(${'ABCDE'[k]}) ${o.label}</div>`;
      card.appendChild(miniSvg(o.mol, 300, 220, { marks: false, noBrackets: true }));
      const why = document.createElement('div');
      why.className = 'opt-why';
      card.appendChild(why);
      card.addEventListener('click', () => { if (!grid.dataset.done) card.classList.toggle('picked'); });
      o.card = card;
      o.why = why;
      grid.appendChild(card);
    });
    body.appendChild(grid);
    const fb = document.createElement('div');
    fb.className = 'feedback';
    const btns = document.createElement('div');
    btns.className = 'banner-btns';
    const check = document.createElement('button');
    check.className = 'btn primary';
    check.textContent = '✔ 檢查';
    const next = document.createElement('button');
    next.className = 'btn';
    next.textContent = '換一組 →';
    next.addEventListener('click', quizWrong);
    check.addEventListener('click', () => {
      if (grid.dataset.done) return;
      grid.dataset.done = 1;
      let allOk = true;
      opts.forEach((o) => {
        const isWrong = o.problems.length > 0;
        const picked = o.card.classList.contains('picked');
        if (isWrong !== picked) allOk = false;
        o.card.classList.add(isWrong ? 'wrong' : 'right');
        o.why.innerHTML = isWrong
          ? `<span class="fb-bad">✘ 錯誤${picked ? '(你選對了)' : '(你漏選了)'}</span><ul>${o.problems.map((p) => `<li>${p}</li>`).join('')}</ul>`
          : `<span class="fb-ok">✔ 正確的結構${picked ? '(你誤選了)' : ''}</span>`;
      });
      score.wrong[1]++;
      if (allOk) score.wrong[0]++;
      fb.innerHTML = allOk ? '<span class="fb-ok">🎉 全部判斷正確!</span>' : '<span class="fb-bad">有判斷錯的,看看每個選項下面的說明。</span>';
    });
    btns.appendChild(check);
    btns.appendChild(next);
    body.appendChild(btns);
    body.appendChild(fb);
  }

  // ---------------------------------------------------------------------------
  // 題型 3:辨識元素(像蛋白質組成單元的胺基酸那題)
  // ---------------------------------------------------------------------------
  const IDENT_ITEMS = [
    { name: '甘胺酸(最簡單的胺基酸,蛋白質的組成單元)', els: ['N', 'H', 'H', 'C', 'H', 'H', 'C', 'O', 'O', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [3, 4, 1], [3, 5, 1], [3, 6, 1], [6, 7, 2], [6, 8, 1], [8, 9, 1]] },
    { name: '尿素', els: ['C', 'O', 'N', 'N', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [2, 4, 1], [2, 5, 1], [3, 6, 1], [3, 7, 1]] },
    { name: '乙酸(醋酸)', els: ['C', 'C', 'O', 'O', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [0, 5, 1], [0, 6, 1], [0, 7, 1]] },
    { name: '乙醯胺', els: ['C', 'C', 'O', 'N', 'H', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [3, 5, 1], [0, 6, 1], [0, 7, 1], [0, 8, 1]] },
    { name: '乙腈', els: ['C', 'C', 'N', 'H', 'H', 'H'], bonds: [[0, 1, 1], [1, 2, 3], [0, 3, 1], [0, 4, 1], [0, 5, 1]] },
    { name: '甲胺', els: ['C', 'N', 'H', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1], [1, 6, 1]] },
    { name: '三氟乙酸', els: ['C', 'C', 'O', 'O', 'H', 'F', 'F', 'F'], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [0, 5, 1], [0, 6, 1], [0, 7, 1]] },
  ];
  const IDENT_CHOICES = ['H', 'C', 'N', 'O', 'F'];
  function quizIdent() {
    const item = pick(IDENT_ITEMS);
    const spec = { els: item.els, forms: [{ bonds: item.bonds }] };
    const { mol, ids } = C.buildSpec(spec, spec.forms[0]);
    const elements = shuffle([...new Set(item.els)]);
    const letterOf = {};
    elements.forEach((e, k) => { letterOf[e] = LETTERS[k]; });
    const hidden = {};
    ids.forEach((id, k) => { hidden[id] = letterOf[item.els[k]]; });
    body.innerHTML = `<span class="score">全對 ${score.ident[0]} / ${score.ident[1]} 回</span>
      <h3>🧩 辨識元素</h3>
      <p class="tiny">下圖是某分子的路易斯結構,${elements.map((e) => letterOf[e]).join('、')} 各代表一種元素(都是 H、C、N、O、F 其中之一)。從每個原子接了幾個鍵、有幾對孤對電子,判斷它們是什麼元素。</p>`;
    body.appendChild(miniSvg(mol, 560, 340, { hidden, marks: false }, 'quiz-svg'));
    const row = document.createElement('div');
    row.className = 'letter-row';
    const sels = {};
    elements.forEach((e) => {
      const lab = document.createElement('label');
      lab.textContent = `${letterOf[e]} =`;
      const sel = document.createElement('select');
      sel.className = 'sel';
      sel.innerHTML = '<option value="">?</option>' + IDENT_CHOICES.map((c) => `<option value="${c}">${c}</option>`).join('');
      lab.appendChild(sel);
      row.appendChild(lab);
      sels[e] = sel;
    });
    body.appendChild(row);
    const fb = document.createElement('div');
    fb.className = 'feedback';
    const btns = document.createElement('div');
    btns.className = 'banner-btns';
    const check = document.createElement('button');
    check.className = 'btn primary';
    check.textContent = '✔ 檢查';
    const next = document.createElement('button');
    next.className = 'btn';
    next.textContent = '換一題 →';
    next.addEventListener('click', quizIdent);
    check.addEventListener('click', () => {
      if (row.dataset.done) return;
      if (elements.some((e) => !sels[e].value)) { fb.innerHTML = '<span class="fb-bad">每個字母都要選一個元素喔。</span>'; return; }
      row.dataset.done = 1;
      let allOk = true;
      const lines = elements.map((e) => {
        const id = ids[item.els.indexOf(e)];
        const i = C.atomInfo(mol, C.atomById(mol, id));
        const ok = sels[e].value === e;
        if (!ok) allOk = false;
        return `<li><b>${letterOf[e]}</b>:${i.bondSum} 個鍵(${i.degree} 個原子相連)+ ${i.pairs} 對孤對 → 自己的電子 ${i.bondSum} + ${2 * i.pairs} = ${C.ELEMENTS[e].valence} 個價電子 → <b>${e}</b> ${ok ? '✔' : `✘(你選 ${sels[e].value})`}</li>`;
      });
      score.ident[1]++;
      if (allOk) score.ident[0]++;
      fb.innerHTML = `<span class="${allOk ? 'fb-ok' : 'fb-bad'}">${allOk ? '🎉 全對!' : '有幾個不對,看說明:'}</span><ul>${lines.join('')}</ul><p class="tiny">這是 ${item.name}。</p>`;
    });
    btns.appendChild(check);
    btns.appendChild(next);
    body.appendChild(btns);
    body.appendChild(fb);
  }

  // ---------------------------------------------------------------------------
  const MODES = [
    { key: 'draw', label: '✏️ 動手畫(在分頁①)', run: () => {
      document.querySelector('.tab-btn[data-tab="build"]').click();
      const qs = document.getElementById('question-select');
      qs.focus();
      if (qs.showPicker) { try { qs.showPicker(); } catch (e) { /* 部分瀏覽器不支援 */ } }
    } },
    { key: 'group', label: '🔍 反推族數', run: quizGroup },
    { key: 'wrong', label: '❌ 找出錯誤的結構', run: quizWrong },
    { key: 'ident', label: '🧩 辨識元素', run: quizIdent },
  ];
  const modeBox = document.getElementById('quiz-modes');
  MODES.forEach((m) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = m.label;
    b.addEventListener('click', () => {
      if (m.key !== 'draw') modeBox.querySelectorAll('.btn').forEach((x) => x.classList.toggle('primary', x === b));
      m.run();
    });
    modeBox.appendChild(b);
  });
  modeBox.children[1].classList.add('primary');
  quizGroup();
})();
