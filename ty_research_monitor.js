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
 *   8. 把本次處理到的最新時間點寫回 .state/checkpoint.json 並 commit,做為下次執行的起點
 *
 * 執行方式：node ty_research_monitor.js
 * 建議透過 GitHub Actions 排程執行(見 .github/workflows/typhoon-monitor.yml),
 * 每 6 小時觸發一次。
 *
 * 必要環境變數(不要寫死在程式碼或 commit 進公開 repo,請設定在 GitHub repo 的
 * Settings → Secrets and variables → Actions 裡)：
 *   CWA_API_KEY          中央氣象署開放資料授權碼
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
 *
 * ⚠️ 同理,scanActiveWesternPacificSystems() 讀取 NOAA/JTWC 公開的 ATCF
 *    aid-deck 檔案(https://ftp.nhc.noaa.gov/atcf/aid_public/),彙整全球各
 *    數值模式與 JTWC 官方預測的路徑點。這段刻意不依賴 CWA 是否已發布正式警報
 *    ——直接把西太平洋(WP) 01~30 號掃過一輪,只留最近幾天內有更新的系統,這樣
 *    即使 CWA 還沒發警報,只要 JTWC/國際模式已經在追蹤(例如 invest 階段),
 *    也看得到路徑。格式是長年穩定的公開標準,但同樣未能在此環境即時驗證
 *    (無法連外測試),第一次遇到真實系統時請用 DEBUG_TRACKS=1 核對解析結果。
 */

import nodemailer from 'nodemailer';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_FILE = path.join(__dirname, '.state', 'checkpoint.json');

// ============================================================
// 設定區
// ============================================================
const CONFIG = {
  CWA_API_KEY: process.env.CWA_API_KEY,
  CWA_TYPHOON_ENDPOINT: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005',
  ATCF_AID_DECK_BASE: 'https://ftp.nhc.noaa.gov/atcf/aid_public',

  PTT_BOARD: 'TY_Research',
  PTT_BASE: 'https://www.ptt.cc',

  TIME_WINDOW_HOURS: 6,          // 只處理過去N小時內的推文(需與Routine排程頻率一致,避免漏抓交界處推文)
  MAX_ARTICLES_TO_CHECK: 25,     // 每次最多檢查看板最新幾篇文章
  REQUEST_DELAY_MS: 800,         // 每次抓取文章之間的延遲,避免被PTT暫時擋IP

  MAX_WP_STORM_NUMBER: 30,       // 西太平洋一年最多用到的編號,掃描 01~此值
  ACTIVE_SYSTEM_RECENCY_HOURS: 72, // ATCF 資料最新一次發布時間在幾小時內才算「現行系統」
  ATCF_SCAN_DELAY_MS: 200,        // 逐一查詢 NOAA 編號之間的延遲,避免短時間內送出過多請求

  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,

  RECIPIENTS: [
    'han503@smail.ilc.edu.tw',
    'gogoyankee@gmail.com',
    'kuanfei77@gmail.com',
  ],
};

function assertConfig() {
  const required = ['CWA_API_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
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

  // 取出中文名稱(cwaTyphoonName)與英文名稱(typhoonName)供比對用,並保留原始物件
  // 供 getCwaForecastTrack() 進一步解析路徑
  return cyclones.map((c) => ({
    nameZh: c.cwaTyphoonName || c.typhoonName || '未知颱風',
    nameEn: c.typhoonName || '',
    raw: c,
  }));
}

// ============================================================
// Step 1b: 從 CWA 原始資料中擷取「中央氣象署自己的預測路徑」
// (與 getActiveTyphoons() 用同一組已驗證授權的資料,沒有額外的外部依賴)
// ============================================================
function getCwaForecastTrack(typhoon) {
  const raw = typhoon.raw || {};
  // 防禦性解析:CWA 的預測路徑欄位位置嘗試多種可能路徑,實際結構請以
  // DEBUG_TRACKS=1 輸出為準,必要時調整
  const fixes =
    raw?.forecastData?.fix ||
    raw?.analysisData?.fix ||
    raw?.forecast?.fix ||
    [];

  if (!Array.isArray(fixes) || fixes.length === 0) return [];

  return fixes
    .map((f) => {
      const coord = f.coordinate || f.coord || '';
      const [lonStr, latStr] = String(coord).split(',');
      const lat = Number(latStr);
      const lon = Number(lonStr);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
      return {
        tau: Number(f.tau ?? f.forecastHour) || 0,
        lat,
        lon,
        vmax: Number(f.maxWindSpeed) || null,
        mslp: Number(f.pressure) || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.tau - b.tau);
}

// ============================================================
// Step 1c: 讀取 NOAA/JTWC 公開的 ATCF aid-deck,彙整全球各數值模式
// (GFS/ECMWF/UKMET 等)與 JTWC 官方預測路徑
// ============================================================
function parseAtcfLatLon(str) {
  const m = String(str).match(/^(\d+)([NSEW])$/);
  if (!m) return null;
  const value = Number(m[1]) / 10;
  const sign = m[2] === 'S' || m[2] === 'W' ? -1 : 1;
  return value * sign;
}

function parseAtcfAidDeck(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const latestInitByTech = new Map();

  for (const line of lines) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 8) continue;
    const [, , initTimeStr, , tech] = f;
    const prev = latestInitByTech.get(tech);
    if (!prev || initTimeStr > prev) latestInitByTech.set(tech, initTimeStr);
  }

  const tracks = {};
  for (const line of lines) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 8) continue;
    const [, , initTimeStr, , tech, tauStr, latStr, lonStr, vmaxStr, mslpStr] = f;
    if (initTimeStr !== latestInitByTech.get(tech)) continue; // 只取每個模式最新一次的預報
    const tau = Number(tauStr);
    const lat = parseAtcfLatLon(latStr);
    const lon = parseAtcfLatLon(lonStr);
    if (lat === null || lon === null || Number.isNaN(tau)) continue;
    (tracks[tech] ||= []).push({
      tau,
      lat,
      lon,
      vmax: Number(vmaxStr) || null,
      mslp: Number(mslpStr) || null,
    });
  }

  for (const tech of Object.keys(tracks)) {
    tracks[tech].sort((a, b) => a.tau - b.tau);
  }
  return tracks;
}

