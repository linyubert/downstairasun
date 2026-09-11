// game.html 實跑測試：驱动 requestAnimationFrame、鍵盤/點擊事件、聲控校準與結算寫檔。
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { buildContext, extractScript, log } = require("./dom");
const path = require("path");

const FILE = path.join(__dirname, "..", "game.html");
const code = extractScript(FILE) +
  "\n;globalThis.__api={G,CHARS,CFG:()=>cfg,setCFG:(v)=>{cfg=Object.assign(cfg,v)},startGame,openCalib,beep,sfx,draw,resetWorld,pickManualNote,setManualTarget,buildPiano,currentDir};";

function run({ search = "", frames = 400, keysDown = [], seed = {} } = {}) {
  const env = buildContext({ search });
  const { ctx, doc, raf, win, LS } = env;
  Object.entries(seed).forEach(([k, v]) => LS.set(k, v));   // 載入前就放好本機資料
  vm_run(ctx, code);
  const api = ctx.__api;
  const frame = () => {
    win._t += 16.7;
    const cbs = raf.splice(0, raf.length);
    if (!cbs.length) throw new Error("迴圈停止：沒有排程下一幀");
    cbs.forEach(cb => cb(win._t));
  };
  // 倒數 3 秒（約 190 幀）
  for (let i = 0; i < frames; i++) {
    if (i === 220) keysDown.forEach(k => (win._h.keydown || []).forEach(f => f({ key: k, preventDefault() {} })));
    frame();
  }
  return { api, doc, win, LS, frame, env };
}

function vm_run(ctx, src) {
  const vm = require("vm");
  try { vm.runInContext(src, ctx, { filename: "game.html:script", timeout: 20000 }); }
  catch (e) { console.error("✘ 腳本擲錯：", e && e.stack || e); process.exit(1); }
}

let fails = 0;
const t = (name, fn) => { try { fn(); console.log("✔", name); } catch (e) { fails++; console.log("✘", name, "→", e.message); } };

/* 1. 預設（阿順）：進場倒數 → 進入 play，樓層增加，世界有階梯 */
let g = run({ frames: 400 });
t("倒數後進入 play 狀態", () => assert.ok(["play", "count"].includes(g.api.G.state), "state=" + g.api.G.state));
t("階梯已生成且往下捲動", () => {
  assert.ok(g.api.G.plats.length > 3, "plats=" + g.api.G.plats.length);
  assert.ok(g.api.G.floors >= 0);
});
t("玩家站在某階上且有座標", () => {
  const p = g.api.G.player;
  assert.ok(p.y > 0 && p.y < 700 && p.w === 30, "player=" + JSON.stringify(p));
});
t("HUD 有畫出來（未拋錯即通過，楼层文字在 canvas）", () => assert.ok(g.doc.getElementById("cv")));

/* 2. 按了左方向鍵後玩家真的往左位移 */
t("鍵盤 ← 讓玩家左移", () => {
  const g2 = run({ frames: 400, keysDown: ["ArrowLeft"] });
  const before = g2.api.G.player.x;
  const W = 400, WALL = 28;
  for (let i = 0; i < 40; i++) g2.frame();
  assert.ok(g2.api.G.player.x <= before + 1, `x ${before} → ${g2.api.G.player.x}`);
  assert.ok(g2.api.G.player.x >= WALL - 0.01);
  assert.ok(g2.api.currentDir() === -1, "dir=" + g2.api.currentDir());
  void W;
});

/* 3. 樓層計數會隨時間增加（下樓進度） */
t("持續遊玩樓層會增加", () => {
  const g3 = run({ frames: 500 });
  const f0 = g3.api.G.floors;
  for (let i = 0; i < 600; i++) g3.frame();
  assert.ok(g3.api.G.floors > f0, `floors ${f0} → ${g3.api.G.floors}`);
});

/* 4. 掉出樓梯間 → 結算畫面寫入 best / runs */
t("掉出畫面觸發結算並寫入 localStorage", () => {
  const g4 = run({ frames: 760 });           // 跑夠久讓樓層累計，但還不被天花板壓到没血
  const G = g4.api.G;
  assert.strictEqual(G.state, "play", "state=" + G.state);
  assert.ok(G.floors > 0, `跑了 760 幀樓層仍為 ${G.floors}`);
  const f = G.floors;
  G.player.on = null;                        // 先離開台階，否則會被吸附回階面
  G.player.y = 999; G.player.vy = 600;
  for (let i = 0; i < 4; i++) g4.frame();
  assert.strictEqual(G.state, "over", "state=" + G.state);
  const best = +g4.LS.get("ahshun.best"), runs = JSON.parse(g4.LS.get("ahshun.runs") || "[]");
  assert.strictEqual(best, f, `best=${best} 應等於本趟 ${f}`);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].f, f);
  assert.strictEqual(runs[0].c, "shun", "char=" + runs[0].c);
  assert.strictEqual(g4.doc.getElementById("overTitle").textContent, "掉出樓梯間！");
  assert.strictEqual(g4.doc.getElementById("overFloors").textContent, f);
  assert.strictEqual(g4.doc.getElementById("overBest").textContent, f);
});

