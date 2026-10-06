// 化學鍵結核心:元素資料、電子記帳(誰出的電子)、成鍵規則、3D 形狀鬆弛、SVG 繪圖。
// 給 app.js(拼拼看)與 quiz.js(題目練習)共用,掛在 window.Chem。
(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------------------
  // 元素:族(A 族)、週期、價電子、電負度、原子顏色、電子顏色、是否金屬
  // ---------------------------------------------------------------------------
  const E = (name, group, period, valence, en, color, ecol, metal = false) =>
    ({ name, group, period, valence, en, color, ecol, metal });
  const ELEMENTS = {
    H: E('氫', 1, 1, 1, 2.20, '#e7ebff', '#364fc7'),
    He: E('氦', 8, 1, 2, null, '#e3fafc', '#0c8599'),
    Li: E('鋰', 1, 2, 1, 0.98, '#f3d9fa', '#9c36b5', true),
    Be: E('鈹', 2, 2, 2, 1.57, '#d3f9d8', '#2b8a3e'),
    B: E('硼', 3, 2, 3, 2.04, '#ffe8cc', '#d9480f'),
    C: E('碳', 4, 2, 4, 2.55, '#e9ecef', '#212529'),
    N: E('氮', 5, 2, 5, 3.04, '#d0ebff', '#1864ab'),
    O: E('氧', 6, 2, 6, 3.44, '#ffe3e3', '#c92a2a'),
    F: E('氟', 7, 2, 7, 3.98, '#e9fac8', '#5c940d'),
    Ne: E('氖', 8, 2, 8, null, '#e3fafc', '#0c8599'),
    Na: E('鈉', 1, 3, 1, 0.93, '#f3d9fa', '#862e9c', true),
    Mg: E('鎂', 2, 3, 2, 1.31, '#ebfbee', '#2f9e44', true),
    Al: E('鋁', 3, 3, 3, 1.61, '#f1f3f5', '#495057', true),
    Si: E('矽', 4, 3, 4, 1.90, '#f1f3f5', '#5f3dc4'),
    P: E('磷', 5, 3, 5, 2.19, '#ffe8cc', '#e8590c'),
    S: E('硫', 6, 3, 6, 2.58, '#fff3bf', '#b07d00'),
    Cl: E('氯', 7, 3, 7, 3.16, '#d8f5a2', '#2b8a3e'),
    Ar: E('氬', 8, 3, 8, null, '#e3fafc', '#0c8599'),
    K: E('鉀', 1, 4, 1, 0.82, '#f3d9fa', '#9c36b5', true),
    Ca: E('鈣', 2, 4, 2, 1.00, '#ebfbee', '#2b8a3e', true),
    Br: E('溴', 7, 4, 7, 2.96, '#ffd8d8', '#a61e4d'),
    I: E('碘', 7, 5, 7, 2.66, '#e5dbff', '#5f3dc4'),
    Xe: E('氙', 8, 5, 8, 2.60, '#e3fafc', '#0b7285'),
  };
  // 週期表排列(只放高中常考的元素,其他留空)
  const TABLE = [
    ['H', null, null, null, null, null, null, 'He'],
    ['Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'],
    ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'],
    ['K', 'Ca', null, null, null, null, 'Br', null],
    [null, null, null, null, null, null, 'I', 'Xe'],
  ];
  const NOBLE_INERT = new Set(['He', 'Ne', 'Ar']);
  // 第三週期以後的非金屬可以「擴張八隅體」(動用 d 軌域),最多多 2 個軌域(12 個電子)
  const EXPANDABLE = new Set(['P', 'S', 'Cl', 'Br', 'I', 'Xe']);
  const ELECTRON_DEFICIENT = new Set(['Be', 'B']);
  // 高中課本的奇數電子例外:NO、NO₂(未配對電子在 N)、ClO₂(在 Cl);
  // 其他原子剩一個未配對電子(例如拼到一半的 OH),視為還可以再成鍵
  const ODD_OK = new Set(['N', 'Cl']);
  const HIDDEN_ECOL = '#495057';

  function baseOrb(el) { return el === 'H' || el === 'He' ? 1 : 4; }
  function octetTarget(el) { return el === 'H' || el === 'He' ? 2 : 8; }
  function drawR(el) {
    const p = ELEMENTS[el].period;
    const r = p === 1 ? 18 : p === 2 ? 24 : p === 3 ? 27 : 29;
    return ELEMENTS[el].metal ? r + 2 : r;
  }
  function neighborEl(el, dGroup, dPeriod) {
    for (let r = 0; r < TABLE.length; r++) {
      const c = TABLE[r].indexOf(el);
      if (c < 0) continue;
      const row = TABLE[r + dPeriod];
      if (!row) return null;
      return row[c + dGroup] || null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 分子資料模型
  //   atom: { id, el, own(這個原子「擁有」的電子數), extra(擴張用的額外軌域), x,y,z, lp[] }
  //   bond: { a, b, pairs[] }  每一對共用電子記錄是誰出的:'ab'=各出一個、'a'=全由 a 出、'b'=全由 b 出
  //   link: { a, b }  離子鍵(電子已轉移,沒有共用電子)
  // ---------------------------------------------------------------------------
  function newMol() { return { atoms: [], bonds: [], links: [], nextId: 1 }; }
  function addAtom(mol, el, x = 0, y = 0, z = 0) {
    const a = { id: mol.nextId++, el, own: ELEMENTS[el].valence, extra: 0, x, y, z: z + (Math.random() - 0.5) * 6, lp: [] };
    mol.atoms.push(a);
    return a;
  }
  function atomById(mol, id) { return mol.atoms.find((a) => a.id === id); }
  function bondBetween(mol, i, j) { return mol.bonds.find((b) => (b.a === i && b.b === j) || (b.a === j && b.b === i)); }
  function linkBetween(mol, i, j) { return mol.links.find((b) => (b.a === i && b.b === j) || (b.a === j && b.b === i)); }
  function otherOf(b, id) { return b.a === id ? b.b : b.a; }
  function contribOf(b, id) {
    let c = 0;
    for (const p of b.pairs) {
      if (p === 'ab') c += 1;
      else if ((p === 'a' && b.a === id) || (p === 'b' && b.b === id)) c += 2;
    }
    return c;
  }

  // 由電子記帳推出:非鍵電子、孤對、未配對、周圍電子數、形式電荷
  function atomInfo(mol, a) {
    const el = ELEMENTS[a.el];
    let bondSum = 0, contributed = 0, degree = 0;
    for (const b of mol.bonds) {
      if (b.a !== a.id && b.b !== a.id) continue;
      bondSum += b.pairs.length;
      contributed += contribOf(b, a.id);
      degree++;
    }
    const nb = a.own - contributed;
    const orb = baseOrb(a.el) + (a.extra || 0);
    const avail = orb - bondSum;
    let pairs, unpaired;
    if (avail >= 0 && nb >= 0 && nb <= 2 * avail) {
      // 先一個軌域放一個電子,不夠放才成對(路易斯點式的畫法)
      pairs = Math.max(0, nb - avail);
      unpaired = nb - 2 * pairs;
    } else {
      pairs = Math.floor(Math.max(nb, 0) / 2);
      unpaired = Math.max(nb, 0) % 2;
    }
    const shell = 2 * bondSum + nb;
    const fc = el.valence - nb - bondSum;
    return { el, bondSum, contributed, degree, nb, orb, avail, pairs, unpaired, shell, fc };
  }

  // 每次結構改變後:把用不到的擴張軌域收回(回到最少軌域的狀態)
  function normalize(mol) {
    const fixExtra = () => mol.atoms.forEach((a) => {
      const i = atomInfo(mol, a);
      const needed = i.bondSum + Math.ceil(Math.max(i.nb, 0) / 2);
      a.extra = Math.max(0, needed - baseOrb(a.el));
    });
    fixExtra();
    if (placeOddElectron(mol)) fixExtra();
  }

  // 奇數電子分子(NO、NO₂、ClO₂):總價電子是奇數,一定剩 1 個落單電子。
  // 課本把它畫在 N(或 Cl)上:如果落單電子停在別的原子(例如 NO₂ 的 O),
  // 就讓 N 把 1 個孤對電子中的 1 個交給那個原子 → O=N⁺(•)–O⁻,其餘原子都是八隅體
  function placeOddElectron(mol) {
    let moved = false;
    fragments(mol).forEach((ids) => {
      if (ids.length < 2) return;
      const atoms = ids.map((id) => atomById(mol, id));
      if (atoms.some((a) => ELEMENTS[a.el].metal)) return;
      const total = atoms.reduce((s, a) => s + a.own, 0);
      if (total % 2 === 0) return;
      const withUnpaired = atoms.filter((a) => atomInfo(mol, a).unpaired > 0);
      if (withUnpaired.length !== 1 || atomInfo(mol, withUnpaired[0]).unpaired !== 1) return;
      const U = withUnpaired[0];
      if (ODD_OK.has(U.el) || U.el === 'H') return;
      const host = atoms.find((a) => ODD_OK.has(a.el) && atomInfo(mol, a).degree > 0 && atomInfo(mol, a).pairs > 0);
      if (!host) return;
      host.own -= 1;
      U.own += 1;
      moved = true;
    });
    return moved;
  }

  function fragments(mol) {
    const parent = new Map(mol.atoms.map((a) => [a.id, a.id]));
    const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
    mol.bonds.forEach((b) => parent.set(find(b.a), find(b.b)));
    const groups = new Map();
    mol.atoms.forEach((a) => {
      const r = find(a.id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(a.id);
    });
    return [...groups.values()];
  }

  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  function chargeText(q, sup = false) {
    if (!q) return '';
    const n = Math.abs(q);
    const s = q > 0 ? '+' : '−';
    if (!sup) return (n > 1 ? n : '') + s;
    return (n > 1 ? String(n).split('').map((d) => SUP[d]).join('') : '') + (q > 0 ? '⁺' : '⁻');
  }
  function sub(n) { return n > 1 ? String(n).split('').map((d) => SUB[d]).join('') : ''; }
  function countsOf(mol, ids) {
    const c = {};
    ids.forEach((id) => { const a = atomById(mol, id); c[a.el] = (c[a.el] || 0) + 1; });
    return c;
  }
  function countsKey(c) { return Object.keys(c).sort().map((k) => k + c[k]).join(''); }
  // 化學式:有 C 用 Hill 排法;沒有 C 就照電負度由小到大(H₂O、NH₃、SO₄ 這種常見寫法)
  function formulaText(c, charge = 0) {
    let order;
    if (Object.keys(c).length === 2 && c.O === 1 && c.H === 1) return 'OH' + chargeText(charge, true);
    if (c.C) order = ['C', 'H', ...Object.keys(c).filter((k) => k !== 'C' && k !== 'H').sort()];
    else {
      order = Object.keys(c).sort((x, y) => (ELEMENTS[x].en ?? 9) - (ELEMENTS[y].en ?? 9));
      // 習慣寫法:N、C 的氫化物把 H 放後面(NH₃、NH₄⁺)
      if (c.H && (c.N || c.P) && !c.O && !c.F && !c.Cl) order = [...order.filter((k) => k !== 'H'), 'H'];
    }
    return order.filter((k) => c[k]).map((k) => k + sub(c[k])).join('') + chargeText(charge, true);
  }

  // ---------------------------------------------------------------------------
  // 判斷每個原子的狀態(八隅體/例外/還沒完成/錯誤)
  // ---------------------------------------------------------------------------
  function analyze(mol) {
    const infos = new Map();
    mol.atoms.forEach((a) => infos.set(a.id, atomInfo(mol, a)));
    const frags = fragments(mol).map((ids) => {
      let charge = 0, electrons = 0, unpaired = 0, sharedPairs = 0, nonbond = 0;
      ids.forEach((id) => {
        const a = atomById(mol, id);
        const i = infos.get(id);
        charge += ELEMENTS[a.el].valence - a.own;
        electrons += a.own;
        unpaired += i.unpaired;
        nonbond += Math.max(i.nb, 0);
      });
      mol.bonds.forEach((b) => { if (ids.includes(b.a)) sharedPairs += b.pairs.length; });
      const counts = countsOf(mol, ids);
      return { ids, charge, electrons, unpaired, sharedPairs, nonbond, counts, formula: formulaText(counts, charge) };
    });
    const fragOf = new Map();
    frags.forEach((f) => f.ids.forEach((id) => fragOf.set(id, f)));

    mol.atoms.forEach((a) => {
      const i = infos.get(a.id);
      const el = i.el;
      const f = fragOf.get(a.id);
      const linked = mol.links.some((l) => l.a === a.id || l.b === a.id);
      let status = 'ok', msg = '';
      if (el.metal) {
        if (i.degree > 0) { status = 'error'; msg = `${a.el} 是金屬,不跟非金屬共用電子,應該把電子「給」出去形成離子鍵`; }
        else if (a.own === 0) { status = 'ok'; msg = `失去價電子成為 ${a.el}${chargeText(el.valence - a.own, true)},剩下內層電子(鈍氣組態)`; }
        else if (a.own < el.valence) { status = 'warn'; msg = `還有 ${a.own} 個價電子可以給出去`; }
        else { status = 'idle'; msg = `金屬原子:拉到非金屬旁邊會把 ${el.valence} 個價電子轉移過去`; }
      } else if (NOBLE_INERT.has(a.el) || (a.el === 'Xe' && i.degree === 0)) {
        if (i.degree > 0) { status = 'error'; msg = `${a.el} 是鈍氣,不會形成共價鍵`; }
        else if (i.shell === octetTarget(a.el) && i.unpaired === 0) { status = 'ok'; msg = `鈍氣:本身${a.el === 'He' ? '二' : '八'}隅體就穩定`; }
        else { status = 'error'; msg = `${a.el} 的電子數不對`; }
      } else if (a.el === 'H') {
        if (i.shell > 2) { status = 'error'; msg = 'H 只有 1s 一個軌域,只能有 2 個電子(只能接一個鍵)'; }
        else if (i.shell === 2 && i.unpaired === 0) { status = 'ok'; msg = i.degree ? '二隅體(像 He)' : '氫負離子 H⁻,二隅體'; }
        else if (a.own === 0 && i.degree === 0) { status = 'idle'; msg = 'H⁺(質子):沒有電子,有一個空軌域,可以接受別人的一對孤對電子(配位鍵)'; }
        else { status = 'warn'; msg = '還有 1 個未配對電子,可以再接一個原子'; }
      } else if (i.nb < 0) {
        status = 'error'; msg = '電子數不夠分配,結構有誤';
      } else if (i.unpaired > 0 && !(f.electrons % 2 === 1 && f.unpaired === 1 && i.degree > 0 && ODD_OK.has(a.el))) {
        status = 'warn';
        msg = i.degree === 0 && !linked
          ? `${i.unpaired} 個未配對電子 → 可以形成 ${i.unpaired} 個共價鍵`
          : `周圍只有 ${i.shell} 個電子(還差 ${octetTarget(a.el) - i.shell} 個),還有 ${i.unpaired} 個未配對電子:可以再接原子,或點一下鍵改成雙鍵/三鍵`;
      } else if (i.unpaired > 0) {
        status = 'exc'; msg = `奇數電子分子(例外):整個分子總共 ${f.electrons} 個價電子是奇數,一定會剩一個未配對電子`;
      } else if (i.shell === 8) {
        status = 'ok'; msg = '八隅體 ✔';
      } else if (i.shell > 8) {
        if (EXPANDABLE.has(a.el)) { status = 'exc'; msg = `擴張八隅體(例外):第 ${el.period} 週期有 d 軌域可用,周圍 ${i.shell} 個電子`; }
        else { status = 'error'; msg = `第 2 週期的 ${a.el} 只有 4 個軌域,周圍最多 8 個電子,這裡卻有 ${i.shell} 個`; }
      } else if (ELECTRON_DEFICIENT.has(a.el) && i.degree > 0) {
        status = 'exc'; msg = `八隅體不足(例外):${a.el} 只有 ${el.valence} 個價電子,周圍只有 ${i.shell} 個電子`;
        if (i.avail > 0) msg += ',還有空軌域可以接受一對孤對電子';
      } else {
        status = 'error'; msg = `周圍只有 ${i.shell} 個電子,沒有達到八隅體`;
      }
      i.status = status;
      i.msg = msg;
    });
    return { infos, frags, fragOf };
  }

  // ---------------------------------------------------------------------------
  // 成鍵/斷鍵/離子鍵/加減電子/換元素
  // ---------------------------------------------------------------------------
  function canAccept(mol, a) {
    // 能不能空出一個軌域接受一對電子(配位鍵);必要時第 3 週期以後可動用擴張軌域
    const i = atomInfo(mol, a);
    const ok = (orb) => orb - i.bondSum - 1 >= 0 && i.nb <= 2 * (orb - i.bondSum - 1);
    if (ok(i.orb)) return { ok: true, promote: false };
    if (EXPANDABLE.has(a.el) && (a.extra || 0) < 2 && ok(i.orb + 1)) return { ok: true, promote: true };
    return { ok: false };
  }
  function promotable(mol, a) {
    const i = atomInfo(mol, a);
    return EXPANDABLE.has(a.el) && (a.extra || 0) < 2 && i.pairs > 0 && i.unpaired === 0;
  }

  // 在 a、b 之間再加一對共用電子;回傳 { ok, kind, msg }
  function addPair(mol, a, b, bond) {
    const ia = atomInfo(mol, a), ib = atomInfo(mol, b);
    const push = (p) => {
      if (!bond) { bond = { a: a.id, b: b.id, pairs: [] }; mol.bonds.push(bond); }
      bond.pairs.push(bond.a === a.id ? p : (p === 'a' ? 'b' : p === 'b' ? 'a' : 'ab'));
      normalize(mol);
      return bond;
    };
    if (ia.unpaired > 0 && ib.unpaired > 0) {
      push('ab');
      return { ok: true, kind: 'normal', msg: `${a.el} 和 ${b.el} 各出 1 個未配對電子,配成一對共用電子` };
    }
    const accA = canAccept(mol, a), accB = canAccept(mol, b);
    // 配位鍵:出整對電子的原子必須已經沒有未配對電子
    // (否則像 F 這種還有未配對電子的原子拿孤對去接 BF₃,會變成 F⁺ 帶一個落單電子,不合理)
    if (ia.pairs > 0 && ia.unpaired === 0 && accB.ok && !accB.promote) {
      push('a');
      return { ok: true, kind: 'dative', msg: `配位共價鍵:${a.el} 拿出一整對孤對電子,${b.el} 提供空軌域` };
    }
    if (ib.pairs > 0 && ib.unpaired === 0 && accA.ok && !accA.promote) {
      push('b');
      return { ok: true, kind: 'dative', msg: `配位共價鍵:${b.el} 拿出一整對孤對電子,${a.el} 提供空軌域` };
    }
    // 升級成雙鍵,但一邊(Y)只剩孤對、另一邊(X)還有未配對電子(像 O–O–O 拼到一半):
    // 讓 Y 把 1 個電子交給同分子裡另一個還有未配對電子的原子 Z(Y 形式電荷 +1、Z −1),
    // Y 多出的未配對電子再跟 X 配成第二對 → O=O⁺–O⁻、O=N⁺(–O⁻)–O 這類結構
    if (bond) {
      const frag = fragments(mol).find((f) => f.includes(a.id));
      for (const [Y, iY, X, iX] of [[a, ia, b, ib], [b, ib, a, ia]]) {
        if (!(iY.unpaired === 0 && iY.pairs > 0 && iX.unpaired > 0 && !ELEMENTS[Y.el].metal)) continue;
        const Z = frag.map((id) => atomById(mol, id))
          .find((z) => z !== X && z !== Y && !ELEMENTS[z.el].metal && atomInfo(mol, z).unpaired > 0);
        if (!Z) continue;
        Y.own -= 1;
        Z.own += 1;
        push('ab');
        const L = atomLabels(mol);
        const [y, x, z] = [Y, X, Z].map((t) => L.get(t.id).text);
        return { ok: true, kind: 'shift', msg: `${y} 先把 1 個電子交給同一分子裡還有落單電子的 ${z}(${y} 形式電荷 +1、${z} 形式電荷 −1),${y} 多出的未配對電子再和 ${x} 配成第二對共用電子,三個原子周圍都變成 8 個電子` };
      }
    }
    if (ib.unpaired > 0 && promotable(mol, a)) {
      a.extra = (a.extra || 0) + 1;
      push('ab');
      return { ok: true, kind: 'expand', msg: `擴張八隅體:${a.el}(第 ${ELEMENTS[a.el].period} 週期)把一對孤對電子拆開,多出未配對電子來成鍵` };
    }
    if (ia.unpaired > 0 && promotable(mol, b)) {
      b.extra = (b.extra || 0) + 1;
      push('ab');
      return { ok: true, kind: 'expand', msg: `擴張八隅體:${b.el}(第 ${ELEMENTS[b.el].period} 週期)把一對孤對電子拆開,多出未配對電子來成鍵` };
    }
    // 用擴張軌域接受孤對電子:只讓「沒有未配對電子」的原子出整對(否則它應該先用未配對電子成鍵)
    if (ia.pairs > 0 && ia.unpaired === 0 && accB.ok) {
      b.extra = (b.extra || 0) + 1;
      push('a');
      return { ok: true, kind: 'dative', msg: `${a.el} 拿出一對孤對電子,${b.el} 用擴張軌域接受(擴張八隅體)` };
    }
    if (ib.pairs > 0 && ib.unpaired === 0 && accA.ok) {
      a.extra = (a.extra || 0) + 1;
      push('b');
      return { ok: true, kind: 'dative', msg: `${b.el} 拿出一對孤對電子,${a.el} 用擴張軌域接受(擴張八隅體)` };
    }
    // 一邊有空軌域且沒有未配對電子(如 BF₃ 的 B、H⁺),另一邊只剩 1 個未配對電子(如 F):
    // 這個原子先得到 1 個電子變成陰離子(F⁻,電子全部成對),再拿一對孤對電子配位 → BF₄⁻ 帶 −1
    if (!bond) {
      const pick = [[a, ia, b, accB, 'a'], [b, ib, a, accA, 'b']].find(([, ix, y, accY]) =>
        ix.unpaired === 1 && ix.pairs > 0 && accY.ok && !accY.promote && atomInfo(mol, y).unpaired === 0);
      if (pick) {
        const [x, , y, , who] = pick;
        x.own += 1;
        push(who);
        const frag = fragments(mol).find((f) => f.includes(x.id));
        const q = frag.reduce((sum, id) => { const t = atomById(mol, id); return sum + ELEMENTS[t.el].valence - t.own; }, 0);
        const tail = q ? `多了這 1 個電子,整個${frag.length > 1 ? '離子' : ''}帶 ${fmtFC(q)} 電荷` : `${y.el} 原本的正電荷被抵消,整體電中性`;
        return { ok: true, kind: 'dative', msg: `${x.el} 先得到 1 個電子成為 ${x.el}⁻(未配對電子配成孤對、達到八隅體),再拿出一對孤對電子接到 ${y.el} 的空軌域(配位共價鍵)。${tail}` };
      }
    }
    let why;
    if (ia.unpaired === 0 && ib.unpaired === 0) why = `${a.el} 和 ${b.el} 都沒有未配對電子`;
    else why = `${ia.unpaired === 0 ? a.el : b.el} 已經沒有未配對電子,另一邊也沒有空軌域可以接受孤對電子`;
    // 提示:讓沒有未配對電子的原子少一個電子(形式電荷 +1),就會多出一個未配對電子(NO₃⁻、O₃ 的中心原子)
    const stuck = [[a, ia], [b, ib]].find(([x, ix]) => ix.unpaired === 0 && ix.pairs > 0 && !ELEMENTS[x.el].metal && x.el !== 'H');
    // 另一種常見情況:一邊有空軌域(如 BF₃ 的 B),另一邊還有未配對電子(如 F)→ 先讓它多一個電子變成陰離子
    const lone = [[a, ia, b, accB], [b, ib, a, accA]].find(([, ix, y, accY]) => ix.unpaired > 0 && ix.pairs > 0 && accY.ok && atomInfo(mol, y).unpaired === 0);
    let hint = stuck ? `。提示:點選 ${stuck[0].el} 按「−1 e⁻」(形式電荷 +1),它就會多出一個未配對電子可以成鍵` : '';
    if (lone) why = `${lone[0].el} 還有一個未配對電子,不能直接拿孤對電子去接 ${lone[2].el} 的空軌域`;
    if (lone) hint = `。提示:${lone[2].el} 有空軌域,但 ${lone[0].el} 還有一個未配對電子。先點選 ${lone[0].el} 按「+1 e⁻」變成 ${lone[0].el}⁻(電子全部配成孤對),再用一對孤對電子接到 ${lone[2].el}(配位共價鍵)`;
    return { ok: false, msg: `無法再共用電子:${why}${hint}` };
  }

  function connect(mol, a, b) {
    const ea = ELEMENTS[a.el], eb = ELEMENTS[b.el];
    if (bondBetween(mol, a.id, b.id)) return { ok: false, msg: '這兩個原子已經有鍵了;點一下鍵可以改成雙鍵/三鍵' };
    if (ea.metal && eb.metal) return { ok: false, msg: '兩個金屬原子之間是金屬鍵,不在本模擬範圍' };
    if (ea.metal || eb.metal) {
      const m = ea.metal ? a : b, x = ea.metal ? b : a;
      if (NOBLE_INERT.has(x.el)) return { ok: false, msg: `${x.el} 是鈍氣,不接受電子` };
      const ix = atomInfo(mol, x);
      const n = Math.min(m.own, ix.unpaired);
      if (n <= 0) {
        return { ok: false, msg: m.own === 0 ? `${m.el} 的價電子已經給光了` : `${x.el} 已經沒有空位(未配對電子)可以接受電子` };
      }
      m.own -= n;
      x.own += n;
      if (!linkBetween(mol, m.id, x.id)) mol.links.push({ a: m.id, b: x.id });
      normalize(mol);
      return { ok: true, kind: 'ionic', msg: `離子鍵:金屬 ${m.el} 把 ${n} 個電子「轉移」給 ${x.el},變成 ${m.el}${chargeText(ELEMENTS[m.el].valence - m.own, true)} 與帶負電的離子,正負電荷互相吸引(沒有共用電子對)` };
    }
    if (NOBLE_INERT.has(a.el) || NOBLE_INERT.has(b.el)) {
      return { ok: false, msg: `${NOBLE_INERT.has(a.el) ? a.el : b.el} 是鈍氣,本身已經穩定,不會形成共價鍵` };
    }
    return addPair(mol, a, b, null);
  }

  // 試算:a、b 接得起來嗎?(在複製品上試,不改動原分子)
  function canConnect(mol, a, b) {
    const copy = JSON.parse(JSON.stringify(mol));
    return connect(copy, atomById(copy, a.id), atomById(copy, b.id)).ok;
  }

  function cycleBond(mol, bond) {
    const a = atomById(mol, bond.a), b = atomById(mol, bond.b);
    if (bond.pairs.length < 3) {
      const r = addPair(mol, a, b, bond);
      if (r.ok) return { ok: true, msg: `${a.el}${bond.pairs.length === 2 ? '=' : '≡'}${b.el} ${bond.pairs.length === 2 ? '雙' : '三'}鍵:共用 ${bond.pairs.length} 對電子。${r.msg}` };
      if (bond.pairs.length === 1) return { ok: false, msg: r.msg };
    }
    bond.pairs = bond.pairs.slice(0, 1);
    normalize(mol);
    return { ok: true, msg: `${a.el}−${b.el} 改回單鍵,多出來的電子回到原本出電子的原子上` };
  }

  function breakBond(mol, bond) {
    mol.bonds = mol.bonds.filter((b) => b !== bond);
    normalize(mol);
  }
  function breakLink(mol, link) { mol.links = mol.links.filter((l) => l !== link); }

  function changeElectron(mol, a, delta) {
    const i = atomInfo(mol, a);
    const el = ELEMENTS[a.el];
    if (delta > 0) {
      if (el.metal && a.own >= el.valence) return { ok: false, msg: '金屬原子不會再多拿電子' };
      if (i.nb + 1 > 2 * Math.max(i.avail, 0)) {
        return { ok: false, msg: '軌域已經填滿,放不下更多電子' };
      }
      a.own++;
    } else {
      if (i.nb <= 0) return { ok: false, msg: '沒有非鍵結電子可以拿走(共用電子要先斷鍵)' };
      a.own--;
    }
    normalize(mol);
    return { ok: true, msg: `${a.el} ${delta > 0 ? '得到' : '失去'} 1 個電子,形式電荷變成 ${fmtFC(atomInfo(mol, a).fc)}` };
  }

  function swapElement(mol, a, newEl, keepCharge) {
    if (!newEl || !ELEMENTS[newEl]) return { ok: false, msg: '週期表上那個位置沒有可用的元素' };
    const i = atomInfo(mol, a);
    const ne = ELEMENTS[newEl];
    if ((ne.metal || NOBLE_INERT.has(newEl)) && (i.degree > 0)) return { ok: false, msg: `${newEl} 不形成共價鍵,不能直接換上去` };
    if (newEl === 'H' && i.bondSum > 1) return { ok: false, msg: 'H 只能接一個鍵' };
    const oldV = ELEMENTS[a.el].valence;
    const own = keepCharge ? a.own + ne.valence - oldV : a.own;
    const nb = own - i.contributed;
    if (nb < 0) return { ok: false, msg: `${newEl} 的電子不夠分配給現有的鍵` };
    const maxOrb = baseOrb(newEl) + (EXPANDABLE.has(newEl) ? 2 : 0);
    if (i.bondSum + Math.ceil(nb / 2) > maxOrb) return { ok: false, msg: `${newEl} 的軌域放不下這麼多電子(第 2 週期最多八隅體)` };
    const old = a.el;
    a.el = newEl;
    a.own = own;
    normalize(mol);
    return { ok: true, msg: `${old} → ${newEl}:${keepCharge ? '同族價電子數相同,鍵結方式不變' : `周圍電子數不變,但價電子 ${oldV} → ${ne.valence},形式電荷變成 ${fmtFC(atomInfo(mol, a).fc)}(等電子)`}` };
  }

  function deleteAtom(mol, id) {
    // 離子鍵的電子還回去(避免留下沒有對象的離子)
    mol.links.filter((l) => l.a === id || l.b === id).forEach((l) => {
      const other = atomById(mol, otherOf(l, id));
      const me = atomById(mol, id);
      if (!other || !me) return;
      const m = ELEMENTS[me.el].metal ? me : other;
      const x = m === me ? other : me;
      const moved = ELEMENTS[m.el].valence - m.own;
      if (x !== me) {
        // 刪掉金屬:把轉過去的電子收回
        const back = Math.min(moved, x.own - ELEMENTS[x.el].valence);
        if (back > 0) x.own -= back;
      } else if (moved > 0) {
        m.own = Math.min(ELEMENTS[m.el].valence, m.own + Math.min(moved, Math.max(0, x.own - ELEMENTS[x.el].valence)));
      }
    });
    mol.bonds = mol.bonds.filter((b) => b.a !== id && b.b !== id);
    mol.links = mol.links.filter((l) => l.a !== id && l.b !== id);
    mol.atoms = mol.atoms.filter((a) => a.id !== id);
    normalize(mol);
  }

  // 同一個分子裡同種元素有好幾個時加編號(F₁、F₂…),依放入畫布的順序
  function atomLabels(mol) {
    const out = new Map();
    fragments(mol).forEach((ids) => {
      const sorted = ids.slice().sort((x, y) => x - y);
      const count = {};
      sorted.forEach((id) => { const e = atomById(mol, id).el; count[e] = (count[e] || 0) + 1; });
      const seen = {};
      sorted.forEach((id) => {
        const e = atomById(mol, id).el;
        seen[e] = (seen[e] || 0) + 1;
        out.set(id, { el: e, n: count[e] > 1 ? seen[e] : 0, text: e + (count[e] > 1 ? sub(seen[e]) || SUB[seen[e]] : '') });
      });
    });
    return out;
  }

  function fmtFC(fc) { return fc === 0 ? '0' : fc > 0 ? `+${fc}` : `−${-fc}`; }

  // ---------------------------------------------------------------------------
  // 3D 形狀:電子域(鍵、孤對、單一電子)在原子周圍互相排斥 → 自然得到直線、角形、
  // 三角錐、四面體、雙三角錐、八面體…;雙鍵兩端再加一個「共平面」修正(C₂H₄ 是平的)
  // ---------------------------------------------------------------------------
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  const P = (a) => [a.x, a.y, a.z];
  function randUnit() {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [s * Math.cos(t), s * Math.sin(t), u];
  }
  function bondLen(ea, eb, order) {
    return drawR(ea) + drawR(eb) + (order === 1 ? 48 : order === 2 ? 44 : 42);
  }

  // 孤對(與單一電子)的方向向量數量要跟電子數對上
  function ensureLP(mol) {
    mol.atoms.forEach((a) => {
      const i = atomInfo(mol, a);
      const need = i.degree > 0 ? i.pairs + i.unpaired : 0;
      if (a.lp.length === need) return;
      let base = [0, 0, 0];
      mol.bonds.forEach((b) => {
        if (b.a !== a.id && b.b !== a.id) return;
        const o = atomById(mol, otherOf(b, a.id));
        base = v3.add(base, v3.norm(v3.sub(P(o), P(a))));
      });
      base = v3.len(base) > 1e-3 ? v3.mul(v3.norm(base), -1) : randUnit();
      const keep = a.lp.slice(0, need);
      while (keep.length < need) keep.push(v3.norm(v3.add(base, v3.mul(randUnit(), 0.8))));
      a.lp = keep;
    });
  }

  // 電子域兩兩之間的排斥強度;用很陡的位能(1/r⁶,再加一點 1/r² 讓直線分子也拉得直),主要計較「夾 90° 的有幾對」,
  // 這樣 SF₄、ClF₃ 的孤對才會跑到赤道位置、XeF₄ 的兩對孤對才會上下相對
  const DOMAIN_W = { BB: 1, BL: 1.35, LB: 1.35, LL: 2.2, BS: 0.6, SB: 0.6, LS: 0.9, SL: 0.9, SS: 0.4 };
  function domainForces(doms) {
    const acc = doms.map(() => [0, 0, 0]);
    for (let p = 0; p < doms.length; p++) {
      for (let q = p + 1; q < doms.length; q++) {
        let d = v3.sub(doms[p].v, doms[q].v);
        let r = v3.len(d);
        if (r < 0.05) { d = v3.mul(randUnit(), 0.05); r = 0.05; }
        const f = DOMAIN_W[doms[p].t + doms[q].t] * (6 / Math.pow(r, 7) + 2 / (r * r * r));
        acc[p] = v3.add(acc[p], v3.mul(d, f / r));
        acc[q] = v3.sub(acc[q], v3.mul(d, f / r));
      }
    }
    return acc;
  }
  function domainEnergy(doms) {
    let e = 0;
    for (let p = 0; p < doms.length; p++) {
      for (let q = p + 1; q < doms.length; q++) {
        const r = Math.max(v3.len(v3.sub(doms[p].v, doms[q].v)), 0.05);
        e += DOMAIN_W[doms[p].t + doms[q].t] * (1 / Math.pow(r, 6) + 1 / (r * r));
      }
    }
    return e;
  }
  function domainsOf(mol, a) {
    const i = atomInfo(mol, a);
    const doms = mol.bonds.filter((b) => b.a === a.id || b.b === a.id).map((b) => {
      const o = atomById(mol, otherOf(b, a.id));
      return { id: o.id, t: 'B', v: v3.norm(v3.sub(P(o), P(a))), L: v3.len(v3.sub(P(o), P(a))) };
    });
    a.lp.forEach((l, k) => doms.push({ k, t: k < i.pairs ? 'L' : 'S', v: l }));
    return doms;
  }
  // 連續的排斥可能卡在局部最小值(例如 XeF₄ 兩對孤對擠在同一側):
  // 對 5、6 個電子域的原子,試著把孤對跟某個鍵的位置對調,能量較低就採用
  function improveDomains(mol) {
    let changed = false;
    mol.atoms.forEach((a) => {
      if (a.lp.length === 0) return;
      for (let round = 0; round < 6; round++) {
        const doms = domainsOf(mol, a);
        if (doms.length < 5 || doms.length !== a.lp.length + doms.filter((d) => d.t === 'B').length) return;
        const e0 = domainEnergy(doms);
        let best = null;
        doms.forEach((L, li) => {
          if (L.t === 'B') return;
          doms.forEach((B, bi) => {
            if (B.t !== 'B') return;
            const trial = doms.map((d) => ({ ...d }));
            trial[li].v = B.v; trial[bi].v = L.v;
            const e = domainEnergy(trial);
            if (e < e0 - 1e-6 && (!best || e < best.e)) best = { e, L, B };
          });
        });
        if (!best) return;
        // 把那個鄰居(連同它後面接的原子)搬到孤對的方向,孤對搬到原本鍵的方向
        const o = atomById(mol, best.B.id);
        const target = v3.add(P(a), v3.mul(best.L.v, best.B.L));
        const delta = v3.sub(target, P(o));
        subtreeOf(mol, o.id, a.id).forEach((id) => {
          const x = atomById(mol, id);
          x.x += delta[0]; x.y += delta[1]; x.z += delta[2];
        });
        a.lp[best.L.k] = best.B.v;
        changed = true;
      }
    });
    return changed;
  }
  function subtreeOf(mol, startId, blockId) {
    const seen = new Set([startId]);
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      mol.bonds.forEach((b) => {
        if (b.a !== id && b.b !== id) return;
        const o = otherOf(b, id);
        if (o === blockId || seen.has(o)) return;
        seen.add(o);
        queue.push(o);
      });
    }
    return [...seen];
  }
  // 鬆弛 + 跳出局部最小值
  function relaxFull(mol, iters = 500) {
    relax(mol, iters);
    if (improveDomains(mol)) relax(mol, iters);
  }

  // active:只讓這些原子移動(其他分子、或不相干的原子完全不動)
  function relax(mol, iters = 200, pinnedId = null, active = null) {
    const atoms = mol.atoms;
    const n = atoms.length;
    if (!n) return 0;
    ensureLP(mol);
    const idx = new Map(atoms.map((a, i) => [a.id, i]));
    const infos = atoms.map((a) => atomInfo(mol, a));
    const nbrs = atoms.map(() => []);
    mol.bonds.forEach((b) => {
      const i = idx.get(b.a), j = idx.get(b.b);
      nbrs[i].push({ j, order: b.pairs.length });
      nbrs[j].push({ j: i, order: b.pairs.length });
    });
    const fragList = fragments(mol).map((ids) => ids.map((id) => idx.get(id)));
    const fragOf = new Array(n);
    fragList.forEach((f, k) => f.forEach((i) => { fragOf[i] = k; }));
    const close = new Set();
    for (let i = 0; i < n; i++) {
      nbrs[i].forEach(({ j }) => {
        close.add(i * 4096 + j);
        nbrs[j].forEach(({ j: k }) => { if (k !== i) close.add(i * 4096 + k); });
      });
    }
    const R = atoms.map((a) => drawR(a.el));
    const pinned = pinnedId == null ? -1 : idx.get(pinnedId);
    const KB = 0.2, KA = 3.2, KL = 0.06, KP = 0.12;
    let lastMax = 0;

    const domainVecs = (c) => {
      const out = nbrs[c].map(({ j }) => v3.norm(v3.sub(P(atoms[j]), P(atoms[c]))));
      return out.concat(atoms[c].lp);
    };

    for (let it = 0; it < iters; it++) {
      const F = atoms.map(() => [0, 0, 0]);
      const before = fragList.map((f) => f.reduce((s, i) => v3.add(s, P(atoms[i])), [0, 0, 0]));
      // 鍵長彈簧
      mol.bonds.forEach((b) => {
        const i = idx.get(b.a), j = idx.get(b.b);
        const d = v3.sub(P(atoms[j]), P(atoms[i]));
        const L = v3.len(d) || 1e-6;
        const f = KB * (L - bondLen(atoms[i].el, atoms[j].el, b.pairs.length));
        const u = v3.mul(d, 1 / L);
        F[i] = v3.add(F[i], v3.mul(u, f));
        F[j] = v3.sub(F[j], v3.mul(u, f));
      });
      mol.links.forEach((l) => {
        const i = idx.get(l.a), j = idx.get(l.b);
        if (i == null || j == null) return;
        const d = v3.sub(P(atoms[j]), P(atoms[i]));
        const L = v3.len(d) || 1e-6;
        const f = 0.1 * (L - (R[i] + R[j] + 110));
        const u = v3.mul(d, 1 / L);
        F[i] = v3.add(F[i], v3.mul(u, f));
        F[j] = v3.sub(F[j], v3.mul(u, f));
      });
      // 電子域互相排斥(孤對-孤對 > 孤對-鍵結對 > 鍵結對-鍵結對;單一電子最弱)
      for (let c = 0; c < n; c++) {
        if (!nbrs[c].length) continue;
        const a = atoms[c];
        const doms = nbrs[c].map(({ j }) => ({ j, t: 'B', v: v3.norm(v3.sub(P(atoms[j]), P(a))) }));
        a.lp.forEach((l, k) => doms.push({ k, t: k < infos[c].pairs ? 'L' : 'S', v: l }));
        if (doms.length < 2) continue;
        const acc = domainForces(doms);
        doms.forEach((dm, p) => {
          let t = v3.sub(acc[p], v3.mul(dm.v, v3.dot(acc[p], dm.v)));
          const tl = v3.len(t);
          if (tl > 3) t = v3.mul(t, 3 / tl);
          if (dm.j != null) {
            F[dm.j] = v3.add(F[dm.j], v3.mul(t, KA));
            F[c] = v3.sub(F[c], v3.mul(t, KA));
          } else if (!active || active.has(a.id)) {
            a.lp[dm.k] = v3.norm(v3.add(dm.v, v3.mul(t, KL)));
          }
        });
      }
      // 雙鍵兩端共平面(π 鍵不能扭)
      mol.bonds.forEach((b) => {
        if (b.pairs.length !== 2) return;
        const i = idx.get(b.a), j = idx.get(b.b);
        const di = domainVecs(i), dj = domainVecs(j);
        if (di.length !== 3 || dj.length !== 3) return;
        [[i, j, di], [j, i, dj]].forEach(([s, t, ds]) => {
          let nrm = v3.cross(ds[0], ds[1]);
          if (v3.len(nrm) < 0.2) nrm = v3.cross(ds[0], ds[2]);
          if (v3.len(nrm) < 0.2) return;
          nrm = v3.norm(nrm);
          nbrs[t].forEach(({ j: x }) => {
            if (x === s) return;
            const off = v3.dot(v3.sub(P(atoms[x]), P(atoms[t])), nrm);
            F[x] = v3.sub(F[x], v3.mul(nrm, KP * off));
            F[t] = v3.add(F[t], v3.mul(nrm, KP * off));
          });
          atoms[t].lp = atoms[t].lp.map((l) => v3.norm(v3.sub(l, v3.mul(nrm, 0.15 * v3.dot(l, nrm)))));
        });
      });
      // 沒有成鍵的原子不要重疊
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (close.has(i * 4096 + j)) continue;
          const same = fragOf[i] === fragOf[j];
          const linked = !same && mol.links.some((l) => (idx.get(l.a) === i && idx.get(l.b) === j) || (idx.get(l.a) === j && idx.get(l.b) === i));
          if (linked) continue;
          const minD = R[i] + R[j] + (same ? 30 : 6); // 不同分子只防止重疊,不互相推開
          const d = v3.sub(P(atoms[j]), P(atoms[i]));
          const L = v3.len(d);
          if (L >= minD) continue;
          const u = L > 1e-3 ? v3.mul(d, 1 / L) : randUnit();
          const f = 0.3 * (minD - L);
          F[i] = v3.sub(F[i], v3.mul(u, f));
          F[j] = v3.add(F[j], v3.mul(u, f));
        }
      }
      // 前進一步
      let maxStep = 0;
      for (let i = 0; i < n; i++) {
        if (i === pinned || (active && !active.has(atoms[i].id))) continue;
        let s = F[i];
        const l = v3.len(s);
        if (l > 8) s = v3.mul(s, 8 / l);
        maxStep = Math.max(maxStep, l);
        atoms[i].x += s[0]; atoms[i].y += s[1]; atoms[i].z += s[2];
      }
      // 各片段的重心固定(使用者放在哪就留在哪);有指定 active 時改由呼叫端對齊
      fragList.forEach((f, k) => {
        if (active || f.includes(pinned)) return;
        const after = f.reduce((s, i) => v3.add(s, P(atoms[i])), [0, 0, 0]);
        const shift = v3.mul(v3.sub(after, before[k]), 1 / f.length);
        f.forEach((i) => { atoms[i].x -= shift[0]; atoms[i].y -= shift[1]; atoms[i].z -= shift[2]; });
      });
      lastMax = maxStep;
    }
    return lastMax;
  }

  // ---------------------------------------------------------------------------
  // 視角:世界座標 → 螢幕座標(輕微透視)
  // ---------------------------------------------------------------------------
  function rotX(t) { const c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function rotY(t) { const c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function mm(A, B) { return A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])); }
  function mv(A, v) { return [v3.dot(A[0], v), v3.dot(A[1], v), v3.dot(A[2], v)]; }
  function tr(A) { return [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]); }
  function newView(cx, cy) { return { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], cx, cy, scale: 1 }; }
  const DEPTH = 1100;
  function project(view, p) {
    const q = mv(view.R, p);
    const s = DEPTH / (DEPTH - q[2]);
    return { x: view.cx + q[0] * s * view.scale, y: view.cy + q[1] * s * view.scale, z: q[2], s: s * view.scale };
  }
  function unprojectDelta(view, dx, dy, s) {
    return mv(tr(view.R), [dx / s, dy / s, 0]);
  }
  function screenToWorld(view, sx, sy) {
    return mv(tr(view.R), [(sx - view.cx) / view.scale, (sy - view.cy) / view.scale, 0]);
  }

  function jacobi3(M) {
    const A = M.map((r) => r.slice());
    let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 30; sweep++) {
      let off = 0;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += A[p][q] * A[p][q];
      if (off < 1e-12) break;
      for (let p = 0; p < 3; p++) {
        for (let q = p + 1; q < 3; q++) {
          if (Math.abs(A[p][q]) < 1e-12) continue;
          const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
          const c = Math.cos(th), s = Math.sin(th);
          for (let k = 0; k < 3; k++) {
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < 3; k++) {
            const apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < 3; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const vals = [A[0][0], A[1][1], A[2][2]];
    const vecs = [0, 1, 2].map((i) => [V[0][i], V[1][i], V[2][i]]);
    return { vals, vecs };
  }

  // 對稱矩陣特徵值(Jacobi 法,任意大小)
  function jacobiN(M) {
    const n = M.length;
    const A = M.map((r) => r.slice());
    const V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-14) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-14) continue;
          const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
          const c = Math.cos(th), s = Math.sin(th);
          for (let k = 0; k < n; k++) {
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    return { vals: A.map((r, i) => r[i]), vecs: A.map((_, i) => V.map((r) => r[i])) };
  }
  // 把每個分子整體「平移+旋轉」回去,讓 ref 裡記錄的原子盡量留在原位(Horn 四元數法):
  // 形狀照樣由鬆弛決定,只是原本的分子不會漂走或轉掉
  function alignToRef(mol, ref) {
    fragments(mol).forEach((ids) => {
      const pts = ids.filter((id) => ref.has(id));
      if (!pts.length) return;
      const cur = pts.map((id) => P(atomById(mol, id)));
      const tgt = pts.map((id) => ref.get(id));
      const pc = v3.mul(cur.reduce((s, p) => v3.add(s, p), [0, 0, 0]), 1 / pts.length);
      const qc = v3.mul(tgt.reduce((s, p) => v3.add(s, p), [0, 0, 0]), 1 / pts.length);
      let M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      if (pts.length >= 2) {
        const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        cur.forEach((p, k) => {
          const a = v3.sub(p, pc), b = v3.sub(tgt[k], qc);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += a[i] * b[j];
        });
        const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
        const N = [
          [xx + yy + zz, yz - zy, zx - xz, xy - yx],
          [yz - zy, xx - yy - zz, xy + yx, zx + xz],
          [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
          [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
        ];
        const { vals, vecs } = jacobiN(N);
        const [w, x, y, z] = vecs[vals.indexOf(Math.max(...vals))];
        M = [
          [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
          [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
          [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
        ];
      }
      ids.forEach((id) => {
        const a = atomById(mol, id);
        const d = v3.add(mv(M, v3.sub(P(a), pc)), qc);
        a.x = d[0]; a.y = d[1]; a.z = d[2];
        a.lp = a.lp.map((l) => mv(M, l));
      });
    });
  }

  // 把分子轉到「看得清楚」的方向:在許多候選方向中,挑原子與孤對電子投影到螢幕上
  // 彼此分得最開的那個(平面分子自然會正對螢幕、SF₄ 的孤對不會躲到原子後面)
  function axisAngle(axis, ang) {
    const [x, y, z] = v3.norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [
      [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
      [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
      [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
    ];
  }
  function randRot() {
    // 均勻隨機四元數 → 旋轉矩陣
    const u1 = Math.random(), u2 = Math.random() * 2 * Math.PI, u3 = Math.random() * 2 * Math.PI;
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    const [w, x, y, z] = [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  }
  function orientPlan(mol, view, force = false) {
    const plans = [];
    fragments(mol).forEach((ids) => {
      const atoms = ids.map((id) => atomById(mol, id));
      const pts = [];
      atoms.forEach((a) => {
        const r = drawR(a.el);
        pts.push({ p: P(a), r, owner: a.id });
        a.lp.forEach((l) => pts.push({ p: v3.add(P(a), v3.mul(l, r + 13)), r: 7, owner: a.id }));
      });
      if (atoms.length < 2 || pts.length < 3) return;
      const cen = v3.mul(atoms.reduce((s, a) => v3.add(s, P(a)), [0, 0, 0]), 1 / atoms.length);
      const rel = pts.map((q) => ({ d: v3.sub(q.p, cen), r: q.r, owner: q.owner }));
      const score = (M) => {
        const sp = rel.map((q) => { const w = mv(view.R, mv(M, q.d)); return { x: w[0], y: w[1], r: q.r, owner: q.owner }; });
        let worst = Infinity;
        for (let i = 0; i < sp.length; i++) {
          for (let j = i + 1; j < sp.length; j++) {
            if (sp[i].owner === sp[j].owner) continue; // 自己的孤對由繪圖時另外排開
            const d = Math.hypot(sp[i].x - sp[j].x, sp[i].y - sp[j].y) - sp[i].r - sp[j].r;
            if (d < worst) worst = d;
          }
        }
        return worst;
      };
      const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const s0 = score(I);
      let best = { M: I, s: s0 };
      const tryM = (M) => { const sc = score(M); if (sc > best.s) best = { M, s: sc }; };
      for (let k = 0; k < 260; k++) tryM(randRot());
      // 局部微調
      for (let k = 0; k < 160; k++) {
        const ang = 0.25 * (1 - k / 160) + 0.02;
        tryM(mm(axisAngle(randUnit(), (Math.random() - 0.5) * 2 * ang), best.M));
      }
      // 現在的方向夠好就不要轉,避免畫面一直跳
      if (!force && s0 > best.s - 4) return;
      plans.push({ ids, cen, M: best.M });
    });
    return plans;
  }
  function rotateFragment(mol, ids, cen, M) {
    ids.forEach((id) => {
      const a = atomById(mol, id);
      const d = mv(M, v3.sub(P(a), cen));
      a.x = cen[0] + d[0]; a.y = cen[1] + d[1]; a.z = cen[2] + d[2];
      a.lp = a.lp.map((l) => mv(M, l));
    });
  }
  // 旋轉矩陣 → 轉軸與角度(做平滑動畫用)
  function toAxisAngle(M) {
    const ang = Math.acos(Math.max(-1, Math.min(1, (M[0][0] + M[1][1] + M[2][2] - 1) / 2)));
    const ax = [M[2][1] - M[1][2], M[0][2] - M[2][0], M[1][0] - M[0][1]];
    if (v3.len(ax) < 1e-6) return null;
    return { axis: v3.norm(ax), ang };
  }
  function orient(mol, view, force = false) {
    orientPlan(mol, view, force).forEach(({ ids, cen, M }) => rotateFragment(mol, ids, cen, M));
  }

  // ---------------------------------------------------------------------------
  // 由「範例結構描述」建分子:els、bonds([i,j,鍵級, 配位提供者 i|j])、fc(形式電荷)
  // ---------------------------------------------------------------------------
  function applyForm(mol, ids, form) {
    mol.bonds = [];
    (form.bonds || []).forEach(([i, j, order, donor]) => {
      const pairs = [];
      for (let k = 0; k < order; k++) pairs.push('ab');
      if (donor != null) pairs[0] = donor === i ? 'a' : 'b';
      mol.bonds.push({ a: ids[i], b: ids[j], pairs });
    });
    mol.links = (form.links || []).map(([i, j]) => ({ a: ids[i], b: ids[j] }));
    ids.forEach((id, k) => {
      const a = atomById(mol, id);
      const fc = (form.fc && form.fc[k]) || 0;
      let bondSum = 0, contributed = 0;
      mol.bonds.forEach((b) => {
        if (b.a !== id && b.b !== id) return;
        bondSum += b.pairs.length;
        contributed += contribOf(b, id);
      });
      const nb = form.nb && form.nb[k] != null ? form.nb[k] : ELEMENTS[a.el].valence - fc - bondSum;
      a.own = nb + contributed;
    });
    normalize(mol);
  }

  function buildSpec(spec, form, opts = {}) {
    const mol = newMol();
    const ids = spec.els.map((el) => addAtom(mol, el).id);
    applyForm(mol, ids, form || spec.forms[0]);
    layoutInitial(mol);
    relaxFull(mol, opts.iters || 600);
    return { mol, ids };
  }

  // 初始位置:從鍵最多的原子出發,鄰居散在球面上(之後再鬆弛)
  function layoutInitial(mol, origin = [0, 0, 0]) {
    if (!mol.atoms.length) return;
    const deg = (a) => mol.bonds.filter((b) => b.a === a.id || b.b === a.id).length + mol.links.filter((l) => l.a === a.id || l.b === a.id).length;
    const placed = new Set();
    const fib = (k, n) => {
      const y = 1 - (2 * (k + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const t = k * 2.39996;
      return [r * Math.cos(t), y, r * Math.sin(t)];
    };
    let offsetX = 0;
    fragmentsWithLinks(mol).forEach((ids) => {
      const atoms = ids.map((id) => atomById(mol, id));
      const root = atoms.reduce((b, a) => (deg(a) > deg(b) ? a : b), atoms[0]);
      root.x = origin[0] + offsetX; root.y = origin[1]; root.z = origin[2];
      placed.add(root.id);
      const queue = [root];
      while (queue.length) {
        const c = queue.shift();
        const nbIds = [
          ...mol.bonds.filter((b) => b.a === c.id || b.b === c.id).map((b) => [otherOf(b, c.id), bondLen(c.el, atomById(mol, otherOf(b, c.id)).el, b.pairs.length)]),
          ...mol.links.filter((l) => l.a === c.id || l.b === c.id).map((l) => [otherOf(l, c.id), drawR(c.el) + drawR(atomById(mol, otherOf(l, c.id)).el) + 110]),
        ];
        const fresh = nbIds.filter(([id]) => !placed.has(id));
        fresh.forEach(([id, L], k) => {
          const a = atomById(mol, id);
          const d = v3.norm(v3.add(fib(k, Math.max(fresh.length, 2)), v3.mul(randUnit(), 0.15)));
          a.x = c.x + d[0] * L; a.y = c.y + d[1] * L; a.z = c.z + d[2] * L;
          placed.add(id);
          queue.push(a);
        });
      }
      const span = Math.max(...atoms.map((a) => a.x)) - Math.min(...atoms.map((a) => a.x));
      offsetX += span + 140;
    });
    mol.atoms.forEach((a) => { a.lp = []; });
    // 置中
    const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / mol.atoms.length;
    const cy = mol.atoms.reduce((s, a) => s + a.y, 0) / mol.atoms.length;
    const cz = mol.atoms.reduce((s, a) => s + a.z, 0) / mol.atoms.length;
    mol.atoms.forEach((a) => { a.x += origin[0] - cx; a.y += origin[1] - cy; a.z += origin[2] - cz; });
  }
  function fragmentsWithLinks(mol) {
    const parent = new Map(mol.atoms.map((a) => [a.id, a.id]));
    const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
    [...mol.bonds, ...mol.links].forEach((b) => parent.set(find(b.a), find(b.b)));
    const groups = new Map();
    mol.atoms.forEach((a) => {
      const r = find(a.id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(a.id);
    });
    return [...groups.values()];
  }

  function centerMol(mol) {
    if (!mol.atoms.length) return;
    const c = v3.mul(mol.atoms.reduce((s, a) => v3.add(s, P(a)), [0, 0, 0]), 1 / mol.atoms.length);
    mol.atoms.forEach((a) => { a.x -= c[0]; a.y -= c[1]; a.z -= c[2]; });
  }
  function fitView(mol, view, w, h, pad = 50) {
    view.scale = 1;
    if (!mol.atoms.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    mol.atoms.forEach((a) => {
      const p = project(view, P(a));
      const r = drawR(a.el) + 20;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
      y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    });
    const sw = (w - 2 * pad) / (x1 - x0), sh = (h - 2 * pad) / (y1 - y0);
    view.scale = Math.min(1.25, sw, sh);
  }

  // ---------------------------------------------------------------------------
  // 繪圖
  // ---------------------------------------------------------------------------
  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }
  const STATUS_COLOR = { ok: '#2f9e44', exc: '#7048e8', warn: '#f08c00', error: '#e03131', idle: '#adb5bd' };

  function drawMark(g, x, y, color, cross, s) {
    if (cross) {
      const d = 3.7 * s;
      el('path', { d: `M${x - d},${y - d}L${x + d},${y + d}M${x - d},${y + d}L${x + d},${y - d}`, stroke: color, 'stroke-width': 1.9 * s, 'stroke-linecap': 'round' }, g);
    } else {
      el('circle', { cx: x, cy: y, r: 3.6 * s, fill: color }, g);
    }
  }

  // opts: { showFC, bondStyle:'dots'|'lines', marks:true, partial:false, selectedId, hidden:{id:label}, highlight:{id:color}, candidateId }
  function render(svg, mol, view, opts = {}) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ana = analyze(mol);
    const pos = new Map();
    mol.atoms.forEach((a) => pos.set(a.id, project(view, P(a))));
    const hidden = opts.hidden || {};
    const ecolOf = (a) => (hidden[a.id] ? HIDDEN_ECOL : ELEMENTS[a.el].ecol);
    const radOf = (a) => (hidden[a.id] ? 24 : drawR(a.el)) * pos.get(a.id).s;

    // × 標記:中心原子(接兩個以上的原子);雙原子分子則其中一個用 ×
    // × / • 標記:相鄰的原子一定用不同記號(從接最多鍵的中心原子開始用 ×,往外交替),
    // 所以每一對共用電子都看得出是哪兩個原子各出的
    const cross = new Set(opts.crossIds || []);
    if (opts.marks !== false && !opts.crossIds) {
      ana.frags.forEach((f) => {
        if (f.ids.length < 2) return;
        const start = f.ids.reduce((b, id) => (ana.infos.get(id).degree > ana.infos.get(b).degree ? id : b), f.ids[0]);
        const color = new Map([[start, 1]]);
        const queue = [start];
        while (queue.length) {
          const id = queue.shift();
          mol.bonds.forEach((b) => {
            if (b.a !== id && b.b !== id) return;
            const o = otherOf(b, id);
            if (color.has(o)) return;
            color.set(o, 1 - color.get(id));
            queue.push(o);
          });
        }
        color.forEach((c, id) => { if (c) cross.add(id); });
      });
    }

    const items = [];
    // 離子鍵:虛線
    mol.links.forEach((l) => {
      const p = pos.get(l.a), q = pos.get(l.b);
      if (!p || !q) return;
      items.push({ z: (p.z + q.z) / 2 - 1, draw: (g) => el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: '#ced4da', 'stroke-width': 2, 'stroke-dasharray': '4 5' }, g) });
    });
    // 共價鍵
    mol.bonds.forEach((b, bi) => {
      const A = atomById(mol, b.a), B = atomById(mol, b.b);
      const p = pos.get(b.a), q = pos.get(b.b);
      const dx = q.x - p.x, dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const ra = radOf(A), rb = radOf(B);
      const ex1 = p.x + ux * ra, ey1 = p.y + uy * ra, ex2 = q.x - ux * rb, ey2 = q.y - uy * rb;
      const mx = (ex1 + ex2) / 2, my = (ey1 + ey2) / 2;
      const s = (p.s + q.s) / 2;
      const n = b.pairs.length;
      items.push({
        z: (p.z + q.z) / 2,
        draw: (g) => {
          const bg = el('g', { 'data-bond': bi, class: 'bond' }, g);
          el('line', { x1: ex1, y1: ey1, x2: ex2, y2: ey2, stroke: 'transparent', 'stroke-width': 22 }, bg);
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (opts.bondStyle === 'lines') {
            const offs = n === 1 ? [0] : n === 2 ? [-3.5, 3.5] : [-5.5, 0, 5.5];
            offs.forEach((o) => el('line', { x1: ex1 - uy * o, y1: ey1 + ux * o, x2: ex2 - uy * o, y2: ey2 + ux * o, stroke: '#343a40', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, bg));
            return;
          }
          const w = (n * 12 + 8) * s, h = 20 * s;
          // 從原子邊緣到電子對框的細線,讓方向清楚
          const gap = w / 2 + 1;
          if (d - ra - rb > w + 4) {
            el('line', { x1: ex1, y1: ey1, x2: mx - ux * gap, y2: my - uy * gap, stroke: '#adb5bd', 'stroke-width': 1.6 }, bg);
            el('line', { x1: mx + ux * gap, y1: my + uy * gap, x2: ex2, y2: ey2, stroke: '#adb5bd', 'stroke-width': 1.6 }, bg);
          }
          const pg = el('g', { transform: `translate(${mx},${my}) rotate(${ang})` }, bg);
          el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2, fill: '#fff3bf', stroke: '#fab005', 'stroke-width': 1.2 }, pg);
          b.pairs.forEach((pr, k) => {
            const t = (k - (n - 1) / 2) * 12 * s;
            const srcs = pr === 'ab' ? [A, B] : pr === 'a' ? [A, A] : [B, B];
            srcs.forEach((src, m) => {
              const yy = (m === 0 ? -4.8 : 4.8) * s;
              drawMark(pg, t, yy, ecolOf(src), cross.has(src.id), s);
            });
          });
        },
      });
    });
    // 原子 + 孤對電子
    mol.atoms.forEach((a) => {
      const p = pos.get(a.id);
      const info = ana.infos.get(a.id);
      items.push({ z: p.z + 0.5, draw: (g) => drawAtom(g, mol, a, p, info, radOf(a), ecolOf(a), cross.has(a.id), opts, pos) });
    });
    items.sort((x, y) => x.z - y.z);
    const layer = el('g', {}, svg);
    items.forEach((it) => it.draw(layer));

    // 離子加中括號與電荷
    ana.frags.forEach((f) => {
      if (!f.charge || opts.noBrackets) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      f.ids.forEach((id) => {
        const a = atomById(mol, id);
        const p = pos.get(id);
        const r = radOf(a) + 17 * p.s;
        x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
        y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
      });
      const k = 8;
      el('path', { d: `M${x0 + k},${y0}H${x0}V${y1}H${x0 + k}M${x1 - k},${y0}H${x1}V${y1}H${x1 - k}`, fill: 'none', stroke: '#495057', 'stroke-width': 2 }, layer);
      const t = el('text', { x: x1 + 4, y: y0 + 10, 'font-size': 20, 'font-weight': 700, fill: '#212529' }, layer);
      t.textContent = chargeText(f.charge);
    });
    return { pos, ana };
  }

  function drawAtom(g, mol, a, p, info, r, ecol, isCross, opts, pos) {
    const hidden = opts.hidden && opts.hidden[a.id];
    const ag = el('g', { 'data-atom': a.id, class: 'atom' }, g);
    const s = p.s;
    const fill = hidden ? '#e9ecef' : ELEMENTS[a.el].color;
    const stroke = opts.noStatus ? '#868e96' : STATUS_COLOR[info.status] || '#868e96';
    if (opts.candidateId === a.id) el('circle', { cx: p.x, cy: p.y, r: r + 10, fill: 'rgba(59,91,219,0.15)', stroke: '#3b5bdb', 'stroke-dasharray': '4 3' }, ag);
    el('circle', { cx: p.x, cy: p.y, r, fill, stroke, 'stroke-width': 2.6 }, ag);
    if (opts.selectedId === a.id) el('circle', { cx: p.x, cy: p.y, r: r + 5, fill: 'none', stroke: '#3b5bdb', 'stroke-width': 2, 'stroke-dasharray': '5 3' }, ag);
    const label = hidden || a.el;
    const num = !hidden && opts.labels && opts.labels.get(a.id) ? opts.labels.get(a.id).n : 0;
    const t = el('text', { x: p.x - (num ? 3 * s : 0), y: p.y + 5.5 * s, 'text-anchor': 'middle', 'font-size': (label.length > 1 ? 15 : 17) * s, 'font-weight': 700, fill: '#212529' }, ag);
    t.textContent = label;
    if (num) {
      // 編號放在元素符號右下角(下標)
      const ts = el('tspan', { dy: 5 * s, 'font-size': 11 * s, fill: '#1c7ed6' }, t);
      ts.textContent = String(num);
    }

    // 非鍵電子的方向
    const nDom = info.pairs + info.unpaired;
    if (nDom > 0) {
      const dirs = loneDirections(mol, a, info, p, pos);
      const R0 = r + 10 * s;
      dirs.forEach((ang, k) => {
        const isPair = k < info.pairs;
        const cx = p.x + Math.cos(ang) * R0, cy = p.y + Math.sin(ang) * R0;
        const px = -Math.sin(ang), py = Math.cos(ang);
        if (isPair) {
          drawMark(ag, cx + px * 4.8 * s, cy + py * 4.8 * s, ecol, isCross, s);
          drawMark(ag, cx - px * 4.8 * s, cy - py * 4.8 * s, ecol, isCross, s);
        } else {
          drawMark(ag, cx, cy, ecol, isCross, s);
        }
      });
    }
    if (opts.showFC !== false && info.fc !== 0 && !ELEMENTS[a.el].metal) {
      const bx = p.x + r * 0.78, by = p.y - r * 0.78;
      el('circle', { cx: bx, cy: by, r: 8.5, fill: info.fc > 0 ? '#e03131' : '#1c7ed6' }, ag);
      const ft = el('text', { x: bx, y: by + 3.6, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#fff' }, ag);
      ft.textContent = info.fc > 0 ? `+${info.fc}` : `−${-info.fc}`;
    }
    if (opts.partial && info.degree > 0 && !hidden) {
      let pull = 0;
      mol.bonds.forEach((b) => {
        if (b.a !== a.id && b.b !== a.id) return;
        const o = atomById(mol, otherOf(b, a.id));
        pull += (ELEMENTS[a.el].en - ELEMENTS[o.el].en) * b.pairs.length;
      });
      if (Math.abs(pull) > 0.25) {
        const dt = el('text', { x: p.x - r * 0.95, y: p.y + r + 13, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: pull > 0 ? '#1c7ed6' : '#e03131' }, ag);
        dt.textContent = pull > 0 ? 'δ−' : 'δ+';
      }
    }
  }

  // 非鍵電子在螢幕上的角度:有鍵的原子用 3D 方向投影,再避開鍵與彼此;
  // 單獨的原子用路易斯點式的上右下左四個位置
  function loneDirections(mol, a, info, p, pos) {
    const n = info.pairs + info.unpaired;
    if (info.degree === 0 || a.lp.length !== n) {
      const slots = [-Math.PI / 2, 0, Math.PI / 2, Math.PI, -Math.PI / 4, (3 * Math.PI) / 4];
      // 先每個位置放一個,再配對:成對的要排前面(繪圖時前 pairs 個是一對)
      const orbN = Math.max(4, n);
      const fill = new Array(orbN).fill(0);
      const e = info.pairs * 2 + info.unpaired;
      for (let k = 0; k < e; k++) fill[k % orbN]++;
      const pairSlots = [], single = [];
      fill.forEach((c, k) => { if (c === 2) pairSlots.push(slots[k]); else if (c === 1) single.push(slots[k]); });
      return [...pairSlots, ...single];
    }
    const fixed = [];
    mol.bonds.forEach((b) => {
      if (b.a !== a.id && b.b !== a.id) return;
      const q = pos.get(otherOf(b, a.id));
      fixed.push(Math.atan2(q.y - p.y, q.x - p.x));
    });
    mol.links.forEach((l) => {
      if (l.a !== a.id && l.b !== a.id) return;
      const q = pos.get(otherOf(l, a.id));
      if (q) fixed.push(Math.atan2(q.y - p.y, q.x - p.x));
    });
    const angs = a.lp.map((l, k) => {
      const q = project(currentViewForLP, [a.x + l[0] * 40, a.y + l[1] * 40, a.z + l[2] * 40]);
      const ang = Math.atan2(q.y - p.y, q.x - p.x);
      return Number.isFinite(ang) ? ang : k;
    });
    const diff = (x, y) => { let d = x - y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const minSep = Math.min(0.95, (2 * Math.PI) / (fixed.length + angs.length) * 0.85);
    for (let it = 0; it < 60; it++) {
      let moved = false;
      angs.forEach((t, k) => {
        let push = 0;
        fixed.forEach((f) => { const d = diff(t, f); if (Math.abs(d) < minSep) push += (d >= 0 ? 1 : -1) * (minSep - Math.abs(d)); });
        angs.forEach((o, m) => { if (m === k) return; const d = diff(t, o); if (Math.abs(d) < minSep) push += (d >= 0 ? 1 : -1) * (minSep - Math.abs(d)) * 0.5; });
        if (Math.abs(push) > 1e-3) { angs[k] = t + push * 0.5; moved = true; }
      });
      if (!moved) break;
    }
    return angs;
  }
  // loneDirections 需要目前的視角;render 前設定
  let currentViewForLP = null;
  const renderWithView = (svg, mol, view, opts) => { currentViewForLP = view; return render(svg, mol, view, opts); };

  window.Chem = {
    ELEMENTS, TABLE, NOBLE_INERT, EXPANDABLE, ELECTRON_DEFICIENT, STATUS_COLOR,
    newMol, addAtom, atomById, bondBetween, linkBetween, otherOf, contribOf, atomInfo, normalize,
    fragments, analyze, connect, canConnect, cycleBond, breakBond, breakLink, changeElectron, swapElement, deleteAtom,
    neighborEl, relax, relaxFull, alignToRef, bondLen, mvec: mv, improveDomains, orient, orientPlan, rotateFragment, toAxisAngle, axisAngle, project, unprojectDelta, screenToWorld, newView, rotX, rotY, mm,
    applyForm, buildSpec, layoutInitial, centerMol, fitView, render: renderWithView, drawR,
    formulaText, atomLabels, countsOf, countsKey, chargeText, fmtFC, octetTarget, baseOrb,
  };
})();