async function fetchAtcfAidDeck(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = url.endsWith('.gz')
    ? zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8')
    : await res.text();
  return text;
}

function parseAtcfInitTime(str) {
  // ATCF 的時間格式是 YYYYMMDDHH(UTC),例如 "2026070100"
  const m = String(str).match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h));
}

// ============================================================
// Step 1d: 不依賴 CWA 是否已發布正式警報,直接把西太平洋 01~30 號掃過一輪,
// 只留「最近 ACTIVE_SYSTEM_RECENCY_HOURS 小時內有更新」的系統,藉此在
// CWA 官方警報之前,就能看到 JTWC/國際模式已經在追蹤的 invest
// ============================================================
async function scanActiveWesternPacificSystems() {
  const year = new Date().getFullYear();
  const results = [];

  for (let n = 1; n <= CONFIG.MAX_WP_STORM_NUMBER; n++) {
    const nn = String(n).padStart(2, '0');
    const urls = [
      `${CONFIG.ATCF_AID_DECK_BASE}/awp${nn}${year}.dat`,
      `${CONFIG.ATCF_AID_DECK_BASE}/awp${nn}${year}.dat.gz`,
    ];

    let text = null;
    for (const url of urls) {
      try {
        text = await fetchAtcfAidDeck(url);
        if (text) break;
      } catch (err) {
        console.warn(`ATCF 資料抓取失敗(${url}):`, err.message);
      }
    }
    if (!text) {
      await sleep(CONFIG.ATCF_SCAN_DELAY_MS);
      continue;
    }

    if (process.env.DEBUG_TRACKS === '1') {
      console.log(`--- ATCF WP${nn}${year} 原始回傳(除錯用,前2000字) ---`);
      console.log(text.slice(0, 2000));
    }

    const initTimes = text
      .split('\n')
      .map((l) => l.split(',')[2]?.trim())
      .filter(Boolean);
    const latestInitStr = initTimes.sort().at(-1);
    const latestInit = parseAtcfInitTime(latestInitStr);

    if (latestInit && Date.now() - latestInit.getTime() <= CONFIG.ACTIVE_SYSTEM_RECENCY_HOURS * 3600 * 1000) {
      results.push({
        stormId: `${nn}W`,
        initTime: latestInitStr,
        tracks: parseAtcfAidDeck(text),
      });
    }

    await sleep(CONFIG.ATCF_SCAN_DELAY_MS);
  }

  return results;
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
// Step 6: 進度紀錄讀寫(存在 repo 裡的 .state/checkpoint.json,用來記住
// 上次處理到哪個時間點;跟 index.html 一樣由本腳本自己 commit+push 回去)
// ============================================================
function getLastCheckpoint() {
  if (!existsSync(CHECKPOINT_FILE)) return null;
  try {
    const { lastPushTime } = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8'));
    const ts = new Date(lastPushTime);
    return isNaN(ts.getTime()) ? null : ts;
  } catch (err) {
    console.warn('讀取 checkpoint 檔案失敗,視為第一次執行:', err.message);
    return null;
  }
}

function setCheckpoint(timestamp) {
  mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastPushTime: timestamp.toISOString() }, null, 2) + '\n');
}