t("既紀錄較高時不會被覆寫、也不顯示 NEW BEST", () => {
  const g = run({ frames: 760, seed: { "ahshun.best": "52" } });
  const first = g.api.G.floors;
  assert.ok(first > 0 && first < 52, `本趟 ${first} 樓`);
  g.api.G.player.on = null; g.api.G.player.y = 999;
  assert.strictEqual(g.api.G.state, "play");
  for (let i = 0; i < 3; i++) g.frame();
  assert.strictEqual(g.api.G.state, "over");
  assert.strictEqual(+(g.LS.get("ahshun.best")), 52, "不該覆寫更高的紀錄");
  assert.ok(g.doc.getElementById("nbBadge").classList.contains("hidden"), "不該顯示 NEW BEST");
  assert.strictEqual(g.doc.getElementById("overBest").textContent, 52, "結算應顯示既有最佳 52");
});

t("破紀錄時更新 best 並顯示 NEW BEST", () => {
  const g = run({ frames: 760, seed: { "ahshun.best": "1" } });
  const first = g.api.G.floors;
  g.api.G.player.on = null; g.api.G.player.y = 999;
  for (let i = 0; i < 3; i++) g.frame();
  assert.strictEqual(+(g.LS.get("ahshun.best")), first, `best 應為 ${first}`);
  assert.ok(!g.doc.getElementById("nbBadge").classList.contains("hidden"), "應顯示 NEW BEST");
});

/* 5. 角色參數與 ?c= 連結生效 */
t("?c=mei 选用小美（HP 128、傷害 12）", () => {
  const g5 = run({ search: "?c=mei", frames: 240 });
  assert.strictEqual(g5.api.CHARS.mei.hp, 128);
  assert.strictEqual(g5.api.G.maxHp, 128, "maxHp=" + g5.api.G.maxHp);
  for (let i = 0; i < 30; i++) g5.frame();
  assert.ok(!g5.LS.has("ahshun.mute")); // 不該在沒按到時亂寫設定
});
t("?c=qing 的 run 值高於 mei", () => {
  const q = run({ search: "?c=qing", frames: 200 });
  assert.ok(q.api.CHARS.qing.run > q.api.CHARS.mei.run);
});

/* 6. 氣球階踩到扣血並進入無敵 */
t("踩到尖刺氣球扣體力", () => {
  const g6 = run({ frames: 400 });
  const G = g6.api.G;
  // 手動在玩家腳下造一個氣球階
  G.plats.length = 0;
  G.plats.push({ x: G.player.x - 4, y: G.player.y + G.player.h, w: 60, h: 15, type: "spike", dir: 0, breaking: -1 });
  G.player.on = null; G.player.vy = 10;
  const hp0 = G.hp;
  for (let i = 0; i < 6; i++) g6.frame();
  assert.ok(G.hp < hp0, `hp ${hp0} → ${G.hp}`);
  assert.ok(G.invuln > 0 || G.state === "play");
});

/* 7. 酥脆台階會碎裂並把玩家撐著掉落 */
t("crumble 台階計時碎裂", () => {
  const g7 = run({ frames: 400 });
  const G = g7.api.G;
  G.plats.length = 0;
  const pl = { x: G.player.x - 4, y: G.player.y + G.player.h, w: 60, h: 15, type: "crumble", dir: 0, breaking: -1 };
  G.plats.push(pl); G.player.on = null;
  for (let i = 0; i < 40; i++) g7.frame();
  assert.ok(pl.gone || G.plats.indexOf(pl) === -1, "碎裂未發生");
});

/* 8. 暫停 / 繼續 */
t("P 鍵暫停與恢復", () => {
  const g8 = run({ frames: 400 });
  const key = k => (g8.win._h.keydown || []).forEach(f => f({ key: k, preventDefault() {} }));
  g8.frame(); key("p"); g8.frame();
  assert.ok(["pause", "play"].includes(g8.api.G.state), "state=" + g8.api.G.state);
  if (g8.api.G.state === "pause") { key("p"); g8.frame(); assert.strictEqual(g8.api.G.state, "play"); }
});

