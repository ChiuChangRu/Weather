document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      panels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // 把整頁(HTML/CSS/JS/圖片)打包成單一離線 HTML 檔下載,方便分享——
  // 不靠使用者手動存整個資料夾,單一檔案雙擊就能開,不需要網路。
  const downloadBtn = document.getElementById('btn-download-page');
  const downloadStatus = document.getElementById('download-status');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      downloadBtn.disabled = true;
      downloadStatus.textContent = '打包中…';
      try {
        const bust = `?v=${Date.now()}`;
        const scripts = ['main.js', 'chem.js', 'presets.js', 'app.js', 'quiz.js'];
        const files = ['index.html', 'style.css', 'pauling.svg', ...scripts];
        const texts = await Promise.all(
          files.map((f) =>
            fetch(f + bust).then((r) => {
              if (!r.ok) throw new Error(`讀取 ${f} 失敗(${r.status})`);
              return r.text();
            })
          )
        );
        const src = Object.fromEntries(files.map((f, i) => [f, texts[i]]));
        const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(src['pauling.svg'])));
        // 內嵌的 JS 檔案內容如果剛好含有「</script」字樣(例如這個檔案自己的這段打包程式碼),
        // HTML 剖析器會把它當成 script 標籤提前結束,後面的程式碼就整個被切斷——escape 掉才安全
        const escapeScriptClose = (s) => s.replace(/<\/script/gi, '<\\/script');
        let out = src['index.html'];
        out = out.replace(/<link rel="stylesheet" href="style\.css[^"]*"\s*\/>/, () => `<style>\n${src['style.css']}\n</style>`);
        out = out.replace(/src="pauling\.svg"/, () => `src="${svgDataUri}"`);
        scripts.forEach((f) => {
          const re = new RegExp(`<script src="${f.replace('.', '\\.')}[^"]*"><\\/script>`);
          out = out.replace(re, () => `<script>\n${escapeScriptClose(src[f])}\n</script>`);
        });
        const blob = new Blob([out], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '化學鍵結互動教學.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        downloadStatus.textContent = '下載完成!這是單一 HTML 檔,離線雙擊也能開啟,方便分享給其他人。';
      } catch (err) {
        downloadStatus.textContent = `下載失敗:${err.message}`;
      } finally {
        downloadBtn.disabled = false;
      }
    });
  }
});
