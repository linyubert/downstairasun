// index.html（主頁面）實跑測試：腳本初始化、封面切換、成績渲染、角色卡、複製/清除、試吹降級。
const assert = require("assert");
const fsx = require("fs");
const path = require("path");
const vm = require("vm");
const { buildContext, extractScript } = require("./dom");

const FILE = path.join(__dirname, "..", "index.html");
const code = extractScript(FILE) + "\n;globalThis.__api={covers,CHARS,runs,renderBoard,setCover};";

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const run = async () => {
  let fails = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("✔", name); }
    catch (e) { fails++; console.log("✘", name, "→", (e && e.message) || e); }
  }
  console.log(fails ? `\n✘ ${fails} 項失敗` : "\n全部通過");
  process.exit(fails ? 1 : 0);
};

function boot(seed = {}) {
  const env = buildContext({ search: "" });
  Object.entries(seed).forEach(([k, v]) => env.LS.set(k, v));
  try { vm.runInContext(code, env.ctx, { filename: "index.html:script", timeout: 15000 }); }
  catch (e) { console.error("✘ index 腳本擲錯：\n", (e && e.stack) || e); process.exit(1); }
  return env;
}

const env = boot();

t("腳本可在無本機紀錄的情況下完成初始化", () => {
  assert.strictEqual(env.doc.getElementById("sBest").textContent, 0);
  assert.ok(/還沒有紀錄/.test(env.doc.getElementById("boardBody").innerHTML), "空表應提示先玩一趟");
});

t("角色卡渲染出 3 位角色與 game.html 連結", () => {
  const html = env.doc.getElementById("charGrid").innerHTML;
  ["阿順", "阿青", "小美"].forEach(n => assert.ok(html.includes(n), `缺少 ${n}`));
  ["shun", "qing", "mei"].forEach(id => assert.ok(html.includes(`game.html?c=${id}`), `缺少連結 ${id}`));
  assert.ok(html.includes("<svg"), "角色 SVG 未產生");
});

