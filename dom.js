// 沙箱內的小型 DOM/Canvas 打樁環境：把 HTML 裡的 <script> 真的跑起來，
// 驅動多幀遊戲迴圈與 UI 事件，任何 throw / ReferenceError 都會讓程序非零退出。
const fs = require("fs"), vm = require("vm"), path = require("path");

const VERBOSE = process.env.V === "1";
const log = (...a) => VERBOSE && console.log(...a);

function makeEl(tag = "div", id = "") {
  const el = {
    tagName: (tag || "div").toUpperCase(), id, _h: {}, style: {}, children: [],
    textContent: "", innerHTML: "", disabled: false, href: "", src: "", alt: "", title: "", className: "",
    _cls: new Set(), attrs: {},
    addEventListener(t, f) { (this._h[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, ev = {}) { (this._h[t] || []).forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {}, target: this, currentTarget: this }, ev))); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; }, remove() {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; },
    focus() {}, click() { this.dispatch("click"); }, scrollIntoView() {}, blur() {},
    animate() { return { onfinish: null, cancel() {}, finish() {} }; },
    getContext() { return makeCtx(); },
    classList: null,
  };
  el.classList = {
    add: (...c) => c.forEach(x => el._cls.add(x)),
    remove: (...c) => c.forEach(x => el._cls.delete(x)),
    contains: c => el._cls.has(c),
    toggle: (c, f) => { const on = f === undefined ? !el._cls.has(c) : !!f; on ? el._cls.add(c) : el._cls.delete(c); return on; },
  };
  return el;
}

function makeCtx() {
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 400, height: 600 },
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: () => ({ width: 10 }), getImageData: () => ({ data: [] }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      t[k] = function () {};                 // 任何繪圖呼叫都變成無害 no-op
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeDoc() {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, makeEl("div", id)); return els.get(id); };
  const doc = {
    title: "", readyState: "complete",
    getElementById: get,
    createElement: tag => makeEl(tag),
    createElementNS: (ns, tag) => makeEl(tag),
    querySelector: () => null,
    querySelectorAll: () => [makeEl("button"), makeEl("button")],
    addEventListener(t, f) { (doc._h[t] ||= []).push(f); },
    _h: {},
    body: makeEl("body"), documentElement: makeEl("html"),
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
  };
  doc.head = makeEl("head");
  return doc;
}

function buildContext({ search = "", micFails = true } = {}) {
  const doc = makeDoc();
  const raf = [];
  const LS = new Map();
  const store = {
    getItem: k => (LS.has(k) ? LS.get(k) : null),
    setItem: (k, v) => LS.set(k, String(v)),
    removeItem: k => LS.delete(k),
  };
  const win = {
    devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
    localStorage: store,
    AudioContext: undefined, webkitAudioContext: undefined,
    navigator: {
      mediaDevices: { getUserMedia: () => micFails ? Promise.reject(new Error("no mic")) : Promise.resolve({ getTracks: () => [] }) },
      clipboard: { writeText: () => Promise.resolve() },
      userAgent: "node",
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ position: "relative" }),
    requestAnimationFrame: cb => { raf.push(cb); return raf.length; },
    cancelAnimationFrame: () => {},
    addEventListener(t, f) { (win._h[t] ||= []).push(f); },
    _h: {},
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 5)), clearTimeout: id => clearTimeout(id),
    URLSearchParams, performance: { now: () => win._t }, _t: 1000,
    location: { search, href: "game.html", assign() {} },
  };
  win.window = win;
  const sandbox = Object.assign(Object.create(null), win, {
    document: doc, console, Math, JSON, Date, Set, Map, Float32Array, Uint8Array, Array, Object, String, Number, Promise, Error, RegExp, isNaN, parseInt, parseFloat, performance: win.performance,
  });
  const ctx = vm.createContext(sandbox);
  return { ctx, doc, raf, win, LS, get: id => doc.getElementById(id) };
}

function extractScript(file) {
  const html = fs.readFileSync(file, "utf8");
  const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!m.length) throw new Error("找不到 <script>");
  return m.map(x => x[1]).join("\n");
}

module.exports = { buildContext, extractScript, makeEl, log, path, fs };