// ============================================================
// Step 7: 組成摘要 email HTML
// ============================================================
function buildSummaryHtml(relevantGroups, typhoons, trackForecasts, activeSystems) {
  const typhoonNames = typhoons.map((t) => t.nameZh).join('、');
  let html = `<h2>TY_Research 颱風監控彙整</h2>`;
  html += `<p>目前生效警報颱風：<strong>${typhoonNames}</strong></p>`;
  html += `<p>資料範圍：過去 ${CONFIG.TIME_WINDOW_HOURS} 小時內的新推文</p>`;
  html += buildTrackForecastHtml(trackForecasts, activeSystems);
  html += `<hr/>`;

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
// Step 7b: 組成狀態頁 index.html(每次執行都會更新,供線上查看目前擷取狀況)
// ============================================================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTrackPoints(points) {
  return points
    .map((p) => `+${p.tau}h(${p.lat.toFixed(1)},${p.lon.toFixed(1)}${p.vmax ? `,${p.vmax}kt` : ''})`)
    .join(' → ');
}

function buildTrackForecastHtml(trackForecasts, activeSystems) {
  const hasCwaTracks = trackForecasts && trackForecasts.length > 0;
  const hasActiveSystems = activeSystems && activeSystems.length > 0;

  let html = `<h2>各方預測路徑比較</h2>
  <p class="meta">CWA 為中央氣象署正式警報的預測路徑;NOAA/JTWC 區塊則是不等 CWA 正式警報,
  直接掃描 NOAA 彙整的全球數值模式與 JTWC 官方預測路徑(來源:
  <a href="https://ftp.nhc.noaa.gov/atcf/aid_public/">NOAA ATCF aid-deck</a>,
  另可參考 <a href="https://www.metoc.navy.mil/jtwc/jtwc.html">JTWC 官網</a>),
  所以即使還沒有正式警報,只要 JTWC/國際模式已在追蹤(例如 invest 階段)也看得到。</p>`;

  if (hasCwaTracks) {
    for (const t of trackForecasts) {
      html += `<div class="card"><h3>${escapeHtml(t.nameZh)}(CWA 正式警報)</h3><ul>`;
      if (t.cwaTrack && t.cwaTrack.length) {
        html += `<li><strong>CWA</strong>: ${escapeHtml(formatTrackPoints(t.cwaTrack))}</li>`;
      } else {
        html += `<li>CWA 路徑資料暫無法解析</li>`;
      }
      html += `</ul></div>`;
    }
  }

  if (hasActiveSystems) {
    html += `<div class="card"><h3>NOAA/JTWC 現行追蹤系統(含尚未正式警報的 invest)</h3>`;
    for (const sys of activeSystems) {
      html += `<p><strong>${escapeHtml(sys.stormId)}</strong>(最新資料時間 ${escapeHtml(sys.initTime)} UTC)</p><ul>`;
      for (const [tech, points] of Object.entries(sys.tracks)) {
        html += `<li><strong>${escapeHtml(tech)}</strong>: ${escapeHtml(formatTrackPoints(points))}</li>`;
      }
      html += `</ul>`;
    }
    html += `</div>`;
  } else {
    html += `<p class="meta">NOAA 掃描目前沒有偵測到任何現行追蹤系統。</p>`;
  }

  return html;
}

