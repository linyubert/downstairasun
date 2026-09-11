#!/usr/bin/env python3
"""把 src/index.tpl.html 的 __DATA_*__ 佔位符換成 base64 data URI，輸出可直接雙連開啟的 index.html。
（內嵌圖片是為了讓離線／沙箱預覽也能看到封面；assets/ 裡仍保留獨立的 jpg 方便重複使用。）"""
import base64, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
MAP = {
    "__DATA_MAIN__":  "assets/cover_main.jpg",   # 封面 A：阿順單人
    "__DATA_ALT__":   "assets/cover_alt.jpg",    # 封面 B：雙人溜樓梯
    "__DATA_THUMB__": "assets/cover_thumb.jpg",  # 角色頭像裁切
}

tpl = (ROOT / "src" / "index.tpl.html").read_text(encoding="utf-8")
for token, rel in MAP.items():
    raw = (ROOT / rel).read_bytes()
    uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    assert token in tpl, f"模板缺少佔位符 {token}"
    tpl = tpl.replace(token, uri)
    print(f"{token:16s} <- {rel} ({len(raw)/1024:.0f} KB)")

left = re.findall(r"__DATA_[A-Z]+__", tpl)
assert not left, f"還有未替換的佔位符: {left}"
out = ROOT / "index.html"
out.write_text(tpl, encoding="utf-8")
print(f"→ {out.name}  {out.stat().st_size/1024:.0f} KB")
