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
    // orb=6:硫可以擴張八隅體(expanded octet),讓 H2SO4 的 S 能同時跟 4 個 O 成鍵仍「滿足」
    S: { valence: 6, orb: 6, color: '#f2d24b', r: 33, name: '硫', en: 2.58, mass: 32.06 },
    Cl: { valence: 7, orb: 4, color: '#8fd14f', r: 30, name: '氯', en: 3.16, mass: 35.45 },
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
  setBP('C', 'N', 3, 1.16, 17.7);
  setBP('C', 'O', 1, 1.43, 5.0);
  setBP('C', 'O', 2, 1.21, 12.1);
  setBP('N', 'N', 1, 1.45, 4.0);
  setBP('N', 'N', 2, 1.25, 13.0);
  setBP('N', 'N', 3, 1.1, 22.4);
  setBP('O', 'O', 1, 1.48, 3.8);
  setBP('O', 'O', 2, 1.21, 11.4);
  setBP('N', 'O', 1, 1.41, 5.4);
  setBP('N', 'O', 2, 1.21, 11.2);
  setBP('S', 'O', 1, 1.57, 4.5);
  setBP('S', 'O', 2, 1.42, 9.8);
  setBP('Cl', 'H', 1, 1.27, 4.8);
  function bondParams(e1, e2, order) {
    return BOND_PARAMS[[e1, e2].sort().join('') + '-' + order] || { len: 1.4, k: 4.5 };
  }
  const LONE_WEIGHT = 1.3; // 孤對電子排斥比鍵結電子對強(VSEPR)
  const ANGLE_K = 0.55; // mdyn·Å,通用彎曲力常數(簡化)

  const SUBSCRIPT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

  const TARGETS = [
    { key: 'H2', label: 'H₂ 氫氣' },
    { key: 'O2', label: 'O₂ 氧氣' },
    { key: 'N2', label: 'N₂ 氮氣' },
    { key: 'H2O1', label: 'H₂O 水' },
    { key: 'H3N1', label: 'NH₃ 氨' },
    { key: 'C1H4', label: 'CH₄ 甲烷' },
    { key: 'C2H6', label: 'C₂H₆ 乙烷' },
    { key: 'C1O2', label: 'CO₂ 二氧化碳' },
    { key: 'H2O2', label: 'H₂O₂ 過氧化氫' },
    { key: 'C1H2O1', label: 'CH₂O 甲醛' },
    { key: 'C7H8', label: 'C₇H₈ 甲苯' },
    { key: 'C6H6', label: 'C₆H₆ 苯' },
    { key: 'H2O4S1', label: 'H₂SO₄ 硫酸' },
    { key: 'H1Cl1', label: 'HCl 氯化氫' },
    { key: 'H1N1O3', label: 'HNO₃ 硝酸' },
    { key: 'C1H4O1', label: 'CH₃OH 甲醇' },
    { key: 'C2H6O1', label: 'C₂H₅OH 乙醇' },
  ];

  // ---- 塑膠代表分子的「單體重複數 N」鏈狀產生器 ----
  // 只對「加成聚合、重複單元結構單純」的塑膠開放(PE/PP/PVC/PS/PMMA/PEG):
  // 骨架是 -CH2-CHX- 交替的碳鏈(PEG 則是 -CH2-CH2-O- 的醚鏈),依 N 動態產生
  // els/bonds,不是固定寫死的單一結構。ABS/TPU/PVP 是共聚合物或機能基代表,
  // 沒有單純可重複的小分子鏈,維持固定的代表結構,不提供 N 選項。
  const FRAG = {
    methyl: () => ({ els: ['C', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]], attach: 0 }),
    chloro: () => ({ els: ['Cl'], bonds: [], attach: 0 }),
    // 單取代苯環:ipso 碳(index 0)沒有 H,留給骨架接;其餘 5 顆環碳各接 1 個 H
    phenyl: () => ({
      els: ['C', 'C', 'C', 'C', 'C', 'C', 'H', 'H', 'H', 'H', 'H'],
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [1, 6, 1], [2, 7, 1], [3, 8, 1], [4, 9, 1], [5, 10, 1]],
      attach: 0,
    }),
    // 甲酯基 -C(=O)-O-CH3
    ester: () => ({
      els: ['C', 'O', 'O', 'C', 'H', 'H', 'H'],
      bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1], [3, 4, 1], [3, 5, 1], [3, 6, 1]],
      attach: 0,
    }),
  };

  // 骨架碳鏈:2N 顆碳,每顆碳依 branchFragsAt(i) 決定要不要掛支鏈,其餘用 H 補滿價數
  function chainBackbone(n, branchFragsAt) {
    const nC = 2 * n;
    const els = [];
    const bonds = [];
    for (let i = 0; i < nC; i++) els.push('C');
    for (let i = 0; i < nC - 1; i++) bonds.push([i, i + 1, 1]);
    let next = nC;
    for (let i = 0; i < nC; i++) {
      const chainNb = i === 0 || i === nC - 1 ? 1 : 2;
      let used = chainNb;
      (branchFragsAt(i) || []).forEach((mk) => {
        const frag = mk();
        const base = next;
        frag.els.forEach((e) => els.push(e));
        frag.bonds.forEach(([a, b, o]) => bonds.push([base + a, base + b, o]));
        bonds.push([i, base + frag.attach, 1]);
        next += frag.els.length;
        used += 1;
      });
      const hCount = 4 - used;
      for (let k = 0; k < hCount; k++) {
        els.push('H');
        bonds.push([i, next, 1]);
        next++;
      }
    }
    return { els, bonds };
  }

  function genPE(n) { return chainBackbone(n, () => []); }
  function genPP(n) { return chainBackbone(n, (i) => (i % 2 === 1 ? [FRAG.methyl] : [])); }
  function genPVC(n) { return chainBackbone(n, (i) => (i % 2 === 1 ? [FRAG.chloro] : [])); }
  function genPS(n) { return chainBackbone(n, (i) => (i % 2 === 1 ? [FRAG.phenyl] : [])); }
  function genPMMA(n) { return chainBackbone(n, (i) => (i % 2 === 1 ? [FRAG.methyl, FRAG.ester] : [])); }

  // Glyme 系列(甘醇二甲醚):CH3-O-(CH2-CH2-O)n-CH3——單/二/三/四甘醇二甲醚都是真實存在的溶劑,
  // 拿來當 PEG 的 -(CH2CH2O)n- 醚鏈骨架代表,N 越大鏈越長、兩端一樣是甲基封端(無端基 OH,跟原本的
  // 1,2-二甲氧基乙烷 N=1 版本一致)。
  function genPEG(n) {
    const els = [];
    const bonds = [];
    let next = 0;
    const addAtom = (elSym) => { els.push(elSym); return next++; };
    const oIdx = [addAtom('O')];
    const cIdx = [];
    for (let u = 0; u < n; u++) {
      const c1 = addAtom('C'), c2 = addAtom('C');
      bonds.push([oIdx[oIdx.length - 1], c1, 1]);
      bonds.push([c1, c2, 1]);
      cIdx.push(c1, c2);
      const o2 = addAtom('O');
      bonds.push([c2, o2, 1]);
      oIdx.push(o2);
    }
    [oIdx[0], oIdx[oIdx.length - 1]].forEach((oi) => {
      const c = addAtom('C');
      bonds.push([oi, c, 1]);
      for (let k = 0; k < 3; k++) {
        const h = addAtom('H');
        bonds.push([c, h, 1]);
      }
    });
    cIdx.forEach((ci) => {
      for (let k = 0; k < 2; k++) {
        const h = addAtom('H');
        bonds.push([ci, h, 1]);
      }
    });
    return { els, bonds };
  }

  // 塑膠代表分子的顯示名稱:chainGen 支援的用「骨架描述 + 目前 N + 分子式」,固定結構的用寫死的 analogName
  function plasticAnalogLabel(key) {
    const p = PLASTICS[key];
    if (!p) return '';
    if (p.chainGen) {
      const spec = p.chainGen(currentPlasticN || 1);
      return `${p.chainDesc},N=${currentPlasticN}(${formulaOf(spec)})`;
    }
    return p.analogName;
  }

  function formulaOf(spec) {
    const counts = {};
    spec.els.forEach((e) => { counts[e] = (counts[e] || 0) + 1; });
    return formulaDisplay(counts);
  }

  // ---- 常見塑膠的 IR 特徵峰(文獻參考值,不是即時計算) ----
  // 塑膠是長鏈高分子(重複單元上千個),不是這個引擎設計來處理的小分子,VSEPR/Hessian
  // 物理沒辦法、也不該假裝去「算」一條無限長的鏈子。這裡誠實地改用文獻上公認的
  // 特徵吸收峰(ATR-FTIR 常見對照表)當參考,同一種塑膠不同廠牌/添加劑/結晶度多少會有些微差異,
  // 這正是「看差異有多少」的意義——峰位置是拿來對照真實光譜、抓特徵官能基用的,不是拿來算溫室效應。
  const PLASTICS = {
    PE: {
      label: 'PE 聚乙烯', full: '聚乙烯(Polyethylene)', uses: '塑膠袋、保鮮膜、水管(回收碼 2/4)',
      presetKey: 'PE_ANALOG', analogName: '丁烷(C₄H₁₀)——PE 的 -(CH₂)n- 骨架代表', chainGen: genPE, chainDesc: 'PE 的 -(CH₂-CH₂)n- 骨架代表(兩端補 H 封端)',
      peaks: [
        { freq: 2915, strength: 0.9, note: 'CH₂ 不對稱伸縮' },
        { freq: 2848, strength: 0.85, note: 'CH₂ 對稱伸縮' },
        { freq: 1472, strength: 0.4, note: 'CH₂ 剪式彎曲' },
        { freq: 730, strength: 0.5, note: 'CH₂ 搖擺(結晶區雙峰之一)' },
        { freq: 719, strength: 0.45, note: 'CH₂ 搖擺(結晶區雙峰之一)' },
      ],
    },
    PP: {
      label: 'PP 聚丙烯', full: '聚丙烯(Polypropylene)', uses: '食品容器、吸管、瓶蓋(回收碼 5)',
      presetKey: 'PP_ANALOG', analogName: '2-甲基丁烷/異戊烷(C₅H₁₂)——PP 甲基取代骨架代表', chainGen: genPP, chainDesc: 'PP 的 -(CH₂-CH(CH₃))n- 甲基取代骨架代表(兩端補 H 封端)',
      peaks: [
        { freq: 2950, strength: 0.7, note: 'CH₃ 不對稱伸縮' },
        { freq: 2917, strength: 0.8, note: 'CH₂ 不對稱伸縮' },
        { freq: 2868, strength: 0.55, note: 'CH₃ 對稱伸縮' },
        { freq: 1456, strength: 0.45, note: 'CH₃/CH₂ 彎曲' },
        { freq: 1376, strength: 0.55, note: 'CH₃ 對稱彎曲(區別 PP/PE 的關鍵峰)' },
        { freq: 997, strength: 0.35, note: 'CH₃ 搖擺 + C−C 伸縮(螺旋結構敏感)' },
        { freq: 841, strength: 0.3, note: 'CH₂ 搖擺' },
      ],
    },
    PS: {
      label: 'PS 聚苯乙烯', full: '聚苯乙烯(Polystyrene)', uses: '保麗龍、透明杯、免洗餐具(回收碼 6)',
      presetKey: 'C7H8', analogName: '甲苯(C₇H₈)——PS 苯環+脂肪鏈骨架代表(乙苯的兩層懸鏈結構在這套簡化力場中不易收斂,改用結構已驗證穩定的甲苯,芳香環特徵不變)',
      peaks: [
        { freq: 3060, strength: 0.3, note: '芳香環 C−H 伸縮' },
        { freq: 3026, strength: 0.35, note: '芳香環 C−H 伸縮' },
        { freq: 2923, strength: 0.6, note: '脂肪族 CH₂ 伸縮' },
        { freq: 1601, strength: 0.25, note: '苯環骨架 C=C 伸縮' },
        { freq: 1493, strength: 0.4, note: '苯環骨架 C=C 伸縮' },
        { freq: 1452, strength: 0.4, note: 'CH₂ 彎曲' },
        { freq: 756, strength: 0.65, note: '單取代苯環 面外彎曲(特徵雙峰之一)' },
        { freq: 698, strength: 0.75, note: '單取代苯環 面外彎曲(特徵雙峰之一,最診斷性)' },
      ],
    },
    PVC: {
      label: 'PVC 聚氯乙烯', full: '聚氯乙烯(Polyvinyl chloride)', uses: '水管、雨衣、地板材(回收碼 3)',
      presetKey: 'PVC_ANALOG', analogName: '1-氯丙烷(C₃H₇Cl)——PVC 的 C−Cl 骨架代表', chainGen: genPVC, chainDesc: 'PVC 的 -(CH₂-CHCl)n- 骨架代表(兩端補 H 封端)',
      peaks: [
        { freq: 2971, strength: 0.4, note: 'C−H 伸縮' },
        { freq: 2913, strength: 0.45, note: 'C−H 伸縮' },
        { freq: 1425, strength: 0.4, note: 'CH₂ 彎曲(鄰近 C−Cl)' },
        { freq: 1330, strength: 0.35, note: 'CH 搖擺' },
        { freq: 1254, strength: 0.4, note: 'CH 彎曲' },
        { freq: 960, strength: 0.3, note: 'C−C 骨架伸縮' },
        { freq: 690, strength: 0.7, note: 'C−Cl 伸縮(最診斷性)' },
        { freq: 615, strength: 0.55, note: 'C−Cl 伸縮' },
      ],
    },
    PMMA: {
      label: 'PMMA 壓克力', full: '聚甲基丙烯酸甲酯(Polymethyl methacrylate)', uses: '壓克力板、有機玻璃、隱形眼鏡',
      presetKey: 'PMMA_ANALOG', analogName: '特戊酸甲酯 methyl pivalate(C₆H₁₂O₂)——PMMA 四級碳+酯基代表', chainGen: genPMMA, chainDesc: 'PMMA 的 -(CH₂-C(CH₃)(COOCH₃))n- 四級碳+酯基骨架代表(兩端補 H 封端)',
      peaks: [
        { freq: 2995, strength: 0.45, note: 'O−CH₃ / CH₂ 伸縮' },
        { freq: 2950, strength: 0.4, note: 'C−H 伸縮' },
        { freq: 1730, strength: 0.95, note: 'C=O 酯基伸縮(最強、最診斷性)' },
        { freq: 1450, strength: 0.35, note: 'CH₃ 不對稱彎曲' },
        { freq: 1435, strength: 0.3, note: 'CH₂ 彎曲' },
        { freq: 1270, strength: 0.55, note: 'C−O−C 不對稱伸縮' },
        { freq: 1145, strength: 0.6, note: 'C−O−C 對稱伸縮' },
        { freq: 985, strength: 0.25, note: '骨架伸縮' },
      ],
    },
    ABS: {
      label: 'ABS', full: '丙烯腈-丁二烯-苯乙烯共聚物(Acrylonitrile Butadiene Styrene)', uses: '樂高積木、家電外殼、3D 列印線材',
      presetKey: 'ABS_ANALOG', analogName: '異丁腈(C₄H₇N)——ABS 中丙烯腈成分 C≡N 代表(不含丁二烯/苯乙烯部分)',
      peaks: [
        { freq: 3025, strength: 0.25, note: '芳香環 C−H 伸縮(苯乙烯)' },
        { freq: 2923, strength: 0.55, note: '脂肪族 C−H 伸縮' },
        { freq: 2237, strength: 0.6, note: 'C≡N 腈基伸縮(丙烯腈,最診斷性)' },
        { freq: 1600, strength: 0.25, note: '苯環骨架(苯乙烯)' },
        { freq: 1452, strength: 0.35, note: 'CH₂ 彎曲' },
        { freq: 966, strength: 0.3, note: '反式 CH=CH 彎曲(丁二烯)' },
        { freq: 758, strength: 0.45, note: '單取代苯環面外彎曲(苯乙烯)' },
        { freq: 700, strength: 0.5, note: '單取代苯環面外彎曲(苯乙烯)' },
      ],
    },
    TPU: {
      label: 'TPU 熱塑性聚氨酯', full: '熱塑性聚氨酯(Thermoplastic Polyurethane,依軟硬段組成可能有多種配方)', uses: '手機殼、彈性鞋材、3D 列印彈性線材',
      presetKey: 'TPU_ANALOG', analogName: 'N-甲基胺基甲酸甲酯(C₃H₇NO₂)——TPU 胺基甲酸酯(urethane)鍵結代表',
      peaks: [
        { freq: 3330, strength: 0.55, note: 'N−H 伸縮(氫鍵)' },
        { freq: 2940, strength: 0.4, note: 'C−H 伸縮' },
        { freq: 2860, strength: 0.35, note: 'C−H 伸縮' },
        { freq: 1730, strength: 0.75, note: 'C=O 胺基甲酸酯伸縮(游離)' },
        { freq: 1703, strength: 0.7, note: 'C=O 胺基甲酸酯伸縮(氫鍵)' },
        { freq: 1530, strength: 0.5, note: 'N−H 彎曲 + C−N 伸縮(amide II)' },
        { freq: 1220, strength: 0.45, note: 'C−N / C−O−C 伸縮' },
        { freq: 1075, strength: 0.4, note: 'C−O−C 醚鍵伸縮(聚醚型軟段)' },
      ],
    },
    PVP: {
      label: 'PVP 聚乙烯吡咯烷酮', full: '聚乙烯吡咯烷酮(Polyvinylpyrrolidone)', uses: '藥物賦形劑、洗髮精/化妝品增稠劑、碘伏(PVP-I)',
      presetKey: 'PVP_ANALOG', analogName: 'N-甲基乙醯胺(C₃H₇NO)——PVP 內醯胺 C=O 官能基代表(不含五圓環)',
      peaks: [
        { freq: 2950, strength: 0.4, note: 'C−H 伸縮' },
        { freq: 1655, strength: 0.95, note: 'C=O 內醯胺伸縮(amide I,最診斷性)' },
        { freq: 1424, strength: 0.35, note: 'CH₂ 彎曲' },
        { freq: 1287, strength: 0.4, note: 'C−N 伸縮' },
        { freq: 1020, strength: 0.3, note: '環骨架伸縮' },
      ],
    },
    PEG: {
      label: 'PEG 聚乙二醇', full: '聚乙二醇(Polyethylene glycol)', uses: '藥物/化妝品賦形劑、保濕劑、PEG 化藥物',
      presetKey: 'PEG_ANALOG', analogName: '1,2-二甲氧基乙烷(C₄H₁₀O₂)——PEG 的 C−O−C 醚鍵骨架代表(無端基 OH)', chainGen: genPEG, chainDesc: 'PEG 的 -(CH₂-CH₂-O)n- 醚鏈骨架代表,甲基封端(glyme 系列,無端基 OH)',
      peaks: [
        { freq: 3400, strength: 0.4, note: 'O−H 伸縮(端基,寬峰)' },
        { freq: 2880, strength: 0.6, note: 'C−H 伸縮' },
        { freq: 1467, strength: 0.3, note: 'CH₂ 彎曲' },
        { freq: 1341, strength: 0.25, note: 'CH₂ 搖擺' },
        { freq: 1145, strength: 0.55, note: 'C−O−C 醚鍵伸縮' },
        { freq: 1100, strength: 0.85, note: 'C−O−C 醚鍵伸縮(最強、最診斷性)' },
        { freq: 960, strength: 0.25, note: 'CH₂ 搖擺' },
        { freq: 843, strength: 0.2, note: 'CH₂ 搖擺' },
      ],
    },
  };

  // 一鍵生成:原子種類 + 鍵結列表 [原子索引a, 原子索引b, 鍵級]
  const PRESETS = {
    H2: { els: ['H', 'H'], bonds: [[0, 1, 1]] },
    O2: { els: ['O', 'O'], bonds: [[0, 1, 2]] },
    N2: { els: ['N', 'N'], bonds: [[0, 1, 3]] },
    H2O1: { els: ['O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1]] },
    H3N1: { els: ['N', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] },
    C1H4: { els: ['C', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
    C2H6: { els: ['C', 'C', 'H', 'H', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1], [1, 6, 1], [1, 7, 1]] },
    C1O2: { els: ['C', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 2]] },
    H2O2: { els: ['O', 'O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [1, 3, 1]] },
    C1H2O1: { els: ['C', 'H', 'H', 'O'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 2]] },
    // 苯環用交錯的 Kekule 單/雙鍵表示(不是真的均勻鍵長)——這其實是很好的教材:
    // 這樣畫出來的六邊形鍵長會忽長忽短,但苯環實測是均勻的 1.39 Å,
    // 這個「理論預測跟實測不符」正是共振/離域結構存在的直接證據。
    C6H6: {
      els: ['C', 'C', 'C', 'C', 'C', 'C', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [0, 6, 1], [1, 7, 1], [2, 8, 1], [3, 9, 1], [4, 10, 1], [5, 11, 1]],
    },
    // 甲苯 = 苯環 + 對位裝上一根 CH3(索引 0 的苯環碳不接 H,改接甲基碳 6)
    C7H8: {
      els: ['C', 'C', 'C', 'C', 'C', 'C', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1],
        [0, 6, 1], [6, 7, 1], [6, 8, 1], [6, 9, 1],
        [1, 10, 1], [2, 11, 1], [3, 12, 1], [4, 13, 1], [5, 14, 1],
      ],
    },
    // 硫可以擴張八隅體(orb=6),讓 S 同時跟 4 個 O 成鍵仍完全滿足、形式電荷全為 0
    H2O4S1: {
      els: ['S', 'O', 'H', 'O', 'H', 'O', 'O'],
      bonds: [[0, 1, 1], [1, 2, 1], [0, 3, 1], [3, 4, 1], [0, 5, 2], [0, 6, 2]],
    },
    H1Cl1: { els: ['H', 'Cl'], bonds: [[0, 1, 1]] },
    // 硝酸的正確路易斯結構需要 N(+1)/一個 O(−1)的共振形式(N 才能維持八隅體不擴張)——
    // 用 electrons 覆寫初始價電子數,才能讓形式電荷自然算出 +1/−1,整體仍中性
    H1N1O3: {
      els: [{ el: 'N', electrons: 4 }, 'O', 'H', 'O', { el: 'O', electrons: 7 }],
      bonds: [[0, 1, 1], [1, 2, 1], [0, 3, 2], [0, 4, 1]],
    },
    C1H4O1: { els: ['C', 'H', 'H', 'H', 'O', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [4, 5, 1]] },
    C2H6O1: {
      els: ['C', 'C', 'H', 'H', 'H', 'H', 'H', 'O', 'H'],
      bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1], [1, 6, 1], [1, 7, 1], [7, 8, 1]],
    },

    // ---- 塑膠參考模式用的小分子代表結構(真實、有名字的小分子,抓住該塑膠最主要的官能基/骨架特徵,
    // 不是那條無限長聚合物鏈本身,但可以用這個引擎真的算出 3D 結構跟振動模式,拿來跟文獻參考峰比較) ----
    PE_ANALOG: { // 丁烷,PE 的 -(CH2)n- 骨架
      els: ['C', 'C', 'C', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [0, 4, 1], [0, 5, 1], [0, 6, 1], [1, 7, 1], [1, 8, 1], [2, 9, 1], [2, 10, 1], [3, 11, 1], [3, 12, 1], [3, 13, 1]],
    },
    PP_ANALOG: { // 2-甲基丁烷(異戊烷),PP 甲基取代骨架的代表
      els: ['C', 'C', 'C', 'C', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1],
        [0, 5, 1], [0, 6, 1], [0, 7, 1], [1, 8, 1], [2, 9, 1], [2, 10, 1],
        [3, 11, 1], [3, 12, 1], [3, 13, 1], [4, 14, 1], [4, 15, 1], [4, 16, 1],
      ],
    },
    PVC_ANALOG: { // 1-氯丙烷,PVC 的 C-Cl 骨架代表
      els: ['C', 'C', 'C', 'Cl', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [[3, 0, 1], [0, 1, 1], [1, 2, 1], [0, 4, 1], [0, 5, 1], [1, 6, 1], [1, 7, 1], [2, 8, 1], [2, 9, 1], [2, 10, 1]],
    },
    PMMA_ANALOG: { // 特戊酸甲酯(methyl pivalate),PMMA 四級碳+酯基的代表
      els: ['C', 'C', 'C', 'C', 'C', 'O', 'O', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [4, 5, 2], [4, 6, 1], [6, 7, 1],
        [1, 8, 1], [1, 9, 1], [1, 10, 1], [2, 11, 1], [2, 12, 1], [2, 13, 1],
        [3, 14, 1], [3, 15, 1], [3, 16, 1], [7, 17, 1], [7, 18, 1], [7, 19, 1],
      ],
    },
    ABS_ANALOG: { // 異丁腈,ABS 中丙烯腈成分 C≡N 的代表
      els: ['C', 'C', 'C', 'C', 'N', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 1], [0, 2, 1], [0, 3, 1], [3, 4, 3],
        [0, 5, 1], [1, 6, 1], [1, 7, 1], [1, 8, 1], [2, 9, 1], [2, 10, 1], [2, 11, 1],
      ],
    },
    TPU_ANALOG: { // N-甲基胺基甲酸甲酯,TPU 胺基甲酸酯(urethane)鍵結的代表
      els: ['N', 'C', 'C', 'O', 'O', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 1], [0, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1], [0, 6, 1],
        [1, 7, 1], [1, 8, 1], [1, 9, 1], [5, 10, 1], [5, 11, 1], [5, 12, 1],
      ],
    },
    PVP_ANALOG: { // N-甲基乙醯胺,PVP 內醯胺 C=O 官能基的代表(不含環,N 上只留一個取代基,收斂更穩定)
      els: ['C', 'C', 'O', 'N', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [3, 5, 1],
        [0, 6, 1], [0, 7, 1], [0, 8, 1], [4, 9, 1], [4, 10, 1], [4, 11, 1],
      ],
    },
    PEG_ANALOG: { // 1,2-二甲氧基乙烷,PEG 的 C-O-C 醚鍵骨架代表
      els: ['C', 'O', 'C', 'C', 'O', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
      bonds: [
        [0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1],
        [0, 6, 1], [0, 7, 1], [0, 8, 1], [2, 9, 1], [2, 10, 1], [3, 11, 1], [3, 12, 1], [5, 13, 1], [5, 14, 1], [5, 15, 1],
      ],
    },
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
  let buildGen = 0; // 每次 clearAll/換分子都會遞增;舊的最佳化動畫迴圈發現世代對不上就自我中止,避免跟新分子的畫面疊在一起
  const rigidAtoms = new Set(); // 最佳化後鎖定的原子:只能整顆分子一起移動,不可再斷鍵
  const rigidSlotOf = new Map(); // atomId -> {cx,cy,scale}:這顆原子所屬分子在畫布上的中心與縮放,3D 投影用
  const TRASH = { x: STAGE_W - 54, y: STAGE_H - 54, r: 32 };
  const doneTargets = new Set();
  let currentPlastic = null; // 目前選的塑膠(文獻參考模式);一旦開始操作分子畫布就會清掉
  let currentPlasticN = 4; // 目前的單體重複數 N(只對 chainGen 支援的塑膠有意義)

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
  // specOverride/labelOverride 讓塑膠的「N 單體鏈長」動態產生的結構也能走同一套建構+最佳化流程,
  // 不必為每個 N 都預先寫死一份 PRESETS
  function buildPresetMolecule(key, specOverride, labelOverride) {
    const spec = specOverride || PRESETS[key];
    if (!spec) return;
    clearAll();
    const cx = STAGE_W / 2, cy = STAGE_H / 2;
    const newIds = spec.els.map((entry, i) => {
      // 大多數原子預設用中性價電子數;少數需要共振形式電荷的分子(如 HNO3 的 N/O)
      // 可以用 {el, electrons} 覆寫初始電子數,讓形式電荷自然算出正確的 +1/−1
      const elKey = typeof entry === 'string' ? entry : entry.el;
      const info = ELEMENTS[elKey];
      const electrons = typeof entry === 'string' ? info.valence : entry.electrons ?? info.valence;
      const angle = (i / spec.els.length) * 2 * Math.PI;
      const id = nextId++;
      atoms.push({ id, el: elKey, x: cx + Math.cos(angle) * 70, y: cy + Math.sin(angle) * 70, electrons });
      return id;
    });
    spec.bonds.forEach(([i, j, order]) => {
      bonds.push({ a: newIds[i], b: newIds[j], order });
    });
    const label = labelOverride || TARGETS.find((t) => t.key === key)?.label || key;
    setStatus(`已直接生成 ${label},正在自動最佳化…`, 'success');
    render();
    runOptimize();
  }

  // 是否還有「沒最佳化過」的鍵(至少一端不是 rigid)——手動拖曳接鍵之後用這個判斷要不要自動觸發最佳化
  function hasPendingBonds() {
    return bonds.some((b) => !(rigidAtoms.has(b.a) && rigidAtoms.has(b.b)));
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
    let changed = true;
    if (b.order < 3 && derived(a1).unpaired > 0 && derived(a2).unpaired > 0) {
      b.order++;
      setStatus(`${a1.el}−${a2.el} 升級為${b.order === 2 ? '雙' : '三'}鍵,共用 ${b.order} 對電子。正在自動最佳化立體結構與振動模式…`, 'success');
    } else if (b.order > 1) {
      b.order = 1;
      setStatus(`${a1.el}−${a2.el} 還原為單鍵,正在自動最佳化…`);
    } else {
      changed = false;
      setStatus('無法升級:兩端原子都必須還有未配對電子才能再共用一對。');
    }
    invalidate3D();
    render();
    if (changed) runOptimize();
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
    buildGen++; // 讓任何還在跑的舊最佳化/振動迴圈作廢,不會跟接下來要畫的新分子搶畫面
    optimizing = false;
    currentPlastic = null;
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
    updatePlasticNControl();
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
    const myGen = buildGen; // 記住這輪最佳化屬於哪個世代;中途若換了分子(世代變了)就自我中止
    const E0 = relaxPass(false, 0);
    const t0 = performance.now();
    const frame = () => {
      if (myGen !== buildGen) return; // 使用者已經換分子/清空畫布,這個舊迴圈不該再動手
      for (let i = 0; i < 6; i++) relaxPass(true, 1);
      render();
      const E = relaxPass(false, 0);
      if (performance.now() - t0 < 1500) {
        setStatus(`簡易能量最小化中… E = ${E.toFixed(2)}(任意單位,持續下降)`);
        requestAnimationFrame(frame);
      } else {
        optimizing = false;
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
    const restPos = restScreenPositions();
    const restPosOf = (id) => restPos.get(id) || atomById(id);
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
      // 鍵中間補一顆軟球,讓兩個原子的雲在鍵上連成一片(不會斷開),顏色沿彩虹色階漸變。
      // 體積大小用「平衡鍵長」算,不能用振動當下的瞬時鍵長——否則鍵拉長時雲反而畫得更大顆,
      // 鍵壓縮時反而畫得更小顆,恰好跟真實電子密度(壓縮時軌域重疊多、密度更高)相反。
      // 瞬時鍵長只拿來算「濃淡」:壓縮→密度變高(更不透明),拉伸→密度變低(更淡更擴散)。
      const a1 = atomById(b.a);
      const a2 = atomById(b.b);
      const p1 = posOf(b.a), p2 = posOf(b.b);
      const rp1 = restPosOf(b.a), rp2 = restPosOf(b.b);
      const restLen = Math.hypot(rp2.x - rp1.x, rp2.y - rp1.y) || 1;
      const liveLen = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const densityFactor = Math.max(0.55, Math.min(1.5, restLen / liveLen));
      const midColor = espColorMix(tOf(a1), tOf(a2), 0.5);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const gradId = `cloud-bond-${b.a}-${b.b}`;
      radialBlob(gradId, midColor, Math.min(1, 0.8 * densityFactor));
      const R = restLen / 2 + 20 + 5 * b.order;
      cloudGroup.appendChild(el('circle', { cx: mx, cy: my, r: R, fill: `url(#${gradId})` }));
      // 鍵上四分之一/四分之三處再各補一顆較小的球,讓色階過渡更連續平滑(仿真正 ESP 表面的漸層)
      [0.25, 0.75].forEach((frac) => {
        const qx = p1.x + (p2.x - p1.x) * frac;
        const qy = p1.y + (p2.y - p1.y) * frac;
        const qColor = espColorMix(tOf(a1), tOf(a2), frac);
        const qGradId = `cloud-bondq-${b.a}-${b.b}-${frac}`;
        radialBlob(qGradId, qColor, Math.min(1, 0.7 * densityFactor));
        cloudGroup.appendChild(el('circle', { cx: qx, cy: qy, r: R * 0.72, fill: `url(#${qGradId})` }));
      });
    });
    layer.appendChild(cloudGroup);

    // 淨偶極(清晰的圖層,不模糊)——只畫整個分子的淨偶極,不逐一畫每根鍵的鍵偶極,
    // 避免多鍵分子(如 H2SO4)畫面被一堆小箭頭塞滿,重點是「加總起來到底有沒有淨偶極」。
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
  // 電子群互斥能量(跟鬆弛迴圈用同一套 Thomson 問題公式):電子群分得越開,這個值越低。
  // 用來在多次隨機起點嘗試中挑出「收斂得最漂亮」的那一次——單次鬆弛偶爾會卡在扭曲的
  // 局部極小值(尤其懸鏈接懸鏈、或兩個 sp2 中心相連時),結果會顯示成看起來像「錯的分子」。
  // 回傳「最差那個中心」的電子群能量(不是全分子加總)——加總的話,某個中心角度歪掉
  // 可能被其他中心排得特別開蓋過去(整體看起來平均值還不錯,但單一鍵角還是歪的,
  // 例如 PEG 的醚氧鍵角有時飄到 130°+),只看最差的一個中心才能真正抓到這種局部缺陷。
  function domainRepulsionEnergy(real, bonds, phantoms) {
    const byId = new Map(real.map((a) => [a.id, a]));
    const nbIds = new Map();
    real.forEach((a) => nbIds.set(a.id, []));
    bonds.forEach((b) => {
      nbIds.get(b.a).push(b.b);
      nbIds.get(b.b).push(b.a);
    });
    let maxE = 0;
    real.forEach((c) => {
      const nb = nbIds.get(c.id);
      const lone = phantoms.get(c.id) || [];
      const dirs = [];
      nb.forEach((id) => {
        const o = byId.get(id);
        const dx = o.x - c.x, dy = o.y - c.y, dz = o.z - c.z;
        const n = Math.hypot(dx, dy, dz) || 1;
        dirs.push({ x: dx / n, y: dy / n, z: dz / n, lone: false });
      });
      lone.forEach((v) => dirs.push({ x: v.x, y: v.y, z: v.z, lone: true }));
      let atomE = 0;
      for (let i = 0; i < dirs.length; i++) {
        for (let j = i + 1; j < dirs.length; j++) {
          const w = (dirs[i].lone ? LONE_WEIGHT : 1) * (dirs[j].lone ? LONE_WEIGHT : 1);
          const dx = dirs[i].x - dirs[j].x, dy = dirs[i].y - dirs[j].y, dz = dirs[i].z - dirs[j].z;
          const d = Math.hypot(dx, dy, dz) || 1e-3;
          atomE += w / (d * d * d);
        }
      }
      if (atomE > maxE) maxE = atomE;
    });
    return maxE;
  }

  // 完整跑一次隨機起點的鬆弛(下面 build3DGeometry() 會跑好幾次挑最好的一次)
  function build3DGeometryOnce() {
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
    function cross(a, b) {
      return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    }
    function orderBetween(i, j) {
      const b = bonds.find((bb) => (bb.a === i && bb.b === j) || (bb.a === j && bb.b === i));
      return b ? b.order : 1;
    }

    // ---- 環偵測(DFS 找 back-edge)----
    // 每個原子只看得到自己的鄰居,靠純局部的電子群排斥沒辦法保證「整個環」收斂成平面、
    // 每個角都對——實測過:苯環用隨機起點跑,角度會卡在一個扭曲的錯誤形狀,不會自動變 120°。
    function findRings() {
      const visited = new Set();
      const stack = [];
      const stackSet = new Set();
      const rings = [];
      function dfs(id, parent) {
        visited.add(id);
        stack.push(id);
        stackSet.add(id);
        for (const nb of nbIds.get(id)) {
          if (nb === parent) continue;
          if (stackSet.has(nb)) {
            const idx = stack.indexOf(nb);
            rings.push(stack.slice(idx));
          } else if (!visited.has(nb)) {
            dfs(nb, id);
          }
        }
        stack.pop();
        stackSet.delete(id);
      }
      atoms.forEach((a) => {
        if (!visited.has(a.id)) dfs(a.id, -1);
      });
      return rings;
    }

    // 環形結構(如苯環)直接用解析幾何排出正確的平面多邊形當起點(每個頂點內角 120°,
    // 交錯的 Kekule 單/雙鍵長度依然能精確閉合——這是真的幾何,不是近似):
    // 環上每個原子唯一的「環外」取代基(苯環的 H、甲苯 ipso 碳的甲基)也一併排在
    // 外角平分線方向,不然它們從隨機點出發,前幾步就會把排好的環又拉歪。
    const ringGroups = findRings();
    const ringSeeded = new Set(); // 已經用解析幾何精準排好的原子(環本身+環上直接的取代基),BFS 補位時不能重排這些
    ringGroups.forEach((ring) => {
      const n = ring.length;
      const pts2d = [{ u: 0, v: 0 }];
      let dir = 0;
      for (let i = 0; i < n - 1; i++) {
        const elA = atoms.find((a) => a.id === ring[i]).el, elB = atoms.find((a) => a.id === ring[i + 1]).el;
        const len = bondParams(elA, elB, orderBetween(ring[i], ring[i + 1])).len;
        const last = pts2d[pts2d.length - 1];
        pts2d.push({ u: last.u + len * Math.cos((dir * Math.PI) / 180), v: last.v + len * Math.sin((dir * Math.PI) / 180) });
        dir += 60; // 外角 60°(內角 120°),sp2 三個電子群的自然夾角
      }
      const rz = norm({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
      let seed0 = { x: 1, y: 0, z: 0 };
      if (Math.abs(dot(seed0, rz)) > 0.9) seed0 = { x: 0, y: 1, z: 0 };
      const uy = norm(cross(rz, seed0));
      const ux = norm(cross(uy, rz));
      const cu = pts2d.reduce((s, p) => s + p.u, 0) / n;
      const cv = pts2d.reduce((s, p) => s + p.v, 0) / n;
      ring.forEach((id, i) => {
        const p = byId.get(id);
        const u = pts2d[i].u - cu, v = pts2d[i].v - cv;
        p.x = u * ux.x + v * uy.x;
        p.y = u * ux.y + v * uy.y;
        p.z = u * ux.z + v * uy.z;
        ringSeeded.add(id);
      });
      ring.forEach((id, i) => {
        const prevId = ring[(i - 1 + n) % n], nextId = ring[(i + 1) % n];
        const others = nbIds.get(id).filter((x) => x !== prevId && x !== nextId);
        if (others.length !== 1) return;
        const c = byId.get(id), p1 = byId.get(prevId), p2 = byId.get(nextId);
        const v1 = norm(sub(p1, c)), v2 = norm(sub(p2, c));
        const bis = norm({ x: -(v1.x + v2.x), y: -(v1.y + v2.y), z: -(v1.z + v2.z) });
        const subId = others[0];
        const len = bondParams(c.el, byId.get(subId).el, orderBetween(id, subId)).len;
        const sp = byId.get(subId);
        sp.x = c.x + bis.x * len;
        sp.y = c.y + bis.y * len;
        sp.z = c.z + bis.z * len;
        ringSeeded.add(subId);
      });
    });

    // 環外的取代基如果自己還有更多鄰居(如甲苯環上接的甲基,甲基又接 3 個 H),
    // 那些原子還是隨機起點——而它們會透過每步的電子群排斥「回頭」牽動已經排好的環
    // (實測證實:甲苯的環角度會被牽歪)。用 BFS 從已排好的原子往外,把還沒排的鄰居
    // 用簡單的錐形(粗略 109.5°)接力擺出合理起始位置,讓整個分子從一開始就接近解,
    // 不再只靠純隨機。
    if (ringGroups.length) {
      const placed = new Set(ringSeeded);
      const queue = [...placed];
      while (queue.length) {
        const id = queue.shift();
        const c = byId.get(id);
        const placedNbrs = nbIds.get(id).filter((nb) => placed.has(nb));
        const unplacedNbrs = nbIds.get(id).filter((nb) => !placed.has(nb));
        if (unplacedNbrs.length === 0) continue;
        // axis 指向「已知鄰居」那個方向,新鍵跟它的夾角才會是真正的四面體角(109.5°)——
        // 之前寫反方向(指向遠離已知鄰居)會讓新原子擠到只離已知鍵 70.5° 的錯誤位置
        const axis =
          placedNbrs.length > 0
            ? norm(sub(byId.get(placedNbrs[0]), c))
            : norm({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
        let seed0 = { x: 1, y: 0, z: 0 };
        if (Math.abs(dot(seed0, axis)) > 0.9) seed0 = { x: 0, y: 1, z: 0 };
        const uy = norm(cross(axis, seed0));
        const ux = norm(cross(uy, axis));
        const coneAngle = (109.5 * Math.PI) / 180;
        unplacedNbrs.forEach((nbId, i) => {
          const az = (i / unplacedNbrs.length) * 2 * Math.PI;
          const dir = {
            x: axis.x * Math.cos(coneAngle) + Math.sin(coneAngle) * (ux.x * Math.cos(az) + uy.x * Math.sin(az)),
            y: axis.y * Math.cos(coneAngle) + Math.sin(coneAngle) * (ux.y * Math.cos(az) + uy.y * Math.sin(az)),
            z: axis.z * Math.cos(coneAngle) + Math.sin(coneAngle) * (ux.z * Math.cos(az) + uy.z * Math.sin(az)),
          };
          const len = bondParams(c.el, byId.get(nbId).el, orderBetween(id, nbId)).len;
          const p = byId.get(nbId);
          p.x = c.x + dir.x * len;
          p.y = c.y + dir.y * len;
          p.z = c.z + dir.z * len;
          placed.add(nbId);
          queue.push(nbId);
        });
      }
    }

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

    // 立體互斥的排除表:1-2(直接鍵結)與 1-3(同一中心的兩個鄰居)不算立體障礙。
    // 兩個中心的取代基數不對稱時(如甲醇的 O 只接 1 個 H、C 接 3 個 H)也整組排除——
    // 實測過:不對稱時徑向推擠會把四面體角度弄壞,只有對稱(如乙烷 3 對 3)才會
    // 自然轉成交錯式而不傷角度。同一個環(以及環上的取代基)也整組排除,
    // 苯環是剛性平面,不需要立體推擠,加了反而會把 120° 弄歪。
    // 用數字鍵而不是字串鍵(避免每一步、每一對原子都重新配置字串再雜湊——
    // 大分子如塑膠 N=4 代表結構有 60+ 顆原子,C(60,2)≈1800 對、乘上 3200 步、
    // 乘上 12 次嘗試,字串版本量測起來要 12 秒以上,數字鍵可以省掉這筆開銷)
    const pairKey = (i, j) => (i < j ? i * 1000000 + j : j * 1000000 + i);
    const stericExcluded = new Set();
    bonds.forEach((b) => stericExcluded.add(pairKey(b.a, b.b)));
    atoms.forEach((c) => {
      const nb = nbIds.get(c.id);
      for (let i = 0; i < nb.length; i++)
        for (let j = i + 1; j < nb.length; j++) stericExcluded.add(pairKey(nb[i], nb[j]));
    });
    bonds.forEach((b) => {
      const nbA = nbIds.get(b.a).filter((id) => id !== b.b);
      const nbB = nbIds.get(b.b).filter((id) => id !== b.a);
      if (nbA.length === 0 || nbB.length === 0 || nbA.length === nbB.length) return;
      nbA.forEach((ia) => nbB.forEach((ib) => stericExcluded.add(pairKey(ia, ib))));
    });
    ringGroups.forEach((ring) => {
      // 環外的取代基本身也可能還有自己的取代基,而且可以接兩層以上(如乙苯的環上接
      // CH2 再接 CH3 再接 H,共 3 層)——往外展開固定 3 層再排除,不然離環太近的原子
      // 還是會被拿來跟環互推、把 120° 弄歪。不能無限展開,不然大分子整條鏈的立體
      // 推擠都會被關掉,遠處該有的交錯排列反而不見了。
      const related = new Set(ring);
      let frontier = [...ring];
      for (let hop = 0; hop < 3; hop++) {
        const next = [];
        frontier.forEach((id) =>
          nbIds.get(id).forEach((nb) => {
            if (!related.has(nb)) {
              related.add(nb);
              next.push(nb);
            }
          })
        );
        frontier = next;
      }
      const list = [...related];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) stericExcluded.add(pairKey(list[i], list[j]));
    });
    const STERIC_R = { H: 1.3, C: 1.45, N: 1.42, O: 1.38, S: 1.8, Cl: 1.75 }; // 近似 vdW 半徑(Å)

    // 鍵長/力常數查表:bondParams() 每次呼叫都要重新配置陣列、排序、拼字串當 key,
    // 鬆弛迴圈裡每一步、每根鍵的兩個方向都會呼叫到——大分子(如塑膠 N=4 代表結構,
    // 60+ 顆原子)乘上 3200 步、12 次嘗試,會呼叫到近千萬次,光是字串配置就佔掉大半時間。
    // 鍵的兩端元素與鍵級在鬆弛過程中不會變,先算好存進 Map,查詢變 O(1) 純數字比對。
    const bondParamsOf = new Map();
    bonds.forEach((b) => {
      const a1 = byId.get(b.a), a2 = byId.get(b.b);
      const p = bondParams(a1.el, a2.el, b.order);
      bondParamsOf.set(pairKey(b.a, b.b), p);
    });

    // 大分子每步成本高(O(atoms²)的立體排斥迴圈),步數也跟著往下調一點,
    // 跟 build3DGeometry() 的嘗試次數調整合起來,把等待時間壓在可接受範圍。
    const STEPS = atoms.length <= 25 ? 3200 : atoms.length <= 40 ? 2600 : atoms.length <= 55 ? 2200 : 1800;
    for (let step = 0; step < STEPS; step++) {
      const stepScale = 1 - step / STEPS;
      // 鍵長彈簧(真實 Å)
      bonds.forEach((b) => {
        const a1 = byId.get(b.a);
        const a2 = byId.get(b.b);
        const p = bondParamsOf.get(pairKey(b.a, b.b));
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
          const rate = 0.03 + 0.12 * stepScale;
          dom.dir = norm({ x: dom.dir.x + tx * rate, y: dom.dir.y + ty * rate, z: dom.dir.z + tz * rate });
        });
        // 把鄰居「柔性拉」向理想位置,而不是硬生生瞬移過去——
        // 多中心分子(如乙烷)裡,共用的原子會被兩個中心各自認領:
        // 硬瞬移等於後處理的中心整碗端走、前一個中心排好的幾何被毀掉,
        // 兩邊永遠打架收斂不了(乙烷角度塌到 96° 的元凶就是這個)。
        // 柔性混合讓所有中心逐步協商出同時滿足彼此的折衷結構。
        const blend = 0.22 + 0.4 * stepScale;
        domains.forEach((d) => {
          if (d.kind === 'real') {
            const p = bondParamsOf.get(pairKey(c.id, d.id));
            const target = byId.get(d.id);
            target.x += (cPos.x + d.dir.x * p.len - target.x) * blend;
            target.y += (cPos.y + d.dir.y * p.len - target.y) * blend;
            target.z += (cPos.z + d.dir.z * p.len - target.z) * blend;
          } else {
            lone[d.i] = d.dir;
          }
        });
      });
      // 立體障礙(van der Waals 短距互斥):只作用在相隔三根鍵以上的原子對
      // (1-2 鍵長歸彈簧管、1-3 角度歸 VSEPR 管,都排除)。
      // 乙烷兩端的 H 若靠太近(重疊式)會被推開,扭轉角因此自然轉向交錯式(staggered)
      // ——這正是真實乙烷交錯構型的立體互斥成因,不是硬套的扭轉角度表。
      for (let i = 0; i < real.length; i++) {
        for (let j = i + 1; j < real.length; j++) {
          const a1 = real[i], a2 = real[j];
          if (stericExcluded.has(pairKey(a1.id, a2.id))) continue;
          const rmin = STERIC_R[a1.el] + STERIC_R[a2.el];
          const d = sub(a2, a1);
          const len = Math.hypot(d.x, d.y, d.z) || 1e-6;
          if (len >= rmin) continue;
          const push = Math.min(0.12, (rmin - len) * 0.35 * stepScale);
          const s = push / len;
          a1.x -= d.x * s; a1.y -= d.y * s; a1.z -= d.z * s;
          a2.x += d.x * s; a2.y += d.y * s; a2.z += d.z * s;
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

  // 隨機起點的鬆弛偶爾會卡在扭曲的局部極小值(尤其懸鏈接懸鏈、或兩個 sp2 中心相連時,
  // 如 PVP/ABS 這類代表分子),使用者看到的結構會變形到像另一顆分子——多跑幾次、
  // 用電子群互斥能量挑出排得最開(最像教科書 VSEPR 形狀)的一次,同一顆分子每次選單
  // 點開結果才會穩定一致。
  function build3DGeometry() {
    // 每次嘗試的成本大致是 O(atoms²×steps)——塑膠 N=4 代表結構可到 60+ 顆原子,
    // 固定 12 次嘗試會拖到好幾秒;原子數越多,嘗試次數往下調,讓等待時間大致穩定,
    // 小分子仍保留足夠嘗試次數維持收斂品質。
    const nAtoms = atoms.length;
    const ATTEMPTS = nAtoms <= 25 ? 12 : nAtoms <= 40 ? 8 : nAtoms <= 55 ? 5 : 3;
    let best = null;
    let bestE = Infinity;
    for (let i = 0; i < ATTEMPTS; i++) {
      const cand = build3DGeometryOnce();
      const e = domainRepulsionEnergy(cand.atoms, cand.bonds, cand.phantoms);
      if (e < bestE) {
        bestE = e;
        best = cand;
      }
    }
    return best;
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

  // 跟 rigidScreenPositions 一樣的投影,但用平衡結構座標(不含振動位移)。
  // 電子雲的「體積大小」要用這份座標算,振動時鍵長的瞬時伸縮不該讓雲的體積跟著膨脹/收縮——
  // 真正該變的是雲的濃淡(鍵壓縮時軌域重疊變多、密度變高;鍵拉長時重疊變少、密度變低)。
  function restScreenPositions() {
    const map = new Map();
    if (!mol3D) return map;
    const slot = rigidSlotOf.get(mol3D.atoms[0]?.id) || { cx: STAGE_W / 2, cy: STAGE_H / 2, scale: 130 };
    let maxR = 1;
    mol3D.atoms.forEach((a) => { maxR = Math.max(maxR, Math.hypot(a.x, a.y, a.z) + 0.35); });
    const scale = slot.scale / maxR;
    mol3D.atoms.forEach((a) => {
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

    // 孤對電子(lone pair):淡黃色電子雲球+兩個小黑點,標示這裡有一對未成鍵電子——
    // 方向是 VSEPR 鬆弛時真正算出來的(跟鍵一樣互相排斥),不是隨便貼在旁邊裝飾用。
    // 例如氨:N 上面應該看得到 1 個朝向四面體第 4 個角落的孤對,是它讓 NH3 變成三角錐形。
    const LONE_LEN = 0.62;
    mol3D.atoms.forEach((a) => {
      const dirs = mol3D.phantoms && mol3D.phantoms.get(a.id);
      if (!dirs || !dirs.length) return;
      const live3 = byId.get(a.id);
      if (!live3) return;
      dirs.forEach((d) => {
        const tip = { x: live3.x + d.x * LONE_LEN, y: live3.y + d.y * LONE_LEN, z: live3.z + d.z * LONE_LEN };
        const tProj = project3D(tip);
        const x1 = slot.cx + live3.proj.x * scale, y1 = slot.cy - live3.proj.y * scale;
        const x2 = slot.cx + tProj.x * scale, y2 = slot.cy - tProj.y * scale;
        const dx = x2 - x1, dy = y2 - y1;
        const dlen = Math.hypot(dx, dy) || 1;
        const lx = x1 + dx * 0.68, ly = y1 + dy * 0.68;
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        layer.appendChild(
          el('ellipse', { cx: lx, cy: ly, rx: 15, ry: 9, fill: '#fff3b0', 'fill-opacity': 0.85, stroke: '#d9b93c', 'stroke-width': 1, transform: `rotate(${ang} ${lx} ${ly})` })
        );
        const px = -dy / dlen, py = dx / dlen;
        [-1, 1].forEach((s) => {
          layer.appendChild(el('circle', { cx: lx + px * 4 * s, cy: ly + py * 4 * s, r: 2.6, fill: '#333' }));
        });
      });
    });

    // 真實鍵長(Å)標示(用未加振動位移的基準座標,避免文字跟著抖動)
    // 塑膠代表分子原子數多(可到 20 顆以上),鍵長/鍵角文字會擠成一團看不清楚,
    // 又把畫面拉得很長——塑膠模式跳過這些標示,只看立體形狀就好。
    if (currentPlastic) {
      const hint = el('text', { x: slot.cx, y: slot.cy + slot.scale + 26, 'text-anchor': 'middle', 'font-size': 11, fill: '#98a1b3' });
      hint.textContent = '拖曳可旋轉立體結構';
      layer.appendChild(hint);
      return;
    }
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
    if (currentPlastic) {
      // 塑膠是文獻參考峰,不是即時算出來的振動模式,談不上「這個模式改不改變偶極矩」——
      // 溫室效應判斷需要真正的振動模式與強度,這裡沒有,所以塑膠一律不討論溫室效應。
      p.textContent = '';
      p.className = 'status-line';
      return;
    }
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

  // IR 圖表共用的座標軸/格線繪製,分子模式(有黑體疊圖)跟塑膠參考模式共用同一套版面
  function drawIRAxes(g, xPx, yPx, L, Rm, T, Bm, W, Hh) {
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
  }

  // 塑膠 IR 圖:純文獻參考特徵峰(紫色標示以區別於真實計算的黑色曲線),不疊黑體輻射、不判溫室效應
  function showPlastic(key, n) {
    const p = PLASTICS[key];
    if (!p) return;
    let spec, label;
    if (p.chainGen) {
      const useN = n || currentPlasticN || 1;
      spec = p.chainGen(useN);
      label = `${p.label}(N=${useN}:${formulaOf(spec)})`;
      currentPlasticN = useN;
    } else {
      spec = PRESETS[p.presetKey];
      label = p.label;
    }
    if (!spec) return;
    buildPresetMolecule(p.presetKey, spec, label);
    currentPlastic = key; // buildPresetMolecule 內部的 clearAll() 會清成 null,要在它跑完之後才設定
    setStatus(
      `已切換到塑膠參考模式:${p.label}。用「${plasticAnalogLabel(key)}」當代表結構,真的算出 3D 結構與振動模式——正在自動最佳化…`,
      'success'
    );
    updatePlasticNControl();
  }

  // N 選單只在目前塑膠支援鏈長調整(chainGen)時顯示;不支援的(ABS/TPU/PVP)固定用單一代表結構
  function updatePlasticNControl() {
    const wrap = document.getElementById('plastic-n-wrap');
    if (!wrap) return;
    const p = currentPlastic && PLASTICS[currentPlastic];
    if (p && p.chainGen) {
      wrap.style.display = '';
      const sel = document.getElementById('plastic-n-select');
      if (sel && sel.value !== String(currentPlasticN)) sel.value = String(currentPlasticN);
    } else {
      wrap.style.display = 'none';
    }
  }

  function renderIRChart() {
    const svg = document.getElementById('svg-lewis-ir');
    if (!svg) return;
    svg.innerHTML = '';
    renderGhgVerdict();
    if (!mol3D || modes3D.length === 0) return;
    const xHi = 4000, xLo = 400;
    // 塑膠模式要多留一排空間畫文獻參考峰的數字,底部邊界拉大一點,避免跟座標軸文字疊在一起
    const L = 68, Rm = 20, T = 46, Bm = currentPlastic ? 62 : 46, W = 720, Hh = 230;
    const xPx = (w) => L + ((xHi - w) / (xHi - xLo)) * (W - L - Rm);
    const yPx = (pct) => T + ((100 - pct) / 100) * (Hh - T - Bm);
    const g = el('g', {});
    drawIRAxes(g, xPx, yPx, L, Rm, T, Bm, W, Hh);

    if (!currentPlastic) {
      // 疊上地球熱輻射(288K)與太陽輻射尾端(5778K)黑體曲線(各自歸一化,示意)——
      // 塑膠參考模式不討論溫室效應,黑體曲線跟這個議題綁在一起,所以只有一般分子才畫
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
    }

    // 目前播放中的模式:先畫一條顯眼的色帶標出它在光譜上的位置,讓後面畫的黑色吸收曲線
    // 疊在色帶上面,一眼就能看出「現在播放的振動模式對應哪個峰」,不用在一堆峰裡面找
    const selMode = modes3D[selectedMode];
    if (selMode) {
      const spx = xPx(selMode.freq);
      g.appendChild(el('rect', { x: spx - 16, y: T, width: 32, height: Hh - Bm - T, fill: '#3b5bdb', 'fill-opacity': 0.14 }));
    }

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
      if (inten < 0.04 && i !== selectedMode) return; // 幾乎不吸收就不特別標(選取中的模式例外,一定要看得到)
      const py = yPx(100 - inten * 88);
      const t = el('text', {
        x: px, y: py - 10, 'text-anchor': 'middle',
        'font-size': i === selectedMode ? 17 : 13,
        fill: i === selectedMode ? '#3b5bdb' : '#495057',
        'font-weight': i === selectedMode ? 800 : 600,
      });
      t.textContent = m.freq.toFixed(0);
      g.appendChild(t);
    });
    // 選取模式標記:粗色虛線 + 峰頂一顆醒目圓點,標出目前正在播放的振動模式對應哪個峰
    const sel = modes3D[selectedMode];
    if (sel) {
      const spx = xPx(sel.freq);
      const selInten = sel.intensity / maxI;
      const spy = yPx(Math.max(2, 100 - selInten * 88));
      g.appendChild(el('line', { x1: spx, y1: T, x2: spx, y2: Hh - Bm, stroke: '#3b5bdb', 'stroke-width': 2.4, 'stroke-dasharray': '7,4' }));
      g.appendChild(el('circle', { cx: spx, cy: spy, r: 8, fill: '#3b5bdb', stroke: '#fff', 'stroke-width': 2.5 }));
    }

    // 塑膠模式:疊上文獻參考的特徵峰(紫色,貼近底部,跟上面黑色計算峰的標籤分開,避免互相蓋住),
    // 直接對照代表分子的即時計算結果跟真實塑膠的文獻值差異有多大
    if (currentPlastic) {
      const p = PLASTICS[currentPlastic];
      const legend = el('text', { x: L + 8, y: T - 10, 'font-size': 13, 'font-weight': 700, fill: '#6b4fa0' });
      legend.textContent = `┊ ${p.label} 文獻參考特徵峰`;
      g.appendChild(legend);
      p.peaks.forEach((pk) => {
        const px = xPx(pk.freq);
        g.appendChild(el('line', { x1: px, y1: T, x2: px, y2: Hh - Bm, stroke: '#6b4fa0', 'stroke-width': 1.3, 'stroke-dasharray': '3,3', 'stroke-opacity': 0.7 }));
        const t = el('text', { x: px, y: Hh - Bm + 34, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#6b4fa0', 'font-weight': 700 });
        t.textContent = pk.freq;
        g.appendChild(t);
      });
    }

    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.appendChild(g);
  }

  function renderVibPanel() {
    const wrap = document.getElementById('vib-mode-list');
    const axisWrap = document.getElementById('vib-axis-wrap');
    const irTitle = document.getElementById('ir-title');
    const irDesc = document.getElementById('ir-desc');
    const sideTitle = document.getElementById('vib-side-title');
    const sideDesc = document.getElementById('vib-side-desc');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (currentPlastic) {
      const p = PLASTICS[currentPlastic];
      const analogLabel = plasticAnalogLabel(currentPlastic);
      if (sideTitle) sideTitle.textContent = '🎵 振動模式(代表分子)';
      if (sideDesc) sideDesc.textContent = `${analogLabel} 的真實振動模式,點一下播放`;
      const info = document.createElement('p');
      info.className = 'tiny';
      info.innerHTML =
        `<b>${p.full}</b><br>常見用途:${p.uses}<br>代表結構:<b>${analogLabel}</b><br><br>` +
        `塑膠是長鏈高分子(重複單元上千個),不是這個引擎設計來處理的小分子——左邊改用這顆真正算出 3D 結構與振動模式的小分子,` +
        `抓住最主要的官能基特徵。下面 IR 圖黑線是這顆代表分子的即時計算結果,紫色虛線是文獻上這種塑膠真正的特徵峰,` +
        `兩者對照可以看出小分子模型跟真實高分子鏈的差異有多大。`;
      wrap.appendChild(info);
      if (irTitle) irTitle.textContent = `📚 ${p.label}:代表分子光譜 vs. 文獻參考峰`;
      if (irDesc) irDesc.innerHTML = '黑線＝代表分子(見左)即時算出的 IR 光譜;紫色虛線＝文獻上這種塑膠的特徵吸收峰。兩者對照可以看出小分子模型跟真實高分子鏈的差異有多大——這裡不討論溫室效應,溫室氣體判斷是地球大氣的議題,跟塑膠材料無關。';
      if (!mol3D || modes3D.length === 0) {
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
      return;
    }
    if (sideTitle) sideTitle.textContent = '🎵 振動模式';
    if (sideDesc) sideDesc.textContent = '點一下,直接在左邊分子上播放';
    if (irTitle) irTitle.textContent = '🌍 這顆分子的 IR 光譜 與 溫室效應判斷';
    if (irDesc) irDesc.innerHTML = '黑線＝這顆分子的 IR 吸收光譜(強度來自模式改變偶極矩的程度);橙色/黃色區塊＝地球熱輻射與太陽輻射,疊在一起才看得出哪個振動模式真正擋得住地球散熱。只列出有代表性的模式,簡併(對稱重複)已合併,雜訊般的低頻模式已省略。點選左邊的振動模式,對應的吸收峰會在圖上明顯標示出來。';
    if (!mol3D || modes3D.length === 0) {
      wrap.innerHTML = '<p class="tiny">分子接好鍵、放開滑鼠(或點選上面常見分子/塑膠選單)後會自動最佳化,這裡會列出這顆分子真正算出來的重要振動模式(依真實原子質量與鍵力常數,對位能面做 Hessian 對角化;簡併模式與雜訊模式已自動省略),動畫會直接顯示在左邊的分子上,下面也會畫出這顆分子的 IR 光譜。</p>';
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
    return ['C', 'H', 'N', 'O', 'S', 'Cl']
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
    return ['C', 'N', 'H', 'O', 'S', 'Cl']
      .filter((e) => counts[e])
      .map((e) => e + (counts[e] > 1 ? sub(counts[e]) : ''))
      .join('');
  }

  function updatePanels() {
    // 目標分子勾選:每次都用「畫布上目前實際有的分子」重新算,不能只累加不清除——
    // 否則換一顆分子之後,之前組過的舊分子仍然亮著綠色勾勾,好幾個按鈕同時「完成」,
    // 容易誤以為畫面上同時有好幾顆分子疊在一起。
    doneTargets.clear();
    const comps = components();
    comps.forEach((comp) => {
      if (comp.length < 2) return;
      if (!comp.every((a) => derived(a).satisfied)) return;
      const net = comp.reduce((s, a) => s + derived(a).fc, 0);
      if (net !== 0) return;
      const key = formulaKey(countsOf(comp));
      if (TARGETS.some((t) => t.key === key)) doneTargets.add(key);
    });
    // 只有第一次才重建選項,避免振動動畫每一幀都重新產生 DOM
    if (chipsEl.childElementCount !== TARGETS.length + 1) {
      chipsEl.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '選擇常見小分子…';
      chipsEl.appendChild(placeholder);
      TARGETS.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = t.label;
        chipsEl.appendChild(opt);
      });
    }
    const currentKey = currentPlastic ? '' : TARGETS.find((t) => doneTargets.has(t.key))?.key || '';
    if (chipsEl.value !== currentKey) chipsEl.value = currentKey;

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
        lines.push(`${meter(0)} ✓ <b>${name}</b> — 每個原子都達成八隅體(H 為二隅體),能量低、結構穩定,可以存在${polarText}(放開滑鼠會自動最佳化,極性才準)。`);
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
      if (currentPlastic) {
        // 塑膠代表分子原子數多,列出每一根鍵長、每個角度會很長一串、看起來太複雜——
        // 塑膠模式只看立體形狀跟振動模式就好,鍵長鍵角細節留給小分子模式。
        geomEl.innerHTML = `<h4>真實立體幾何(3D)</h4><p class="tiny">塑膠代表分子原子較多,鍵長/鍵角細節省略,拖曳左邊的 3D 結構看整體形狀就好。</p>`;
      } else if (mol3D) {
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
            '<h4>目前的幾何:鍵長與鍵角</h4><p class="tiny">接出鍵之後,這裡與畫布上會即時顯示鍵長(相對單位)與鍵角;放開滑鼠就會自動最佳化收斂到平衡值,並換算成真實的 Å 與立體角度。</p>';
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

    const plasticSelect = document.getElementById('plastic-select');
    const plasticNSelect = document.getElementById('plastic-n-select');
    chipsEl.addEventListener('change', () => {
      if (chipsEl.value) {
        buildPresetMolecule(chipsEl.value);
        if (plasticSelect) plasticSelect.value = '';
        updatePlasticNControl();
      }
    });
    if (plasticSelect) {
      plasticSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '🧪 選擇塑膠(IR 特徵峰文獻參考)…';
      plasticSelect.appendChild(placeholder);
      Object.entries(PLASTICS).forEach(([key, p]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = p.label;
        plasticSelect.appendChild(opt);
      });
      plasticSelect.addEventListener('change', () => {
        if (plasticSelect.value) {
          showPlastic(plasticSelect.value);
          chipsEl.value = '';
        } else {
          updatePlasticNControl();
        }
      });
    }
    if (plasticNSelect) {
      plasticNSelect.value = String(currentPlasticN);
      plasticNSelect.addEventListener('change', () => {
        if (currentPlastic && PLASTICS[currentPlastic]?.chainGen) {
          showPlastic(currentPlastic, Number(plasticNSelect.value));
        }
      });
    }

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
      } else if (drag && drag.moved && hasPendingBonds() && !optimizing) {
        // 放開滑鼠時,只要畫布上還有沒最佳化過的鍵,就直接自動最佳化,不用另外按按鈕
        runOptimize();
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
