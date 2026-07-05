#!/usr/bin/env node
/**
 * TY_Research 颱風監控 Email 通知 Routine
 * ------------------------------------------------------
 * 邏輯流程：
 *   1. 呼叫中央氣象署開放資料 API,檢查是否有生效中的颱風警報
 *      → 沒有警報就直接結束,不執行後續任何步驟
 *   2. 取得目前警報颱風的中文名稱
 *   3. 抓取 PTT TY_Research 看板文章列表
 *   4. 篩選標題包含該颱風名稱(或本次已處理過)的文章
 *   5. 進入文章頁面,擷取推文,篩選「過去 6 小時內」的推文
 *      (並排除上次已處理過的時間點,避免重複寄送)
 *   6. 從推文文字中擷取圖片連結(imgur 等)
 *   7. 組成摘要 email,寄給三位收件人
 *   8. 把本次處理到的最新時間點寫回 Notion,做為下次執行的起點
 *
 * 執行方式：node ty_research_monitor.js
 * 建議透過 Claude Code cloud Routine 設定 Cron,每 6 小時觸發一次
 * (Claude Pro 方案 Routine 每日執行上限為5次,每6小時一天4次,在額度內)。
 *
 * 必要環境變數(不要寫死在程式碼或 commit 進公開 repo)：
 *   CWA_API_KEY          中央氣象署開放資料授權碼
 *   NOTION_TOKEN         Notion Integration Token
 *   NOTION_STATE_PAGE_ID 用來存放「上次處理到的時間戳記」的 Notion 頁面 ID
 *   GMAIL_USER           寄件 Gmail 帳號
 *   GMAIL_APP_PASSWORD   Gmail 應用程式密碼(非登入密碼,需在 Google 帳號設定中另外產生)
 *
 * 相依套件(需先 npm install)：
 *   nodemailer
 * ------------------------------------------------------
 * ⚠️ 注意：CWA API 實際 JSON 欄位名稱我未能在此環境即時驗證
 *    (沙盒網路白名單不含 opendata.cwa.gov.tw),第一次執行時
 *    請先用 DEBUG_CWA=1 環境變數印出完整回傳結構,核對欄位名稱
 *    是否與下方 getActiveTyphoons() 的解析邏輯一致,必要時微調。
 */

import nodemailer from 'nodemailer';

// ============================================================
// 設定區
// ============================================================
const CONFIG = {
  CWA_API_KEY: process.env.CWA_API_KEY,
  CWA_TYPHOON_ENDPOINT: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005',

  PTT_BOARD: 'TY_Research',
  PTT_BASE: 'https://www.ptt.cc',

  TIME_WINDOW_HOURS: 6,          // 只處理過去N小時內的推文(需與Routine排程頻率一致,避免漏抓交界處推文)
  MAX_ARTICLES_TO_CHECK: 25,     // 每次最多檢查看板最新幾篇文章
  REQUEST_DELAY_MS: 800,         // 每次抓取文章之間的延遲,避免被PTT暫時擋IP

  NOTION_TOKEN: process.env.NOTION_TOKEN,
  NOTION_STATE_PAGE_ID: process.env.NOTION_STATE_PAGE_ID,

  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,

  RECIPIENTS: [
    'han503@smail.ilc.edu.tw',
    'gogoyankee@gmail.com',
    'kuanfei77@gmail.com',
  ],
};