t("兩張封面都成功內嵌為 data URI（沙箱預覽不吃外部圖檔）", () => {
  const { covers } = env.ctx.__api;
  for (const k of ["A", "B"]) {
    assert.ok(covers[k].startsWith("data:image/jpeg;base64,"), `${k} 不是 data URI`);
    assert.ok(covers[k].length > 20000, `${k} base64 過短：${covers[k].length}`);
  }
  const html = fsx.readFileSync(FILE, "utf8");
  assert.ok(/id="coverImg" src="data:image\/jpeg;base64,/.test(html), "初始 <img> 沒嵌進 data URI");
  assert.ok(!/__DATA_/.test(html), "還有未替換的佔位符");
});

t("點 B 可切換封面並更新 alt 文字", () => {
  env.doc.getElementById("covB").click();
  const img = env.doc.getElementById("coverImg");
  assert.strictEqual(img.src, env.ctx.__api.covers.B);
  assert.ok(/封面 B/.test(img.alt), img.alt);
  env.doc.getElementById("covA").click();
  assert.strictEqual(env.doc.getElementById("coverImg").src, env.ctx.__api.covers.A);
});

t("試吹麥克風被拒時優雅降級（不 throw）", async () => {
  env.doc.getElementById("micTry").click();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const s = env.doc.getElementById("micState").textContent;
  assert.ok(/無法取得麥克風/.test(s), "state=" + s);
});

t("成績渲染與清除", () => {
  env.LS.set("ahshun.best", "77");
  env.LS.set("ahshun.runs", JSON.stringify([{ f: 77, c: "qing", t: Date.now() }, { f: 12, c: "mei", t: Date.now() }]));
  env.ctx.__api.renderBoard();
  assert.strictEqual(String(env.doc.getElementById("sBest").textContent), "77");
  assert.strictEqual(env.doc.getElementById("sRuns").textContent, 2);
  const html = env.doc.getElementById("boardBody").innerHTML;
  assert.ok(/77 樓/.test(html) && /阿青/.test(html) && /<table/.test(html), "成績表內容不符");
  env.doc.getElementById("btnClear").click();
  assert.strictEqual(env.LS.get("ahshun.best"), "0");
  assert.ok(/還沒有紀錄/.test(env.doc.getElementById("boardBody").innerHTML));
});

t("複製成績按鈕可用", async () => {
  env.LS.set("ahshun.best", "42");
  env.ctx.__api.renderBoard();
  env.doc.getElementById("btnCopy").click();
  await new Promise(r => setImmediate(r));
  assert.ok(env.doc.getElementById("_toast"), "應出現 toast 提示");
  assert.ok(/42 樓/.test(env.doc.getElementById("_toast").textContent), env.doc.getElementById("_toast").textContent);
});

t("壞掉的 runs 資料不會讓主頁掛掉", () => {
  const e2 = boot({ "ahshun.runs": "{不是 JSON" });
  assert.ok(/還沒有紀錄/.test(e2.doc.getElementById("boardBody").innerHTML));
});

t("與 game.html 共用同一組 localStorage key", () => {
  const game = fsx.readFileSync(path.join(__dirname, "..", "game.html"), "utf8");
  const g = /const K_BEST="([^"]+)",\s*K_RUNS="([^"]+)"/.exec(game);
  const i = /const K_BEST="([^"]+)",\s*K_RUNS="([^"]+)"/.exec(extractScript(FILE));
  assert.ok(g && i, "找不到兩邊的 key 定義");
  assert.deepStrictEqual([i[1], i[2]], [g[1], g[2]], `game:${g[1]}/${g[2]} vs index:${i[1]}/${i[2]}`);
});

t("主頁所有內部連結都指向存在的檔案／錨點", () => {
  const html = fsx.readFileSync(FILE, "utf8");
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !h.startsWith("data:") && !h.startsWith("http"));
  const root = path.join(__dirname, "..");
  const targets = [...new Set(hrefs.map(h => h.split("?")[0].split("#")[0]).filter(Boolean))];
  targets.forEach(tp => tp.endsWith(".html") && assert.ok(fsx.existsSync(path.join(root, tp)), `檔案不存在：${tp}`));
  const anchors = [...new Set(hrefs.filter(h => h.startsWith("#")).map(h => h.slice(1)))];
  anchors.forEach(a => assert.ok(new RegExp(`id="${a}"`).test(html), `錨點不存在：#${a}`));
  assert.ok(targets.length >= 1, "找不到內部檔案連結");
  assert.ok(anchors.length >= 5, `錨點太少：${anchors.length}`);
});

t("離線可開：除 Google Fonts 外無外部相依", () => {
  const html = fsx.readFileSync(FILE, "utf8");
  const ext = [...html.matchAll(/(?:src|href)="https?:\/\/[^"]+"/g)].map(m => m[0]);
  const nonFont = ext.filter(s => !/fonts\.(googleapis|gstatic)\.com/.test(s));
  assert.strictEqual(nonFont.length, 0, "非字型的外部相依：" + nonFont.join(", "));
});

t("主頁「載入試玩」會把 game.html 放進 iframe，再按一次卸除", () => {
  const get = id => env.doc.getElementById(id);
  get("btnEmbed").click();
  assert.strictEqual(get("frame").src, "game.html?c=shun", "iframe src=" + get("frame").src);
  assert.ok(!get("stage").classList.contains("hidden"), "舞台應該顯示");
  assert.strictEqual(get("btnEmbed").textContent, "■ 收起遊戲");
  assert.ok(/已載入/.test(get("stageHint").textContent), get("stageHint").textContent);
  get("btnEmbed").click();
  assert.strictEqual(get("frame").src, "about:blank", "收起後應卸載遊戲");
  assert.ok(get("stage").classList.contains("hidden"), "舞台應該收起");
  assert.ok(/已暫停/.test(get("stageHint").textContent));
});

t("新板块都有對應的錨點與 aria 標題", () => {
  assert.ok(env.doc.getElementById("h-play"), "試玩區標題");
  const html = fsx.readFileSync(FILE, "utf8");
  assert.ok(/id="play"[^]*aria-labelledby="h-play"/.test(html) || /aria-labelledby="h-play"/.test(html));
});

run();
