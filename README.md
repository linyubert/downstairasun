# 阿順下樓梯 ・ AH-SHUN STAIR RUSH

班級遊樂會用的單機 HTML 小遊戲：**遊戲主頁面（index.html）**＋**可玩的遊戲（game.html）**，
封面依班服照片風格生成。沿用 `模型3.html`（VOICE TOWER / 直笛聲控闖關）的引擎與音高偵測，
把主題改成「往下捲的樓梯」、角色換成胸前別紅緞帶的阿順。

## 檔案

| 路徑 | 說明 |
|---|---|
| `index.html` | **遊戲主頁面**（成品，封面已內嵌成 data URI，雙連開啟即可看） |
| `src/index.tpl.html` | 主頁面模板（`__DATA_MAIN__` 等佔位符）；改完執行 `python3 build.py` 重新輸出 `index.html` |
| `game.html` | 遊戲本體（Canvas 闖關、直笛聲控、觸控按鈕、結算） |
| `build.py` | 把 `assets/*.jpg` 以 base64 注入模板 → `index.html` |
| `assets/` | 封面原始檔：`cover_a.png`／`cover_b.png`（AI 生成原圖）、`cover_main.jpg`、`cover_alt.jpg`、`cover_thumb.jpg` |
| `test/` | `node` 跑的沙箱測試（假 DOM／假 canvas，實跑遊戲迴圈與主頁面腳本） |

## 主頁面包含什麼

`index.html`：頂部活動跑馬燈 → 封面海報（可切 A／B 兩版主視覺）＋開始按鈕與本機紀錄數字 →
**在主頁直接試玩**（按「載入」才把 `game.html` 放進 iframe，再按一次卸除）→ 玩法 4 步驟與按鍵表 →
四種階梯／三種陷阱 → 三位角色卡（數值與遊戲內 `CHARS` 一致，點了帶 `?c=` 進遊戲）→
直笛聲控說明＋「現場試吹」偵測小工具 → 本機成績表（複製／清除）→ 製作說明與 FAQ。

## 常用指令

```bash
cd ahshun
npm test                      # 遊戲 25 項 + 主頁 11 項檢查
python3 build.py              # 改過模板或封面後重建 index.html
python3 -m http.server 8000   # 開 http://localhost:8000 預覽（直笛聲控需要 HTTPS/localhost）
```

## 操作

* 鍵盤：`← →` 或 `A / D`；暫停 `P` 或 `Esc`；結束後 `Enter`／`空白` 再来一局。
* 手機：畫面左右兩個圓鈕。
* 直笛聲控：`game.html?mode=calib` 錄兩個音（預設 升Fa F#5 ＝左、升Do C#6 ＝右），
  或小鋼琴手動選音；無麥克風時自動退回鍵盤模式，不會當。

## 成績

`localStorage`：`ahshun.best`（最高樓層）、`ahshun.runs`（最近 20 趟，含角色）、
`ahshun.cfg`（聲控設定）、`ahshun.mute`。主頁與遊戲共用同一組 key，
所以玩完回主頁（`pageshow`）成績表會自動更新。沙箱／無同域權限的環境會自動改用記憶體暫存，不會拋錯。

## 想調難度／換角色

`game.html` 內：

* `CHARS`：三位角色的 `run`（移動速度）、`hp`（體力）、`dmg`（氣球傷害）、配色與髮型。
* `randGap()`：階梯間距；`spawnPlat()`：各種危機出現率。
* `update()` 裡的 `G.speed=56+Math.min(G.floors*1.05,120)`：捲動速度曲線。
* `drawPlayer()`／`drawPlat()`：角色與階梯的画法（階梯＝石階＋草、氣球＝黑色尖刺、電扶梯、酥脆階）。