function assertConfig() {
  const required = ['CWA_API_KEY', 'NOTION_TOKEN', 'NOTION_STATE_PAGE_ID', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const missing = required.filter((k) => !CONFIG[k]);
  if (missing.length) {
    throw new Error(`缺少環境變數: ${missing.join(', ')}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Step 1: 檢查中央氣象署是否有生效中的颱風警報
// ============================================================
async function getActiveTyphoons() {
  const url = `${CONFIG.CWA_TYPHOON_ENDPOINT}?Authorization=${CONFIG.CWA_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CWA API 請求失敗: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  if (process.env.DEBUG_CWA === '1') {
    console.log('--- CWA 原始回傳(除錯用) ---');
    console.log(JSON.stringify(data, null, 2));
  }

  // 防禦性解析:嘗試多種可能的資料路徑,實際欄位名稱請以第一次執行的
  // DEBUG_CWA=1 輸出為準,必要時修改這段
  const cyclones =
    data?.records?.tropicalCyclones?.tropicalCyclone ||
    data?.records?.tropicalCyclone ||
    [];

  if (!Array.isArray(cyclones) || cyclones.length === 0) {
    return [];
  }

  // 取出中文名稱(cwaTyphoonName)與英文名稱(typhoonName)供比對用
  return cyclones.map((c) => ({
    nameZh: c.cwaTyphoonName || c.typhoonName || '未知颱風',
    nameEn: c.typhoonName || '',
  }));
}

// ============================================================
// Step 2: 抓取 PTT 看板文章列表
// ============================================================
async function fetchBoardArticles() {
  const res = await fetch(`${CONFIG.PTT_BASE}/bbs/${CONFIG.PTT_BOARD}/index.html`);
  if (!res.ok) {
    throw new Error(`PTT 看板頁面請求失敗: ${res.status}`);
  }
  const html = await res.text();

  const articles = [];
  const re = /<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    articles.push({
      url: `${CONFIG.PTT_BASE}${match[1]}`,
      title: match[2].trim(),
    });
  }
  // PTT 頁面由舊到新排列,反轉讓最新文章在前面
  return articles.reverse();
}

// ============================================================
// Step 3: 抓取單篇文章的推文列表
// ============================================================
async function fetchArticlePushes(articleUrl) {
  const res = await fetch(articleUrl);
  if (!res.ok) {
    console.warn(`文章請求失敗,略過: ${articleUrl} (${res.status})`);
    return [];
  }
  const html = await res.text();

  const pushes = [];
  const re = /<div class="push">[\s\S]*?<span class="push-tag">([^<]*)<\/span>\s*<span class="push-userid">([^<]*)<\/span>\s*<span class="push-content">([\s\S]*?)<\/span>\s*<span class="push-ipdatetime">([^<]*)<\/span>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const [, tag, userid, content, ipdatetime] = match;
    const time = parsePushTime(ipdatetime.trim());
    pushes.push({
      tag: tag.trim(),
      userid: userid.trim(),
      content: content.replace(/^:\s*/, '').trim(),
      time,
    });
  }
  return pushes;
}

// ============================================================
// Step 4: 解析推文時間戳記("MM/DD HH:MM" → Date)
// ============================================================
function parsePushTime(str) {
  // str 範例: "07/05 14:23"
  const m = str.match(/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, month, day, hour, minute] = m.map(Number);
  const now = new Date();
  let year = now.getFullYear();

  const candidate = new Date(year, month - 1, day, hour, minute);
  // 處理跨年邊界:若組出來的時間比現在晚超過一天,代表其實是去年的資料
  if (candidate.getTime() - now.getTime() > 24 * 3600 * 1000) {
    candidate.setFullYear(year - 1);
  }
  return candidate;
}

// ============================================================
// Step 5: 從推文文字中擷取圖片連結
// ============================================================
function extractImageUrls(text) {
  const re = /(https?:\/\/[^\s]*?(?:imgur\.com|\.jpg|\.jpeg|\.png|\.gif)[^\s]*)/gi;
  const urls = new Set();
  let match;
  while ((match = re.exec(text)) !== null) {
    urls.add(match[1]);
  }
  return Array.from(urls);
}

// ============================================================
// Step 6: Notion 進度紀錄讀寫(用來記住上次處理到哪個時間點)
// ============================================================
const NOTION_VERSION = '2022-06-28';

async function getLastCheckpoint() {
  const res = await fetch(`https://api.notion.com/v1/blocks/${CONFIG.NOTION_STATE_PAGE_ID}/children?page_size=1`, {
    headers: {
      Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  if (!res.ok) {
    console.warn('讀取 Notion 進度失敗,視為第一次執行');
    return null;
  }
  const data = await res.json();
  const firstBlock = data.results?.[0];
  const text = firstBlock?.paragraph?.rich_text?.[0]?.plain_text;
  if (!text) return null;
  const ts = new Date(text);
  return isNaN(ts.getTime()) ? null : ts;
}

async function setCheckpoint(timestamp) {
  // 先取得第一個 block 的 ID 才能更新;若頁面是空的則改用新增 block
  const listRes = await fetch(`https://api.notion.com/v1/blocks/${CONFIG.NOTION_STATE_PAGE_ID}/children?page_size=1`, {
    headers: {
      Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  const listData = await listRes.json();
  const firstBlockId = listData.results?.[0]?.id;

  const paragraphBlock = {
    paragraph: {
      rich_text: [{ text: { content: timestamp.toISOString() } }],
    },
  };

  if (firstBlockId) {
    await fetch(`https://api.notion.com/v1/blocks/${firstBlockId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paragraphBlock),
    });
  } else {
    await fetch(`https://api.notion.com/v1/blocks/${CONFIG.NOTION_STATE_PAGE_ID}/children`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', ...paragraphBlock }] }),
    });
  }
}

// ============================================================
// Step 7: 組成摘要 email HTML
// ============================================================
function buildSummaryHtml(relevantGroups, typhoons) {
  const typhoonNames = typhoons.map((t) => t.nameZh).join('、');
  let html = `<h2>TY_Research 颱風監控彙整</h2>`;
  html += `<p>目前生效警報颱風：<strong>${typhoonNames}</strong></p>`;
  html += `<p>資料範圍：過去 ${CONFIG.TIME_WINDOW_HOURS} 小時內的新推文</p><hr/>`;

  for (const group of relevantGroups) {
    html += `<h3><a href="${group.article.url}">${group.article.title}</a></h3><ul>`;
    for (const p of group.pushes) {
      const timeStr = p.time ? p.time.toLocaleString('zh-TW') : '(時間未知)';
      html += `<li><strong>${p.tag}${p.userid}</strong>：${p.content} <em>(${timeStr})</em></li>`;
      const imgs = extractImageUrls(p.content);
      for (const img of imgs) {
        html += `<div><img src="${img}" style="max-width:500px;" /></div>`;
      }
    }
    html += `</ul>`;
  }
  return html;
}

// ============================================================
// Step 8: 寄送 Email
// ============================================================
async function sendEmail(subject, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.GMAIL_USER,
      pass: CONFIG.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: CONFIG.GMAIL_USER,
    to: CONFIG.RECIPIENTS.join(','),
    subject,
    html,
  });
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  assertConfig();

  console.log('[1/6] 檢查中央氣象署颱風警報...');
  const typhoons = await getActiveTyphoons();
  if (typhoons.length === 0) {
    console.log('目前無生效颱風警報,結束本次執行。');
    return;
  }
  console.log(`偵測到警報颱風: ${typhoons.map((t) => t.nameZh).join('、')}`);

  console.log('[2/6] 讀取上次處理進度...');
  const lastCheckpoint = await getLastCheckpoint();
  const windowStart = new Date(Date.now() - CONFIG.TIME_WINDOW_HOURS * 3600 * 1000);
  const effectiveStart = lastCheckpoint && lastCheckpoint > windowStart ? lastCheckpoint : windowStart;
  console.log(`本次篩選起點: ${effectiveStart.toISOString()}`);

  console.log('[3/6] 抓取 TY_Research 文章列表...');
  const articles = await fetchBoardArticles();
  const typhoonNameList = typhoons.map((t) => t.nameZh).filter(Boolean);
  const candidateArticles = articles
    .filter((a) => typhoonNameList.some((name) => a.title.includes(name)))
    .slice(0, CONFIG.MAX_ARTICLES_TO_CHECK);

  if (candidateArticles.length === 0) {
    console.log('看板最新文章中未找到與目前颱風相關的標題,結束本次執行。');
    return;
  }
  console.log(`找到 ${candidateArticles.length} 篇相關文章,開始逐篇檢查推文...`);

  console.log('[4/6] 抓取推文並篩選時間窗...');
  const relevantGroups = [];
  let latestPushTime = effectiveStart;

  for (const article of candidateArticles) {
    await sleep(CONFIG.REQUEST_DELAY_MS);
    const pushes = await fetchArticlePushes(article.url);
    const relevant = pushes.filter((p) => p.time && p.time > effectiveStart);
    if (relevant.length > 0) {
      relevantGroups.push({ article, pushes: relevant });
      for (const p of relevant) {
        if (p.time > latestPushTime) latestPushTime = p.time;
      }
    }
  }

  if (relevantGroups.length === 0) {
    console.log('時間窗內無新推文,結束本次執行。');
    return;
  }

  console.log('[5/6] 組成摘要並寄送 Email...');
  const html = buildSummaryHtml(relevantGroups, typhoons);
  const subject = `[颱風監控] ${typhoons.map((t) => t.nameZh).join('/')} TY_Research 專業回文彙整`;
  await sendEmail(subject, html);
  console.log(`已寄送給: ${CONFIG.RECIPIENTS.join(', ')}`);

  console.log('[6/6] 更新 Notion 進度紀錄...');
  await setCheckpoint(latestPushTime);
  console.log('完成。');
}

main().catch((err) => {
  console.error('執行失敗:', err);
  process.exit(1);
});