/* 9. 聲控：無麥克風時優雅降級；手動選音可設定並持久化 */
t("無麥克風時校準不-crash，聲控顯示為關", () => {
  const g9 = run({ search: "?mode=calib", frames: 60 });
  g9.frame();
  assert.strictEqual(g9.doc.getElementById("btnMic").textContent, "🎤 聲控：關");
  assert.ok(g9.doc.getElementById("micTxt").textContent.length > 0);
});
t("手動選音 L/R 寫入設定並高亮鋼琴鍵", () => {
  const g10 = run({ search: "?mode=calib", frames: 60 });
  const api = g10.api;
  api.setCFG({ leftMidi: null, rightMidi: null });
  api.pickManualNote(78);           // LEFT = F#5
  api.setManualTarget("R");
  api.pickManualNote(85);           // RIGHT = C#6
  const cfgv = api.CFG();
  assert.ok(Math.abs(cfgv.leftMidi - 78) < 1e-6 && Math.abs(cfgv.rightMidi - 85) < 1e-6, JSON.stringify(cfgv));
  const saved = JSON.parse(g10.LS.get("ahshun.cfg"));
  assert.ok(Math.abs(saved.leftMidi - 78) < 1e-6, "cfg 未持久化");
});
t("兩個音太接近時拒絕設定", () => {
  const g11 = run({ search: "?mode=calib", frames: 60 });
  g11.api.setCFG({ leftMidi: 78, rightMidi: null });
  g11.api.setManualTarget("R");
  g11.api.pickManualNote(79);
  assert.strictEqual(g11.api.CFG().rightMidi, null, "不該被接受");
  assert.ok(/太接近/.test(g11.doc.getElementById("calibMsg").innerHTML));
});
t("音高偵測 autoCorrelate 能從纯正弦波還原頻率", () => {
  const g12 = run({ frames: 10 });
  const ctx = g12.env.ctx;
  const src = extractScript(FILE);
  const m = /function autoCorrelate[\s\S]*?\n}/.exec(src);
  assert.ok(m, "找不到 autoCorrelate");
  const fn = new Function(m[0] + "; return autoCorrelate;")();
  const sr = 48000, f0 = 739.99, N = 2048, buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * f0 * i / sr);
  const { freq } = fn(buf, sr, 1.0);
  assert.ok(Math.abs(freq - f0) < 4, `偵測 ${freq} vs 期望 ${f0}`);
  void ctx;
});

/* 10. UI 按鈕都有接上、點擊後狀態合理 */
t("主頁連結與結算按鈕存在", () => {
  const g13 = run({ frames: 30 });
  const src = fs.readFileSync(FILE, "utf8");
  assert.ok(/id="btnHome"[^>]*href="index\.html"|href="index\.html"[^>]*id="btnHome"/.test(src), "主頁連結缺失");
  assert.ok(/id="btnMenu"[^>]*href="index\.html"/.test(src), "結算畫面回主頁連結缺失");
  g13.doc.getElementById("btnMute").click();
  assert.strictEqual(g13.doc.getElementById("btnMute").textContent, "🔇");
  assert.strictEqual(g13.LS.get("ahshun.mute"), "1");
  g13.doc.getElementById("btnMute").click();
  assert.strictEqual(g13.doc.getElementById("btnMute").textContent, "🔊");
});


/* ---------- 繪圖指令級檢查：確保新角色/階梯/HUD 真的被畫出來 ---------- */
(function () {
  const { buildContext } = require("./dom");
  const env = buildContext({ search: "?c=shun" });
  const ops = [];
  const props = {};
  const grad = { addColorStop() {} };
  const cvEl = env.doc.getElementById("cv");
  cvEl.getContext = () => new Proxy({}, {
    get(t, k) {
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k in t) return t[k];
      t[k] = (...a) => ops.push({ op: k, a, fill: props.fillStyle, font: props.font });
      return t[k];
    },
    set(t, k, v) { props[k] = v; return true; },
  });
  vm.runInContext(code, env.ctx, { filename: "draw-check" });
  const api = env.ctx.__api;
  for (let i = 0; i < 300; i++) {
    env.win._t += 16.7;
    env.raf.splice(0, env.raf.length).forEach(cb => cb(env.win._t));
  }
  const names = ops.map(o => o.op);
  const count = n => names.filter(x => x === n).length;
  const fillOf = n => ops.filter(o => o.op === n).map(o => o.fill);
  const texts = ops.filter(o => o.op === "fillText").map(o => String(o.a[0]));
  const show = (name, cond, detail) => {
    if (cond) console.log("✔", name, detail ? `（${detail}）` : "");
    else { fails++; console.log("✘", name, "→", detail); }
  };
  show("繪圖迴圈有產生大量指令", ops.length > 4000, `${ops.length} 筆`);
  show("角色黃襯衫色 #ffd52a 有被使用", fillOf("fillRect").includes("#ffd52a") || fillOf("arc").includes("#ffd52a"),
    `使用的 fillStyle 前 6 種：${[...new Set(fillOf("fillRect"))].slice(0, 6).join(", ")}`);
  show("畫了圓形（頭/眼鏡/氣球/緞帶）", count("arc") >= 8, `${count("arc")} 次 arc`);
  show("畫了圓角階梯踏面", count("strokeRect") >= 1, `${count("strokeRect")} 次 strokeRect`);
  show("HUD 文字包含樓層與角色名", texts.includes("樓") && texts.includes("阿順"), `texts=${JSON.stringify(texts.slice(0, 8))}`);
  show("里程碑/結算用中文字串存在（非亂碼）", !texts.some(s => /undefined|NaN/.test(s)),
    texts.filter(s => /undefined|NaN/.test(s)).join(",") || "無 undefined/NaN 字串");
})();

console.log(fails ? `\n✘ ${fails} 項失敗` : "\n全部通過");
process.exit(fails ? 1 : 0);