function buildStatusHtml(status) {
  const generatedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const typhoonNames = status.typhoons.length
    ? status.typhoons.map((t) => escapeHtml(t.nameZh)).join('、')
    : '無';

  let html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>TY_Research 颱風監控狀態</title>
<style>
  body { font-family: -apple-system, "Noto Sans TC", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 32px; }
  .meta { color: #666; font-size: 0.9rem; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .error { border-color: #e33; background: #fff5f5; }
  img { max-width: 100%; border-radius: 4px; }
  a { color: #0b5fff; }
</style>
</head>
<body>
<h1>TY_Research 颱風監控狀態</h1>
<p class="meta">最後執行時間：${generatedAt}(每次 Routine 執行後自動更新此頁)</p>

<div class="card${status.error ? ' error' : ''}">
  <p>目前生效警報颱風：<strong>${typhoonNames}</strong></p>
  ${status.note ? `<p>${escapeHtml(status.note)}</p>` : ''}
  ${status.error ? `<p><strong>執行錯誤：</strong>${escapeHtml(status.error)}</p>` : ''}
</div>
${buildTrackForecastHtml(status.trackForecasts, status.activeSystems)}
`;

  if (status.relevantGroups && status.relevantGroups.length) {
    html += `<h2>本次擷取到的新推文</h2>`;
    for (const group of status.relevantGroups) {
      html += `<div class="card"><h3><a href="${escapeHtml(group.article.url)}">${escapeHtml(group.article.title)}</a></h3><ul>`;
      for (const p of group.pushes) {
        const timeStr = p.time ? p.time.toLocaleString('zh-TW') : '(時間未知)';
        html += `<li><strong>${escapeHtml(p.tag)}${escapeHtml(p.userid)}</strong>：${escapeHtml(p.content)} <em>(${timeStr})</em></li>`;
        for (const img of extractImageUrls(p.content)) {
          html += `<div><img src="${escapeHtml(img)}" /></div>`;
        }
      }
      html += `</ul></div>`;
    }
  }

  html += `</body></html>\n`;
  return html;
}

function writeStatusPage(html) {
  writeFileSync(path.join(__dirname, 'index.html'), html);
}

function commitAndPush() {
  const opts = { cwd: __dirname, stdio: 'pipe' };
  try {
    const filesToAdd = ['index.html'];
    if (existsSync(CHECKPOINT_FILE)) filesToAdd.push('.state/checkpoint.json');
    execFileSync('git', ['add', ...filesToAdd], opts);
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], opts).toString().trim();
    if (!staged) {
      console.log('狀態頁與 checkpoint 皆無變化,略過 commit。');
      return;
    }
    execFileSync('git', ['commit', '-m', 'Update status page and checkpoint'], opts);
    execFileSync('git', ['push'], opts);
    console.log('已將狀態頁與 checkpoint commit 並 push。');
  } catch (err) {
    console.error('commit/push 失敗:', err.message);
  }
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
function finish(status) {
  writeStatusPage(buildStatusHtml(status));
  commitAndPush();
}

async function main() {
  const status = { typhoons: [], relevantGroups: [], trackForecasts: [], activeSystems: [], note: '', error: null };

  try {
    assertConfig();

    console.log('[1/6] 檢查中央氣象署颱風警報...');
    const typhoons = await getActiveTyphoons();
    status.typhoons = typhoons;
    if (typhoons.length > 0) {
      console.log(`偵測到警報颱風: ${typhoons.map((t) => t.nameZh).join('、')}`);
      status.trackForecasts = typhoons.map((t) => ({ nameZh: t.nameZh, cwaTrack: getCwaForecastTrack(t) }));
    }

    console.log('[1b/6] 掃描 NOAA/JTWC 現行追蹤系統(不等 CWA 正式警報,涵蓋 invest 階段)...');
    try {
      status.activeSystems = await scanActiveWesternPacificSystems();
    } catch (err) {
      // 這段只是輔助資訊,失敗不應該讓整個 routine 中斷
      console.warn('掃描 NOAA/JTWC 現行系統失敗:', err.message);
    }

    if (typhoons.length === 0) {
      status.note = status.activeSystems.length
        ? `目前無 CWA 正式颱風警報,但 NOAA/JTWC 資料顯示有 ${status.activeSystems.length} 個系統正在追蹤中(詳見下方各方預測路徑)。`
        : '目前無生效颱風警報,結束本次執行。';
      console.log(status.note);
      return;
    }

    console.log('[2/6] 讀取上次處理進度...');
    const lastCheckpoint = getLastCheckpoint();
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
      status.note = '看板最新文章中未找到與目前颱風相關的標題,結束本次執行。';
      console.log(status.note);
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
    status.relevantGroups = relevantGroups;

    if (relevantGroups.length === 0) {
      status.note = `時間窗內無新推文(已檢查 ${candidateArticles.length} 篇相關文章),結束本次執行。`;
      console.log(status.note);
      return;
    }

    console.log('[5/6] 組成摘要並寄送 Email...');
    const html = buildSummaryHtml(relevantGroups, typhoons, status.trackForecasts, status.activeSystems);
    const subject = `[颱風監控] ${typhoons.map((t) => t.nameZh).join('/')} TY_Research 專業回文彙整`;
    await sendEmail(subject, html);
    console.log(`已寄送給: ${CONFIG.RECIPIENTS.join(', ')}`);
    status.note = `已寄送摘要 email 給 ${CONFIG.RECIPIENTS.length} 位收件人。`;

    console.log('[6/6] 更新 checkpoint 進度紀錄...');
    setCheckpoint(latestPushTime);
    console.log('完成。');
  } catch (err) {
    status.error = err.message;
    throw err;
  } finally {
    finish(status);
  }
}

main().catch((err) => {
  console.error('執行失敗:', err);
  process.exit(1);
});
