// 範例分子(依講義「結構式畫法」的分類)。
// forms:同一組原子的不同畫法(共振結構;alt:true 表示擴張八隅體的另一種畫法)
// bonds:[i, j, 鍵級, 配位鍵時出整對電子的原子 index(可省略)];fc:形式電荷
(() => {
  const singles = (n, from = 1) => Array.from({ length: n }, (_, k) => [0, from + k, 1]);
  const fcAll = (idxs, v, extra = {}) => Object.assign(Object.fromEntries(idxs.map((i) => [i, v])), extra);
  // 中心原子 0 接 n 個外圍原子,其中第 d 個是雙鍵、其他單鍵帶 −1(共振結構的輪替)
  const rotateDouble = (n, centerFC) => Array.from({ length: n }, (_, d) => ({
    bonds: Array.from({ length: n }, (_, k) => [0, k + 1, k === d ? 2 : 1]),
    fc: Object.assign({ 0: centerFC }, Object.fromEntries(Array.from({ length: n }, (_, k) => [k + 1, k === d ? 0 : -1]))),
  }));

  const CATS = [
    { key: 'basic', label: '① 基本分子', tip: '先數價電子:未配對電子的個數 = 能形成的共價鍵數(H 1、O 2、N 3、C 4)。兩個原子各出 1 個未配對電子,就配成一對共用電子。' },
    { key: 'iso', label: '② 同族互換・等電子', tip: '密技 (1):同族元素價電子相同,可以直接互換(O↔S、N↔P、F↔Cl),結構不變。相鄰元素多/少一個價電子,只要用電荷補回來,就是一樣的結構:CH₄ = NH₄⁺ = BF₄⁻、SO₄²⁻ = PO₄³⁻ = ClO₄⁻。點選中心原子,按「換元素」試試看。' },
    { key: 'res', label: '③ 共振系列', tip: '價電子總數相同的分子,結構相同:SO₂ = NO₂⁻ = O₃(18 個價電子)、SO₃ = NO₃⁻ = CO₃²⁻(24 個價電子)。雙鍵可以放在不同位置,就是「共振結構」,按「↔ 下一個共振結構」切換。' },
    { key: 'exc', label: '④ 不符合八隅體', tip: '三種例外:(1) 八隅體不足:Be、B 價電子太少(BeCl₂ 周圍 4 個、BF₃ 周圍 6 個);(2) 擴張八隅體:第 3 週期以後有 d 軌域(PCl₅ 10 個、SF₆ 12 個);(3) 奇數電子:總價電子是奇數,一定剩一個未配對電子(NO、NO₂)。' },
    { key: 'dual', label: '⑤ 雙中心', tip: '密技:雙中心拆成兩個單中心。先把一半畫好(C₂H₄ = 2 個 CH₂、C₂H₂ = 2 個 CH、H₂O₂ = 2 個 OH、N₂H₄ = 2 個 NH₂、N₂O₄ = 2 個 NO₂),再把兩半剩下的未配對電子接起來。' },
    { key: 'ionic', label: '⑥ 離子化合物', tip: '金屬 + 非金屬:電子是「轉移」不是共用。金屬失去價電子成為陽離子,非金屬得到電子成為陰離子,各自加上中括號與電荷,中間沒有共用電子對。' },
  ];

  const PRESETS = [
    // ① 基本
    { key: 'H2', label: 'H₂ 氫氣', cat: 'basic', els: ['H', 'H'], forms: [{ bonds: [[0, 1, 1]] }] },
    { key: 'Cl2', label: 'Cl₂ 氯氣', cat: 'basic', els: ['Cl', 'Cl'], forms: [{ bonds: [[0, 1, 1]] }] },
    { key: 'O2', label: 'O₂ 氧氣', cat: 'basic', els: ['O', 'O'], forms: [{ bonds: [[0, 1, 2]] }] },
    { key: 'N2', label: 'N₂ 氮氣', cat: 'basic', els: ['N', 'N'], forms: [{ bonds: [[0, 1, 3]] }] },
    { key: 'HF', label: 'HF 氟化氫', cat: 'basic', els: ['F', 'H'], forms: [{ bonds: [[0, 1, 1]] }] },
    { key: 'HCl', label: 'HCl 氯化氫', cat: 'basic', els: ['Cl', 'H'], forms: [{ bonds: [[0, 1, 1]] }] },
    { key: 'H2O', label: 'H₂O 水', cat: 'basic', els: ['O', 'H', 'H'], forms: [{ bonds: singles(2) }] },
    { key: 'NH3', label: 'NH₃ 氨', cat: 'basic', els: ['N', 'H', 'H', 'H'], forms: [{ bonds: singles(3) }] },
    { key: 'CH4', label: 'CH₄ 甲烷', cat: 'basic', els: ['C', 'H', 'H', 'H', 'H'], forms: [{ bonds: singles(4) }] },
    { key: 'CO2', label: 'CO₂ 二氧化碳', cat: 'basic', els: ['C', 'O', 'O'], forms: [{ bonds: [[0, 1, 2], [0, 2, 2]] }] },
    { key: 'HCN', label: 'HCN 氰化氫', cat: 'basic', els: ['C', 'H', 'N'], forms: [{ bonds: [[0, 1, 1], [0, 2, 3]] }] },
    { key: 'CH2O', label: 'CH₂O 甲醛', cat: 'basic', els: ['C', 'O', 'H', 'H'], forms: [{ bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1]] }] },
    { key: 'CO', label: 'CO 一氧化碳', cat: 'basic', els: ['C', 'O'], forms: [{ bonds: [[0, 1, 3, 1]], fc: { 0: -1, 1: 1 } }] },
    { key: 'CCl4', label: 'CCl₄ 四氯化碳', cat: 'basic', els: ['C', 'Cl', 'Cl', 'Cl', 'Cl'], forms: [{ bonds: singles(4) }] },

    // ② 同族互換・等電子
    { key: 'H2S', label: 'H₂S 硫化氫(O→S)', cat: 'iso', els: ['S', 'H', 'H'], forms: [{ bonds: singles(2) }] },
    { key: 'PH3', label: 'PH₃ 磷化氫(N→P)', cat: 'iso', els: ['P', 'H', 'H', 'H'], forms: [{ bonds: singles(3) }] },
    { key: 'NH4+', label: 'NH₄⁺ 銨離子', cat: 'iso', els: ['N', 'H', 'H', 'H', 'H'], forms: [{ bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1, 0]], fc: { 0: 1 } }] },
    { key: 'BF4-', label: 'BF₄⁻ 四氟硼酸根', cat: 'iso', els: ['B', 'F', 'F', 'F', 'F'], forms: [{ bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1, 4]], fc: { 0: -1 } }] },
    { key: 'H3O+', label: 'H₃O⁺ 鋞離子', cat: 'iso', els: ['O', 'H', 'H', 'H'], forms: [{ bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1, 0]], fc: { 0: 1 } }] },
    { key: 'OH-', label: 'OH⁻ 氫氧根', cat: 'iso', els: ['O', 'H'], forms: [{ bonds: [[0, 1, 1]], fc: { 0: -1 } }] },
    { key: 'CN-', label: 'CN⁻ 氰離子', cat: 'iso', els: ['C', 'N'], forms: [{ bonds: [[0, 1, 3]], fc: { 0: -1 } }] },
    {
      key: 'SO4', label: 'SO₄²⁻ 硫酸根', cat: 'iso', els: ['S', 'O', 'O', 'O', 'O'],
      forms: [
        { bonds: singles(4), fc: fcAll([1, 2, 3, 4], -1, { 0: 2 }) },
        { bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 1], [0, 4, 1]], fc: { 3: -1, 4: -1 }, alt: true },
      ],
    },
    {
      key: 'PO4', label: 'PO₄³⁻ 磷酸根', cat: 'iso', els: ['P', 'O', 'O', 'O', 'O'],
      forms: [
        { bonds: singles(4), fc: fcAll([1, 2, 3, 4], -1, { 0: 1 }) },
        { bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [0, 4, 1]], fc: { 2: -1, 3: -1, 4: -1 }, alt: true },
      ],
    },
    {
      key: 'ClO4', label: 'ClO₄⁻ 過氯酸根', cat: 'iso', els: ['Cl', 'O', 'O', 'O', 'O'],
      forms: [
        { bonds: singles(4), fc: fcAll([1, 2, 3, 4], -1, { 0: 3 }) },
        { bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 2], [0, 4, 1]], fc: { 4: -1 }, alt: true },
      ],
    },

    // ③ 共振
    {
      key: 'SO2', label: 'SO₂ 二氧化硫', cat: 'res', els: ['S', 'O', 'O'],
      forms: [...rotateDouble(2, 1), { bonds: [[0, 1, 2], [0, 2, 2]], alt: true }],
    },
    { key: 'NO2-', label: 'NO₂⁻ 亞硝酸根', cat: 'res', els: ['N', 'O', 'O'], forms: rotateDouble(2, 0) },
    { key: 'O3', label: 'O₃ 臭氧', cat: 'res', els: ['O', 'O', 'O'], forms: rotateDouble(2, 1) },
    {
      key: 'SO3', label: 'SO₃ 三氧化硫', cat: 'res', els: ['S', 'O', 'O', 'O'],
      forms: [...rotateDouble(3, 2), { bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 2]], alt: true }],
    },
    { key: 'NO3-', label: 'NO₃⁻ 硝酸根', cat: 'res', els: ['N', 'O', 'O', 'O'], forms: rotateDouble(3, 1) },
    { key: 'CO3', label: 'CO₃²⁻ 碳酸根', cat: 'res', els: ['C', 'O', 'O', 'O'], forms: rotateDouble(3, 0) },

    // ④ 不符合八隅體
    { key: 'BeCl2', label: 'BeCl₂ 氯化鈹(不足)', cat: 'exc', els: ['Be', 'Cl', 'Cl'], forms: [{ bonds: singles(2) }] },
    { key: 'BF3', label: 'BF₃ 三氟化硼(不足)', cat: 'exc', els: ['B', 'F', 'F', 'F'], forms: [{ bonds: singles(3) }] },
    { key: 'PCl5', label: 'PCl₅ 五氯化磷(擴張)', cat: 'exc', els: ['P', 'Cl', 'Cl', 'Cl', 'Cl', 'Cl'], forms: [{ bonds: singles(5) }] },
    { key: 'SF6', label: 'SF₆ 六氟化硫(擴張)', cat: 'exc', els: ['S', 'F', 'F', 'F', 'F', 'F', 'F'], forms: [{ bonds: singles(6) }] },
    { key: 'SF4', label: 'SF₄ 四氟化硫(擴張)', cat: 'exc', els: ['S', 'F', 'F', 'F', 'F'], forms: [{ bonds: singles(4) }] },
    { key: 'ClF3', label: 'ClF₃ 三氟化氯(擴張)', cat: 'exc', els: ['Cl', 'F', 'F', 'F'], forms: [{ bonds: singles(3) }] },
    { key: 'XeF2', label: 'XeF₂ 二氟化氙(擴張)', cat: 'exc', els: ['Xe', 'F', 'F'], forms: [{ bonds: singles(2) }] },
    { key: 'XeF4', label: 'XeF₄ 四氟化氙(擴張)', cat: 'exc', els: ['Xe', 'F', 'F', 'F', 'F'], forms: [{ bonds: singles(4) }] },
    { key: 'NO', label: 'NO 一氧化氮(奇數電子)', cat: 'exc', els: ['N', 'O'], forms: [{ bonds: [[0, 1, 2]] }] },
    { key: 'NO2', label: 'NO₂ 二氧化氮(奇數電子)', cat: 'exc', els: ['N', 'O', 'O'], forms: rotateDouble(2, 1) },

    // ⑤ 雙中心
    { key: 'C2H6', label: 'C₂H₆ 乙烷 = 2 CH₃', cat: 'dual', els: ['C', 'C', 'H', 'H', 'H', 'H', 'H', 'H'], forms: [{ bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1], [1, 6, 1], [1, 7, 1]] }] },
    { key: 'C2H4', label: 'C₂H₄ 乙烯 = 2 CH₂', cat: 'dual', els: ['C', 'C', 'H', 'H', 'H', 'H'], forms: [{ bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]] }] },
    { key: 'C2H2', label: 'C₂H₂ 乙炔 = 2 CH', cat: 'dual', els: ['C', 'C', 'H', 'H'], forms: [{ bonds: [[0, 1, 3], [0, 2, 1], [1, 3, 1]] }] },
    { key: 'H2O2', label: 'H₂O₂ 過氧化氫 = 2 OH', cat: 'dual', els: ['O', 'O', 'H', 'H'], forms: [{ bonds: [[0, 1, 1], [0, 2, 1], [1, 3, 1]] }] },
    { key: 'N2H4', label: 'N₂H₄ 聯胺 = 2 NH₂', cat: 'dual', els: ['N', 'N', 'H', 'H', 'H', 'H'], forms: [{ bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]] }] },
    { key: 'N2F2', label: 'N₂F₂ 二氟二氮 = 2 NF', cat: 'dual', els: ['N', 'N', 'F', 'F'], forms: [{ bonds: [[0, 1, 2], [0, 2, 1], [1, 3, 1]] }] },
    {
      key: 'N2O4', label: 'N₂O₄ 四氧化二氮 = 2 NO₂', cat: 'dual', els: ['N', 'N', 'O', 'O', 'O', 'O'],
      forms: [
        { bonds: [[0, 1, 1], [0, 2, 2], [0, 3, 1], [1, 4, 2], [1, 5, 1]], fc: { 0: 1, 1: 1, 3: -1, 5: -1 } },
        { bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 2], [1, 4, 2], [1, 5, 1]], fc: { 0: 1, 1: 1, 2: -1, 5: -1 } },
      ],
    },

    // ⑥ 離子化合物
    { key: 'NaCl', label: 'NaCl 氯化鈉', cat: 'ionic', els: ['Na', 'Cl'], forms: [{ links: [[0, 1]], fc: { 0: 1, 1: -1 } }] },
    { key: 'MgO', label: 'MgO 氧化鎂', cat: 'ionic', els: ['Mg', 'O'], forms: [{ links: [[0, 1]], fc: { 0: 2, 1: -2 } }] },
    { key: 'CaCl2', label: 'CaCl₂ 氯化鈣', cat: 'ionic', els: ['Ca', 'Cl', 'Cl'], forms: [{ links: [[0, 1], [0, 2]], fc: { 0: 2, 1: -1, 2: -1 } }] },
    { key: 'Na2O', label: 'Na₂O 氧化鈉', cat: 'ionic', els: ['O', 'Na', 'Na'], forms: [{ links: [[0, 1], [0, 2]], fc: { 0: -2, 1: 1, 2: 1 } }] },
    { key: 'NaOH', label: 'NaOH 氫氧化鈉', cat: 'ionic', els: ['Na', 'O', 'H'], forms: [{ bonds: [[1, 2, 1]], links: [[0, 1]], fc: { 0: 1, 1: -1 } }] },
  ];

  window.Presets = { CATS, PRESETS, byKey: Object.fromEntries(PRESETS.map((p) => [p.key, p])) };
})();
