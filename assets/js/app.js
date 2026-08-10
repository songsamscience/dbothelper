/* =========================================================
   송쌤과학 디벗 업무 도우미 — app.js
   해시 라우팅(#/id) 사용 → GitHub Pages에서 별도 설정 없이 동작
   ========================================================= */
(function () {
  'use strict';

  const PAGES = window.PAGES || [];
  const LS_THEME = 'debut.theme';
  const LS_CHECK = 'debut.check';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  /* =========================================================
     저장소 — 입력한 내용은 이 브라우저 안(localStorage)에만 남는다.
     서버가 없으므로 사용자가 브라우저 데이터를 직접 지우지 않는 한
     내용이 사라지지 않아야 한다. 그래서 두 가지를 한다.

     ① 저장 공간을 「영구 보관」으로 요청한다 (navigator.storage.persist).
        요청하지 않으면 브라우저는 이 사이트 데이터를 「지워도 되는 것」으로 보고
        디스크가 부족할 때 말없이 비운다. 승인되면 그 대상에서 빠진다.
     ② 저장에 실패하면 조용히 넘기지 않고 화면에 알린다.
        예전에는 setItem 을 try/catch 로 감싸 그냥 삼켰기 때문에,
        시크릿 창이나 저장 공간이 꽉 찬 상태에서는 다 적어 넣은 내용이
        저장되지 않는데도 사용자는 끝까지 알 수 없었다.
     ========================================================= */

  // 이 브라우저에서 저장이 되기는 하는지 먼저 확인 (시크릿 창·쿠키 차단 감지)
  const LS_LIVE = (function () {
    try {
      const k = '__debut_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  let stBarShown = '';
  function stBar(kind) {
    if (stBarShown === kind) return;
    stBarShown = kind;
    const old = document.getElementById('stBar');
    if (old) old.remove();
    const msg = kind === 'quota'
      ? '<b class="st-t">저장 공간이 가득 차 더 저장하지 못했습니다</b>' +
        '<span class="st-b">지금 입력한 내용이 <b>저장되지 않았습니다.</b> ' +
        '<a href="#/setup">학교 정보</a>에서 <b>전체 백업 내려받기</b>로 백업한 뒤, ' +
        '브라우저에서 다른 사이트의 저장 데이터를 정리해 주세요.</span>'
      : '<b class="st-t">입력한 내용이 저장되지 않고 있습니다</b>' +
        '<span class="st-b">브라우저가 이 사이트의 저장을 막고 있습니다 — ' +
        '<b>시크릿(비공개) 창</b>이거나 쿠키·사이트 데이터가 차단된 상태입니다. ' +
        '<b>창을 닫으면 지금까지 적은 내용이 모두 사라집니다.</b> ' +
        '일반 창에서 다시 열어 주세요.</span>';
    const bar = document.createElement('div');
    bar.id = 'stBar';
    bar.className = 'st-bar';
    bar.setAttribute('role', 'alert');
    bar.innerHTML = '<span class="st-em">⚠️</span><div class="st-wrap">' + msg + '</div>' +
                    '<button type="button" class="st-x" aria-label="닫기">✕</button>';
    bar.querySelector('.st-x').addEventListener('click', () => bar.remove());
    document.body.appendChild(bar);
  }

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch (e) {
      /* 이름은 브라우저마다 다르다 — 크롬 QuotaExceededError,
         사파리 QUOTA_EXCEEDED_ERR, 파이어폭스 NS_ERROR_DOM_QUOTA_REACHED */
      const n = (e && (e.name || '')) + ' ' + (e && (e.code || ''));
      stBar(!LS_LIVE ? 'blocked' : /Quota|QUOTA|22|1014/.test(n) ? 'quota' : 'blocked');
      return false;
    }
  }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }

  /* 저장 공간을 「영구 보관」으로 요청한다.
     크롬 계열은 사이트를 어느 정도 써 봐야 승인하므로 처음 조작할 때 한 번 더 묻는다. */
  let persistAsked = false;
  function askPersist() {
    if (persistAsked || !LS_LIVE) return;
    const st = navigator.storage;
    if (!st || !st.persist) return;
    persistAsked = true;
    Promise.resolve(st.persisted ? st.persisted() : false)
      .then(ok => (ok ? true : st.persist()))
      .then(ok => { if (!ok) persistAsked = false; })   // 거절되면 다음 조작 때 다시
      .catch(() => { persistAsked = false; });
  }
  if (!LS_LIVE) {
    // 저장이 아예 막힌 상태는 무언가 적기 전에 미리 알려야 의미가 있다
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => stBar('blocked'), { once: true });
    } else { stBar('blocked'); }
  } else {
    askPersist();
    ['pointerdown', 'keydown'].forEach(ev =>
      window.addEventListener(ev, askPersist, { passive: true }));
  }

  /* ---------- 통째로 백업하고 되살리기 ----------
     「영구 보관」요청은 브라우저가 거절할 수도 있고, 사용자가 인터넷 사용 기록을
     지우면 어차피 함께 지워진다. 그래서 파일로 내보내는 길을 하나 열어 둔다.
     예전에는 학교 정보(debut.profile) 하나만 담았지만, 실제로 사용자가 적어 넣은
     내용은 생성기·체크리스트에도 흩어져 있으므로 debut. 로 시작하는 키를 모두 담는다. */
  const BK_PREFIX = 'debut.';
  function bkKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(BK_PREFIX) === 0) out.push(k);
      }
    } catch (e) {}
    return out.sort();
  }
  function bkDump() {
    const data = {};
    bkKeys().forEach(k => { data[k] = lsGet(k); });
    return { _debut: 1, saved: new Date().toISOString(), data: data };
  }
  /* 되살리기 — 새 형식({_debut, data})과 예전 학교 정보 전용 파일을 모두 받는다.
     돌려주는 값은 되살린 키 개수(0이면 형식이 맞지 않는 파일). */
  function bkRestore(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    if (obj._debut && obj.data && typeof obj.data === 'object') {
      let n = 0;
      Object.keys(obj.data).forEach(k => {
        if (k.indexOf(BK_PREFIX) !== 0) return;          // 남의 키는 건드리지 않는다
        const v = obj.data[k];
        if (typeof v === 'string' && lsSet(k, v)) n++;
      });
      return n;
    }
    // 예전 형식: 학교 정보 값이 그대로 들어 있는 객체
    pfSet(obj);
    return 1;
  }

  /* ---------- 체크리스트 저장 ---------- */
  function loadChecks() {
    try { return JSON.parse(lsGet(LS_CHECK) || '{}'); }
    catch (e) { return {}; }
  }
  function saveChecks(obj) { lsSet(LS_CHECK, JSON.stringify(obj)); }
  let CHECKS = loadChecks();

  /* ---------- 체크리스트 통계 ---------- */
  function pageCheckItems(page) {
    let n = 0;
    (page.blocks || []).forEach(b => { if (b.t === 'checklist') n += (b.items || []).length; });
    return n;
  }
  function pageCheckDone(page) {
    let n = 0;
    (page.blocks || []).forEach((b, bi) => {
      if (b.t !== 'checklist') return;
      (b.items || []).forEach((_, ii) => { if (CHECKS[page.id + ':' + bi + ':' + ii]) n++; });
    });
    return n;
  }
  function pageProgress(page) {
    const total = pageCheckItems(page);
    if (!total) return null;
    return { done: pageCheckDone(page), total: total, pct: Math.round(pageCheckDone(page) / total * 100) };
  }

  /* ---------- 송쌤과학 채널 버튼 ---------- */
  function renderSocial() {
    // data.js의 const SOCIAL 은 window의 속성이 아니라 전역 변수다
    const S = (typeof SOCIAL !== 'undefined' && SOCIAL) || {};
    [['#snsYt', S.youtube], ['#snsIg', S.instagram]].forEach(pair => {
      const el = $(pair[0]);
      if (!el) return;
      const url = String(pair[1] || '').trim();
      if (url) { el.href = url; el.hidden = false; }
      else { el.removeAttribute('href'); el.hidden = true; }   // 주소가 없으면 숨긴다
    });
  }

  /* ---------- 유틸 ---------- */
  function extOf(path) {
    const m = String(path || '').match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : 'file';
  }
  function fileName(path) {
    return String(path || '').split('/').pop();
  }
  const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16"/></svg>';
  const ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  const ICON_CK = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';

  /* =========================================================
     문서 생성 공통 엔진 (포스터 · 반납증에서 함께 사용)
     ========================================================= */
  const RG = {};   // 포스터 생성기 상태
  const RT = {};   // 반납증 생성기 상태
  const WF = {};   // 와이파이 안내문 생성기 상태
  const CB = {};   // 충전함 안내문 생성기 상태
  const CS = {};   // 개인정보 동의서 생성기 상태
  const ED = {};   // 교육자료 생성기 상태

  /* =========================================================
     학교 기본 정보 — 사이트 전체가 함께 쓰는 전역 설정
     ========================================================= */
  const PF_KEY = 'debut.profile';
  /* wifiMode 를 여기서 정해 두지 않으면 「학교 정보」 화면은 첫 버튼(학교 전체가 같음)이
     눌린 것처럼 보이는데 와이파이 생성기는 many 로 시작해 둘이 어긋난다. */
  const PF_DEFAULT = { school: '○○중학교', dept: '과학정보부', wifiMode: 'many' };

  function pfGet() {
    let p = Object.assign({}, PF_DEFAULT);
    try {
      const saved = JSON.parse(lsGet(PF_KEY) || 'null');
      if (saved) p = Object.assign(p, saved);
    } catch (e) {}
    return p;
  }
  function pfSet(patch) {
    const p = Object.assign(pfGet(), patch);
    lsSet(PF_KEY, JSON.stringify(p));
    return p;
  }
  // 값이 있을 때만 반환 (비어 있으면 자료에서 자동으로 빠짐)
  const pfv = (p, k) => (p[k] || '').trim();

  /* 「학교 정보」에서 문의처로 쓸 만한 값을 골라 준다 —
     각 생성기의 “문의처” 칸을 미리 채우는 데 쓴다. */
  function pfContact(p) {
    const o = p || pfGet();
    return pfv(o, 'report1') || pfv(o, 'tel') || pfv(o, 'teacher') || pfv(o, 'dept') || '';
  }

  /* 꼬리말 「문의 : …」 한 줄 — 부서명과 문의처가 같으면 두 번 쓰지 않는다
     (문의처를 안 채우면 pfContact()가 부서명을 돌려주므로 그대로 두면 겹친다) */
  function contactLine(st) {
    const seen = [];
    [st.dept, st.contact].forEach(v => {
      const t = String(v || '').trim();
      if (t && seen.indexOf(t) < 0) seen.push(t);
    });
    return seen.join(' · ') || '학교 담당 부서';
  }

  /* 생성기의 「문의처」 칸 — 사용자가 손대기 전까지는 「학교 정보」를 계속 따라간다.
     한 번이라도 직접 고치면 st.contactEdited 가 켜지고 그 값을 지킨다. */
  function pfSyncContact(st, pf) {
    if (st.contactEdited) return st.contact;
    return pfContact(pf) || st.contact || '';
  }

  // "a | b | c" 여러 줄 → [[a,b,c], ...]
  function pfRows(text) {
    return String(text || '').split('\n')
      .map(l => l.trim()).filter(Boolean)
      .map(l => l.split('|').map(c => c.trim()));
  }

  const DOC_FONT =
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;700;800&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">';

  function docShell(title, css, body) {
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
           '<meta name="viewport" content="width=device-width,initial-scale=1">' +
           '<title>' + title + '</title>' + DOC_FONT +
           '<style>' + css + '</style></head><body>' + body + '</body></html>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 미리보기 iframe을 컨테이너 폭(과 최대 높이)에 맞춰 축소
  function fitFrame(frameId, baseW, baseH) {
    const f = document.getElementById(frameId);
    if (!f) return;
    const box = f.parentNode;
    const avail = box.clientWidth;
    if (!avail) return;
    const maxH = Math.max(360, Math.min(680, window.innerHeight - 180));
    const scale = Math.min(1, avail / baseW, maxH / baseH);
    f.style.width = baseW + 'px';
    f.style.height = baseH + 'px';
    f.style.transform = 'scale(' + scale + ')';
    box.style.height = Math.round(baseH * scale) + 'px';
  }

  function printFrame(frameId) {
    const f = document.getElementById(frameId);
    if (!f || !f.contentWindow) return;
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } catch (e) {
      const w = window.open('', '_blank');
      if (w) { w.document.write(f.getAttribute('srcdoc')); w.document.close(); }
    }
  }

  function downloadDoc(filename, html) {
    const blob = new Blob(['﻿', html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* =========================================================
     워드(.docx) 생성 — 외부 라이브러리 없이 ZIP + WordprocessingML
     ========================================================= */
  const CRC_TBL = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TBL[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // 압축 없이(store) ZIP 만들기
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

    files.forEach(f => {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + data.length;
    });

    let cdSize = 0;
    central.forEach(c => { cdSize += c.length; });
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true);
    eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
    eo.setUint32(12, cdSize, true); eo.setUint32(16, offset, true);

    const all = parts.concat(central, [new Uint8Array(eo.buffer)]);
    let total = 0;
    all.forEach(a => { total += a.length; });
    const out = new Uint8Array(total);
    let pos = 0;
    all.forEach(a => { out.set(a, pos); pos += a.length; });
    return out;
  }

  const xesc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  /* U+00A0(줄바꿈 없는 공백)은 일부러 넣은 것이므로 그대로 둔다 —
     「(서명 또는 인)」이 줄 끝에서 잘리지 않게 붙여 두는 데 쓴다.
     원본 HTML의 &nbsp; 는 앞서 inlineRuns()에서 이미 보통 공백으로 합쳐진다. */

  const W_FONT = '맑은 고딕';

  /* ---------------------------------------------------------
     인쇄용 HTML → 블록 목록 (워드·한글이 함께 쓰는 중간 표현)
       run    { t:'글자', b, sz, color, u }   ·   { br:true } 줄 바꿈
       block  { k:'p',   runs:[run], o:{align,shd,border,before,after,ind,hang} }
              { k:'tbl', rows:[{ cells:[{ head, runs }] }] }
              { k:'pb' }  쪽 나눔
     sz·before·after·ind 는 워드 단위(sz는 1/2pt, 나머지는 1/20pt)를 그대로 쓰고,
     한글 쪽에서 HWPUNIT으로 바꾼다.
     --------------------------------------------------------- */
  function iRun(text, o) {
    if (!text) return [];
    return [Object.assign({ t: text }, o || {})];
  }
  const iBr = () => [{ br: true }];

  // 인라인 태그(b, strong, em, code…)를 굵기만 살려 run 목록으로
  function inlineRuns(node, base) {
    base = base || {};
    let out = [];
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        const t = n.nodeValue.replace(/\s+/g, ' ');
        if (t.trim() || t === ' ') out = out.concat(iRun(t, base));
      } else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        const cl = ' ' + (n.className || '') + ' ';
        const o = Object.assign({}, base);
        if (tag === 'b' || tag === 'strong') o.b = true;
        if (tag === 'code') o.color = '0F6FB8';

        if (tag === 'br') { out = out.concat(iBr()); return; }
        // <small>은 줄을 바꿔서 표시 (표지 부서명 등)
        if (tag === 'small') { out = out.concat(iBr(), inlineRuns(n, base)); return; }
        // 하단 배너 둘째 줄
        if (tag === 'i' && (' ' + (n.parentNode.className || '') + ' ').indexOf(' ft-tx ') >= 0) {
          out = out.concat(iBr(), inlineRuns(n, base)); return;
        }
        // 표 머리글 안의 ※ 단서는 줄을 내려서 작게
        if (tag === 'em' && n.parentNode.tagName && n.parentNode.tagName.toLowerCase() === 'th') {
          out = out.concat(iBr(),
                           inlineRuns(n, Object.assign({}, base,
                                      { b: false, sz: Math.max(15, (base.sz || 18) - 2), color: '555555' })));
          return;
        }
        /* 「(서명 또는 인)」이 줄 끝에서 「는 인)」처럼 잘리지 않게 사이 공백을 묶는다.
           서명란에서는 본문보다 한 호 작게 — 한 줄에 두 사람을 넣어도 넘치지 않는다. */
        if (tag === 'em' && (n.textContent || '').indexOf('(') === 0) {
          const inSrow = (' ' + (n.parentNode.className || '') + ' ').indexOf(' srow ') >= 0;
          const eo = inSrow ? Object.assign({}, base, { sz: Math.max(16, (base.sz || 20) - 3) }) : base;
          out = out.concat(iRun((n.textContent || '').replace(/\u0020/g, '\u00a0'), eo));
          if (inSrow) out = out.concat(iRun('\u3000', base));
          return;
        }

        /* 빈 칸(.ln) — 밑줄 문자(_)를 늘어놓아 만든다.
           한글·워드는 「문단 맨 끝에 붙은 공백」에는 밑줄을 그리지 않는다.
           그래서 예전처럼 전각 공백에 밑줄을 입힐 때는 「이름 : ____」처럼
           칸이 줄 끝에 오는 자리에서만 줄이 통째로 사라졌다.
           _ 는 글자라서 어디에 놓이든 그대로 그려지고 서로 빈틈없이 이어진다.
           _ 한 글자는 한글 한 글자의 절반 폭 — 두 개가 한 칸이다.
           w1(학년·반·번)은 두 자리, w2(서명)·w3(성명)은 손글씨가 들어갈 만큼. */
        if (cl.indexOf(' ln ') >= 0) {
          const cells = cl.indexOf(' w3 ') >= 0 ? 20 : cl.indexOf(' w2 ') >= 0 ? 14 : 7;
          out = out.concat(iRun('_'.repeat(cells), base));
          return;
        }

        /* 한 줄에 두 사람을 앉힐 때 사이를 벌리는 빈 칸(.gap) */
        if (cl.indexOf(' gap ') >= 0) {
          out = out.concat(iRun('　　', base));
          return;
        }

        /* 표 칸 안의 「항목 : 값」 한 줄(.f) — 이름과 값이 붙어 나오지 않게 나눈다 */
        if (cl.indexOf(' f ') >= 0) {
          const lb = n.querySelector('b'), vl = n.querySelector('span');
          if (out.length) out = out.concat(iBr());
          out = out.concat(
            lb ? iRun(lb.textContent + ' : ', Object.assign({}, base, { b: true })) : [],
            vl ? inlineRuns(vl, base) : (lb ? [] : inlineRuns(n, base)));
          return;
        }
        /* div·p 같은 덩어리는 앞 내용과 줄을 나눠 준다 (표 칸 안의 여러 줄) */
        if ((tag === 'div' || tag === 'p') && out.length &&
            !(out[out.length - 1] || {}).br) {
          out = out.concat(iBr());
        }

        out = out.concat(inlineRuns(n, o));
        // 체크 항목(.cb)은 서로 붙지 않게 간격
        if (cl.indexOf(' cb ') >= 0) out = out.concat(iRun('      ', base));
        // 꼬리말·표지의 span들 사이 간격
        const pcl = ' ' + (n.parentNode.className || '') + ' ';
        if (tag === 'span' && (pcl.indexOf(' foot ') >= 0 || pcl.indexOf(' ph ') >= 0)) {
          out = out.concat(iRun('        ', base));
        }
        // 서명란 사이 간격
        if (tag === 'em' && (' ' + (n.parentNode.className || '') + ' ').indexOf(' srow ') >= 0) {
          out = out.concat(iRun('　　', base));
        }
      }
    });
    return out;
  }

  /* 칸에 들어갈 글자 수로 열 너비를 나눈다 — 항목/설명 표가 반반으로 갈리지 않게.
     한 열이 지나치게 좁거나 넓어지지 않도록 위아래로 묶고, 합이 1이 되게 맞춘다. */
  function colRatios(rows, cols) {
    const len = new Array(cols).fill(1);
    rows.forEach(r => {
      for (let i = 0; i < cols; i++) {
        const c = r.cells[i];
        if (!c) continue;
        const n = c.runs.reduce((a, x) => a + (x.t ? x.t.length : 0), 0);
        if (n > len[i]) len[i] = n;
      }
    });
    const even = 1 / cols;
    const lo = even * 0.5, hi = even * 2.4;
    const sum = len.reduce((a, b) => a + b, 0);
    let w = len.map(n => Math.min(hi, Math.max(lo, n / sum)));
    const t = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / t);
  }

  function tblBlock(tblEl) {
    const rows = Array.prototype.slice.call(tblEl.querySelectorAll('tr'));
    if (!rows.length) return null;
    /* 손으로 읽고 체크하는 양식 표(.big)는 자료용 표보다 한 호 크게 —
       반납 확인서처럼 표가 본문인 문서에서 글자가 작아 보이지 않게 한다 */
    const sz = (' ' + (tblEl.className || '') + ' ').indexOf(' big ') >= 0 ? 21 : 18;
    const out = rows.map(tr => ({
      cells: Array.prototype.slice.call(tr.children).map(td => {
        const head = td.tagName.toLowerCase() === 'th';
        return { head: head, runs: inlineRuns(td, { b: head, sz: sz }) };
      })
    }));
    let cols = 1;
    out.forEach(r => { if (r.cells.length > cols) cols = r.cells.length; });
    return { k: 'tbl', cols: cols, w: colRatios(out, cols), rows: out };
  }

  /* 생성된 인쇄용 HTML → 블록 목록 */
  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pages = Array.prototype.slice.call(doc.querySelectorAll('.page'));
    const roots = pages.length ? pages : [doc.body];
    const B = [];
    const P = (runs, o) => { B.push({ k: 'p', runs: runs || [], o: o || {} }); };

    roots.forEach((page, pi) => {
      if (pi) B.push({ k: 'pb' });

      // 포스터형 표지(.hd)
      const hd = page.querySelector('.hd');
      if (hd) {
        const sm = hd.querySelector('.hd-sm'), tt = hd.querySelector('.hd-tt');
        if (sm) P(inlineRuns(sm, { sz: 22, color: '5A6674' }), { align: 'center' });
        if (tt) P(inlineRuns(tt, { b: true, sz: 56, color: '0F6FB8' }), { align: 'center', after: 200 });
      }

      // 안내서 표지
      const cs = page.querySelector('.cs'), ct = page.querySelector('.ct'),
            cd = page.querySelector('.cd'), cf = page.querySelector('.cf');
      if (ct) {
        P(inlineRuns(cs || doc.createElement('i'), { b: true, sz: 24, color: '0F6FB8' }), { align: 'center', before: 1200 });
        P(inlineRuns(ct, { b: true, sz: 64 }), { align: 'center', after: 240 });
        if (cd) P(inlineRuns(cd, { sz: 22, color: '5A6674' }), { align: 'center', after: 600 });
        if (cf) P(inlineRuns(cf, { b: true, sz: 30 }), { align: 'center' });
      }

      // 문서 머리글
      const ph = page.querySelector('.ph');
      if (ph) {
        const b = ph.querySelector('b');
        P(inlineRuns(b || ph, { b: true, sz: 32, color: '0F6FB8' }), { after: 160 });
      }

      // 반납 확인서 제목
      const h1 = page.querySelector('h1');
      if (h1) P(inlineRuns(h1, { b: true, sz: 36, u: true }), { align: 'center', after: 100 });
      const sub = page.querySelector('.sub');
      if (sub) P(inlineRuns(sub, { sz: 22 }), { align: 'center', after: 260 });
      /* 손으로 적는 칸이므로 줄 사이를 넉넉히 띄운다 —
         학년·반·번 아래 이름 칸이 눌리지 않게 두 줄 사이를 특히 벌린다 */
      page.querySelectorAll('.who > div').forEach(w => {
        P(inlineRuns(w, { sz: 24 }), { align: 'right', before: 200, after: 200 });
      });

      // 본문 블록
      const walk = el => {
        Array.prototype.slice.call(el.children).forEach(n => {
          const cl = n.className || '', tag = n.tagName.toLowerCase();
          const c = ' ' + cl + ' ';
          if (tag === 'table') {
            const t = tblBlock(n);
            if (t) { B.push(t); P([], { after: 80 }); }
            return;
          }

          // 공문 서식(계획안·심의안) 요소
          if (c.indexOf(' doc-h ') >= 0) {
            P(inlineRuns(n, { b: true, sz: 40 }), { align: 'center', before: 200, after: 80 });
            return;
          }
          if (c.indexOf(' doc-sub ') >= 0) {
            P(inlineRuns(n, { b: true, sz: 26 }), { align: 'center', after: 260 });
            return;
          }
          if (c.indexOf(' meta ') >= 0) {
            P(inlineRuns(n, { sz: 21 }), { align: 'right', after: 240 });
            return;
          }
          if (c.indexOf(' h1n ') >= 0) {
            const em = n.querySelector('em'), b = n.querySelector('b');
            P(iRun((em ? em.textContent + '. ' : ''), { b: true, sz: 28, color: '0F6FB8' })
                .concat(b ? inlineRuns(b, { b: true, sz: 28 }) : []),
              { before: 240, after: 100 });
            return;
          }
          if (c.indexOf(' h2n ') >= 0) {
            P(inlineRuns(n, { b: true, sz: 23 }), { before: 180, after: 60, ind: 100 });
            return;
          }
          if (c.indexOf(' dot ') >= 0) {
            P(iRun('◦ ', { sz: 20, color: '0F6FB8' }).concat(inlineRuns(n, { sz: 20 })),
              { ind: 340, hang: 180, after: 40 });
            return;
          }
          if (c.indexOf(' dash ') >= 0) {
            P(iRun('- ', { sz: 19, color: '7A8894' }).concat(inlineRuns(n, { sz: 19, color: '333333' })),
              { ind: 560, hang: 180, after: 30 });
            return;
          }
          if (cl.indexOf('sec') >= 0 && tag === 'div') {
            const h2 = n.querySelector('h2');
            if (h2) P(inlineRuns(h2, { b: true, sz: 26, color: 'FFFFFF' }), { shd: '0F6FB8', after: 60 });
            const sb = n.querySelector('.sbody');
            if (sb) walk(sb);
            P([], { after: 100 });
            return;
          }
          if (cl.indexOf('kv') >= 0) {
            const b = n.querySelector('b'), v = n.querySelector('span');
            P(iRun((b ? b.textContent : '') + ' : ', { b: true, sz: 20, color: '0F6FB8' })
                .concat(v ? inlineRuns(v, { sz: 20 }) : []),
              { ind: 200, after: 30 });
            return;
          }
          if (cl.indexOf('li') >= 0 || cl.indexOf('talk') >= 0) {
            P(iRun('• ', { sz: 20, color: '0F6FB8' }).concat(inlineRuns(n, { sz: 20 })),
              { ind: 340, hang: 160, after: 30 });
            return;
          }
          if (cl.indexOf('card') >= 0) {
            const no = n.querySelector('.no'), tx = n.querySelector('.tx');
            P(iRun((no ? no.textContent : '•') + '. ', { b: true, sz: 22, color: 'B07C0A' })
                .concat(tx ? inlineRuns(tx, { b: true, sz: 22 }) : []),
              { ind: 300, hang: 300, after: 60 });
            return;
          }
          /* QR 안내는 미리보기에서 파란 정보 상자다 — 아래 note 분기(빨간 경고 상자)에
             부분 일치로 걸리지 않도록 먼저 처리한다. */
          if (cl.indexOf('qr-note') >= 0) {
            P(inlineRuns(n, { sz: 19, color: '0B4E82' }),
              { shd: 'EAF2F9', before: 120, after: 120 });
            return;
          }
          // ※ 로 시작하는 안내문 — 상자 없이 내어쓰기(둘째 줄부터 ※ 뒤에 맞춤)
          if (cl.indexOf('notice') >= 0) {
            P(inlineRuns(n, { sz: 19 }), { ind: 300, hang: 300, before: 160, after: 200 });
            return;
          }
          if (cl.indexOf('note') >= 0) {
            P(inlineRuns(n, { sz: 19, color: '8A2E28' }),
              { shd: 'FDF3F2', border: 'C0392B', before: 120, after: 120 });
            return;
          }
          if (cl.indexOf('ft') >= 0 && n.querySelector('.ft-tx')) {
            const ft = n.querySelector('.ft-tx');
            P(inlineRuns(ft, { b: true, sz: 24, color: 'FFFFFF' }),
              { shd: 'C0392B', align: 'center', before: 200, after: 100 });
            return;
          }
          /* 서명란은 손으로 적는 칸 — 줄 사이를 크게 벌려 이름·도장 자리를 남긴다.
             학생·학부모가 함께 들어가는 줄(.two)은 왼쪽 맞춤으로 둔다. */
          if (cl.indexOf('srow') >= 0) {
            const two = cl.indexOf('two') >= 0;
            P(inlineRuns(n, { sz: 23 }),
              { align: cl.indexOf('right') >= 0 ? 'right' : two ? '' : 'both',
                before: 260, after: 260 });
            return;
          }
          if (cl.indexOf('body') >= 0 || cl.indexOf('date') >= 0 || cl.indexOf('school') >= 0 ||
              cl.indexOf('dept') >= 0) {
            const center = cl.indexOf('date') >= 0 || cl.indexOf('school') >= 0 || cl.indexOf('dept') >= 0;
            const big = cl.indexOf('school') >= 0;
            P(inlineRuns(n, { sz: big ? 32 : 22, b: big }),
              { align: center ? 'center' : 'both', before: big ? 200 : 60, after: 60 });
            return;
          }
          if (cl.indexOf('by') >= 0 || cl.indexOf('foot') >= 0) {
            P(inlineRuns(n, { sz: 16, color: '8A97A5' }), { align: 'right', before: 200 });
            return;
          }
          if (n.children.length) walk(n);
        });
      };
      walk(page);
    });

    return B;
  }

  /* ---------------- 블록 목록 → WordprocessingML ---------------- */
  function wRunProps(o) {
    o = o || {};
    let r = '<w:rPr><w:rFonts w:ascii="' + W_FONT + '" w:eastAsia="' + W_FONT + '" w:hAnsi="' + W_FONT + '"/>';
    if (o.b) r += '<w:b/>';
    if (o.color) r += '<w:color w:val="' + o.color + '"/>';
    r += '<w:sz w:val="' + (o.sz || 20) + '"/><w:szCs w:val="' + (o.sz || 20) + '"/>';
    if (o.u) r += '<w:u w:val="single"/>';
    r += '</w:rPr>';
    return r;
  }
  function wRunXml(r) {
    if (r.br) return '<w:r><w:br/></w:r>';
    if (!r.t) return '';
    return '<w:r>' + wRunProps(r) + '<w:t xml:space="preserve">' + xesc(r.t) + '</w:t></w:r>';
  }
  const wRunsXml = runs => (runs || []).map(wRunXml).join('');

  function wParaXml(runs, o) {
    o = o || {};
    let pr = '<w:pPr>';
    if (o.align) pr += '<w:jc w:val="' + o.align + '"/>';
    if (o.shd) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shd + '"/>';
    if (o.border) pr += '<w:pBdr><w:top w:val="single" w:sz="6" w:color="' + o.border +
      '"/><w:left w:val="single" w:sz="6" w:color="' + o.border +
      '"/><w:bottom w:val="single" w:sz="6" w:color="' + o.border +
      '"/><w:right w:val="single" w:sz="6" w:color="' + o.border + '"/></w:pBdr>';
    pr += '<w:spacing w:before="' + (o.before == null ? 40 : o.before) +
          '" w:after="' + (o.after == null ? 40 : o.after) + '" w:line="264" w:lineRule="auto"/>';
    if (o.ind) pr += '<w:ind w:left="' + o.ind + '" w:hanging="' + (o.hang || 0) + '"/>';
    pr += '</w:pPr>';
    return '<w:p>' + pr + wRunsXml(runs) + '</w:p>';
  }
  const wBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  /* 본문 폭(twip) — 좌우 여백 20mm를 뺀 값. 세로 9638 · 가로 14570.
     열 너비를 직접 지정해야 워드가 내용 길이대로 표를 좁게 그리지 않고
     용지 방향에 맞춰 양식 폭에 꽉 채운다. */
  const wTextWidth = landscape => (landscape ? 16838 : 11906) - 2268;
  function wTblXml(b, tblw) {
    const cols = b.cols || 1;
    const px = (b.w || new Array(cols).fill(1 / cols)).map(r => Math.round(tblw * r));
    px[cols - 1] += tblw - px.reduce((a, c) => a + c, 0);
    const pct = px.map(v => Math.round(v / tblw * 5000));

    let x = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
      '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        .map(s => '<w:' + s + ' w:val="single" w:sz="6" w:color="AAB8C4"/>').join('') +
      '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
      '<w:tblGrid>' + px.map(v => '<w:gridCol w:w="' + v + '"/>').join('') + '</w:tblGrid>';
    b.rows.forEach((tr, ri) => {
      /* 머리글 줄은 장이 넘어갈 때마다 다시 찍는다.
         cantSplit 은 넣지 않는다 — 넣으면 한 줄이 한 장보다 길 때 잘려 나간다. */
      const head = ri === 0 && tr.cells.some(c => c && c.head);
      x += '<w:tr>' + (head ? '<w:trPr><w:tblHeader/></w:trPr>' : '');
      for (let ci = 0; ci < cols; ci++) {
        const td = tr.cells[ci] || { head: false, runs: [] };
        x += '<w:tc><w:tcPr><w:tcW w:w="' + pct[ci] + '" w:type="pct"/>' +
             (td.head ? '<w:shd w:val="clear" w:color="auto" w:fill="EDF3F9"/>' : '') +
             '<w:vAlign w:val="center"/></w:tcPr>' +
             wParaXml(td.runs, { before: 20, after: 20 }) +
             '</w:tc>';
      }
      x += '</w:tr>';
    });
    return x + '</w:tbl>';
  }

  function blocksToWml(blocks, landscape) {
    const tblw = wTextWidth(landscape);
    let out = '';
    (blocks || []).forEach(b => {
      if (b.k === 'pb') { out += wBreak(); return; }
      if (b.k === 'tbl') { out += wTblXml(b, tblw); return; }
      out += wParaXml(b.runs, b.o);
    });
    return out;
  }

  const htmlToWml = (html, landscape) => blocksToWml(htmlToBlocks(html), landscape);

  function docxBlob(title, html, landscape) {
    const body = htmlToWml(html, landscape);
    const W = landscape ? 16838 : 11906, H = landscape ? 11906 : 16838;
    const document_xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body +
      '<w:sectPr><w:pgSz w:w="' + W + '" w:h="' + H + '"' + (landscape ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';

    const styles_xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="' + W_FONT + '" w:eastAsia="' + W_FONT + '" w:hAnsi="' + W_FONT + '"/>' +
      '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults></w:styles>';

    const ct =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>';

    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    const drels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const zip = zipStore([
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rels },
      { name: 'word/document.xml', data: document_xml },
      { name: 'word/_rels/document.xml.rels', data: drels },
      { name: 'word/styles.xml', data: styles_xml }
    ]);
    return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function downloadDocx(filename, html, landscape) {
    const blob = docxBlob(filename, html, landscape);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* =========================================================
     한글(.hwpx) 생성 — 외부 라이브러리 없이 ZIP + OWPML
     ---------------------------------------------------------
     워드와 같은 블록 목록(htmlToBlocks)을 받아 한글 문서로 옮긴다.
     길이 단위는 HWPUNIT(1/7200인치 = 1/100pt)이고,
     블록 목록은 워드 단위(sz는 1/2pt · 나머지는 1/20pt)를 쓰므로
       글자 크기  sz * 50
       여백·들여쓰기  값 * 5
     로 바꿔서 넣는다.
     ========================================================= */
  const HWP_NS =
    ' xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"' +
    ' xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"' +
    ' xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"' +
    ' xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"' +
    ' xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"' +
    ' xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"' +
    ' xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"' +
    ' xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"' +
    ' xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:opf="http://www.idpf.org/2007/opf/"' +
    ' xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"' +
    ' xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"' +
    ' xmlns:epub="http://www.idpf.org/2007/ops"' +
    ' xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
  const XDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const H_FONT = '맑은 고딕';
  const HU = v => Math.round((v || 0) * 5);          // 1/20pt → HWPUNIT
  const HALIGN = { center: 'CENTER', right: 'RIGHT', both: 'JUSTIFY' };

  function hwpxBlob(blocks, landscape, title) {
    /* ── 서식 모음 — 실제로 쓰인 조합만 모아 header.xml에 적는다 ── */
    const bfList = [], bfMap = {};
    const bfId = (fill, line) => {                    // 테두리·채우기 (1번부터)
      const key = (fill || '') + '|' + (line || '');
      if (bfMap[key] == null) { bfList.push({ fill: fill, line: line }); bfMap[key] = bfList.length; }
      return bfMap[key];
    };
    const BF_NONE = bfId('', '');

    const cpList = [], cpMap = {};
    const cpId = r => {                                // 글자 모양 (0번부터)
      const key = [r.sz || 20, r.b ? 1 : 0, r.color || '', r.u ? 1 : 0].join('|');
      if (cpMap[key] == null) { cpList.push(r); cpMap[key] = cpList.length - 1; }
      return cpMap[key];
    };
    const CP_BASE = cpId({ sz: 20 });

    const ppList = [], ppMap = {};
    const ppId = o => {                                // 문단 모양 (0번부터)
      o = o || {};
      const key = [o.align || '', o.shd || '', o.border || '',
                   o.before == null ? 40 : o.before, o.after == null ? 40 : o.after,
                   o.ind || 0, o.hang || 0].join('|');
      if (ppMap[key] == null) { ppList.push(o); ppMap[key] = ppList.length - 1; }
      return ppMap[key];
    };
    const PP_BASE = ppId({});
    const PP_TIGHT = ppId({ before: 0, after: 0 });

    /* ── 용지 — A4. 여백은 워드와 같은 좌우 20mm로 맞춘다.
       한글 기본값(30mm)을 쓰면 본문이 150mm로 좁아져
       「학생 : __ 학년 __ 반 __ 번 성명 ____ (서명 또는 인)」 같은
       서명란이 다음 줄로 잘려 넘어간다. 표는 아래 TXTW에 맞춰
       비율대로 나뉘므로 어느 방향에서도 양식 폭을 넘거나 모자라지 않는다. ── */
    const PW = landscape ? 84188 : 59528;   // A4 297mm / 210mm
    const PH = landscape ? 59528 : 84188;
    const MGX = 5669;                       // 좌우 20mm (워드와 동일)
    const MGY = landscape ? 4252 : 5669;    // 위아래 15mm / 20mm
    const TXTW = PW - MGX * 2;              // 본문 너비 170mm / 257mm

    /* ── 문단 · 표 ── */
    /* 줄바꿈은 문단을 나누지 않고 <hp:t> 안의 <hp:lineBreak/> 로 넣는다.
       문단을 쪼개면 테두리·음영이 걸린 안내 상자가 줄마다 따로 그려진다. */
    function paraXml(runs, o, brk) {
      const pid = ppId(o || {});
      let body = '', pend = '';        // pend: 다음 글자 앞에 붙일 줄바꿈
      (runs || []).forEach(r => {
        if (r.br) { pend += '<hp:lineBreak/>'; return; }
        if (!r.t) return;
        body += '<hp:run charPrIDRef="' + cpId(r) + '"><hp:t>' + pend + xesc(r.t) + '</hp:t></hp:run>';
        pend = '';
      });
      if (pend) body += '<hp:run charPrIDRef="' + CP_BASE + '"><hp:t>' + pend + '</hp:t></hp:run>';
      if (!body) body = '<hp:run charPrIDRef="' + CP_BASE + '"><hp:t/></hp:run>';
      return '<hp:p id="0" paraPrIDRef="' + pid + '" styleIDRef="0" pageBreak="' + (brk ? '1' : '0') +
             '" columnBreak="0" merged="0">' + body + '</hp:p>';
    }

    let tblSeq = 1000;
    function tblXml(b) {
      const rows = b.rows;
      const cols = b.cols || 1;
      /* 워드와 같은 비율을 써서 표가 본문 폭에 꼭 맞게 들어간다 */
      const cws = (b.w || new Array(cols).fill(1 / cols)).map(r => Math.round(TXTW * r));
      cws[cols - 1] += TXTW - cws.reduce((a, c) => a + c, 0);
      const tw = TXTW;
      const rh = 1400;                                 // 내용이 길면 한글이 늘려 준다
      const HEAD_BF = bfId('EDF3F9', 'AAB8C4');
      const CELL_BF = bfId('', 'AAB8C4');

      let x = '<hp:p id="0" paraPrIDRef="' + PP_TIGHT + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
        '<hp:run charPrIDRef="' + CP_BASE + '">' +
        '<hp:tbl id="' + (++tblSeq) + '" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM"' +
        ' textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1"' +
        ' rowCnt="' + rows.length + '" colCnt="' + cols + '" cellSpacing="0"' +
        ' borderFillIDRef="' + CELL_BF + '" noAdjust="0">' +
        '<hp:sz width="' + tw + '" widthRelTo="ABSOLUTE" height="' + (rh * rows.length) +
        '" heightRelTo="ABSOLUTE" protect="0"/>' +
        /* treatAsChar="0" — 「글자처럼 취급」을 끈다.
           켜 두면 표가 글자 하나로 다뤄져 쪽을 넘겨 이어지지 못하고,
           한 장을 넘어가는 목록은 뒷부분이 통째로 잘려 나갔다.
           끄면 표가 쪽 경계에서 나뉘어 전체가 나온다(한글 「표 속성 → 글자처럼 취급」과 같은 값).
           flowWithText="1" 은 앞뒤 글이 밀릴 때 표도 함께 밀리게 한다 —
           0 이면 표가 제자리에 박혀 본문과 겹친다. 한글이 직접 만든 파일도 이 조합을 쓴다. */
        '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0"' +
        ' vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
        '<hp:outMargin left="0" right="0" top="0" bottom="0"/>' +
        '<hp:inMargin left="141" right="141" top="141" bottom="141"/>';

      rows.forEach((tr, ri) => {
        x += '<hp:tr>';
        for (let ci = 0; ci < cols; ci++) {
          const td = tr.cells[ci] || { head: false, runs: [] };   // 칸 수가 모자라면 빈 칸으로 채운다
          x += '<hp:tc name="" header="' + (td.head ? '1' : '0') + '" hasMargin="0" protect="0"' +
               ' editable="0" dirty="0" borderFillIDRef="' + (td.head ? HEAD_BF : CELL_BF) + '">' +
               '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER"' +
               ' linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
               paraXml(td.runs, { align: td.head ? 'center' : 'both', before: 0, after: 0 }) +
               '</hp:subList>' +
               '<hp:cellAddr colAddr="' + ci + '" rowAddr="' + ri + '"/>' +
               '<hp:cellSpan colSpan="1" rowSpan="1"/>' +
               '<hp:cellSz width="' + cws[ci] + '" height="' + rh + '"/>' +
               '<hp:cellMargin left="141" right="141" top="141" bottom="141"/>' +
               '</hp:tc>';
        }
        x += '</hp:tr>';
      });
      return x + '</hp:tbl></hp:run></hp:p>';
    }

    /* ── 본문 (여기서 서식 번호가 등록되므로 header 보다 먼저 만든다) ── */
    let body = '';
    (blocks || []).forEach(b => {
      if (b.k === 'pb') { body += paraXml([], { before: 0, after: 0 }, true); return; }
      if (b.k === 'tbl') { body += tblXml(b); return; }
      body += paraXml(b.runs, b.o);
    });

    const secPr =
      '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000"' +
      ' tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
      '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>' +
      '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
      '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL"' +
      ' fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
      '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>' +
      /* landscape 값은 이름과 반대로 쓴다 — 한글이 직접 만든 A4 세로 문서는
         모두 WIDELY 로 적혀 있고, NARROWLY 로 넣으면 가로형으로 열린다. */
      '<hp:pagePr landscape="' + (landscape ? 'NARROWLY' : 'WIDELY') + '" width="' + PW +
      '" height="' + PH + '" gutterType="LEFT_ONLY">' +
      '<hp:margin header="0" footer="0" gutter="0" left="' + MGX + '" right="' + MGX +
      '" top="' + MGY + '" bottom="' + MGY + '"/>' +
      '</hp:pagePr>' +
      '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>' +
      '<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>' +
      '<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>' +
      '<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/>' +
      '</hp:footNotePr>' +
      '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>' +
      '<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>' +
      '<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>' +
      '<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/>' +
      '</hp:endNotePr>' +
      ['BOTH', 'EVEN', 'ODD'].map(t =>
        '<hp:pageBorderFill type="' + t + '" borderFillIDRef="' + BF_NONE + '" textBorder="PAPER"' +
        ' headerInside="0" footerInside="0" fillArea="PAPER">' +
        '<hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>').join('') +
      '</hp:secPr>';

    /* 첫 문단이 용지 설정을 들고 있어야 한다 */
    const firstP =
      '<hp:p id="0" paraPrIDRef="' + PP_TIGHT + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
      '<hp:run charPrIDRef="' + CP_BASE + '">' + secPr +
      '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>' +
      '</hp:run></hp:p>';

    const section = XDECL + '<hs:sec' + HWP_NS + '>' + firstP + body + '</hs:sec>';

    /* ── 서식 목록을 XML로 (paraPr 이 테두리를 새로 만들 수 있어 순서가 중요하다) ── */
    const ppXmlAll = ppList.map((o, i) => {
      const mg = '<hh:margin>' +
        '<hc:intent value="' + (-HU(o.hang)) + '" unit="HWPUNIT"/>' +
        '<hc:left value="' + HU(o.ind) + '" unit="HWPUNIT"/>' +
        '<hc:right value="0" unit="HWPUNIT"/>' +
        '<hc:prev value="' + HU(o.before == null ? 40 : o.before) + '" unit="HWPUNIT"/>' +
        '<hc:next value="' + HU(o.after == null ? 40 : o.after) + '" unit="HWPUNIT"/>' +
        '</hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>';
      const boxed = !!(o.shd || o.border);
      return '<hh:paraPr id="' + i + '" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0"' +
        ' suppressLineNumbers="0" checked="0">' +
        '<hh:align horizontal="' + (HALIGN[o.align] || 'JUSTIFY') + '" vertical="BASELINE"/>' +
        '<hh:heading type="NONE" idRef="0" level="0"/>' +
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0"' +
        ' keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
        '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
        '<hp:switch>' +
          '<hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">' + mg + '</hp:case>' +
          '<hp:default>' + mg + '</hp:default>' +
        '</hp:switch>' +
        '<hh:border borderFillIDRef="' + (boxed ? bfId(o.shd || '', o.border || '') : BF_NONE) +
        '" offsetLeft="' + (boxed ? 283 : 0) + '" offsetRight="' + (boxed ? 283 : 0) +
        '" offsetTop="' + (boxed ? 142 : 0) + '" offsetBottom="' + (boxed ? 142 : 0) +
        '" connect="0" ignoreMargin="0"/>' +
        '</hh:paraPr>';
    }).join('');

    const cpXmlAll = cpList.map((r, i) =>
      '<hh:charPr id="' + i + '" height="' + ((r.sz || 20) * 50) + '" textColor="#' + (r.color || '000000') +
      '" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="' + BF_NONE + '">' +
      '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
      '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
      '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
      '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
      '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
      (r.b ? '<hh:bold/>' : '') +
      '<hh:underline type="' + (r.u ? 'BOTTOM' : 'NONE') + '" shape="SOLID" color="#000000"/>' +
      '<hh:strikeout shape="NONE" color="#000000"/>' +
      '<hh:outline type="NONE"/>' +
      '<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>' +
      '</hh:charPr>').join('');

    const bfXmlAll = bfList.map((b, i) => {
      const type = b.line ? 'SOLID' : 'NONE';
      const col = '#' + (b.line || '000000');
      return '<hh:borderFill id="' + (i + 1) + '" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">' +
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/>' +
        '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
        ['left', 'right', 'top', 'bottom'].map(s =>
          '<hh:' + s + 'Border type="' + type + '" width="0.12 mm" color="' + col + '"/>').join('') +
        '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>' +
        (b.fill
          ? '<hc:fillBrush><hc:winBrush faceColor="#' + b.fill + '" hatchColor="#999999" alpha="0"/></hc:fillBrush>'
          : '') +
        '</hh:borderFill>';
    }).join('');

    const header = XDECL + '<hh:head' + HWP_NS + ' version="1.4" secCnt="1">' +
      '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>' +
      '<hh:refList>' +
      '<hh:fontfaces itemCnt="7">' +
        ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'].map(l =>
          '<hh:fontface lang="' + l + '" fontCnt="1">' +
          '<hh:font id="0" face="' + H_FONT + '" type="TTF" isEmbedded="0">' +
          '<hh:typeInfo familyType="FCAT_GOTHIC" weight="0" proportion="0" contrast="0" strokeVariation="0"' +
          ' armStyle="0" letterform="0" midline="0" xHeight="0"/>' +
          '</hh:font></hh:fontface>').join('') +
      '</hh:fontfaces>' +
      '<hh:borderFills itemCnt="' + bfList.length + '">' + bfXmlAll + '</hh:borderFills>' +
      '<hh:charProperties itemCnt="' + cpList.length + '">' + cpXmlAll + '</hh:charProperties>' +
      '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
      '<hh:paraProperties itemCnt="' + ppList.length + '">' + ppXmlAll + '</hh:paraProperties>' +
      '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="' +
        PP_BASE + '" charPrIDRef="' + CP_BASE + '" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
      '</hh:refList>' +
      '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
      '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>' +
      '</hh:head>';

    /* ── 나머지 포장 파일 ── */
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const hpf = XDECL + '<opf:package' + HWP_NS + ' version="" unique-identifier="" id="">' +
      '<opf:metadata><opf:title>' + xesc(title || '문서') + '</opf:title>' +
      '<opf:language>ko</opf:language>' +
      '<opf:meta name="creator" content="text">송쌤과학 디벗 업무 도우미</opf:meta>' +
      '<opf:meta name="CreatedDate" content="text">' + now + '</opf:meta>' +
      '<opf:meta name="ModifiedDate" content="text">' + now + '</opf:meta>' +
      '</opf:metadata><opf:manifest>' +
      '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
      '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
      '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>' +
      '</opf:manifest><opf:spine>' +
      '<opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/>' +
      '</opf:spine></opf:package>';

    const version = XDECL +
      '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR"' +
      ' major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4"' +
      ' application="송쌤과학 디벗 업무 도우미" appVersion="1.0"/>';

    const settings = XDECL +
      '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"' +
      ' xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">' +
      '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>' +
      '</ha:HWPApplicationSetting>';

    const containerXml = XDECL +
      '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"' +
      ' xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles>' +
      '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>' +
      '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>' +
      '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>' +
      '</ocf:rootfiles></ocf:container>';

    /* ⚠️ xmlns:ns0 은 반드시 <ns0:hasPart> 마다 따로 적는다 — 맨 위 <rdf:RDF>에 한 번만
       적으면 안 된다. XML 규칙으로는 둘이 같은 뜻이지만, 한글의 RDF 읽기 부분은
       이름공간을 물려받지 않고 그 태그에 적힌 것만 본다. 위에만 적어 두면 한글이
       ns0 을 찾지 못해 파일을 여는 순간 그대로 튕긴다(액세스 위반 0xC0000005).
       한글이 직접 만든 .hwpx 도 아래와 같이 태그마다 적어 둔다. 줄이지 말 것. */
    const NS0 = ' xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#"';
    const containerRdf = XDECL +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about=""><ns0:hasPart' + NS0 +
      ' rdf:resource="Contents/header.xml"/></rdf:Description>' +
      '<rdf:Description rdf:about="Contents/header.xml">' +
      '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description>' +
      '<rdf:Description rdf:about=""><ns0:hasPart' + NS0 +
      ' rdf:resource="Contents/section0.xml"/></rdf:Description>' +
      '<rdf:Description rdf:about="Contents/section0.xml">' +
      '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description>' +
      '<rdf:Description rdf:about="">' +
      '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description>' +
      '</rdf:RDF>';

    const manifestXml = XDECL +
      '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>';

    const prv = (blocks || []).map(b =>
      b.k === 'tbl'
        ? b.rows.map(r => r.cells.map(c => c.runs.map(x => x.t || '').join('')).join('\t')).join('\n')
        : (b.runs || []).map(x => x.t || '').join('')
    ).filter(Boolean).join('\n').slice(0, 3000);

    const zip = zipStore([
      { name: 'mimetype', data: 'application/hwp+zip' },      // 반드시 첫 항목
      { name: 'version.xml', data: version },
      { name: 'settings.xml', data: settings },
      { name: 'Contents/content.hpf', data: hpf },
      { name: 'Contents/header.xml', data: header },
      { name: 'Contents/section0.xml', data: section },
      { name: 'META-INF/container.xml', data: containerXml },
      { name: 'META-INF/container.rdf', data: containerRdf },
      { name: 'META-INF/manifest.xml', data: manifestXml },
      { name: 'Preview/PrvText.txt', data: prv }
    ]);
    return new Blob([zip], { type: 'application/hwp+zip' });
  }

  /* A4 · 세로형이 기본이고, 생성기에서 가로형을 고르면 그대로 따라간다 */
  function downloadHwpx(filename, html, landscape) {
    const blob = hwpxBlob(htmlToBlocks(html), !!landscape, filename.replace(/\.hwpx$/i, ''));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* =========================================================
     엑셀(.xlsx) 생성 — 라이브러리 없이 ZIP + SpreadsheetML
     sheets: [{ name, cols:[너비...], rows:[[셀,...]] }]
     셀은 문자열이거나 { v:값, b:굵게, h:머리글, n:숫자 }
     ========================================================= */
  function xlsxBlob(sheets) {
    const colLetter = i => {
      let s = '', n = i;
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    };

    const sheetXml = sh => {
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if (sh.cols && sh.cols.length) {
        x += '<cols>';
        sh.cols.forEach((w, i) => {
          x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        });
        x += '</cols>';
      }
      x += '<sheetData>';
      (sh.rows || []).forEach((row, ri) => {
        x += '<row r="' + (ri + 1) + '">';
        row.forEach((cell, ci) => {
          const c = (cell && typeof cell === 'object') ? cell : { v: cell };
          const ref = colLetter(ci) + (ri + 1);
          const style = c.h ? ' s="2"' : (c.b ? ' s="1"' : ' s="3"');
          if (c.n && c.v !== '' && c.v != null && !isNaN(c.v)) {
            x += '<c r="' + ref + '"' + style + '><v>' + Number(c.v) + '</v></c>';
          } else {
            x += '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' +
                 xesc(c.v) + '</t></is></c>';
          }
        });
        x += '</row>';
      });
      return x + '</sheetData></worksheet>';
    };

    const F = '맑은 고딕';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3">' +
        '<font><sz val="10"/><name val="' + F + '"/></font>' +
        '<font><b/><sz val="10"/><name val="' + F + '"/></font>' +
        '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="' + F + '"/></font>' +
      '</fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF0F6FB8"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left style="thin"><color rgb="FFAAB8C4"/></left><right style="thin"><color rgb="FFAAB8C4"/></right>' +
        '<top style="thin"><color rgb="FFAAB8C4"/></top><bottom style="thin"><color rgb="FFAAB8C4"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1">' +
          '<alignment vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1">' +
          '<alignment vertical="top" wrapText="1"/></xf>' +
      '</cellXfs></styleSheet>';

    let wbSheets = '', wbRels = '', ctOverrides = '';
    const files = [];
    sheets.forEach((sh, i) => {
      const id = i + 1;
      wbSheets += '<sheet name="' + xesc(sh.name || ('시트' + id)) + '" sheetId="' + id + '" r:id="rId' + id + '"/>';
      wbRels += '<Relationship Id="rId' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + id + '.xml"/>';
      ctOverrides += '<Override PartName="/xl/worksheets/sheet' + id + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      files.push({ name: 'xl/worksheets/sheet' + id + '.xml', data: sheetXml(sh) });
    });
    const styleRelId = sheets.length + 1;
    wbRels += '<Relationship Id="rId' + styleRelId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + wbSheets + '</sheets></workbook>';

    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      ctOverrides + '</Types>';

    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const all = [
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rels },
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>' },
      { name: 'xl/styles.xml', data: styles }
    ].concat(files);

    return new Blob([zipStore(all)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function downloadXlsx(filename, sheets) {
    const url = URL.createObjectURL(xlsxBlob(sheets));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function copyText(text, btn) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = '복사했습니다';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    } else { fallback(); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  }

  const todayKR = () => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  };

  /* =========================================================
     실제 사용 예시 그림
     외부 이미지 파일 없이 인라인 SVG로 그린다. 색은 전부 CSS 변수를
     쓰므로 라이트·다크 테마를 그대로 따라간다.
     ========================================================= */
  const EXC = {
    surf: 'var(--surf)', surf2: 'var(--surf-2)', surf3: 'var(--surf-3)',
    line: 'var(--line)', line2: 'var(--line-2)',
    txt: 'var(--txt)', txt2: 'var(--txt-2)', txt3: 'var(--txt-3)',
    tint: 'var(--tint)', ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)'
  };
  const EX_ACCENT = { doc: 'var(--c-doc)', guide: 'var(--c-guide)', check: 'var(--c-check)', link: 'var(--c-link)' };

  const exR = (x, y, w, h, f, s, r) =>
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r == null ? 5 : r) +
    '" fill="' + (f || 'none') + '"' + (s ? ' stroke="' + s + '" stroke-width="1.1"' : '') + '/>';

  const exT = (x, y, t, o) => {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.s || 10) + '" font-weight="' + (o.w || 500) +
      '" fill="' + (o.c || EXC.txt) + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + '>' + esc(t) + '</text>';
  };

  const exBar = (x, y, w, h, c) => exR(x, y, w, h, c || EXC.line, null, h / 2);

  const exArrow = (x1, y1, x2, y2) =>
    '<path d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + '" stroke="' + EXC.line2 +
    '" stroke-width="2" fill="none" marker-end="url(#exArr)"/>';

  /* 번호 뱃지 + 라벨 */
  const exStep = (n, x, y, t, c) =>
    '<circle cx="' + (x + 7) + '" cy="' + (y - 3.5) + '" r="7.5" fill="' + c + '"/>' +
    exT(x + 7, y, String(n), { s: 9, w: 800, c: '#fff', a: 'middle' }) +
    exT(x + 19, y, t, { s: 10, w: 700, c: c });

  /* 알약 모양 태그 */
  const exChip = (x, y, w, t, c) =>
    exR(x, y, w, 18, EXC.tint, c, 9) + exT(x + w / 2, y + 12.5, t, { s: 8.5, w: 700, c: c, a: 'middle' });

  /* 입력 화면 목업 — rows: [라벨, 값] 또는 [라벨, [줄1,줄2...], 'list'] */
  function exForm(x, y, w, h, title, rows, c) {
    let s = exR(x, y, w, h, EXC.surf, EXC.line, 9) +
      exR(x, y, w, 23, EXC.surf3, null, 9) + exR(x, y + 13, w, 10, EXC.surf3, null, 0) +
      '<path d="M' + x + ' ' + (y + 23) + ' h' + w + '" stroke="' + EXC.line + '" stroke-width="1.1"/>' +
      exT(x + 10, y + 16, title, { s: 10, w: 700, c: c });
    let cy = y + 38;
    (rows || []).forEach(r => {
      const isList = r[2] === 'list';
      s += exT(x + 10, cy, r[0], { s: 8.5, w: 600, c: EXC.txt3 });
      const bh = isList ? Math.max(24, y + h - cy - 14) : 16;
      s += exR(x + 10, cy + 5, w - 20, bh, EXC.surf2, EXC.line, 4);
      if (isList) {
        (r[1] || []).slice(0, Math.floor((bh - 8) / 12)).forEach((ln, i) => {
          s += exT(x + 16, cy + 18 + i * 12, ln, { s: 8.5, w: 600, c: EXC.txt2 });
        });
      } else {
        s += exT(x + 16, cy + 16.5, r[1], { s: 9, w: 600 });
      }
      cy += bh + 13;
    });
    return s;
  }

  /* A4 결과물 목업 — lines: 0이면 빈 줄, 0~1이면 그 비율만큼의 글줄 */
  function exPaper(x, y, w, h, title, c, o) {
    o = o || {};
    let s = exR(x, y, w, h, EXC.surf, EXC.line, 4) +
      exR(x + 8, y + 8, w - 16, 3, c, null, 1.5) +
      exT(x + w / 2, y + 24, title, { s: 9.5, w: 800, c: c, a: 'middle' });
    let cy = y + 36;
    (o.lines || []).forEach(v => {
      if (!v) { cy += 5; return; }
      s += exBar(x + 11, cy, (w - 22) * v, 3.2);
      cy += 8;
    });
    if (o.table) {
      const cols = o.table[0], rws = o.table[1], tw = w - 22, ch = 10;
      s += exR(x + 11, cy, tw, ch, EXC.surf3, EXC.line, 2);
      for (let r = 1; r <= rws; r++) s += exR(x + 11, cy + ch * r, tw, ch, 'none', EXC.line, 0);
      for (let i = 1; i < cols; i++) {
        s += '<path d="M' + (x + 11 + tw / cols * i) + ' ' + cy + ' v' + (ch * (rws + 1)) +
             '" stroke="' + EXC.line + '" stroke-width="1"/>';
      }
      cy += ch * (rws + 1) + 8;
    }
    (o.after || []).forEach(v => {
      if (!v) { cy += 5; return; }
      s += exBar(x + 11, cy, (w - 22) * v, 3.2);
      cy += 8;
    });
    if (o.stamp) {
      s += exR(x + w - 52, y + h - 30, 42, 20, EXC.tint, c, 4) +
           exT(x + w - 31, y + h - 16.5, o.stamp, { s: 8, w: 700, c: c, a: 'middle' });
    }
    return s;
  }

  /* 엑셀 시트 목업 — 높이는 행 수에 맞춰 자동으로 잡는다 */
  const exSheetH = (rows, legend) => 32 + 15 * (rows + 1) + (legend ? 22 : 12);

  function exSheet(x, y, w, h, title, head, rows, c, mark) {
    const n = head.length, cw = (w - 24) / n, rh = 15;
    let s = exR(x, y, w, h, EXC.surf, EXC.line, 6) +
      exR(x, y, w, 22, EXC.surf3, null, 6) + exR(x, y + 12, w, 10, EXC.surf3, null, 0) +
      exT(x + 10, y + 15, title, { s: 9.5, w: 700, c: c });
    const gx = x + 12, gy = y + 32;
    s += exR(gx, gy, cw * n, rh, EXC.tint, EXC.line, 2);
    head.forEach((t, i) => { s += exT(gx + cw * i + cw / 2, gy + 10.5, t, { s: 8, w: 700, c: c, a: 'middle' }); });
    rows.forEach((r, ri) => {
      const ry = gy + rh * (ri + 1);
      r.forEach((v, ci) => {
        const hit = mark && mark[0] === ri && mark[1] === ci;
        s += exR(gx + cw * ci, ry, cw, rh, hit ? 'var(--tint-bad)' : 'none', EXC.line, 0);
        s += exT(gx + cw * ci + cw / 2, ry + 10.5, v, { s: 8, w: hit ? 700 : 500, a: 'middle', c: hit ? EXC.bad : EXC.txt2 });
      });
    });
    return s;
  }

  /* 장면 템플릿 */
  const EX_SCENE = {
    /* 입력 → 문서 */
    form2doc(b, c) {
      const f = b.form || {}, p = b.paper || {};
      return exForm(8, 30, 196, 200, f.title || '입력', f.rows || [], c) +
        exArrow(214, 130, 246, 130) +
        exT(230, 118, '자동', { s: 8.5, w: 700, c: EXC.txt3, a: 'middle' }) +
        exPaper(258, 18, 158, 224, p.title || '결과물', c, p) +
        exT(8, 18, b.leftCap || '① 우리 학교 내용만 입력', { s: 9.5, w: 700, c: EXC.txt3 }) +
        exT(258, 12, b.rightCap || '② 바로 나오는 문서', { s: 9.5, w: 700, c: EXC.txt3 }) +
        (b.chips || []).map((t, i) => exChip(436, 34 + i * 26, 190, t, c)).join('') +
        (b.chips && b.chips.length
          ? exT(436, 26, '③ 이 형식으로 받습니다', { s: 9.5, w: 700, c: EXC.txt3 }) : '');
    },
    /* 입력 → 엑셀 */
    form2sheet(b, c) {
      const f = b.form || {}, sh = b.sheet || {}, rows = sh.rows || [];
      const sh_h = exSheetH(rows.length, sh.legend);
      const sy = Math.max(30, 30 + (200 - sh_h) / 2);
      return exForm(8, 30, 176, 200, f.title || '입력', f.rows || [], c) +
        exArrow(194, 130, 224, 130) +
        exT(209, 118, '자동', { s: 8.5, w: 700, c: EXC.txt3, a: 'middle' }) +
        exSheet(234, sy, 392, sh_h, sh.title || '결과 엑셀', sh.head || [], rows, c, sh.mark) +
        exT(8, 18, b.leftCap || '① 명단만 붙여넣기', { s: 9.5, w: 700, c: EXC.txt3 }) +
        exT(234, sy - 8, b.rightCap || '② 서식이 갖춰진 엑셀', { s: 9.5, w: 700, c: EXC.txt3 }) +
        (sh.legend ? exT(246, sy + sh_h - 8, sh.legend, { s: 8.5, w: 600, c: EXC.bad }) : '');
    },
    /* 충전함 등 공간 배치 */
    place(b, c) {
      const slots = b.slots || 20, per = 5, cw = 30, ch = 26;
      let s = exT(8, 18, b.leftCap || '① 교실 안 자리', { s: 9.5, w: 700, c: EXC.txt3 });
      /* 교실 평면 */
      s += exR(8, 30, 196, 200, EXC.surf, EXC.line, 8) +
        exBar(24, 44, 164, 8, EXC.line2) + exT(106, 66, '칠판', { s: 8.5, w: 700, c: EXC.txt3, a: 'middle' });
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
        s += exR(32 + i * 38, 84 + r * 34, 26, 20, EXC.surf3, null, 3);
      }
      s += exR(160, 186, 34, 34, EXC.tint, c, 4) + exT(177, 206, '충전함', { s: 7.5, w: 800, c: c, a: 'middle' });
      s += '<path d="M150 203 L120 203" stroke="' + c + '" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/>';
      s += exT(116, 200, '구석 · 통행로 밖', { s: 8, w: 600, c: c, a: 'end' });
      /* 충전함 정면 */
      s += exT(232, 18, b.rightCap || '② 칸마다 번호 스티커', { s: 9.5, w: 700, c: EXC.txt3 });
      s += exR(232, 30, 200, 200, EXC.surf, EXC.line, 8) + exR(240, 38, 184, 20, EXC.tint, null, 4) +
        exT(332, 52, b.cabTitle || '1학년 3반 충전함', { s: 9, w: 800, c: c, a: 'middle' });
      for (let i = 0; i < slots; i++) {
        const gx = 242 + (i % per) * cw, gy = 66 + Math.floor(i / per) * ch;
        s += exR(gx, gy, cw - 4, ch - 4, EXC.surf2, EXC.line, 2) +
          exT(gx + (cw - 4) / 2, gy + 14.5, String(i + 1), { s: 7.5, w: 700, c: EXC.txt3, a: 'middle' });
      }
      s += exT(242, 224, b.cabNote || '번호 = 출석번호 · 스티커로 고정', { s: 8, w: 600, c: EXC.txt3 });
      s += exT(452, 18, '③ 매일 지키는 순서', { s: 9.5, w: 700, c: EXC.txt3 });
      (b.steps2 || []).forEach((t, i) => { s += exStep(i + 1, 452, 46 + i * 30, t, c); });
      return s;
    },
    /* 안내 카드 (와이파이 등) */
    card(b, c) {
      const rows = b.rows || [];
      let s = exT(8, 18, b.leftCap || '① 교실에 붙는 카드', { s: 9.5, w: 700, c: EXC.txt3 });
      s += exR(8, 30, 250, 200, EXC.surf, EXC.line, 8) + exR(8, 30, 250, 34, c, null, 8) +
        exR(8, 54, 250, 10, c, null, 0) +
        exT(133, 52, b.cardTitle || '교실 와이파이 안내', { s: 11, w: 800, c: '#fff', a: 'middle' });
      rows.forEach((r, i) => {
        s += exT(24, 90 + i * 30, r[0], { s: 8.5, w: 700, c: EXC.txt3 });
        s += exR(96, 76 + i * 30, 146, 19, EXC.surf2, EXC.line, 4) +
          exT(104, 89 + i * 30, r[1], { s: 9, w: 700, c: c });
      });
      /* QR 자리 */
      s += exT(280, 18, b.midCap || '② QR로 바로 접속', { s: 9.5, w: 700, c: EXC.txt3 });
      s += exR(280, 30, 130, 130, EXC.surf, EXC.line, 8);
      for (let r = 0; r < 6; r++) for (let i = 0; i < 6; i++) {
        if ((r * 7 + i * 3) % 5 < 2) continue;
        s += exR(296 + i * 16, 46 + r * 16, 13, 13, EXC.txt3, null, 1);
      }
      s += exT(345, 178, b.qrCap || 'QR 코드 자동 생성', { s: 8.5, w: 700, c: EXC.txt3, a: 'middle' });
      s += exChip(280, 194, 130, b.qrChip || '카드·포스터에 인쇄', c);
      s += exT(432, 18, '③ 이렇게 씁니다', { s: 9.5, w: 700, c: EXC.txt3 });
      (b.steps2 || []).forEach((t, i) => { s += exStep(i + 1, 432, 46 + i * 30, t, c); });
      return s;
    },
    /* 자료 선반 (매뉴얼 · 링크 모음) */
    shelf(b, c) {
      const items = b.items || [];
      let s = exT(8, 18, b.leftCap || '① 필요한 것만 골라 내려받기', { s: 9.5, w: 700, c: EXC.txt3 });
      items.slice(0, 6).forEach((it, i) => {
        const gx = 8 + (i % 3) * 210, gy = 30 + Math.floor(i / 3) * 74;
        s += exR(gx, gy, 196, 62, EXC.surf, EXC.line, 8) +
          exR(gx + 12, gy + 14, 34, 34, EXC.tint, c, 4) +
          exT(gx + 29, gy + 35, it[0], { s: 8.5, w: 800, c: c, a: 'middle' }) +
          exT(gx + 56, gy + 26, it[1], { s: 9.5, w: 700 }) +
          exT(gx + 56, gy + 42, it[2], { s: 8.5, w: 500, c: EXC.txt3 });
      });
      s += exT(8, 190, b.rightCap || '② 학년 · 기기에 맞게 배부', { s: 9.5, w: 700, c: EXC.txt3 });
      (b.steps2 || []).forEach((t, i) => { s += exStep(i + 1, 8 + i * 210, 218, t, c); });
      return s;
    },
    /* 월별 달력 */
    calendar(b, c) {
      const marks = b.marks || {};
      let s = exT(8, 18, b.leftCap || '① 달을 누르면 그 달 업무가 열립니다', { s: 9.5, w: 700, c: EXC.txt3 });
      for (let m = 1; m <= 12; m++) {
        const gx = 8 + ((m - 1) % 6) * 74, gy = 30 + Math.floor((m - 1) / 6) * 68;
        const on = !!marks[m];
        s += exR(gx, gy, 66, 58, on ? EXC.tint : EXC.surf, on ? c : EXC.line, 7) +
          exT(gx + 33, gy + 22, m + '월', { s: 10.5, w: 800, c: on ? c : EXC.txt3, a: 'middle' }) +
          exT(gx + 33, gy + 40, on ? marks[m] : '—', { s: 7.5, w: 600, c: on ? c : EXC.line2, a: 'middle' });
      }
      s += exT(8, 190, b.rightCap || '② 그 달에 할 일이 순서대로', { s: 9.5, w: 700, c: EXC.txt3 });
      (b.steps2 || []).forEach((t, i) => { s += exStep(i + 1, 8 + i * 210, 218, t, c); });
      return s;
    },
    /* 한 번 입력 → 여러 자료에 반영 */
    profile(b, c) {
      const f = b.form || {};
      let s = exT(8, 18, b.leftCap || '① 여기 한 번만 입력하면', { s: 9.5, w: 700, c: EXC.txt3 }) +
        exForm(8, 30, 210, 200, f.title || '학교 기본 정보', f.rows || [], c);
      s += exT(258, 18, b.rightCap || '② 모든 자료에 자동으로 들어갑니다', { s: 9.5, w: 700, c: EXC.txt3 });
      (b.targets || []).slice(0, 6).forEach((t, i) => {
        const gx = 258 + (i % 2) * 190, gy = 30 + Math.floor(i / 2) * 68;
        s += exArrow(226, 130, 252, 44 + Math.floor(i / 2) * 68);
        s += exR(gx, gy, 176, 56, EXC.surf, EXC.line, 7) +
          exR(gx + 10, gy + 12, 26, 32, EXC.tint, c, 3) +
          exT(gx + 46, gy + 25, t[0], { s: 9.5, w: 700 }) +
          exT(gx + 46, gy + 41, t[1], { s: 8.5, w: 500, c: EXC.txt3 });
      });
      return s;
    }
  };

  function exSceneSvg(b) {
    const fn = EX_SCENE[b.kind];
    if (!fn) return '';
    const c = EX_ACCENT[b.accent || 'doc'] || EX_ACCENT.doc;
    return '<svg class="ex-svg" viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="' + esc(b.cap || b.title || '사용 예시 그림') + '">' +
      '<defs><marker id="exArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" ' +
      'orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="' + EXC.line2 + '"/></marker></defs>' +
      fn(b, c) + '</svg>';
  }

  /* ---------- 블록 렌더러 ---------- */
  const R = {
    rich(b) {
      return '<section class="block"><div class="rich">' + (b.html || '') + '</div></section>';
    },

    checklist(b, page, bi) {
      const items = b.items || [];
      const done = items.reduce((a, _, ii) => a + (CHECKS[page.id + ':' + bi + ':' + ii] ? 1 : 0), 0);
      let h = '<section class="block" data-block="' + bi + '">';
      h += '<h2>' + (b.title || '체크리스트') +
           '<span class="cnt" data-cnt="' + bi + '">' + done + ' / ' + items.length + '</span></h2>';
      h += '<div class="ck">';
      items.forEach((it, ii) => {
        const key = page.id + ':' + bi + ':' + ii;
        const on = CHECKS[key] ? ' on' : '';
        h += '<div class="ck-item' + on + '" role="checkbox" tabindex="0" aria-checked="' + (!!CHECKS[key]) +
             '" data-key="' + key + '">' +
             '<span class="ck-box">' + ICON_CK + '</span>' +
             '<span class="ck-txt">' + (it.txt || '') +
             (it.sub ? '<small>' + it.sub + '</small>' : '') +
             '</span></div>';
      });
      h += '</div></section>';
      return h;
    },

    notes(b) {
      let h = '<section class="block" style="padding:0;border:0;background:none;box-shadow:none">';
      (b.items || []).forEach(n => {
        h += '<div class="note ' + (n.tone || 'info') + '">' +
             '<span class="n-em">' + (n.em || '💡') + '</span>' +
             '<div class="n-wrap"><b class="n-t">' + (n.title || '') + '</b>' +
             '<div class="n-b">' + (n.body || '') + '</div></div>' +
             '</div>';
      });
      h += '</section>';
      return h;
    },

    files(b) {
      let h = '<section class="block"><h2>' + (b.title || '첨부 자료') + '</h2><div class="files">';
      (b.items || []).forEach(f => {
        const ex = extOf(f.path);
        h += '<a class="file" href="' + f.path + '" download data-check="' + f.path + '">' +
             '<span class="f-ext ' + ex + '">' + ex.toUpperCase().slice(0, 4) + '</span>' +
             '<span class="f-body"><b>' + (f.name || fileName(f.path)) + '</b>' +
             '<small>' + (f.desc || fileName(f.path)) + '</small></span>' +
             '<span class="f-arrow">' + ICON_DL + '</span>' +
             '</a>';
      });
      h += '</div></section>';
      return h;
    },

    example(b) {
      const svg = exSceneSvg(b);
      let h = '<section class="block example"><h2>' + (b.title || '실제 사용 예시') + '</h2>';
      if (b.lead) h += '<p class="ex-lead">' + b.lead + '</p>';
      if (svg) {
        h += '<figure class="ex-fig">' + svg +
             (b.cap ? '<figcaption>' + b.cap + '</figcaption>' : '') + '</figure>';
      }
      if (b.steps && b.steps.length) {
        h += '<ol class="ex-steps">' + b.steps.map(s =>
          '<li><b>' + (s.t || '') + '</b>' + (s.d ? '<span>' + s.d + '</span>' : '') + '</li>').join('') + '</ol>';
      }
      if (b.note) {
        h += '<div class="note tip"><span class="n-em">' + (b.noteEm || '🧭') + '</span><div class="n-wrap">' +
             '<b class="n-t">' + (b.noteTitle || '이렇게 쓰면 편합니다') + '</b>' +
             '<div class="n-b">' + b.note + '</div></div></div>';
      }
      h += '</section>';
      return h;
    },

    gallery(b) {
      let h = '<section class="block"><h2>' + (b.title || '이미지') + '</h2><div class="gal">';
      (b.items || []).forEach(g => {
        h += '<figure>' +
             '<img src="' + g.src + '" alt="' + (g.cap || '') + '" loading="lazy" data-img="' + g.src + '">' +
             (g.cap ? '<figcaption>' + g.cap + '</figcaption>' : '') +
             '</figure>';
      });
      h += '</div></section>';
      return h;
    },

    links(b) {
      let h = '<section class="block"><h2>' + (b.title || '링크') + '</h2><div class="links">';
      (b.items || []).forEach(l => {
        if (l.url) {
          h += '<a class="lk" href="' + l.url + '" target="_blank" rel="noopener noreferrer">' +
               '<span class="lk-em">' + (l.em || '🔗') + '</span>' +
               /* 설명은 단어 단위로, 주소만 아무 데서나 끊기게 나눠 둔다 */
               '<span class="lk-body"><b>' + l.name + '</b><small>' +
               (l.desc ? '<span class="lk-desc">' + l.desc + '</span> · ' : '') +
               '<span class="lk-url">' + esc(l.url) + '</span></small></span>' +
               '<span class="lk-out">' + ICON_OUT + '</span></a>';
        } else {
          h += '<div class="lk todo">' +
               '<span class="lk-em">' + (l.em || '📝') + '</span>' +
               '<span class="lk-body"><b>' + l.name + '</b><small>' + (l.desc || '') + '</small></span>' +
               '<span class="f-badge">주소 미등록</span></div>';
        }
      });
      h += '</div></section>';
      return h;
    },

    table(b) {
      let h = '<section class="block">';
      if (b.title) h += '<h2>' + b.title + '</h2>';
      h += '<div class="tbl-wrap"><table><thead><tr>';
      (b.head || []).forEach(c => { h += '<th>' + c + '</th>'; });
      h += '</tr></thead><tbody>';
      (b.rows || []).forEach(r => {
        h += '<tr>';
        r.forEach(c => { h += '<td>' + c + '</td>'; });
        h += '</tr>';
      });
      h += '</tbody></table></div></section>';
      return h;
    },

    months(b) {
      const items = b.items || [];
      const now = new Date().getMonth() + 1;

      const CAT = {
        '디벗': 'c-dev', '계정': 'c-acc', '충전함': 'c-cab', '전자칠판': 'c-brd',
        '디벗·계정': 'c-devacc', '디벗·충전함': 'c-devcab', '공통': 'c-com'
      };
      const KIND = { '수신': 'k-in', '자체': 'k-self', '참고': 'k-ref' };

      // 월 바로가기 (해시를 쓰면 라우터와 충돌하므로 버튼 + 스크롤 방식)
      let h = '<section class="block"><h2>월 바로가기<span class="cnt">오늘 기준 ' + now + '월</span></h2>';
      h += '<div class="mon-jump">';
      items.forEach(it => {
        h += '<button type="button" class="mon-chip' + (it.m === now ? ' now' : '') +
             '" data-mon="' + it.m + '">' + it.label + '</button>';
      });
      h += '</div></section>';

      h += '<div class="months">';
      items.forEach(it => {
        const imgs = it.imgs || [];
        h += '<article class="mon' + (it.m === now ? ' now' : '') + '" data-mon-card="' + it.m + '">';

        if (imgs.length) {
          h += '<div class="mon-imgs' + (imgs.length > 1 ? ' multi' : '') + '">';
          imgs.forEach(src => {
            h += '<img src="' + src + '" alt="' + it.label + ' 디벗 업무 배너" loading="lazy" data-img="' + src + '">';
          });
          h += '</div>';
        }

        h += '<div class="mon-in">';
        h += '<div class="mon-head"><span class="mon-n">' + it.label + '</span>' +
             (it.season ? '<span class="mon-season">' + it.season + '</span>' : '') +
             (it.m === now ? '<span class="mon-now">이번 달</span>' : '') + '</div>';
        h += '<p class="mon-sub">' + it.sub + '</p>';

        // 업무 내용
        const tasks = it.tasks || [];
        if (tasks.length) {
          h += '<div class="mon-tasks">';
          tasks.forEach(t => {
            h += '<div class="mon-task">' +
                 '<span class="cat ' + (CAT[t.c] || 'c-dev') + '">' + t.c + '</span>' +
                 '<div class="mon-task-b">' + t.txt + '</div>' +
                 '</div>';
          });
          h += '</div>';
        }

        // 이 달 주요 오는 공문
        const docs = it.docs || [];
        if (docs.length) {
          h += '<div class="mon-docs">' +
               '<div class="mon-docs-h"><b>이 달 주요 오는 공문</b>' +
               '<span>수신(외부) 공문은 참고용 · 의무 아님 &nbsp;|&nbsp; <i>★</i> 제출·일정 주의</span></div>';
          docs.forEach(d => {
            h += '<div class="mon-doc">' +
                 '<span class="kind ' + (KIND[d.kind] || 'k-in') + '">' + d.kind + '</span>' +
                 (d.star ? '<span class="star">★</span>' : '<span class="star off"></span>') +
                 '<div class="mon-doc-b">' + d.txt + '</div>' +
                 '</div>';
          });
          h += '</div>';
        }

        // 업무표 원본 이미지
        (it.sheets || []).forEach(sh => {
          h += '<figure class="mon-sheet">' +
               '<img src="' + sh.src + '" alt="' + esc(sh.cap || (it.label + ' 업무표')) + '" loading="lazy" data-img="' + sh.src + '">' +
               '<figcaption>' + (sh.cap || it.label + ' 업무표 원본 — 인쇄해서 붙여 두면 편합니다') + '</figcaption>' +
               '</figure>';
        });

        const links = (it.links || []).map(id => PAGES.find(p => p.id === id)).filter(Boolean);
        if (links.length) {
          h += '<div class="mon-links"><span class="mon-links-t">관련 업무</span>';
          links.forEach(p => {
            h += '<a class="mon-link" href="#/' + p.id + '"><span>' + p.em + '</span>' + p.short + '</a>';
          });
          h += '</div>';
        }

        h += '</div></article>';
      });
      h += '</div>';
      return h;
    },

    profile(b) {
      const p = pfGet();
      let h = '<section class="block rulegen" id="profBox"><h2>' + (b.title || '학교 기본 정보') +
              '<span class="cnt" id="pfSaved">자동 저장됨</span></h2>';

      (b.groups || []).forEach(g => {
        h += '<div class="pf-group">';
        h += '<div class="pf-gh"><span>' + (g.em || '•') + '</span><b>' + g.name + '</b></div>';
        if (g.hint) h += '<p class="pf-hint">' + g.hint + '</p>';
        /* 선택 버튼(seg)은 표 바깥에 한 줄로 놓는다 */
        (g.fields || []).filter(f => f.type === 'seg').forEach(f => {
          h += '<div class="rg-row pf-seg"><span class="rg-lb">' + f.label + '</span>' +
               '<div class="rg-seg sm" data-pseg="' + f.k + '">';
          (f.options || []).forEach(o => {
            h += '<button type="button" data-v="' + o.v + '"><b>' + o.t + '</b></button>';
          });
          h += '</div></div>';
        });

        /* 엑셀로 한 번에 넣기 — 표 바깥에 통째로 놓는다 */
        (g.fields || []).filter(f => f.type === 'xlsx').forEach(f => {
          h += '<div class="wf-xl' + (f.when ? ' pf-when ' + f.when : '') + '" data-xl="' + esc(f.k) + '">' +
               '<div class="wf-xl-t"><b>' + (f.title || '📊 엑셀로 한 번에 넣기') + '</b>' +
               (f.sub ? '<span>' + f.sub + '</span>' : '') + '</div>' +
               '<div class="wf-xl-a">' +
                 '<button type="button" class="rg-btn excel" data-xltpl="' + esc(f.k) + '">⬇️ 엑셀 양식 내려받기</button>' +
                 '<label class="rg-btn ghost wf-up">📂 엑셀 · CSV 올리기' +
                 '<input type="file" data-xlfile="' + esc(f.k) + '" accept=".xlsx,.csv" hidden></label>' +
               '</div>' +
               '<div class="wf-xl-msg" data-xlmsg="' + esc(f.k) + '">' + (f.hint || '') + '</div>' +
               '</div>';
        });

        const rest = (g.fields || []).filter(f => f.type !== 'seg' && f.type !== 'xlsx');
        h += '<div class="rg-grid' + (rest.some(f => f.type === 'textarea') ? ' one' : '') + '">';
        rest.forEach(f => {
          h += '<label class="rg-f' + (f.when ? ' pf-when ' + f.when : '') + '"><span>' + f.label + '</span>';
          if (f.type === 'textarea') {
            h += '<textarea data-p="' + f.k + '" rows="' + (f.rows || 4) + '" spellcheck="false" placeholder="' +
                 esc(f.ph || '') + '"></textarea>';
          } else {
            h += '<input type="text" data-p="' + f.k + '" placeholder="' + esc(f.ph || '') + '">';
          }
          h += '</label>';
        });
        h += '</div></div>';
      });

      h += '<div class="rg-actions">' +
           '<button type="button" class="rg-btn ghost" id="pfDl">⬇️ 전체 백업 내려받기</button>' +
           '<button type="button" class="rg-btn ghost" id="pfUpBtn">⬆️ 백업 불러오기</button>' +
           '<input type="file" id="pfUp" accept="application/json,.json" hidden>' +
           '<button type="button" class="rg-btn ghost" id="pfClear">모두 지우기</button>' +
           '</div>';
      h += '</section>';
      ED.profileFields = (b.groups || []).reduce((a, g) => a.concat(g.fields.map(f => f.k)), []);
      return h;
    },

    rulegen(b) {
      const d = b.defaults || {};
      RG.defaults = d;
      const F = [
        ['school', '학교 이름', '예: ○○중학교'],
        ['dept', '부서명', '예: 과학정보부'],
        ['headline', '제목 윗줄 문구', '예: 학생이라면 지켜야 할'],
        ['ptitle', '포스터 제목', '예: 디벗 이용수칙'],
        ['slogan1', '하단 표어 첫째 줄', ''],
        ['slogan2', '하단 표어 둘째 줄', '']
      ];

      let h = '<section class="block rulegen" id="ruleGen"><h2>' + (b.title || '포스터 만들기') + '</h2>';

      h += '<div class="rg-pick">';
      h += '<div class="rg-row"><span class="rg-lb">출력 방식</span><div class="rg-seg" data-seg="tool">' +
           '<button type="button" data-v="pdf"><b>📄 PDF</b><small>규칙만 넣으면 바로 완성</small></button>' +
           '<button type="button" data-v="chatgpt"><b>🤖 ChatGPT 이미지</b><small>프롬프트 복사해서 사용</small></button>' +
           '<button type="button" data-v="flow"><b>🎬 Google Flow 이미지</b><small>프롬프트 복사해서 사용</small></button>' +
           '</div></div>';
      h += '<div class="rg-row"><span class="rg-lb">용지 방향</span><div class="rg-seg sm" data-seg="orient">' +
           '<button type="button" data-v="portrait"><b>A4 세로형</b></button>' +
           '<button type="button" data-v="landscape"><b>A4 가로형</b></button>' +
           '</div></div>';

      h += '<div class="rg-row"><span class="rg-lb">디자인 분위기</span><div class="rg-seg sm" data-seg="mood">';
      Object.keys(MOODS).forEach(k => {
        h += '<button type="button" data-v="' + k + '">' +
             '<b><i class="sw" style="background:' + MOODS[k].sw + '"></i>' + MOODS[k].name + '</b></button>';
      });
      h += '</div></div>';

      h += '<div class="rg-row"><span class="rg-lb">학생 캐릭터</span><div class="rg-seg sm" data-seg="char">' +
           '<button type="button" data-v="on"><b>🧑‍🎓 포함</b></button>' +
           '<button type="button" data-v="off"><b>아이콘만</b></button>' +
           '</div></div>';
      h += '</div>';

      h += '<div class="rg-grid">';
      F.forEach(f => {
        h += '<label class="rg-f"><span>' + f[1] + '</span>' +
             '<input type="text" data-f="' + f[0] + '" placeholder="' + f[2] + '"></label>';
      });
      h += '</div>';

      h += '<label class="rg-f rg-rules"><span>규칙 <em>— 한 줄에 하나씩 적으세요</em>' +
           '<i id="rgCount"></i></span>' +
           '<textarea data-f="rules" rows="11" spellcheck="false"></textarea></label>';

      h += '<div class="rg-actions">' +
           '<button type="button" class="rg-btn ghost" id="rgReset">처음 예시로 되돌리기</button>' +
           '</div>';

      h += '<div id="rgOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    edzipgen(b) {
      let h = '<section class="block rulegen" id="ezGen"><h2>' +
              (b.title || '에듀집 확인완료 목록 조회') + '<span class="cnt" id="ezCount"></span></h2>';

      h += '<div class="note info"><span class="n-em">🏛️</span><div class="n-wrap">' +
           '<b class="n-t">에듀집에서 바로 받아옵니다</b><div class="n-b">' +
           '교육부 <b>에듀집</b>의 「학습지원 소프트웨어」 가운데 <b>확인완료</b>인 것만 모아 ' +
           '<b>구분 · 서비스명 · 공급자 · 작성일</b> 네 칸짜리 엑셀로 만듭니다. ' +
           '누를 때마다 <b>그 시점의 최신 목록</b>을 받아오고, 받아 둔 목록은 이 브라우저에 남아 ' +
           '다음에 들어와도 그대로 보입니다.' +
           '</div></div></div>';

      h += '<div class="rg-actions">' +
           '<button type="button" class="rg-btn" id="ezLoad">🔄 에듀집에서 최신 목록 불러오기</button>' +
           '<a class="rg-btn ghost" href="https://edzip.kr/learning-sw" target="_blank" rel="noopener">' +
             '🏛️ 에듀집에서 직접 보기</a>' +
           '</div>' +
           '<div class="ez-state" id="ezState"></div>';

      h += '<div class="rg-pick"><div class="rg-row"><span class="rg-lb">구분</span>' +
           '<div class="rg-seg" data-seg="cls" id="ezCls">' +
           '<button type="button" data-v="">전체</button>' +
           Object.keys(EZ_CLASS).map(k =>
             '<button type="button" data-v="' + k + '">' + EZ_CLASS[k] + '</button>').join('') +
           '</div></div></div>';

      h += '<label class="rg-f"><span>검색 <em>— 서비스명 · 공급자에서 찾습니다. 여러 개는 쉼표로 구분</em></span>' +
           '<input type="text" id="ezQ" placeholder="예: 패들렛, 캔바, 클래스팅"></label>';

      h += '<div id="ezOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    swgen(b) {
      SW.defaults = b.defaults || {};
      const F = [
        ['year', '학년도', '예: 2026'],
        ['meetDate', '학교운영위원회 개최일', '예: 2026. 2. 20.'],
        ['planDate', '수요조사 마감일', '예: 2026. 2. 5.'],
        ['proposer', '제안설명자', '예: 홍길동'],
        ['edzipDate', '에듀집 기준일', '예: 2026. 2. 7.']
      ];

      let h = '<section class="block rulegen" id="swGen"><h2>' + (b.title || '학운위 자료 만들기') +
              '<span class="cnt" id="swCount"></span></h2>';

      h += '<div class="rg-pick"><div class="rg-row"><span class="rg-lb">자료 종류</span>' +
           '<div class="rg-seg" data-seg="kind">' +
           '<button type="button" data-v="plan"><b>📋 선정 계획(안)</b><small>워드 · 추진 근거~기대효과</small></button>' +
           '<button type="button" data-v="review"><b>⚖️ 학운위 심의(안)</b><small>워드 · 제안서~심의 결과란</small></button>' +
           '<button type="button" data-v="xlsx"><b>📊 목록·체크리스트</b><small>엑셀 · 시트 3개</small></button>' +
           '</div></div></div>';

      h += '<div class="rg-grid">';
      F.forEach(f => {
        h += '<label class="rg-f"><span>' + f[1] + '</span>' +
             '<input type="text" data-s="' + f[0] + '" placeholder="' + esc(f[2]) + '"></label>';
      });
      h += '</div>';

      h += '<label class="rg-f rg-rules"><span>근거 공문 <em>— 계획(안)·심의(안)의 추진 근거로 들어갑니다</em></span>' +
           '<input type="text" data-s="basis" placeholder="예: 교육부 인공지능교육진흥과-000(2026. 1. 21.) 「2026학년도 … 심의 가이드(안)」"></label>';

      h += '<label class="rg-f rg-rules"><span>세부 추진 계획 <em>— 한 줄에 하나씩 <b>단계 | 일정 | 주요 내용 | 담당</b></em></span>' +
           '<textarea data-s="steps" rows="6" spellcheck="false"></textarea></label>';

      h += '<label class="rg-f rg-rules"><span>에듀테크 소프트웨어 목록 ' +
           '<em>— <b>제품명만</b> 한 줄에 하나씩 적으면 됩니다. 관련 교과와 활용 목적은 자동으로 채워집니다.</em></span>' +
           '<textarea data-s="swList" rows="12" spellcheck="false" ' +
           'placeholder="패들렛&#10;띵커벨&#10;엔트리&#10;똑똑! 수학탐험대&#10;&#10;※ 직접 정하고 싶으면 — 제품명 | 관련 교과 | 활용 목적"></textarea></label>';

      h += '<div class="sw-quick" id="swQuick"><b class="sw-quick-h">자주 올라오는 제품 — 눌러서 목록에 추가</b>';
      SW_QUICK.forEach(g => {
        h += '<div class="sw-quick-g"><span>' + esc(g[0]) + '</span><div class="sw-quick-c">' +
             g[1].map(n => '<button type="button" data-add="' + esc(n) + '">' + esc(n) + '</button>').join('') +
             '</div></div>';
      });
      h += '</div>';

      /* 목록이 1,000줄을 넘어갈 수 있어서, 누를 것을 모두 위로 올리고
         길게 늘어지는 「인식 결과」는 맨 아래로 내렸다.
         버튼을 찾으려고 표를 한참 스크롤해 내려갈 일이 없게 한다. */
      h += '<div class="rg-actions" id="swActs"></div>';
      h += '<div id="swOut" class="rg-out"></div>';
      h += '<div id="swParsed" class="sw-parsed"></div>';
      h += '</section>';
      return h;
    },

    edugen(b) {
      let h = '<section class="block rulegen" id="eduGen"><h2>' + (b.title || '안내 자료 만들기') + '</h2>';
      h += '<div class="rg-pick">';
      h += '<div class="rg-row"><span class="rg-lb">자료 종류</span><div class="rg-seg" data-seg="kind">' +
           '<button type="button" data-v="book"><b>📘 학생용 안내 자료</b><small>여러 쪽 · 배부용</small></button>' +
           '<button type="button" data-v="one"><b>📄 한 장 요약 안내문</b><small>교실 게시 · 가정통신문</small></button>' +
           '<button type="button" data-v="lesson"><b>🧑‍🏫 교사용 45분 구성안</b><small>담임 배부용</small></button>' +
           '</div></div>';
      /* 한 장 요약을 고를 때만 나타난다 */
      h += '<div class="rg-row" id="eduOutRow" hidden><span class="rg-lb">만드는 방법</span>' +
           '<div class="rg-seg" data-seg="out">' +
           '<button type="button" data-v="doc"><b>📄 인쇄물로 만들기</b><small>PDF · 워드 · HTML</small></button>' +
           '<button type="button" data-v="gpt"><b>🤖 ChatGPT 이미지</b><small>프롬프트 복사해서 사용</small></button>' +
           '<button type="button" data-v="flow"><b>🎬 Google Flow 이미지</b><small>프롬프트 복사해서 사용</small></button>' +
           '</div></div>';
      h += '</div>';
      h += '<div id="eduMissing"></div>';
      h += '<div id="eduOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    returngen(b) {
      const d = b.defaults || {};
      RT.defaults = d;
      const F = [
        ['school', '학교 이름', '예: ○○중학교'],
        ['dept', '부서명', '예: 과학정보부'],
        ['dtitle', '문서 제목', '디벗 반납 확인서(학생용/전입교제출)'],
        ['dsub', '제목 아래 안내 문구', '(전입학교 디벗 담당선생님께 제출합니다.)']
      ];

      let h = '<section class="block rulegen" id="retGen"><h2>' + (b.title || '반납 확인서 만들기') + '</h2>';

      h += '<div class="rg-pick">';
      h += '<div class="rg-row"><span class="rg-lb">인쇄 매수</span><div class="rg-seg sm" data-seg="copies">' +
           '<button type="button" data-v="1"><b>1매</b></button>' +
           '<button type="button" data-v="2"><b>2매 (학교·학생 보관용)</b></button>' +
           '</div></div>';
      h += '<div class="rg-row"><span class="rg-lb">날짜 칸</span><div class="rg-seg sm" data-seg="datemode">' +
           '<button type="button" data-v="blank"><b>빈칸으로</b></button>' +
           '<button type="button" data-v="today"><b>오늘 날짜 넣기</b></button>' +
           '</div></div>';
      h += '</div>';

      h += '<div class="rg-grid">';
      F.forEach(f => {
        h += '<label class="rg-f"><span>' + f[1] + '</span>' +
             '<input type="text" data-f="' + f[0] + '" placeholder="' + f[2] + '"></label>';
      });
      h += '</div>';

      h += '<label class="rg-f rg-rules"><span>구성품 항목 <em>— 한 줄에 하나씩</em></span>' +
           '<textarea data-f="parts" rows="4" spellcheck="false"></textarea></label>';
      h += '<label class="rg-f rg-rules"><span>※ 안내 문구</span>' +
           '<textarea data-f="notice" rows="2" spellcheck="false"></textarea></label>';
      h += '<label class="rg-f rg-rules"><span>확인 문장</span>' +
           '<textarea data-f="body" rows="2" spellcheck="false"></textarea></label>';

      h += '<div class="rg-actions"><button type="button" class="rg-btn ghost" id="rtReset">처음 양식으로 되돌리기</button></div>';
      h += '<div id="rtOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    csgen(b) {
      const d = b.defaults || {};
      CS.defaults = d;

      let h = '<section class="block rulegen" id="csGen"><h2>' + (b.title || '개인정보 동의서 초안 만들기') + '</h2>';

      h += '<div class="rg-pick"><div class="rg-row"><span class="rg-lb">만드는 방법</span>' +
           '<div class="rg-seg" data-seg="out">' +
           '<button type="button" data-v="doc"><b>동의서 초안</b><small>PDF · 워드 · HTML</small></button>' +
           '<button type="button" data-v="gpt"><b>ChatGPT 이미지</b><small>안내문 표지 그림</small></button>' +
           '<button type="button" data-v="flow"><b>Google Flow 이미지</b><small>안내문 표지 그림</small></button>' +
           '</div></div></div>';

      h += '<div class="rg-grid">';
      [['school', '학교 이름', '예: ○○중학교'],
       ['dept', '부서명', '예: 과학정보부'],
       ['date', '발행일', '예: 2026. 3. 4.'],
       ['due', '제출 기한', '예: 3월 6일(금)'],
       ['contact', '문의처', '예: 2층 과학정보부 (내선 000)']
      ].forEach(f => {
        h += '<label class="rg-f"><span>' + f[1] + '</span>' +
             '<input type="text" data-f="' + f[0] + '" placeholder="' + f[2] + '"></label>';
      });
      h += '</div>';

      h += '<label class="rg-f rg-rules"><span>동의 항목 <em>— 한 줄에 하나씩, ' +
           '<b>구분 | 수집·이용 목적 | 수집 항목 | 보유 및 이용 기간</b></em></span>' +
           '<textarea data-f="items" rows="8" spellcheck="false"></textarea></label>';
      h += '<label class="rg-f rg-rules"><span>맺음말 <em>— 안내문 앞부분에 들어갈 인사와 설명</em></span>' +
           '<textarea data-f="intro" rows="4" spellcheck="false"></textarea></label>';

      h += '<div class="rg-actions"><button type="button" class="rg-btn ghost" id="csReset">처음 양식으로 되돌리기</button></div>';
      h += '<div id="csOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    cabgen(b) {
      const d = b.defaults || {};
      CB.defaults = d;

      let h = '<section class="block rulegen" id="cabGen"><h2>' + (b.title || '충전함 안내문 만들기') + '</h2>';

      h += '<div class="rg-pick"><div class="rg-row"><span class="rg-lb">만드는 방법</span>' +
           '<div class="rg-seg" data-seg="out">' +
           '<button type="button" data-v="doc"><b>📄 인쇄물로 만들기</b><small>PDF · 워드 · HTML</small></button>' +
           '<button type="button" data-v="gpt"><b>🤖 ChatGPT 이미지</b><small>프롬프트 복사해서 사용</small></button>' +
           '<button type="button" data-v="flow"><b>🎬 Google Flow 이미지</b><small>프롬프트 복사해서 사용</small></button>' +
           '</div></div>' +
           /* 이미지로 만들 때만 나타난다 */
           '<div class="rg-row" id="cbShotRow" hidden><span class="rg-lb">무엇을 그릴까요</span>' +
           '<div class="rg-seg" data-seg="shot">' +
           '<button type="button" data-v="poster"><b>📢 사용 안내문 포스터</b><small>충전함 문에 붙이는 글 포스터</small></button>' +
           '<button type="button" data-v="howto"><b>🔌 보관 방법 설명 그림</b><small>설치 자리 · 넣는 순서 · 방학 보관</small></button>' +
           '</div></div></div>';

      h += '<div class="rg-grid">';
      [['school', '학교 이름', '예: ○○중학교'],
       ['dept', '부서명', '예: 과학정보부'],
       ['dtitle', '안내문 제목', '충전함 사용 유의사항'],
       ['contact', '문의처', '예: 2층 과학정보부']
      ].forEach(f => {
        h += '<label class="rg-f"><span>' + f[1] + '</span>' +
             '<input type="text" data-f="' + f[0] + '" placeholder="' + f[2] + '"></label>';
      });
      h += '</div>';

      h += '<label class="rg-f rg-rules"><span>안내문 내용 <em>— 한 줄에 하나씩, 번호는 자동으로 붙습니다</em></span>' +
           '<textarea data-f="notes" rows="9" spellcheck="false"></textarea></label>';
      h += '<label class="rg-f rg-rules"><span>보관 · 충전 운영 규칙 <em>— 한 줄에 하나씩, ' +
           '<b>제목 | 설명</b> 형식 (제목만 적어도 됩니다)</em></span>' +
           '<textarea data-f="rules" rows="6" spellcheck="false"></textarea></label>';

      h += '<div class="rg-actions"><button type="button" class="rg-btn ghost" id="cbReset">처음 양식으로 되돌리기</button></div>';
      h += '<div id="cbOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    wifigen(b) {
      const d = b.defaults || {};
      WF.defaults = d;

      let h = '<section class="block rulegen" id="wifiGen"><h2>' + (b.title || '와이파이 안내문 만들기') + '</h2>';

      h += '<div class="rg-pick">';
      h += '<div class="rg-row"><span class="rg-lb">와이파이 구성</span><div class="rg-seg" data-seg="mode">' +
           '<button type="button" data-v="one"><b>학교 전체가 같음</b>' +
           '<small>네트워크 하나 · 비밀번호 하나</small></button>' +
           '<button type="button" data-v="many"><b>교실 · 구역마다 다름</b>' +
           '<small>구역별 목록으로 안내</small></button>' +
           '</div></div>';
      h += '<div class="rg-row"><span class="rg-lb">비밀번호</span><div class="rg-seg sm" data-seg="pwmode">' +
           '<button type="button" data-v="show"><b>안내문에 인쇄</b></button>' +
           '<button type="button" data-v="blank"><b>빈칸 — 손으로 적기</b></button>' +
           '</div></div>';
      h += '<div class="rg-row"><span class="rg-lb">접속 QR</span><div class="rg-seg sm" data-seg="qr">' +
           '<button type="button" data-v="on"><b>넣기</b></button>' +
           '<button type="button" data-v="off"><b>빼기</b></button>' +
           '</div></div>';
      h += '</div>';

      h += '<div class="rg-grid">';
      [['school', '학교 이름', '예: ○○중학교'],
       ['dept', '부서명', '예: 과학정보부'],
       ['dtitle', '안내문 제목', '학교 와이파이 접속 안내'],
       ['contact', '문의처', '예: 2층 과학정보부 (내선 000)']
      ].forEach(f => {
        h += '<label class="rg-f"><span>' + f[1] + '</span>' +
             '<input type="text" data-f="' + f[0] + '" placeholder="' + f[2] + '"></label>';
      });
      h += '</div>';

      /* 공통 와이파이 하나일 때 */
      h += '<div class="wf-only one"><div class="rg-grid">' +
           '<label class="rg-f"><span>네트워크 이름 (SSID)</span>' +
           '<input type="text" data-f="ssid" placeholder="예: OOMS_STUDENT"></label>' +
           '<label class="rg-f"><span>비밀번호</span>' +
           '<input type="text" data-f="pw" placeholder="예: 담임 선생님이 안내"></label>' +
           '</div></div>';

      /* 구역마다 다를 때 */
      h += '<div class="wf-only many">' +
           '<div class="wf-xl">' +
             '<div class="wf-xl-t"><b>📊 엑셀로 한 번에 넣기</b>' +
             '<span>구역이 많으면 엑셀에 정리해서 올리는 편이 빠릅니다</span></div>' +
             '<div class="wf-xl-a">' +
               '<button type="button" class="rg-btn excel" id="wfTpl">⬇️ 엑셀 양식 내려받기</button>' +
               '<label class="rg-btn ghost wf-up">📂 엑셀 · CSV 올리기' +
               '<input type="file" id="wfFile" accept=".xlsx,.csv" hidden></label>' +
             '</div>' +
             '<div class="wf-xl-msg" id="wfMsg">' + WIFI_XL.hint + '</div>' +
           '</div>' +
           '<label class="rg-f rg-rules"><span>구역별 와이파이 <em>— 한 줄에 하나씩, ' +
           '<b>구역 | 네트워크 이름 | 비밀번호</b> 순서 (비밀번호는 빼도 됩니다)</em></span>' +
           '<textarea data-f="rooms" rows="6" spellcheck="false"></textarea></label>' +
           '<div class="note info" style="margin-bottom:var(--s4)"><span class="n-em">🔗</span><div class="n-wrap">' +
           '<b class="n-t">「학교 정보」와 같은 값을 씁니다</b><div class="n-b">' +
           '여기에 적은 목록은 <a href="#/setup"><b>학교 기본 정보</b></a>의 와이파이 항목과 ' +
           '<b>자동으로 함께 저장</b>됩니다. 한쪽에서 고치면 다른 쪽도 바뀝니다.' +
           '</div></div></div></div>';

      h += '<label class="rg-f rg-rules"><span>접속 순서 <em>— 한 줄에 하나씩</em></span>' +
           '<textarea data-f="steps" rows="4" spellcheck="false"></textarea></label>';
      h += '<label class="rg-f rg-rules"><span>안 될 때 확인할 것 <em>— 한 줄에 하나씩</em></span>' +
           '<textarea data-f="trouble" rows="5" spellcheck="false"></textarea></label>';
      h += '<label class="rg-f rg-rules"><span>※ 안내 문구</span>' +
           '<textarea data-f="notice" rows="2" spellcheck="false"></textarea></label>';

      h += '<div class="rg-actions"><button type="button" class="rg-btn ghost" id="wfReset">처음 양식으로 되돌리기</button></div>';
      h += '<div id="wfOut" class="rg-out"></div>';
      h += '</section>';
      return h;
    },

    timeline(b) {
      let h = '<section class="block">';
      if (b.title) h += '<h2>' + b.title + '</h2>';
      h += '<div class="tl">';
      (b.items || []).forEach(it => {
        h += '<div class="tl-item ' + (it.tone || 'q1') + '">' +
             '<div class="tl-m"><b>' + it.m + '</b>' + (it.note ? '<span>' + it.note + '</span>' : '') + '</div>' +
             '<div class="tl-list">';
        (it.rows || []).forEach(r => { h += '<div class="tl-row"><span>' + r + '</span></div>'; });
        h += '</div></div>';
      });
      h += '</div></section>';
      return h;
    }
  };

  /* ---------- 홈 ---------- */
  function renderHome() {
    const jobs = PAGES.filter(p => typeof p.no === 'number');
    const files = new Set();
    const gens = new Set();
    PAGES.forEach(p => (p.blocks || []).forEach(b => {
      if (b.t === 'files') (b.items || []).forEach(i => files.add(i.path));
      if (['rulegen', 'returngen', 'edugen', 'swgen', 'edzipgen'].indexOf(b.t) > -1) gens.add(b.t);
    }));

    let h = '';
    h += '<section class="hero">' +
         '<span class="hero-art" aria-hidden="true"></span>' +
         '<h1>디벗 업무, 순서대로 하나씩 처리하세요</h1>' +
         '<p>학교운영위원회 심의부터 계정 발급 · 기기 관리 · 반납과 양품화까지 — 디벗 담당 교사가 한 해 동안 해야 할 일을 ' +
         '절차와 서식으로 정리했습니다. 위쪽 메뉴에서 업무를 고르면 준비물, 절차 체크리스트, 내려받을 서식이 함께 나옵니다.</p>' +
         '<div class="hero-meta">' +
         '<span>📁 업무 ' + jobs.length + '가지</span>' +
         '<span>📎 서식 ' + files.size + '종</span>' +
         '<span>🛠️ 문서 생성기 ' + gens.size + '종</span>' +
         '<span>✅ 체크리스트 진행률 저장</span>' +
         '<span>🖨️ 페이지별 인쇄 지원</span>' +
         '</div></section>';

    const first = ['setup', 'monthly'].map(id => PAGES.find(p => p.id === id)).filter(Boolean);
    if (first.length) {
      h += '<div class="sec-head"><h2>먼저 볼 것</h2>' +
           '<span>학교 정보를 한 번 채우고, 이번 달 할 일을 확인하세요</span></div>';
      h += '<div class="card-grid">' + first.map(cardHTML).join('') + '</div>';
    }

    h += '<div class="sec-head"><h2>업무별 안내</h2><span>1번부터 ' + jobs.length + '번까지 순서대로 진행하면 됩니다</span></div>';
    h += '<div class="card-grid">' + jobs.map(cardHTML).join('') + '</div>';

    h += '<div class="sec-head"><h2>자료 넣는 방법</h2><span>GitHub에 그대로 올려도 동작합니다</span></div>' +
         '<section class="block"><div class="rich">' +
         '<p>이 사이트는 <b>base64를 쓰지 않습니다.</b> 파일과 이미지를 폴더에 넣고 경로만 연결하는 방식이라 HTML 용량이 커지지 않습니다.</p>' +
         '<ul>' +
         '<li>PDF·한글·엑셀 등 <b>첨부파일</b> → <code>assets/files/</code> 폴더에 넣기 ' +
         '(첨부가 많은 업무는 <code>council/</code> <code>manuals/</code> <code>accounts/</code> <code>mdm/</code> 하위 폴더로 정리되어 있습니다)</li>' +
         '<li>사진·캡처 등 <b>이미지</b> → <code>assets/img/</code> 폴더에 넣기</li>' +
         '<li>파일 이름은 <code>assets/js/data.js</code>에 적힌 이름과 <b>똑같이</b> 맞추기</li>' +
         '</ul>' +
         '<div class="callout"><b>GitHub에 올릴 때</b>는 <b>밑줄( _ )로 시작하는 폴더만 빼고</b> 전부 올리면 됩니다. ' +
         '<code>_원본자료 (업로드 제외)</code> 안에는 학교 내부 양식과 원본 이미지가 들어 있어 올리면 안 됩니다. ' +
         '자세한 내용은 폴더 안의 <b>「깃허브 업로드 방법.txt」</b>를 보세요.</div>' +
         '<p>아직 넣지 않은 파일은 <b>“준비 중”</b>으로, 이미지는 <b>회색 안내 상자</b>로 표시되어 무엇이 빠졌는지 바로 보입니다.</p>' +
         '</div></section>';

    return h;
  }

  function cardHTML(p) {
    const pr = pageProgress(p);
    let foot = '';
    if (pr) {
      const doneAll = pr.done === pr.total;
      foot = '<div class="bar"><i style="width:' + pr.pct + '%"></i></div>' +
             '<span class="bar-txt">' + pr.done + '/' + pr.total + '</span>' +
             (doneAll ? '<span class="tag done">완료</span>' : '');
    }
    return '<a class="card t-' + p.tag + '" href="#/' + p.id + '">' +
           '<div class="card-top">' +
           '<span class="card-em t-' + p.tag + '">' + p.em + '</span>' +
           '<span class="tag ' + p.tag + '">' + p.tagTxt + '</span>' +
           '<span class="card-no">' + (typeof p.no === 'number' ? String(p.no).padStart(2, '0') : p.no) + '</span>' +
           '</div>' +
           '<h3>' + p.title + '</h3>' +
           '<p>' + p.summary + '</p>' +
           '<div class="card-foot">' + foot + '</div>' +
           '</a>';
  }

  /* ---------- 상세 ---------- */
  function renderPage(p) {
    const idx = PAGES.indexOf(p);
    const prev = PAGES[idx - 1], next = PAGES[idx + 1];
    const pr = pageProgress(p);

    let h = '<div class="crumb"><a href="#/home">홈</a><span>›</span><span>' + p.title + '</span></div>';

    h += '<div class="page-head t-' + p.tag + '">' +
         '<span class="ph-em t-' + p.tag + '">' + p.em + '</span>' +
         '<div class="ph-body"><h1>' + p.title + '</h1><p>' + p.summary + '</p>' +
         '<div class="ph-tags"><span class="tag ' + p.tag + '">' + p.tagTxt + '</span>' +
         (pr ? '<span class="tag' + (pr.done === pr.total ? ' done' : '') + '">진행 ' + pr.done + ' / ' + pr.total + '</span>' : '') +
         '</div></div></div>';

    (p.blocks || []).forEach((b, bi) => {
      const fn = R[b.t];
      if (fn) h += fn(b, p, bi);
    });

    h += '<div class="pager">';
    h += prev ? '<a class="pg" href="#/' + prev.id + '"><small>← 이전</small><b>' + prev.short + '</b></a>'
              : '<a class="pg" href="#/home"><small>← 이전</small><b>홈</b></a>';
    if (next) h += '<a class="pg next" href="#/' + next.id + '"><small>다음 →</small><b>' + next.short + '</b></a>';
    h += '</div>';

    return h;
  }

  /* ---------- 렌더 후 처리 ---------- */
  function afterRender() {
    // 이미지 없을 때 안내 상자로 교체
    $$('img[data-img]').forEach(img => {
      img.addEventListener('error', function () {
        const src = img.getAttribute('data-img');
        const ph = document.createElement('div');
        ph.className = 'img-ph';
        ph.innerHTML = '<div>🖼️ 이미지를 넣어주세요</div><code>' + src + '</code>';
        if (img.parentNode) img.parentNode.replaceChild(ph, img);
      }, { once: true });
    });

    // 생성기 초기화
    pfInit();
    rgInit();
    rtInit();
    wfInit();
    cbInit();
    csInit();
    eduInit();
    swInit();
    ezInit();

    // 줄바꿈 다듬기 · 화면에 들어오는 순서대로 떠오르게
    tidyBreaks($('#view'));
    setupReveal();

    // 첨부파일 존재 여부 확인 (없으면 “준비 중”)
    if (location.protocol !== 'file:') {
      $$('a.file[data-check]').forEach(a => {
        fetch(a.getAttribute('data-check'), { method: 'HEAD' })
          .then(res => { if (!res.ok) markMissing(a); })
          .catch(() => {});
      });
    }
  }

  /* ---------- 줄바꿈 다듬기 ----------
     한글은 style.css의 word-break:keep-all로 단어 중간에서 끊기지 않지만,
     가운뎃점(·)과 여는 괄호는 여전히 줄바꿈 자리로 잡힌다. 그 결과
       「번호·아이콘 / ·규칙」처럼 점이 줄 앞에 홀로 남거나
       「워드 / (.docx)」처럼 괄호가 앞말과 떨어지는
     어색한 줄바꿈이 생긴다. 보이지 않는 붙임표(U+2060)를 끼워 막는다.
     띄어쓰기가 있는 「기기 · 계정」은 원래대로 그 자리에서 줄이 바뀐다. */
  const WJ = '⁠';
  const TIDY_MAX = 12;   // 이보다 긴 덩어리는 좁은 칸에서 오히려 음절이 잘리므로 점에서 끊게 둔다

  function tidyBreaks(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const jobs = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue;
      if (!t || t.indexOf(WJ) >= 0 || !/[·・(]/.test(t)) continue;
      if (!n.parentElement || n.parentElement.closest('code,textarea,input,.rg-prompt,svg')) continue;

      const nt = t.replace(/\S+/g, tok => {
        if (!/[·・(]/.test(tok)) return tok;
        let s = tok.replace(/(\S)\(/g, '$1' + WJ + '(');   // 앞말에 바로 붙은 여는 괄호
        s = tok.length <= TIDY_MAX
          ? s.replace(/[·・]/g, m => WJ + m + WJ)  // 짧으면 통째로 붙여 둔다
          : s.replace(/[·・]/g, m => WJ + m);      // 길면 점 뒤에서 끊기게 (점이 줄 앞에 홀로 남는 것만 막는다)
        return s;
      });
      if (nt !== t) jobs.push([n, nt]);
    }
    jobs.forEach(j => { j[0].nodeValue = j[1]; });
  }

  /* 복사할 때는 보이지 않는 붙임표를 걷어낸다 — 한글 문서에 그대로 붙지 않도록 */
  document.addEventListener('copy', e => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const txt = sel.toString();
    if (txt.indexOf(WJ) < 0) return;
    try {
      e.clipboardData.setData('text/plain', txt.split(WJ).join(''));
      e.preventDefault();
    } catch (err) {}
  });

  /* ---------- 스크롤에 맞춰 떠오르는 등장 효과 ----------
     같은 화면에 여러 개가 함께 들어오면 아주 짧게 시차를 준다.
     IntersectionObserver를 못 쓰는 환경에서는 그냥 다 보이게 둔다. */
  let exObs = null;
  function setupReveal() {
    const targets = $$('#view > .block, #view > .card-grid > .card, #view > .pager');
    if (!targets.length) return;

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('reveal', 'in'));
      return;
    }

    if (exObs) exObs.disconnect();
    let n = 0, last = 0;
    exObs = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const now = performance.now();
        if (now - last > 320) n = 0;   // 한참 만에 들어온 것은 시차 없이
        last = now;
        en.target.style.setProperty('--rd', Math.min(n, 5) * 55 + 'ms');
        en.target.classList.add('in');
        n++;
        obs.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });

    targets.forEach(el => { el.classList.add('reveal'); exObs.observe(el); });
  }

  function markMissing(a) {
    a.classList.add('missing');
    a.removeAttribute('href');
    a.removeAttribute('download');
    const arrow = $('.f-arrow', a);
    if (arrow) {
      const b = document.createElement('span');
      b.className = 'f-badge';
      b.textContent = '준비 중';
      arrow.parentNode.replaceChild(b, arrow);
    }
  }

  /* =========================================================
     ① 사용 규칙 포스터 생성기
     ========================================================= */
  const RG_KEY = 'debut.rulegen';
  const RG_FIELDS = ['school', 'dept', 'headline', 'ptitle', 'slogan1', 'slogan2', 'rules'];

  /* 디자인 분위기 팔레트 */
  const MOODS = {
    navy: {
      name: '진한 남색', sw: '#12172B',
      bg: '#12172B', hdSm: '#D6DCEA', hdAc: '#FFC53D', t1: '#FFFFFF', t2: '#FFC53D',
      card: '#FFFFFF', cardLine: 'none', num: '#FFC53D', numTx: '#12172B', tx: '#1B2430',
      band: '#C0392B', b1: '#FFC53D', b2: '#FFFFFF', exBg: '#FFFFFF', exFg: '#C0392B',
      foot: '#96A0BC', sign: '#FFC53D', signTx: '#12172B', uniform: '#2C3A63', hair: '#2E2A28',
      ko: '짙은 남색 배경에 노란색을 포인트로 쓴, 멀리서도 눈에 띄는 강렬한 게시판용 디자인. 깔끔한 플랫 벡터 인포그래픽 스타일.',
      en: 'deep navy background with golden yellow accents, bold high-contrast school bulletin board style, clean flat vector infographic'
    },
    sky: {
      name: '밝은 하늘색', sw: '#0F6FB8',
      bg: '#E9F2FB', hdSm: '#4A6076', hdAc: '#0F6FB8', t1: '#0F6FB8', t2: '#12324D',
      card: '#FFFFFF', cardLine: '0.4mm solid #CBDDEE', num: '#0F6FB8', numTx: '#FFFFFF', tx: '#14202B',
      band: '#0F6FB8', b1: '#BFE0FF', b2: '#FFFFFF', exBg: '#FFFFFF', exFg: '#0F6FB8',
      foot: '#7A8CA0', sign: '#0F6FB8', signTx: '#FFFFFF', uniform: '#2C4C6B', hair: '#33302C',
      ko: '밝은 하늘색 배경에 파란색을 포인트로 쓴, 여백이 넉넉하고 단정한 학교 공지 스타일. 미니멀한 플랫 디자인.',
      en: 'light sky-blue background with clean blue accents, minimal and tidy school notice style, generous white space, flat design'
    },
    mint: {
      name: '파스텔 민트', sw: '#2E7D68',
      bg: '#EAF6F1', hdSm: '#4E6B62', hdAc: '#E8823C', t1: '#2E7D68', t2: '#E8823C',
      card: '#FFFFFF', cardLine: '0.4mm solid #CFE6DD', num: '#E8823C', numTx: '#FFFFFF', tx: '#1E2B26',
      band: '#2E7D68', b1: '#FFD9A0', b2: '#FFFFFF', exBg: '#FFFFFF', exFg: '#2E7D68',
      foot: '#7E948C', sign: '#E8823C', signTx: '#FFFFFF', uniform: '#3C6E60', hair: '#3A322C',
      ko: '연한 민트와 크림색을 쓴 부드럽고 친근한 파스텔 톤. 둥근 모서리와 말랑말랑한 아이콘, 저학년도 편하게 보는 분위기.',
      en: 'soft pastel mint and cream palette, friendly rounded shapes, squishy cute icons, gentle and approachable'
    },
    coral: {
      name: '산호빛', sw: '#E2564A',
      bg: '#FFF1EC', hdSm: '#7A5348', hdAc: '#E2564A', t1: '#E2564A', t2: '#23384F',
      card: '#FFFFFF', cardLine: '0.4mm solid #FBD9CF', num: '#23384F', numTx: '#FFFFFF', tx: '#23303B',
      band: '#E2564A', b1: '#FFE08A', b2: '#FFFFFF', exBg: '#FFFFFF', exFg: '#E2564A',
      foot: '#9A8078', sign: '#E2564A', signTx: '#FFFFFF', uniform: '#3A4E68', hair: '#332B28',
      ko: '연한 살구빛 배경에 산호색을 포인트로 쓴 밝고 경쾌한 분위기. 통통 튀는 아이콘과 활기찬 느낌.',
      en: 'light apricot background with vivid coral accents, cheerful and energetic, bouncy playful icons'
    },
    paper: {
      name: '크래프트 종이', sw: '#C4562F',
      bg: '#F3E9D8', hdSm: '#6B5A44', hdAc: '#C4562F', t1: '#4A3B2A', t2: '#C4562F',
      card: '#FFFDF7', cardLine: '0.5mm solid #D9C7A8', num: '#4A3B2A', numTx: '#FFFFFF', tx: '#33291D',
      band: '#4A3B2A', b1: '#F0C36A', b2: '#FFF6E2', exBg: '#F0C36A', exFg: '#4A3B2A',
      foot: '#8B7A62', sign: '#C4562F', signTx: '#FFFFFF', uniform: '#6B5A44', hair: '#3B2F22',
      ko: '크래프트 종이 질감 위에 손으로 그린 듯한 크레용·색연필 느낌. 따뜻하고 아날로그한 분위기, 손글씨 같은 제목.',
      en: 'kraft paper texture background, hand-drawn crayon and colored-pencil illustration feel, warm analog mood, handwritten-style title'
    }
  };
  const moodOf = k => MOODS[k] || MOODS.navy;

  /* 학생 캐릭터 (플랫 벡터 SVG) */
  function studentSVG(mo, h) {
    return '<svg viewBox="0 0 60 74" style="height:' + h + 'mm;width:auto;display:block">' +
      '<ellipse cx="30" cy="71" rx="19" ry="2.6" fill="#000" opacity=".12"/>' +
      '<path d="M11 70V54c0-7.5 5.5-13 13-14h12c7.5 1 13 6.5 13 14v16z" fill="' + mo.uniform + '"/>' +
      '<path d="M24 39.5l6 8.5 6-8.5 3.6 1.8L30 55 20.4 41.3z" fill="#FFFFFF"/>' +
      '<rect x="26" y="31" width="8" height="10" rx="2" fill="#F2CBA9"/>' +
      '<circle cx="30" cy="21" r="15" fill="' + mo.hair + '"/>' +
      '<ellipse cx="30" cy="24" rx="12.6" ry="12.2" fill="#F7D6B4"/>' +
      '<circle cx="24.6" cy="23.5" r="1.9" fill="#2A2320"/>' +
      '<circle cx="35.4" cy="23.5" r="1.9" fill="#2A2320"/>' +
      '<path d="M26.6 28.6a4.2 4.2 0 0 0 6.8 0" fill="none" stroke="#2A2320" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="20.8" cy="27.5" r="2.3" fill="#F3A093" opacity=".65"/>' +
      '<circle cx="39.2" cy="27.5" r="2.3" fill="#F3A093" opacity=".65"/>' +
      '<rect x="33" y="47" width="19" height="25" rx="2.6" fill="#FFFFFF" stroke="' + mo.hair + '" stroke-width="2"/>' +
      '<rect x="36" y="50" width="13" height="15" rx="1.4" fill="' + mo.sign + '" opacity=".55"/>' +
      '</svg>';
  }

  function rgLoad() {
    const d = RG.defaults || {};
    let st = { tool: 'pdf', orient: 'portrait', mood: 'navy', char: 'off' };
    RG_FIELDS.forEach(k => { st[k] = k === 'rules' ? (d.rules || []).join('\n') : (d[k] || ''); });
    try {
      const saved = JSON.parse(lsGet(RG_KEY) || 'null');
      if (saved) st = Object.assign(st, saved);
    } catch (e) {}
    const pf = pfGet();                       // 학교 이름·부서명은 전역 설정을 따름
    st.school = pf.school || st.school;
    st.dept = pf.dept || st.dept;
    return st;
  }
  function rgSave(st) { lsSet(RG_KEY, JSON.stringify(st)); }
  function rgRules(st) {
    return String(st.rules || '').split('\n').map(s => s.trim()).filter(Boolean);
  }

  /* 포스터 인쇄 문서 */
  function posterDoc(st) {
    const rules = rgRules(st);
    const n = rules.length || 1;
    const land = st.orient === 'landscape';
    const W = land ? 297 : 210, H = land ? 210 : 297;

    const hdH = land ? 38 : 46;
    const ftH = land ? 20 : 26;
    const pad = 8;
    const avail = H - hdH - ftH - 7 - pad * 2;
    const cols = land ? 2 : 1;
    const rows = Math.ceil(n / cols);
    const gap = 2.2;
    const cardH = Math.max(9, (avail - (rows - 1) * gap) / rows);
    const fs = Math.min(land ? 4.0 : 4.6, Math.max(2.6, cardH * 0.27));
    const numFs = Math.min(7, Math.max(4, cardH * 0.42));

    // 제목 2색 분리
    const t = String(st.ptitle || '').trim();
    const sp = t.indexOf(' ');
    const t1 = sp > 0 ? t.slice(0, sp) : t;
    const t2 = sp > 0 ? t.slice(sp + 1) : '';

    const mo = moodOf(st.mood);
    const useChar = st.char === 'on';
    const artW = land ? 22 : 27;

    const css = `
@page{size:A4 ${land ? 'landscape' : 'portrait'};margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${W}mm;height:${H}mm;overflow:hidden;background:${mo.bg};
 font-family:'Gothic A1','IBM Plex Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
 word-break:keep-all;overflow-wrap:break-word;line-break:strict}
.hd{height:${hdH}mm;display:flex;align-items:center;justify-content:space-between;
 gap:4mm;padding:0 ${pad + 3}mm;position:relative}
.hd-l{min-width:0}
.hd-sm{font-size:${land ? 4.2 : 4.8}mm;font-weight:700;color:${mo.hdSm};letter-spacing:.02em;margin-bottom:1.5mm}
.hd-sm b{color:${mo.hdAc}}
.hd-tt{font-size:${land ? 14 : 17}mm;font-weight:800;line-height:1.05;letter-spacing:-.02em}
.hd-tt i{font-style:normal;color:${mo.t1}}
.hd-tt em{font-style:normal;color:${mo.t2}}
.art{flex-shrink:0;display:flex;align-items:center;justify-content:center}
.sign{width:${artW * 0.85}mm;height:${artW * 0.85}mm;
 background:${mo.sign};border-radius:3mm;display:flex;align-items:center;justify-content:center;
 transform:rotate(3deg)}
.sign span{font-size:${artW * 0.5}mm;font-weight:800;color:${mo.signTx};line-height:1}
.bd{padding:0 ${pad}mm;display:grid;grid-template-columns:repeat(${cols},1fr);
 gap:${gap}mm;align-content:start}
.card{background:${mo.card};border:${mo.cardLine};border-radius:2.4mm;height:${cardH}mm;
 display:flex;align-items:center;gap:${land ? 2.5 : 3.5}mm;padding:0 ${land ? 3 : 4}mm;overflow:hidden}
.no{flex-shrink:0;width:${numFs * 1.55}mm;height:${numFs * 1.55}mm;border-radius:50%;
 background:${mo.num};display:flex;align-items:center;justify-content:center;
 font-size:${numFs}mm;font-weight:800;color:${mo.numTx};line-height:1}
.tx{font-size:${fs}mm;font-weight:700;color:${mo.tx};line-height:1.32}
.ft{height:${ftH}mm;margin:${pad}mm ${pad}mm 0;background:${mo.band};border-radius:2.4mm;
 display:flex;align-items:center;justify-content:center;gap:${land ? 4 : 6}mm;padding:0 4mm}
.ex{width:${land ? 9 : 11}mm;height:${land ? 9 : 11}mm;border-radius:50%;background:${mo.exBg};flex-shrink:0;
 display:flex;align-items:center;justify-content:center;color:${mo.exFg};
 font-size:${land ? 6 : 7}mm;font-weight:800;line-height:1}
.ft-tx{text-align:center;line-height:1.32;min-width:0}
.ft-tx b{display:block;font-size:${land ? 3.9 : 4.5}mm;font-weight:800;color:${mo.b1}}
.ft-tx i{display:block;font-style:normal;font-size:${land ? 4.6 : 5.3}mm;font-weight:800;color:${mo.b2};margin-top:.8mm}
.by{height:7mm;display:flex;align-items:center;justify-content:flex-end;
 padding:0 ${pad + 2}mm;font-size:3.2mm;color:${mo.foot};font-weight:600}
`;

    let cards = '';
    rules.forEach((r, i) => {
      cards += '<div class="card"><div class="no">' + String(i + 1).padStart(2, '0') + '</div>' +
               '<div class="tx">' + esc(r) + '</div></div>';
    });

    const body =
      '<div class="hd"><div class="hd-l">' +
        '<div class="hd-sm">' + esc(st.school) + ' <b>' + esc(st.headline) + '</b></div>' +
        '<div class="hd-tt"><i>' + esc(t1) + '</i> <em>' + esc(t2) + '</em></div>' +
      '</div><div class="art">' +
        (useChar ? studentSVG(mo, hdH * 0.92) : '<div class="sign"><span>!</span></div>') +
      '</div></div>' +
      '<div class="bd">' + cards + '</div>' +
      '<div class="ft"><div class="ex">!</div><div class="ft-tx">' +
        '<b>' + esc(st.slogan1) + '</b><i>' + esc(st.slogan2) + '</i>' +
      '</div><div class="ex">!</div></div>' +
      '<div class="by">' + esc(st.school) + ' ' + esc(st.dept) + '</div>';

    return docShell(esc(st.school) + ' ' + esc(st.ptitle), css, body);
  }

  /* 이미지 생성용 프롬프트 */
  function rgPrompt(st) {
    const rules = rgRules(st);
    const n = rules.length;
    const land = st.orient === 'landscape';
    const numbered = rules.map((r, i) => String(i + 1).padStart(2, '0') + '. ' + r).join('\n');
    const mo = moodOf(st.mood);
    const useChar = st.char === 'on';

    const charKO = useChar
      ? '- 교복을 입은 한국 중학생 캐릭터를 함께 넣을 것. 각 규칙 카드 옆(또는 포스터 여백)에 그 규칙에 맞는 행동을 하는 ' +
        '귀엽고 단순한 플랫 일러스트로, 표정은 밝고 친근하게. 남학생·여학생을 섞어서 배치.'
      : '- 사람 캐릭터는 넣지 말고 아이콘과 도형만 사용할 것.';
    const charEN = useChar
      ? 'Include cute simple flat-illustration Korean middle-school student characters in school uniforms, ' +
        'each acting out the matching rule, friendly cheerful expressions, a mix of boys and girls.'
      : 'No human characters — use only icons and geometric shapes.';

    if (st.tool === 'chatgpt') {
      return [
'다음 조건에 정확히 맞는 학교 게시용 안내 포스터 이미지를 1장 만들어 주세요.',
'',
'■ 기본 정보',
'- 학교: ' + st.school,
'- 제작 부서: ' + st.dept,
'- 제목 윗줄: "' + st.school + ' ' + st.headline + '"',
'- 큰 제목: "' + st.ptitle + '"',
'- 용지: A4 ' + (land ? '가로형 (4:3 비율)' : '세로형 (3:4 비율)') + ', 인쇄용 고해상도',
'- 분위기: ' + mo.ko,
'',
'■ 전체 구성',
'1) 상단 헤더 — 배경색 ' + mo.bg + '. 작은 글씨로 "' + st.school + ' ' + st.headline + '",',
'   그 아래 "' + st.ptitle + '"를 아주 크고 두꺼운 글씨로 배치.',
'   앞 단어는 ' + mo.t1 + ', 뒷 단어는 ' + mo.t2 + ' 색. 오른쪽에는 ' +
   (useChar ? '교복 입은 학생 캐릭터를 크게 배치.' : '경고 표지판(느낌표) 아이콘을 배치.'),
'2) 본문 — ' + mo.card + ' 색 둥근 모서리 카드 ' + n + '개를 ' +
   (land ? '좌우 2단으로' : '위에서 아래로 한 줄씩') + ' 배치.',
'   각 카드 구성은 [규칙 내용에 어울리는 컬러 아이콘] + [' + mo.num + ' 색 원 안의 두 자리 번호] + [규칙 문구] 순서.',
'3) 하단 — ' + mo.band + ' 색 굵은 띠 배너, 양 끝에 원형 느낌표 아이콘. 문구 2줄:',
'   "' + st.slogan1 + '"',
'   "' + st.slogan2 + '"',
'4) 맨 아래 오른쪽에 작은 글씨로 "' + st.school + ' ' + st.dept + '"',
'',
'■ 카드에 넣을 규칙 문구 — 번호와 문장을 아래 그대로, 한 글자도 바꾸지 말 것',
numbered,
'',
'■ 반드시 지킬 것',
'- 모든 한글을 맞춤법 그대로 정확히 렌더링할 것. 오탈자·깨진 글자·의미 없는 글자 금지',
'- 위에 적힌 문구 외에 다른 글자를 절대 만들어 넣지 말 것',
'- 멀리서도 읽히도록 글자를 굵고 크게, 카드 안에서 글자가 잘리지 않게',
'- 한국어 문장은 단어 중간에서 줄바꿈되지 않게 할 것',
'- 배경과 카드의 명암 대비를 뚜렷하게',
charKO
      ].join('\n');
    }

    // Google Flow (Imagen 계열)
    return [
'A clean high-resolution Korean school notice poster, ' + mo.en + ', print quality, ' +
  (land ? 'landscape 4:3 aspect ratio' : 'portrait 3:4 aspect ratio') + '.',
'',
'TOP HEADER: a ' + mo.bg + ' band. Small Korean text at the top, then a very large bold ' +
  'sticker-style Korean title below it — the first word in ' + mo.t1 + ', the rest in ' + mo.t2 + '. ' +
  (useChar
    ? 'A cute flat-illustration Korean middle-school student in uniform holding a tablet on the right side.'
    : 'A glossy warning sign icon with an exclamation mark on the right side.'),
'',
'BODY: ' + n + ' ' + mo.card + ' rounded rectangle cards ' +
  (land ? 'arranged in two even columns' : 'stacked vertically') +
  ', evenly spaced. Each card contains, left to right: a small colorful flat icon ' +
  'matching the rule, a ' + mo.num + ' circular badge with a two-digit number, and bold Korean sentence text in ' + mo.tx + '.',
'',
'BOTTOM: a thick ' + mo.band + ' rounded banner with two centered lines of bold Korean text, ' +
  'and circular exclamation-mark icons at both ends.',
'',
'CHARACTERS: ' + charEN,
'',
'RENDER EXACTLY THIS KOREAN TEXT, spelled correctly, and no other text:',
'HEADER LINE 1: "' + st.school + ' ' + st.headline + '"',
'HEADER TITLE: "' + st.ptitle + '"',
numbered,
'BANNER LINE 1: "' + st.slogan1 + '"',
'BANNER LINE 2: "' + st.slogan2 + '"',
'FOOTER: "' + st.school + ' ' + st.dept + '"',
'',
'NEGATIVE PROMPT: misspelled Korean, garbled or invented glyphs, extra random text, watermark, ' +
  'photorealistic faces, cluttered background, cropped or overflowing text, words broken mid-syllable, low contrast.'
    ].join('\n');
  }

  function rgRender(st) {
    const out = $('#rgOut');
    if (!out) return;
    const n = rgRules(st).length;
    const cnt = $('#rgCount');
    if (cnt) cnt.textContent = n + '개';

    // 선택 상태 표시
    $$('#ruleGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      $$('button', seg).forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-v') === st[key]));
    });

    if (!n) {
      out.innerHTML = '<div class="note warn"><span class="n-em">✏️</span><div class="n-wrap">' +
        '<b class="n-t">규칙을 한 줄 이상 입력해 주세요</b>' +
        '<div class="n-b">위 규칙 칸에 한 줄에 하나씩 적으면 결과가 여기에 나타납니다.</div></div></div>';
      return;
    }

    if (st.tool === 'pdf') {
      const doc = posterDoc(st);
      const land = st.orient === 'landscape';
      const baseW = land ? 1123 : 794, baseH = land ? 794 : 1123;
      out.innerHTML =
        '<div class="rg-outhead"><b>미리보기</b><span>A4 ' + (land ? '가로형' : '세로형') + ' · 규칙 ' + n + '개</span></div>' +
        '<div class="rg-actions">' +
          '<button type="button" class="rg-btn" id="rgPrint">🖨️ 인쇄 · PDF로 저장</button>' +
          '<button type="button" class="rg-btn word" id="rgDocx">📝 워드(.docx) 내려받기</button>' +
          '<button type="button" class="rg-btn hwp" id="rgHwpx">🅷 한글(.hwpx) 내려받기</button>' +
          '<button type="button" class="rg-btn ghost" id="rgDl">⬇️ HTML 파일로 내려받기</button>' +
        '</div>' +
        '<div class="note info"><span class="n-em">💾</span><div class="n-wrap">' +
          '<b class="n-t">PDF로 저장하는 법</b><div class="n-b">' +
          '<b>인쇄 · PDF로 저장</b>을 누르면 인쇄 창이 열립니다. 대상(프린터)을 <b>“PDF로 저장”</b>으로 바꾸고, ' +
          '용지를 <b>A4 ' + (land ? '가로' : '세로') + '</b>, 여백을 <b>없음</b>, <b>배경 그래픽</b>을 켠 뒤 저장하세요. ' +
          '문구를 더 고치고 싶으면 <b>워드(.docx)</b>로 받아 편집한 뒤 워드에서 PDF로 내보내세요.' +
          '</div></div></div>' +
        '<div class="rg-frame"><iframe id="rgFrame" title="포스터 미리보기"></iframe></div>';
      const f = $('#rgFrame');
      f.setAttribute('srcdoc', doc);
      f.addEventListener('load', () => fitFrame('rgFrame', baseW, baseH), { once: true });
      setTimeout(() => fitFrame('rgFrame', baseW, baseH), 60);
      RG.doc = doc;
      return;
    }

    const p = rgPrompt(st);
    const toolName = st.tool === 'chatgpt' ? 'ChatGPT 이미지' : 'Google Flow 이미지';
    out.innerHTML =
      '<div class="rg-outhead"><b>' + toolName + '용 프롬프트</b><span>A4 ' +
        (st.orient === 'landscape' ? '가로형' : '세로형') + ' · 규칙 ' + n + '개</span></div>' +
      '<div class="rg-actions">' +
        '<button type="button" class="rg-btn" id="rgCopy">📋 프롬프트 복사</button>' +
      '</div>' +
      '<textarea class="rg-prompt" id="rgPromptBox" rows="18" readonly spellcheck="false"></textarea>' +
      '<div class="note tip"><span class="n-em">🔤</span><div class="n-wrap">' +
        '<b class="n-t">생성 후 반드시 확인하세요</b><div class="n-b">' +
        'AI 이미지 도구는 한글을 자주 틀리게 씁니다. 결과물의 <b>글자를 하나씩 대조</b>하고, ' +
        '오탈자가 반복되면 규칙 개수를 줄이거나 <b>PDF 방식</b>으로 만드세요.' +
        '</div></div></div>';
    $('#rgPromptBox').value = p;
    RG.prompt = p;
  }

  function rgInit() {
    const wrap = $('#ruleGen');
    if (!wrap) return;
    let st = rgLoad();

    RG_FIELDS.forEach(k => {
      const el = $('[data-f="' + k + '"]', wrap);
      if (el) el.value = st[k] || '';
    });

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const k = el.getAttribute('data-f');
      st[k] = el.value;
      if (k === 'contact') st.contactEdited = 1;
      if (k === 'school' || k === 'dept') { const q = {}; q[k] = el.value; pfSet(q); }
      rgSave(st); rgRender(st);
    });

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        st[seg.parentNode.getAttribute('data-seg')] = seg.getAttribute('data-v');
        rgSave(st); rgRender(st);
        return;
      }
      if (e.target.closest('#rgReset')) {
        const d = RG.defaults || {};
        RG_FIELDS.forEach(k => {
          st[k] = k === 'rules' ? (d.rules || []).join('\n') : (d[k] || '');
          const el = $('[data-f="' + k + '"]', wrap);
          if (el) el.value = st[k];
        });
        rgSave(st); rgRender(st);
        return;
      }
      if (e.target.closest('#rgPrint')) { printFrame('rgFrame'); return; }
      if (e.target.closest('#rgDocx')) {
        downloadDocx((st.school || '포스터') + '_' + (st.ptitle || '규칙') + '.docx',
                     RG.doc || posterDoc(st), st.orient === 'landscape');
        return;
      }
      if (e.target.closest('#rgHwpx')) {
        downloadHwpx((st.school || '포스터') + '_' + (st.ptitle || '규칙') + '.hwpx',
                     RG.doc || posterDoc(st), st.orient === 'landscape');
        return;
      }
      if (e.target.closest('#rgDl')) {
        downloadDoc((st.school || '포스터') + '_' + (st.ptitle || '규칙') + '.html', RG.doc || posterDoc(st));
        return;
      }
      if (e.target.closest('#rgCopy')) { copyText(RG.prompt || rgPrompt(st), e.target.closest('#rgCopy')); return; }
    });

    rgRender(st);
    window.addEventListener('resize', () => {
      const land = st.orient === 'landscape';
      fitFrame('rgFrame', land ? 1123 : 794, land ? 794 : 1123);
    });
  }

  /* =========================================================
     ② 디벗 반납 확인서 생성기
     ========================================================= */
  const RT_KEY = 'debut.returngen';
  const RT_FIELDS = ['school', 'dept', 'dtitle', 'dsub', 'parts', 'notice', 'body'];

  function rtLoad() {
    const d = RT.defaults || {};
    let st = { copies: '1', datemode: 'blank' };
    RT_FIELDS.forEach(k => { st[k] = k === 'parts' ? (d.parts || []).join('\n') : (d[k] || ''); });
    try {
      const saved = JSON.parse(lsGet(RT_KEY) || 'null');
      if (saved) st = Object.assign(st, saved);
    } catch (e) {}
    const pf = pfGet();                       // 학교 이름·부서명은 전역 설정을 따름
    st.school = pf.school || st.school;
    st.dept = pf.dept || st.dept;
    /* 구성품도 「학교 정보」의 학년별 구성품에서 가져온다.
       칸을 직접 고친 뒤에는(st.partsEdited) 그 내용을 그대로 둔다. */
    if (!st.partsEdited) {
      const fromPf = pfPartNames(pf);
      if (fromPf.length) st.parts = fromPf.join('\n');
    }
    return st;
  }
  /* 「학년 | 기기 | 펜 | 충전기 | 케이스 | 문의처」에서 구성품 이름만 추려 낸다.
     학년마다 기기가 달라도 같은 이름은 한 번만 넣고, 미지급 항목은 뺀다. */
  function pfPartNames(pf) {
    const skip = /^(미지급|없음|해당\s*없음|-|없슴)$/;
    const seen = {}, out = [];
    pfRows(pf.parts).forEach(r => {
      [1, 2, 3, 4].forEach(i => {
        const v = (r[i] || '').trim();
        if (!v || skip.test(v) || seen[v]) return;
        seen[v] = 1; out.push(v);
      });
    });
    return out;
  }
  function rtSave(st) { lsSet(RT_KEY, JSON.stringify(st)); }
  function rtParts(st) {
    return String(st.parts || '').split('\n').map(s => s.trim()).filter(Boolean);
  }

  function slipPage(st, label) {
    const parts = rtParts(st);
    const t = todayKR();
    const dy = st.datemode === 'today' ? t.y : '&nbsp;&nbsp;&nbsp;&nbsp;';
    const dm = st.datemode === 'today' ? t.m : '&nbsp;&nbsp;&nbsp;';
    const dd = st.datemode === 'today' ? t.d : '&nbsp;&nbsp;&nbsp;';

    let partsHtml = '<div class="parts">';
    parts.forEach(p => { partsHtml += '<span class="cb">☐ ' + esc(p) + '</span>'; });
    partsHtml += '</div>';

    const yn = '<span class="cb">☐ 예</span><span class="cb">☐ 아니오</span>';

    return '<div class="page">' +
      (label ? '<div class="copylb">' + esc(label) + '</div>' : '') +
      '<h1>' + esc(st.dtitle) + '</h1>' +
      '<p class="sub">' + esc(st.dsub) + '</p>' +
      /* 학년·반·번 아래에 이름 칸 — 손으로 적을 자리를 남겨 한 줄 띄운다 */
      '<div class="who">' +
        '<div><span class="ln w1"></span> 학년 <span class="ln w1"></span> 반 <span class="ln w1"></span> 번</div>' +
        '<div>이름 : <span class="ln w3"></span></div>' +
      '</div>' +
      '<table class="big">' +
        '<tr><th>1. 구성품을 모두 제출하였나요?</th><td>' + partsHtml + '</td></tr>' +
        '<tr><th>2. 기기 상태는 양호한가요?</th><td><div class="yn">' + yn + '</div></td></tr>' +
        '<tr><th>3. 개인 데이터는 삭제하였나요?</th><td><div class="yn">' + yn + '</div></td></tr>' +
        '<tr><th>4. 기기 잠금 비밀번호를 해제하였나요?<em>※ 크롬북, 웨일북 제외</em></th><td><div class="yn">' + yn + '</div></td></tr>' +
        '<tr><th>5. 계정을 로그아웃(또는 삭제)하였나요?</th><td><div class="yn">' + yn + '</div></td></tr>' +
      '</table>' +
      '<p class="notice">' + esc(st.notice) + '</p>' +
      '<p class="body">' + esc(st.body) + '</p>' +
      /* 학생·학부모는 같은 줄에 나란히, 담당은 그 아래 오른쪽에.
         칸 높이(.ln)와 줄 사이(gap)는 연필·볼펜으로 쓸 자리를 생각해 넉넉히 둔다 */
      '<div class="signs">' +
        '<div class="srow two">' +
          '<span>학생 :</span><span class="ln w2"></span><em>(인 또는 서명)</em>' +
          '<span class="gap"></span>' +
          '<span>학부모 :</span><span class="ln w2"></span><em>(인 또는 서명)</em>' +
        '</div>' +
        '<div class="srow right"><span>담당 :</span><span class="ln w2"></span><em>(인 또는 서명)</em></div>' +
      '</div>' +
      '<p class="date">' + dy + ' 년 &nbsp; ' + dm + ' 월 &nbsp; ' + dd + ' 일</p>' +
      '<p class="school">' + esc(st.school) + '</p>' +
      '<p class="dept">' + esc(st.dept) + '</p>' +
    '</div>';
  }

  function slipDoc(st) {
    const css = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'IBM Plex Sans KR','Gothic A1','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
 color:#000;background:#fff;
 word-break:keep-all;overflow-wrap:break-word;line-break:strict}
/* 넘치면 잘라 내지 않고 다음 장으로 흘려보낸다 — 잘라 내면 인쇄물에서 소리 없이 사라진다 */
.page{width:210mm;min-height:297mm;padding:20mm 20mm 14mm;position:relative;page-break-after:always}
.page:last-child{page-break-after:auto}
.copylb{position:absolute;top:9mm;right:20mm;font-size:3.2mm;color:#555;
 border:.3mm solid #888;border-radius:1mm;padding:.8mm 2.5mm}
h1{font-family:'Gothic A1',sans-serif;font-size:8mm;font-weight:800;text-align:center;
 letter-spacing:-.02em;text-decoration:underline;text-underline-offset:2mm;margin-bottom:4mm}
.sub{text-align:center;font-size:4.1mm;margin-bottom:8mm}
/* 학년·반·번 / 이름 — 두 줄 사이를 벌려 이름 쓸 자리를 확보한다 */
.who{display:flex;flex-direction:column;align-items:flex-end;gap:7mm;font-size:4.5mm;margin-bottom:8mm}
/* 손으로 적는 칸 — 밑줄 위에 글씨가 들어갈 높이를 남긴다 */
.ln{display:inline-block;border-bottom:.35mm solid #000;height:9mm;vertical-align:-2.8mm}
.w1{width:17mm}.w2{width:36mm}.w3{width:46mm}
table{width:100%;border-collapse:collapse;border:.5mm solid #000}
th,td{border:.35mm solid #000;padding:2.8mm 3mm;font-size:4.1mm;text-align:left;vertical-align:middle}
th{width:62mm;font-weight:600;line-height:1.45;word-break:keep-all}
th em{display:block;font-style:normal;font-size:3.3mm;color:#333;margin-top:.8mm;white-space:nowrap}
.parts{display:grid;grid-template-columns:1fr 1fr;gap:1.8mm 3mm}
.yn{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.cb{font-size:4.1mm;white-space:nowrap}
.notice{font-size:3.8mm;line-height:1.55;margin:5mm 0 7mm;padding-left:5mm;text-indent:-5mm}
.body{font-size:4.4mm;line-height:1.75;margin-bottom:10mm;text-indent:4mm}
/* 서명란 — 학생·학부모는 한 줄, 담당은 그 아래. 줄 사이는 손으로 쓸 자리 */
.signs{display:flex;flex-direction:column;gap:10mm;font-size:4.5mm;margin-bottom:12mm}
.srow{display:flex;align-items:flex-end;gap:2mm;flex-wrap:nowrap}
.srow.right{justify-content:flex-end;padding-right:2mm}
.srow em{font-style:normal;font-size:3.5mm;white-space:nowrap;padding-bottom:.6mm}
.srow .gap{flex:1;min-width:5mm}
.date{text-align:center;font-size:4.6mm;letter-spacing:.02em;margin-bottom:5mm}
.school{text-align:center;font-family:'Gothic A1',sans-serif;font-size:6.8mm;font-weight:800;letter-spacing:.06em}
.dept{text-align:center;font-size:4mm;color:#333;margin-top:1.5mm}
`;
    let body;
    if (st.copies === '2') {
      body = slipPage(st, '학교 보관용') + slipPage(st, '학생 보관용');
    } else {
      body = slipPage(st, '');
    }
    return docShell(esc(st.school) + ' ' + esc(st.dtitle), css, body);
  }

  function rtRender(st) {
    const out = $('#rtOut');
    if (!out) return;

    $$('#retGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      $$('button', seg).forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-v') === st[key]));
    });

    const doc = slipDoc(st);
    RT.doc = doc;
    out.innerHTML =
      '<div class="rg-outhead"><b>미리보기</b><span>A4 세로 · ' +
        (st.copies === '2' ? '2매(학교·학생 보관용)' : '1매') + '</span></div>' +
      '<div class="rg-actions">' +
        '<button type="button" class="rg-btn" id="rtPrint">🖨️ 인쇄 · PDF로 저장</button>' +
        '<button type="button" class="rg-btn word" id="rtDocx">📝 워드(.docx) 내려받기</button>' +
        '<button type="button" class="rg-btn hwp" id="rtHwpx">🅷 한글(.hwpx) 내려받기</button>' +
        '<button type="button" class="rg-btn ghost" id="rtDl">⬇️ HTML 파일로 내려받기</button>' +
      '</div>' +
      '<div class="note info"><span class="n-em">💾</span><div class="n-wrap">' +
        '<b class="n-t">PDF로 저장하는 법</b><div class="n-b">' +
        '<b>인쇄 · PDF로 저장</b>을 누르면 인쇄 창이 열립니다. 대상(프린터)을 <b>“PDF로 저장”</b>으로 바꾸고 ' +
        '용지 <b>A4 세로</b>, 여백 <b>없음</b>으로 두고 저장하세요. 학교 이름과 부서명은 이미 채워져 있습니다. ' +
        '항목을 더 손보려면 <b>워드(.docx)</b>로 받아 고치면 됩니다.' +
        '</div></div></div>' +
      '<div class="rg-frame"><iframe id="rtFrame" title="반납 확인서 미리보기"></iframe></div>';
    // (미리보기 아래 안내 끝)
    const f = $('#rtFrame');
    f.setAttribute('srcdoc', doc);
    f.addEventListener('load', () => fitFrame('rtFrame', 794, 1123), { once: true });
    setTimeout(() => fitFrame('rtFrame', 794, 1123), 60);
  }

  function rtInit() {
    const wrap = $('#retGen');
    if (!wrap) return;
    let st = rtLoad();

    RT_FIELDS.forEach(k => {
      const el = $('[data-f="' + k + '"]', wrap);
      if (el) el.value = st[k] || '';
    });

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const k = el.getAttribute('data-f');
      st[k] = el.value;
      if (k === 'contact') st.contactEdited = 1;
      if (k === 'parts') st.partsEdited = 1;   // 직접 고친 뒤에는 「학교 정보」가 덮어쓰지 않는다
      if (k === 'school' || k === 'dept') { const q = {}; q[k] = el.value; pfSet(q); }
      rtSave(st); rtRender(st);
    });

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        st[seg.parentNode.getAttribute('data-seg')] = seg.getAttribute('data-v');
        rtSave(st); rtRender(st);
        return;
      }
      if (e.target.closest('#rtReset')) {
        const d = RT.defaults || {};
        RT_FIELDS.forEach(k => { st[k] = k === 'parts' ? (d.parts || []).join('\n') : (d[k] || ''); });
        /* 되돌리면 「학교 정보」를 다시 따라가게 한다 */
        st.partsEdited = 0;
        st.contactEdited = 0;
        rtSave(st);
        st = rtLoad();                      // 학교 이름·구성품을 다시 얹어 읽는다
        RT_FIELDS.forEach(k => {
          const el = $('[data-f="' + k + '"]', wrap);
          if (el) el.value = st[k] || '';
        });
        rtSave(st); rtRender(st);
        return;
      }
      if (e.target.closest('#rtPrint')) { printFrame('rtFrame'); return; }
      if (e.target.closest('#rtDocx')) {
        downloadDocx((st.school || '학교') + '_디벗_반납확인서.docx', RT.doc || slipDoc(st), false);
        return;
      }
      if (e.target.closest('#rtHwpx')) {
        downloadHwpx((st.school || '학교') + '_디벗_반납확인서.hwpx', RT.doc || slipDoc(st));
        return;
      }
      if (e.target.closest('#rtDl')) {
        downloadDoc((st.school || '학교') + '_디벗_반납확인서.html', RT.doc || slipDoc(st));
        return;
      }
    });

    rtRender(st);
    window.addEventListener('resize', () => fitFrame('rtFrame', 794, 1123));
  }

  /* =========================================================
     QR 코드 생성기 (외부 라이브러리 없이 직접 구현)
     ---------------------------------------------------------
     QR 모델2 · 바이트 모드 · 오류정정 L · 버전 1~9 (최대 230바이트).
     와이파이 접속 문자열은 길어야 100자 안쪽이라 이 범위로 충분합니다.
     ========================================================= */
  const QR_SPEC = {          // 버전: [전체 코드워드, 블록당 EC 코드워드, 블록 수]
    1: [26, 7, 1],  2: [44, 10, 1], 3: [70, 15, 1], 4: [100, 20, 1], 5: [134, 26, 1],
    6: [172, 18, 2], 7: [196, 20, 2], 8: [242, 24, 2], 9: [292, 30, 2]
  };
  const QR_ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46]
  };
  const QR_MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
  ];

  const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();
  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

  function qrRsPoly(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const q = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        q[j] ^= p[j];
        q[j + 1] ^= gfMul(p[j], GF_EXP[i]);
      }
      p = q;
    }
    return p;
  }
  function qrRsEc(data, ecLen) {
    const gen = qrRsPoly(ecLen);
    const res = data.slice().concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const f = res[i];
      if (!f) continue;
      for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], f);
    }
    return res.slice(data.length);
  }

  /* 15비트 형식 정보 (오류정정 L = 0b01) */
  function qrFormatBits(mask) {
    const data = (1 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | (rem & 0x3FF)) ^ 0x5412;
  }
  /* 18비트 버전 정보 (버전 7 이상) */
  function qrVersionBits(ver) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (ver << 12) | (rem & 0xFFF);
  }

  function qrPenalty(m) {
    const n = m.length;
    let p = 0;

    // 규칙1 — 같은 색이 5칸 이상 이어짐
    for (let k = 0; k < 2; k++) {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b < n; b++) {
          const cur = k ? m[b][a] : m[a][b], prev = k ? m[b - 1][a] : m[a][b - 1];
          if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; }
          else run = 1;
        }
      }
    }
    // 규칙2 — 2×2 같은 색 덩어리
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    // 규칙3 — 파인더와 혼동되는 1:1:3:1:1 무늬
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const match = (get, a, b) => {
      for (let i = 0; i < 11; i++) if (get(a, b + i) !== pat1[i]) break; else if (i === 10) return true;
      for (let i = 0; i < 11; i++) if (get(a, b + i) !== pat2[i]) return false;
      return true;
    };
    for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) {
      if (match((x, y) => m[x][y], a, b)) p += 40;
      if (match((x, y) => m[y][x], a, b)) p += 40;
    }
    // 규칙4 — 검은 칸 비율이 50%에서 멀어질수록
    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  }

  function qrMatrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));

    let ver = 0, spec = null, dataCW = 0;
    for (let v = 1; v <= 9; v++) {
      const s = QR_SPEC[v], dcw = s[0] - s[1] * s[2];
      if (bytes.length <= dcw - 2) { ver = v; spec = s; dataCW = dcw; break; }
    }
    if (!ver) return null;                    // 담을 수 없을 만큼 긴 문자열

    // ── 비트열 만들기 (모드 0100 + 길이 8비트 + 데이터) ──
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); push(bytes.length, 8);
    bytes.forEach(b => push(b, 8));
    const cap = dataCW * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const pads = [0xEC, 0x11];
    for (let i = 0; bits.length < cap; i++) push(pads[i % 2], 8);

    const dcws = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dcws.push(b);
    }

    // ── 블록 나누기 · 오류정정 · 끼워 넣기 ──
    const nB = spec[2], ecLen = spec[1], per = dataCW / nB;
    const dB = [], eB = [];
    for (let i = 0; i < nB; i++) {
      const d = dcws.slice(i * per, (i + 1) * per);
      dB.push(d); eB.push(qrRsEc(d, ecLen));
    }
    const out = [];
    for (let i = 0; i < per; i++) for (let b = 0; b < nB; b++) out.push(dB[b][i]);
    for (let i = 0; i < ecLen; i++) for (let b = 0; b < nB; b++) out.push(eB[b][i]);

    // ── 기능 무늬 배치 ──
    const size = ver * 4 + 17;
    const m = [], fx = [];
    for (let i = 0; i < size; i++) { m.push(new Array(size).fill(0)); fx.push(new Array(size).fill(false)); }
    const set = (r, c, v) => { if (r < 0 || c < 0 || r >= size || c >= size) return; m[r][c] = v ? 1 : 0; fx[r][c] = true; };

    [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r0, c0]) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                   (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                   (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(r0 + r, c0 + c, on);
      }
    });
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    const al = QR_ALIGN[ver];
    al.forEach(r => al.forEach(c => {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) return;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }));

    set(size - 8, 8, 1);                                   // 항상 검은 칸
    for (let i = 0; i <= 8; i++) {                          // 형식 정보 자리 예약
      if (!fx[8][i]) set(8, i, 0);
      if (!fx[i][8]) set(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (!fx[8][size - 1 - i]) set(8, size - 1 - i, 0);
      if (!fx[size - 1 - i][8]) set(size - 1 - i, 8, 0);
    }
    if (ver >= 7) {
      const vb = qrVersionBits(ver);
      for (let i = 0; i < 18; i++) {
        const bit = (vb >>> i) & 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(b, a, bit); set(a, b, bit);
      }
    }

    // ── 데이터 채우기 (오른쪽 아래부터 지그재그) ──
    let bi = 0, up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;          // 세로 타이밍 열은 건너뛴다
      for (let k = 0; k < size; k++) {
        const row = up ? size - 1 - k : k;
        for (let s = 0; s < 2; s++) {
          const cc = col - s;
          if (fx[row][cc]) continue;
          let bit = 0;
          if (bi < out.length * 8) { bit = (out[bi >> 3] >> (7 - (bi & 7))) & 1; bi++; }
          m[row][cc] = bit;
        }
      }
      up = !up;                      // 한 열 쌍이 끝날 때마다 방향을 뒤집는다
    }

    // ── 마스크 8종을 모두 시험해 벌점이 가장 낮은 것을 고름 ──
    const base = m.map(r => r.slice());
    let best = null, bestScore = Infinity;
    for (let mk = 0; mk < 8; mk++) {
      const t = base.map(r => r.slice());
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (!fx[r][c] && QR_MASKS[mk](r, c)) t[r][c] ^= 1;
      }
      /* 형식정보 15비트를 두 곳에 넣는다 (ISO/IEC 18004 §7.9)
         · 좌상단 세로(8열) : 0~5행 = 비트 0~5, 7행 = 비트 6, 8행 = 비트 7
         · 좌상단 가로(8행) : 0~5열 = 비트 14~9, 7열 = 비트 8
         · 우상단 가로(8행) : 끝에서 1~8열 = 비트 0~7
         · 좌하단 세로(8열) : 끝에서 1~7행 = 비트 14~8, 끝에서 8행 = 항상 검은 칸 */
      const fb = qrFormatBits(mk), g = i => (fb >>> i) & 1;
      for (let i = 0; i <= 5; i++) t[i][8] = g(i);
      t[7][8] = g(6);
      t[8][8] = g(7);
      for (let i = 0; i <= 5; i++) t[8][i] = g(14 - i);
      t[8][7] = g(8);
      for (let i = 0; i < 8; i++) t[8][size - 1 - i] = g(i);
      for (let i = 0; i < 7; i++) t[size - 1 - i][8] = g(14 - i);
      t[size - 8][8] = 1;

      const sc = qrPenalty(t);
      if (sc < bestScore) { bestScore = sc; best = t; }
    }
    return best;
  }

  /* 와이파이 접속용 QR 문자열 — 안드로이드·아이폰 카메라가 알아듣는 표준 형식 */
  function wifiQrText(ssid, pw) {
    const q = s => String(s || '').replace(/([\\;,:"])/g, '\\$1');
    if (!ssid) return '';
    return 'WIFI:T:' + (pw ? 'WPA' : 'nopass') + ';S:' + q(ssid) + ';P:' + q(pw) + ';H:false;;';
  }

  function qrSvg(text, mm) {
    const m = text ? qrMatrix(text) : null;
    if (!m) return '';
    const n = m.length, pad = 3, tot = n + pad * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (m[r][c]) d += 'M' + (c + pad) + ' ' + (r + pad) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + tot + ' ' + tot + '" ' +
           'width="' + mm + 'mm" height="' + mm + 'mm" shape-rendering="crispEdges">' +
           '<rect width="' + tot + '" height="' + tot + '" fill="#fff"/>' +
           '<path d="' + d + '" fill="#000"/></svg>';
  }

  /* =========================================================
     엑셀(.xlsx) · CSV 읽기 — 외부 라이브러리 없이
     ---------------------------------------------------------
     xlsx는 압축된 ZIP이라 브라우저의 DecompressionStream으로 풉니다.
     (크롬·엣지·사파리·파이어폭스 최신 버전에서 동작)
     ========================================================= */
  function zipEntries(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eo = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    }
    if (eo < 0) throw new Error('엑셀 파일 형식이 아닙니다.');
    const cnt = dv.getUint16(eo + 10, true);
    let off = dv.getUint32(eo + 16, true);
    const files = {};
    for (let i = 0; i < cnt; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true);
      const elen = dv.getUint16(off + 30, true);
      const clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
      const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lelen;
      files[name] = { method: method, data: u8.subarray(start, start + csize) };
      off += 46 + nlen + elen + clen;
    }
    return files;
  }

  async function zipText(files, name) {
    const f = files[name];
    if (!f) return '';
    if (f.method === 0) return new TextDecoder().decode(f.data);
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않습니다. CSV로 올려 주세요.');
    }
    const s = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(s).text();
  }

  const unXml = s => String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');

  function xlsxShared(xml) {
    return (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map(si =>
      unXml((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '')).join('')));
  }

  function xlsxRows(xml, shared) {
    const rows = [];
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const cells = [];
      const cRe = /<c([^>]*?)\/>|<c([^>]*?)>([\s\S]*?)<\/c>/g;
      let cm;
      while ((cm = cRe.exec(rm[1]))) {
        const attr = cm[1] || cm[2] || '', body = cm[3] || '';
        const ref = (attr.match(/r="([A-Z]+)\d+"/) || [])[1] || '';
        const t = (attr.match(/t="([^"]+)"/) || [])[1] || '';
        let v = '';
        if (t === 'inlineStr') {
          v = (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '';
        } else {
          const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
          v = t === 's' ? (shared[+raw] || '') : raw;
        }
        let ci = 0;
        for (let k = 0; k < ref.length; k++) ci = ci * 26 + (ref.charCodeAt(k) - 64);
        cells[Math.max(0, ci - 1)] = unXml(v).trim();
      }
      rows.push(cells);
    }
    return rows;
  }

  async function readTableFile(file) {
    const name = (file.name || '').toLowerCase();
    if (/\.csv$/.test(name)) {
      let txt = await file.text();
      if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
      return txt.split(/\r?\n/).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
    }
    const files = zipEntries(await file.arrayBuffer());
    const shared = xlsxShared(await zipText(files, 'xl/sharedStrings.xml'));
    const sheetName = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!sheetName) throw new Error('시트를 찾을 수 없습니다.');
    return xlsxRows(await zipText(files, sheetName), shared);
  }

  /* =========================================================
     ②-2 와이파이 안내문 생성기
     ---------------------------------------------------------
     학교 전체가 같은 와이파이를 쓰는 경우(one)와
     교실·구역마다 다른 경우(many)를 골라서 입력합니다.
     구역별 목록은 「학교 정보」의 wifi 항목과 같은 값을 씁니다.
     ========================================================= */
  const WF_KEY = 'debut.wifigen';
  const WF_FIELDS = ['school', 'dept', 'dtitle', 'contact', 'ssid', 'pw', 'rooms', 'steps', 'trouble', 'notice'];

  function wfDefaults() {
    const d = WF.defaults || {};
    const st = { mode: d.mode || 'many', pwmode: d.pwmode || 'show', qr: d.qr || 'on' };
    WF_FIELDS.forEach(k => {
      const v = d[k];
      st[k] = Array.isArray(v) ? v.join('\n') : (v || '');
    });
    return st;
  }

  function wfLoad() {
    let st = wfDefaults();
    try {
      const saved = JSON.parse(lsGet(WF_KEY) || 'null');
      if (saved) st = Object.assign(st, saved);
    } catch (e) {}
    /* 학교 이름·부서명·와이파이 구성은 「학교 정보」를 따름 */
    const pf = pfGet();
    st.school = pf.school || st.school;
    st.dept = pf.dept || st.dept;
    st.contact = pfSyncContact(st, pf);
    if (pf.wifiMode) st.mode = pf.wifiMode;
    if (pf.wifiSsid) st.ssid = pf.wifiSsid;
    if (pf.wifiPw) st.pw = pf.wifiPw;
    if (pf.wifi) st.rooms = pf.wifi;
    return st;
  }
  function wfSave(st) { lsSet(WF_KEY, JSON.stringify(st)); }

  const wfLines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

  /* '구역 | SSID | 비밀번호' → {area, ssid, pw} */
  function wfRooms(st) {
    return wfLines(st.rooms).map(line => {
      const c = line.split('|').map(x => x.trim());
      return { area: c[0] || '', ssid: c[1] || '', pw: c[2] || '' };
    }).filter(r => r.area || r.ssid);
  }

  /* QR은 비밀번호를 담고 있으므로 '빈칸' 모드에서는 만들지 않는다 */
  const wfQrOn = st => st.qr !== 'off' && st.pwmode !== 'blank';

  function wifiPage(st) {
    const blank = st.pwmode === 'blank';
    const pwCell = v => blank ? '<span class="wln"></span>' : esc(v || '—');
    const useQr = wfQrOn(st);

    let net = '';
    if (st.mode === 'one') {
      const qr = useQr ? qrSvg(wifiQrText(st.ssid, st.pw), 34) : '';
      net = '<div class="one-wrap">' +
              '<div class="one-box">' +
                '<div class="ob-row"><b>네트워크 이름</b><span class="ob-v">' + esc(st.ssid || '—') + '</span></div>' +
                '<div class="ob-row"><b>비밀번호</b><span class="ob-v">' + pwCell(st.pw) + '</span></div>' +
              '</div>' +
              (qr ? '<div class="qr-box"><div class="qr-img">' + qr + '</div>' +
                    '<div class="qr-cap">카메라로 비추면<br><b>바로 연결</b></div></div>' : '') +
            '</div>';
    } else {
      const rooms = wfRooms(st);
      const anyQr = useQr && rooms.some(r => r.ssid);
      net = '<table><tr><th>구역</th><th>네트워크 이름</th><th>비밀번호</th>' +
            (anyQr ? '<th class="qcol">접속 QR</th>' : '') + '</tr>';
      if (!rooms.length) {
        net += '<tr><td colspan="' + (anyQr ? 4 : 3) + '">구역별 와이파이를 입력하세요.</td></tr>';
      } else {
        rooms.forEach(r => {
          net += '<tr><td>' + esc(r.area) + '</td><td class="mono">' + esc(r.ssid) +
                 '</td><td>' + pwCell(r.pw) + '</td>' +
                 (anyQr ? '<td class="qcol">' + (r.ssid ? qrSvg(wifiQrText(r.ssid, r.pw), 20) : '') + '</td>' : '') +
                 '</tr>';
        });
      }
      net += '</table>';
    }
    if (useQr) {
      net += '<div class="qr-note">📱 QR 접속은 <b>안드로이드 · 아이폰 카메라</b>에서 됩니다. ' +
             '<b>윈도우 · 크롬북 디벗은 QR로 자동 연결되지 않으므로</b> 위의 이름과 비밀번호로 직접 접속하세요.</div>';
    }

    let steps = '';
    wfLines(st.steps).forEach((s, i) => {
      steps += '<div class="card"><span class="no">' + (i + 1) + '</span><span class="tx">' + esc(s) + '</span></div>';
    });

    let trouble = '';
    wfLines(st.trouble).forEach(s => { trouble += '<div class="li">' + esc(s) + '</div>'; });

    return '<div class="page">' +
      '<div class="ph"><b>' + esc(st.school || '○○학교') + '</b></div>' +
      '<h1>' + esc(st.dtitle || '학교 와이파이 접속 안내') + '</h1>' +
      '<p class="sub">' + esc((WF.defaults || {}).dsub || '') + '</p>' +
      net +
      (steps ? '<div class="sec"><h2>접속 순서</h2><div class="sbody">' + steps + '</div></div>' : '') +
      (trouble ? '<div class="sec"><h2>연결이 안 될 때 확인할 것</h2><div class="sbody">' + trouble + '</div></div>' : '') +
      (st.notice ? '<div class="note">' + esc(st.notice) + '</div>' : '') +
      '<div class="ft"><span class="ft-tx">문의 : ' +
        esc(contactLine(st)) +
      '</span></div>' +
    '</div>';
  }

  function wifiDoc(st) {
    const css = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'IBM Plex Sans KR','Gothic A1','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
 color:#111;background:#fff;word-break:keep-all;overflow-wrap:break-word;line-break:strict}
/* 넘치면 잘라 내지 않고 다음 장으로 흘려보낸다 — 잘라 내면 인쇄물에서 소리 없이 사라진다 */
.page{width:210mm;min-height:297mm;padding:18mm 18mm 14mm;position:relative}
.ph{font-size:3.6mm;color:#5A6674;margin-bottom:3mm}
.ph b{font-family:'Gothic A1',sans-serif;font-weight:800;color:#0F6FB8;font-size:4.4mm}
h1{font-family:'Gothic A1',sans-serif;font-size:11mm;font-weight:800;text-align:center;
 letter-spacing:-.03em;color:#0F6FB8;margin-bottom:2.5mm}
.sub{text-align:center;font-size:4mm;color:#5A6674;margin-bottom:9mm}
.one-wrap{display:flex;align-items:stretch;gap:6mm;margin-bottom:7mm}
.one-box{flex:1;border:.9mm solid #0F6FB8;border-radius:3mm;padding:6mm 7mm;display:flex;flex-direction:column;justify-content:center}
.ob-row{display:flex;align-items:center;gap:6mm;padding:3mm 0}
.ob-row + .ob-row{border-top:.3mm dashed #A8C4DC}
.ob-row b{width:32mm;flex-shrink:0;font-size:4.4mm;color:#0F6FB8}
.ob-v{font-family:'IBM Plex Mono','Consolas',monospace;font-size:7.4mm;font-weight:600;letter-spacing:.04em;word-break:break-all}
.qr-box{flex-shrink:0;width:46mm;border:.5mm solid #0F6FB8;border-radius:3mm;padding:4mm;
 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.5mm}
.qr-img{line-height:0}
.qr-cap{font-size:3.4mm;text-align:center;line-height:1.35;color:#0B4E82}
table{width:100%;border-collapse:collapse;margin-bottom:7mm}
th,td{border:.35mm solid #9FB3C6;padding:3.2mm 4mm;font-size:4.2mm;text-align:left;vertical-align:middle}
th{background:#EAF2F9;color:#0B4E82;font-family:'Gothic A1',sans-serif;font-weight:700}
td.mono{font-family:'IBM Plex Mono','Consolas',monospace;font-weight:600;letter-spacing:.02em}
.qcol{width:26mm;text-align:center;padding:2mm}
.qcol svg{display:inline-block}
.wln{display:inline-block;border-bottom:.35mm solid #666;width:34mm;height:4.6mm;vertical-align:-1mm}
.qr-note{font-size:3.5mm;line-height:1.5;color:#0B4E82;background:#EAF2F9;border-radius:2mm;
 padding:3mm 4mm;margin-bottom:7mm}
.sec{margin-bottom:7mm}
.sec h2{font-family:'Gothic A1',sans-serif;font-size:4.8mm;font-weight:800;color:#fff;background:#0F6FB8;
 padding:2.2mm 4mm;border-radius:1.5mm;margin-bottom:3.5mm}
.sbody{padding-left:1mm}
.card{display:flex;align-items:flex-start;gap:3.5mm;margin-bottom:2.6mm}
.card .no{flex-shrink:0;width:6.5mm;height:6.5mm;border-radius:50%;background:#0F6FB8;color:#fff;
 font-size:3.8mm;font-weight:700;display:flex;align-items:center;justify-content:center}
.card .tx{font-size:4.2mm;line-height:1.5;padding-top:.6mm}
.li{font-size:4mm;line-height:1.55;margin-bottom:2mm;padding-left:5mm;text-indent:-5mm}
.li::before{content:"• ";color:#0F6FB8;font-weight:700}
.note{font-size:3.8mm;line-height:1.6;color:#8A2E28;background:#FDF3F2;border:.35mm solid #E0A9A4;
 border-radius:2mm;padding:3.5mm 4.5mm;margin-bottom:7mm}
.ft{position:absolute;left:18mm;right:18mm;bottom:14mm;border-top:.35mm solid #C6D2DE;padding-top:3mm}
.ft-tx{font-size:3.8mm;color:#5A6674}
@media print{.page{page-break-after:auto}}`;

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
           '<title>' + esc(st.dtitle || '학교 와이파이 접속 안내') + '</title>' +
           '<style>' + css + '</style></head><body>' + wifiPage(st) + '</body></html>';
  }

  function wfRender(st) {
    const wrap = $('#wifiGen');
    const out = $('#wfOut');
    if (!wrap || !out) return;

    wrap.setAttribute('data-mode', st.mode);
    $$('#wifiGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      $$('button', seg).forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-v') === st[key]));
    });

    const doc = wifiDoc(st);
    WF.doc = doc;
    out.innerHTML =
      '<div class="rg-outhead"><b>미리보기</b><span>A4 세로 · ' +
        (st.mode === 'one' ? '공통 와이파이' : '구역별 ' + wfRooms(st).length + '곳') +
        (st.pwmode === 'blank' ? ' · 비밀번호 빈칸' : '') +
        (wfQrOn(st) ? ' · QR 포함' : '') + '</span></div>' +
      '<div class="rg-actions">' +
        '<button type="button" class="rg-btn" id="wfPrint">🖨️ 인쇄 · PDF로 저장</button>' +
        '<button type="button" class="rg-btn word" id="wfDocx">📝 워드(.docx) 내려받기</button>' +
        '<button type="button" class="rg-btn hwp" id="wfHwpx">🅷 한글(.hwpx) 내려받기</button>' +
        '<button type="button" class="rg-btn ghost" id="wfDl">⬇️ HTML 파일로 내려받기</button>' +
      '</div>' +
      '<div class="note ' + (st.pwmode === 'blank' ? 'tip' : 'bad') + '">' +
        '<span class="n-em">' + (st.pwmode === 'blank' ? '✅' : '🔐') + '</span><div class="n-wrap">' +
        '<b class="n-t">' + (st.pwmode === 'blank'
          ? '비밀번호를 빈칸으로 두었습니다'
          : '비밀번호가 안내문에 그대로 인쇄됩니다') + '</b><div class="n-b">' +
        (st.pwmode === 'blank'
          ? '인쇄한 뒤 <b>교실에서 손으로 적어</b> 쓰세요. 복도·홈페이지에 붙이거나 파일로 돌릴 때 가장 안전한 방식입니다.'
          : '<b>교실 안 게시</b>까지만 쓰세요. 복도·현관·학교 홈페이지에 붙이면 외부인이 접속할 수 있습니다. ' +
            '파일로 배포하거나 공개 저장소에 올릴 예정이라면 <b>「빈칸 — 손으로 적기」</b>로 바꾸세요.') +
        '</div></div></div>' +
      (st.qr !== 'off' && st.pwmode === 'blank'
        ? '<div class="note warn"><span class="n-em">📵</span><div class="n-wrap">' +
          '<b class="n-t">비밀번호가 빈칸이라 QR은 빠집니다</b><div class="n-b">' +
          'QR 안에는 <b>비밀번호가 그대로 들어갑니다.</b> 비밀번호를 감추면서 QR만 넣는 것은 되지 않습니다. ' +
          'QR을 쓰려면 비밀번호를 <b>「안내문에 인쇄」</b>로 바꾸고, 그 안내문은 <b>교실 안에서만</b> 게시하세요.' +
          '</div></div></div>'
        : '') +
      '<div class="rg-frame"><iframe id="wfFrame" title="와이파이 안내문 미리보기"></iframe></div>';

    const f = $('#wfFrame');
    f.setAttribute('srcdoc', doc);
    f.addEventListener('load', () => fitFrame('wfFrame', 794, 1123), { once: true });
    setTimeout(() => fitFrame('wfFrame', 794, 1123), 60);
  }

  /* ---------------------------------------------------------
     구역별 와이파이 — 엑셀 양식과 읽어들이기
     「와이파이 안내」 페이지와 「학교 기본 정보」가 같은 것을 쓴다.
     --------------------------------------------------------- */
  const WIFI_XL = {
    file: '와이파이_구역별_정리양식.xlsx',
    hint: '첫 줄은 머리글로 보고 건너뜁니다. ' +
          '<b>A열 구역 · B열 네트워크 이름 · C열 비밀번호</b> 순서로 적으세요.'
  };

  function wifiTplSheets() {
    return [{
      name: '와이파이 목록',
      cols: [22, 26, 20, 40],
      rows: [
        [{ v: '구역', h: true }, { v: '네트워크 이름(SSID)', h: true },
         { v: '비밀번호', h: true }, { v: '비고 (올릴 때 쓰지 않음)', h: true }],
        ['1학년 교실', 'OO중_1F', '********', '아래 예시 줄은 지우고 우리 학교 값을 넣으세요'],
        ['2학년 교실', 'OO중_2F', '********', ''],
        ['3학년 교실', 'OO중_3F', '********', ''],
        ['특별실 · 도서관', 'OO중_SP', '********', ''],
        ['체육관 · 강당', 'OO중_GYM', '********', ''],
        ['교무실 · 행정실', 'OO중_STAFF', '', '학생 접속 불가라면 비밀번호를 비워 두세요']
      ]
    }];
  }

  /* 표 → "구역 | 네트워크 이름 | 비밀번호" 여러 줄 */
  function wifiRowsToLines(rows) {
    const looksHeader = r => /구역|장소|SSID|네트워크|이름/i.test((r[0] || '') + ' ' + (r[1] || ''));
    const body = (rows.length && looksHeader(rows[0])) ? rows.slice(1) : rows;
    return body
      .map(r => [r[0], r[1], r[2]].map(v => String(v == null ? '' : v).trim()))
      .filter(r => r[0] || r[1])
      .map(r => (r[2] ? r.join(' | ') : r.slice(0, 2).join(' | ')));
  }

  /* 파일 하나를 읽어 목록으로 바꾼 뒤 onOk(lines) 호출.
     say(문구, 'ok'|'bad')로 진행 상황을 알린다. */
  async function wifiReadFile(file, say, onOk) {
    if (!file) return;
    say('읽는 중…');
    try {
      const lines = wifiRowsToLines(await readTableFile(file));
      if (!lines.length) {
        say('읽을 수 있는 줄이 없습니다. A열 구역 · B열 네트워크 이름 · C열 비밀번호로 정리했는지 확인하세요.', 'bad');
        return;
      }
      onOk(lines);
      say('<b>' + esc(file.name) + '</b> — ' + lines.length +
          '곳을 넣었습니다. 아래 목록에서 바로 고칠 수 있습니다.', 'ok');
    } catch (err) {
      say('읽지 못했습니다 — ' + esc(err.message || String(err)) +
          ' 엑셀이 열려 있다면 닫고 다시 시도하거나, CSV로 저장해 올려 보세요.', 'bad');
    }
  }

  function wfInit() {
    const wrap = $('#wifiGen');
    if (!wrap) return;
    let st = wfLoad();

    WF_FIELDS.forEach(k => {
      const el = $('[data-f="' + k + '"]', wrap);
      if (el) el.value = st[k] || '';
    });

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const k = el.getAttribute('data-f');
      st[k] = el.value;
      if (k === 'contact') st.contactEdited = 1;
      /* 학교 이름·부서명·구역별 목록은 「학교 정보」와 같은 값을 쓴다 */
      if (k === 'school' || k === 'dept') { const q = {}; q[k] = el.value; pfSet(q); }
      if (k === 'rooms') pfSet({ wifi: el.value });
      if (k === 'ssid') pfSet({ wifiSsid: el.value });
      if (k === 'pw') pfSet({ wifiPw: el.value });
      wfSave(st); wfRender(st);
    });

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        const key = seg.parentNode.getAttribute('data-seg');
        st[key] = seg.getAttribute('data-v');
        if (key === 'mode') pfSet({ wifiMode: st.mode });   // 「학교 정보」와 같은 값을 씀
        wfSave(st); wfRender(st);
        return;
      }
      if (e.target.closest('#wfReset')) {
        const d = wfDefaults();
        Object.keys(d).forEach(k => {
          st[k] = d[k];
          const el = $('[data-f="' + k + '"]', wrap);
          if (el) el.value = d[k];
        });
        pfSet({ wifi: st.rooms });
        wfSave(st); wfRender(st);
        return;
      }
      if (e.target.closest('#wfTpl')) {
        downloadXlsx(WIFI_XL.file, wifiTplSheets());
        return;
      }
      if (e.target.closest('#wfPrint')) { printFrame('wfFrame'); return; }
      if (e.target.closest('#wfDocx')) {
        downloadDocx((st.school || '학교') + '_와이파이_안내문.docx', WF.doc || wifiDoc(st), false);
        return;
      }
      if (e.target.closest('#wfHwpx')) {
        downloadHwpx((st.school || '학교') + '_와이파이_안내문.hwpx', WF.doc || wifiDoc(st));
        return;
      }
      if (e.target.closest('#wfDl')) {
        downloadDoc((st.school || '학교') + '_와이파이_안내문.html', WF.doc || wifiDoc(st));
        return;
      }
    });

    /* 엑셀 · CSV 올리기 — 첫 줄은 머리글로 보고 건너뛴다 */
    const fileEl = $('#wfFile', wrap);
    if (fileEl) fileEl.addEventListener('change', e => {
      const msg = $('#wfMsg', wrap);
      const say = (txt, cls) => { if (msg) { msg.innerHTML = txt; msg.className = 'wf-xl-msg ' + (cls || ''); } };
      wifiReadFile(e.target.files && e.target.files[0], say, lines => {
        st.rooms = lines.join('\n');
        const ta = $('[data-f="rooms"]', wrap);
        if (ta) ta.value = st.rooms;
        pfSet({ wifi: st.rooms });
        wfSave(st); wfRender(st);
      });
      e.target.value = '';
    });

    wfRender(st);
    window.addEventListener('resize', () => fitFrame('wfFrame', 794, 1123));
  }

  /* =========================================================
     ②-4 개인정보 동의서 생성기
     ---------------------------------------------------------
     항목 내용은 교육청·학교 배포 동의서 서식을 정본으로 삼았습니다.
     (디벗 배부·관리 / 에듀테크·AI 플랫폼 이용 / A/S 수리 접수)
     ========================================================= */
  const CS_KEY = 'debut.csgen';
  const CS_FIELDS = ['school', 'dept', 'date', 'due', 'contact', 'items', 'intro'];

  function csDefaults() {
    const d = CS.defaults || {};
    const st = { out: d.out || 'doc' };
    CS_FIELDS.forEach(k => {
      const v = d[k];
      st[k] = Array.isArray(v) ? v.join('\n') : (v || '');
    });
    return st;
  }
  function csLoad() {
    let st = csDefaults();
    try {
      const saved = JSON.parse(lsGet(CS_KEY) || 'null');
      if (saved) st = Object.assign(st, saved);
    } catch (e) {}
    const pf = pfGet();
    st.school = pf.school || st.school;
    st.dept = pf.dept || st.dept;
    st.contact = pfSyncContact(st, pf);
    if (!st.date) { const t = todayKR(); st.date = t.y + '. ' + t.m + '. ' + t.d + '.'; }
    return st;
  }
  function csSave(st) { lsSet(CS_KEY, JSON.stringify(st)); }

  function csItems(st) {
    return String(st.items || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const c = l.split('|').map(x => x.trim());
      return { name: c[0] || '', purpose: c[1] || '', fields: c[2] || '', keep: c[3] || '' };
    });
  }

  function csPage(st) {
    const items = csItems(st);
    const school = st.school || '○○중학교';

    let rows = '';
    items.forEach(it => {
      rows += '<tr>' +
        '<th>' + esc(it.name) + '</th>' +
        '<td>' +
          '<div class="f"><b>수집·이용 목적</b><span>' + esc(it.purpose) + '</span></div>' +
          '<div class="f"><b>수집 항목</b><span>' + esc(it.fields) + '</span></div>' +
          '<div class="f"><b>보유 및 이용 기간</b><span>' + esc(it.keep) + '</span></div>' +
          '<div class="agree">위 개인정보 수집·이용에 &nbsp; <span class="cb">☐ 동의합니다</span>' +
          '&nbsp;&nbsp;<span class="cb">☐ 동의하지 않습니다</span></div>' +
        '</td></tr>';
    });

    return '<div class="page">' +
      '<div class="ph"><b>가정통신문</b><i>' + esc(st.date || '') + '</i></div>' +
      '<h1>개인정보 수집 · 이용 동의 안내</h1>' +
      '<p class="intro">' + esc(st.intro || '').replace(/\n/g, '<br>') + '</p>' +
      '<table>' + rows + '</table>' +
      '<div class="note">※ 정보주체는 동의를 거부할 권리가 있습니다. 다만 동의하지 않으면 해당 항목의 ' +
        '서비스 제공이 제한될 수 있습니다.<br>' +
        '※ 수집한 개인정보는 정보주체의 동의 없이 목적 외로 사용하거나 제3자에게 제공하지 않으며, ' +
        '보유기간이 끝나면 즉시 파기합니다.<br>' +
        '※ <b>만 14세 미만</b> 학생은 반드시 <b>법정대리인(보호자)의 동의</b>가 필요합니다.</div>' +
      (st.due ? '<p class="due">작성하신 뒤 <b>' + esc(st.due) + '</b>까지 담임 선생님께 제출해 주시기 바랍니다.</p>' : '') +
      '<div class="signs">' +
        '<div class="srow"><span>학생 :</span><span class="ln w1"></span>학년<span class="ln w1"></span>반' +
          '<span class="ln w1"></span>번 &nbsp; 성명<span class="ln w3"></span><em>(서명 또는 인)</em></div>' +
        '<div class="srow"><span>보호자(법정대리인) :</span> 성명<span class="ln w3"></span><em>(서명 또는 인)</em></div>' +
      '</div>' +
      '<p class="date">' + esc(st.date || '') + '</p>' +
      '<p class="school">' + esc(school) + '장 &nbsp; 귀하</p>' +
      '<div class="ft"><span class="ft-tx">문의 : ' +
        esc(contactLine(st)) + '</span></div>' +
    '</div>';
  }

  function csDoc(st) {
    const css = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'IBM Plex Sans KR','Gothic A1','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
 color:#111;background:#fff;word-break:keep-all;overflow-wrap:break-word;line-break:strict}
.page{width:210mm;min-height:297mm;padding:16mm 16mm 14mm;position:relative}
.ph{display:flex;align-items:baseline;padding-bottom:2.5mm;margin-bottom:6mm;border-bottom:.8mm solid #0F6FB8}
.ph b{font-family:'Gothic A1',sans-serif;font-size:5.4mm;font-weight:800;color:#0F6FB8}
.ph i{margin-left:auto;font-style:normal;font-size:3.4mm;color:#7A8894}
h1{font-family:'Gothic A1',sans-serif;font-size:8.4mm;font-weight:800;text-align:center;
 letter-spacing:-.03em;margin-bottom:6mm}
.intro{font-size:3.9mm;line-height:1.7;margin-bottom:7mm;text-indent:3mm}
table{width:100%;border-collapse:collapse;border:.5mm solid #333;margin-bottom:5mm}
th,td{border:.35mm solid #8FA0B2;padding:3mm 3.5mm;text-align:left;vertical-align:top;font-size:3.7mm}
th{width:36mm;background:#EDF3F9;font-weight:700;line-height:1.45}
.f{display:flex;gap:2.5mm;margin-bottom:1.8mm;line-height:1.55}
.f b{flex-shrink:0;width:28mm;color:#0B4E82}
.agree{margin-top:2.5mm;padding-top:2.2mm;border-top:.3mm dashed #A8C4DC;font-size:3.8mm}
.cb{white-space:nowrap;font-weight:600}
.note{font-size:3.4mm;line-height:1.65;color:#5A2B27;background:#FDF3F2;border:.3mm solid #E0A9A4;
 border-radius:2mm;padding:3mm 3.5mm;margin-bottom:5mm}
.due{font-size:3.9mm;line-height:1.6;margin-bottom:9mm}
.signs{display:flex;flex-direction:column;gap:9mm;font-size:4mm;margin-bottom:12mm}
.srow{display:flex;align-items:flex-end;gap:1.5mm;flex-wrap:wrap}
.srow em{font-style:normal;font-size:3.3mm;color:#555;white-space:nowrap}
/* 손으로 적는 칸 — 밑줄 위에 글씨가 들어갈 높이를 남긴다 */
.ln{display:inline-block;border-bottom:.35mm solid #000;height:8mm;vertical-align:-2.4mm}
.w1{width:15mm}.w3{width:42mm}
.date{text-align:center;font-size:4.2mm;margin-bottom:4mm}
.school{text-align:center;font-family:'Gothic A1',sans-serif;font-size:5.8mm;font-weight:800;letter-spacing:.05em}
.ft{margin-top:10mm;border-top:.35mm solid #C6D2DE;padding-top:3mm}
.ft-tx{font-size:3.6mm;color:#5A6674}`;
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
           '<title>' + esc((st.school || '학교')) + ' 개인정보 수집·이용 동의 안내</title>' +
           '<style>' + css + '</style></head><body>' + csPage(st) + '</body></html>';
  }

  function csPrompt(st) {
    const items = csItems(st);
    const school = st.school || '○○중학교';
    const list = items.map((it, i) => '  ' + (i + 1) + '. ' + it.name + ' — ' + it.purpose).join('\n');

    if (st.out === 'flow') {
      return [
        'A clean header illustration for a Korean school parent newsletter about student personal-data consent.',
        'Style: flat vector, friendly, education-oriented, soft blue and teal palette, generous white space.',
        'Subject: middle-school students using tablet devices in a classroom, connected to simple icons that',
        'represent (1) a device being handed over, (2) an online learning platform on screen, (3) a repair/service tool,',
        'all linked to a shield-with-lock icon meaning personal information protection.',
        'Do NOT draw faces in detail. Do NOT show any real logo or brand.',
        '',
        'The illustration accompanies a document about these consent items:',
        list,
        '',
        'Keep it as an illustration only — do not render any Korean or English text inside the image.',
        'Leave the top third empty so a title can be placed over it.'
      ].filter(x => x !== null).join('\n');
    }

    if (st.out === 'gpt') {
      return [
        '아래 안내문에 어울리는 **가정통신문 상단 삽화 이미지**를 만들어 줘.',
        '',
        '[문서 성격]',
        '· ' + school + ' 에서 학부모에게 보내는 <개인정보 수집·이용 동의 안내>',
        '· 아래 세 가지에 대한 동의를 받는 문서야.',
        list,
        '',
        '[그림 요구사항]',
        '· 깔끔한 플랫 벡터 일러스트, 교육용, 부드러운 파랑·청록 계열',
        '· 중학생이 태블릿(디벗)을 쓰는 교실 장면',
        '· 기기를 건네받는 모습 / 화면 속 학습 플랫폼 / 수리 도구 아이콘을 함께 배치',
        '· 이 셋이 <자물쇠가 달린 방패>(= 개인정보 보호) 아이콘으로 연결되는 구성',
        '· 얼굴은 단순하게, 실제 브랜드 로고는 넣지 말 것',
        '',
        '[주의]',
        '· **이미지 안에 글자를 넣지 말 것** — 제목은 문서에서 따로 얹을 거야',
        '· 위쪽 1/3은 비워 둘 것 (제목 자리)',
        '· 사람 얼굴이나 학교 이름이 특정되지 않게 할 것'
      ].filter(x => x !== null).join('\n');
    }
    return '';
  }

  function csRender(st) {
    const wrap = $('#csGen');
    const out = $('#csOut');
    if (!wrap || !out) return;

    $$('#csGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      $$('button', seg).forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-v') === st[key]));
    });

    if (st.out === 'doc') {
      const doc = csDoc(st);
      CS.doc = doc;
      out.innerHTML =
        '<div class="rg-outhead"><b>미리보기</b><span>A4 세로 · 동의 항목 ' + csItems(st).length + '개</span></div>' +
        '<div class="rg-actions">' +
          '<button type="button" class="rg-btn" id="csPrint">🖨️ 인쇄 · PDF로 저장</button>' +
          '<button type="button" class="rg-btn word" id="csDocx">📝 워드(.docx) 내려받기</button>' +
          '<button type="button" class="rg-btn hwp" id="csHwpx">🅷 한글(.hwpx) 내려받기</button>' +
          '<button type="button" class="rg-btn ghost" id="csDl">⬇️ HTML 파일로 내려받기</button>' +
        '</div>' +
        '<div class="note warn"><span class="n-em">⚖️</span><div class="n-wrap">' +
          '<b class="n-t">그대로 쓰지 말고 학교 상황에 맞추세요</b><div class="n-b">' +
          '이 초안은 교육청·학교 배포 서식을 바탕으로 만든 <b>예시</b>입니다. ' +
          '우리 학교가 실제로 쓰는 플랫폼과 수집 항목이 다르면 <b>반드시 고쳐야</b> 하고, ' +
          '발송 전에 <b>개인정보 보호책임자(보통 교감)</b>의 확인을 받으세요.' +
          '</div></div></div>' +
        '<div class="rg-frame"><iframe id="csFrame" title="개인정보 동의서 미리보기"></iframe></div>';
      const f = $('#csFrame');
      f.setAttribute('srcdoc', doc);
      f.addEventListener('load', () => fitFrame('csFrame', 794, 1123), { once: true });
      setTimeout(() => fitFrame('csFrame', 794, 1123), 60);
      return;
    }

    const p = csPrompt(st);
    CS.prompt = p;
    out.innerHTML =
      '<div class="rg-outhead"><b>' + (st.out === 'gpt' ? 'ChatGPT' : 'Google Flow') + '용 프롬프트</b>' +
        '<span>안내문 상단에 넣을 삽화</span></div>' +
      '<div class="rg-actions"><button type="button" class="rg-btn" id="csCopy">📋 프롬프트 복사</button></div>' +
      '<textarea class="rg-prompt" id="csPromptBox" rows="20" readonly spellcheck="false"></textarea>' +
      '<div class="note tip"><span class="n-em">🖼️</span><div class="n-wrap">' +
        '<b class="n-t">글자는 이미지에 넣지 않았습니다</b><div class="n-b">' +
        'AI 이미지 도구는 한글을 자주 틀리게 씁니다. 그래서 <b>그림만 만들고 제목·본문은 문서에서 얹도록</b> 프롬프트를 짰습니다. ' +
        '만든 그림은 <b>워드로 받은 동의서 맨 위에 붙여</b> 쓰시면 됩니다.' +
        '</div></div></div>';
    $('#csPromptBox').value = p;
  }

  function csInit() {
    const wrap = $('#csGen');
    if (!wrap) return;
    let st = csLoad();

    CS_FIELDS.forEach(k => {
      const el = $('[data-f="' + k + '"]', wrap);
      if (el) el.value = st[k] || '';
    });

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const k = el.getAttribute('data-f');
      st[k] = el.value;
      if (k === 'contact') st.contactEdited = 1;
      if (k === 'school' || k === 'dept') { const q = {}; q[k] = el.value; pfSet(q); }
      csSave(st); csRender(st);
    });

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        st[seg.parentNode.getAttribute('data-seg')] = seg.getAttribute('data-v');
        csSave(st); csRender(st);
        return;
      }
      if (e.target.closest('#csReset')) {
        const d = csDefaults();
        Object.keys(d).forEach(k => {
          st[k] = d[k];
          const el = $('[data-f="' + k + '"]', wrap);
          if (el) el.value = d[k];
        });
        csSave(st); csRender(st);
        return;
      }
      if (e.target.closest('#csPrint')) { printFrame('csFrame'); return; }
      if (e.target.closest('#csDocx')) {
        downloadDocx((st.school || '학교') + '_개인정보_동의서.docx', CS.doc || csDoc(st), false);
        return;
      }
      if (e.target.closest('#csHwpx')) {
        downloadHwpx((st.school || '학교') + '_개인정보_동의서.hwpx', CS.doc || csDoc(st));
        return;
      }
      if (e.target.closest('#csDl')) {
        downloadDoc((st.school || '학교') + '_개인정보_동의서.html', CS.doc || csDoc(st));
        return;
      }
      if (e.target.closest('#csCopy')) { copyText(CS.prompt || csPrompt(st), e.target.closest('#csCopy')); return; }
    });

    csRender(st);
    window.addEventListener('resize', () => fitFrame('csFrame', 794, 1123));
  }

  /* =========================================================
     ②-3 충전함 안내문 생성기
     ---------------------------------------------------------
     인쇄물(PDF·워드)로 만들거나, AI 이미지 도구용 프롬프트를 뽑습니다.
     ========================================================= */
  const CB_KEY = 'debut.cabgen';
  const CB_FIELDS = ['school', 'dept', 'dtitle', 'contact', 'notes', 'rules'];

  function cbDefaults() {
    const d = CB.defaults || {};
    const st = { out: d.out || 'doc', shot: d.shot || 'poster' };
    CB_FIELDS.forEach(k => {
      const v = d[k];
      st[k] = Array.isArray(v) ? v.join('\n') : (v || '');
    });
    return st;
  }
  function cbLoad() {
    let st = cbDefaults();
    try {
      const saved = JSON.parse(lsGet(CB_KEY) || 'null');
      if (saved) st = Object.assign(st, saved);
    } catch (e) {}
    const pf = pfGet();
    st.school = pf.school || st.school;
    st.dept = pf.dept || st.dept;
    st.contact = pfSyncContact(st, pf);
    return st;
  }
  function cbSave(st) { lsSet(CB_KEY, JSON.stringify(st)); }

  const cbLines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  function cbRules(st) {
    return cbLines(st.rules).map(l => {
      const i = l.indexOf('|');
      return i < 0 ? { t: l.trim(), b: '' } : { t: l.slice(0, i).trim(), b: l.slice(i + 1).trim() };
    });
  }

  function cabPage(st) {
    const notes = cbLines(st.notes);
    const rules = cbRules(st);

    let noteHtml = '';
    notes.forEach((n, i) => {
      noteHtml += '<div class="card"><span class="no">' + (i + 1) + '</span><span class="tx">' + esc(n) + '</span></div>';
    });

    let ruleHtml = '';
    rules.forEach(r => {
      ruleHtml += '<div class="kv"><b>' + esc(r.t) + '</b><span>' + esc(r.b) + '</span></div>';
    });

    /* 「학교 정보」의 보관 장소·충전함 규칙을 우리 학교 항목으로 앞에 붙인다 */
    const pf = pfGet();
    let ourHtml = '';
    if (pfv(pf, 'storage')) {
      ourHtml += '<div class="kv"><b>보관 장소</b><span>' + esc(pfv(pf, 'storage')) + '</span></div>';
    }
    if (pfv(pf, 'chargeRule')) {
      ourHtml += '<div class="kv"><b>충전함 사용 규칙</b><span>' + esc(pfv(pf, 'chargeRule')) + '</span></div>';
    }
    if (ourHtml) ruleHtml = ourHtml + ruleHtml;

    return '<div class="page">' +
      '<div class="ph"><b>' + esc(st.school || '○○학교') + '</b></div>' +
      '<h1>' + esc(st.dtitle || '충전함 사용 유의사항') + '</h1>' +
      (noteHtml ? '<div class="sec"><h2>꼭 지켜 주세요</h2><div class="sbody">' + noteHtml + '</div></div>' : '') +
      (ruleHtml ? '<div class="sec"><h2>보관 · 충전 운영 규칙</h2><div class="sbody">' + ruleHtml + '</div></div>' : '') +
      '<div class="note">※ 배터리 화재는 소화기로 꺼도 다시 붙습니다. 연기나 불꽃이 보이면 ' +
        '다른 기기를 먼저 꺼내 옮기고, 전원 플러그를 뽑은 뒤 물을 받은 양동이에 통째로 담그세요.</div>' +
      '<div class="ft"><span class="ft-tx">문의 : ' +
        esc(contactLine(st)) + '</span></div>' +
    '</div>';
  }

  function cabDoc(st) {
    const css = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'IBM Plex Sans KR','Gothic A1','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
 color:#111;background:#fff;word-break:keep-all;overflow-wrap:break-word;line-break:strict}
/* 넘치면 잘라 내지 않고 다음 장으로 흘려보낸다 — 잘라 내면 인쇄물에서 소리 없이 사라진다 */
.page{width:210mm;min-height:297mm;padding:18mm 18mm 14mm;position:relative}
.ph{font-size:3.6mm;color:#5A6674;margin-bottom:3mm}
.ph b{font-family:'Gothic A1',sans-serif;font-weight:800;color:#B07C0A;font-size:4.4mm}
h1{font-family:'Gothic A1',sans-serif;font-size:11mm;font-weight:800;text-align:center;
 letter-spacing:-.03em;color:#8A5F00;margin-bottom:8mm}
.sec{margin-bottom:7mm}
.sec h2{font-family:'Gothic A1',sans-serif;font-size:4.8mm;font-weight:800;color:#fff;background:#B07C0A;
 padding:2.2mm 4mm;border-radius:1.5mm;margin-bottom:3.5mm}
.sbody{padding-left:1mm}
.card{display:flex;align-items:flex-start;gap:3.5mm;margin-bottom:3mm}
.card .no{flex-shrink:0;width:6.8mm;height:6.8mm;border-radius:50%;background:#B07C0A;color:#fff;
 font-size:3.9mm;font-weight:700;display:flex;align-items:center;justify-content:center}
.card .tx{font-size:4.3mm;line-height:1.5;padding-top:.7mm}
.kv{display:flex;gap:3mm;margin-bottom:2.4mm;align-items:baseline}
.kv b{flex-shrink:0;min-width:26mm;font-size:4mm;color:#8A5F00}
.kv span{font-size:3.9mm;line-height:1.5;color:#333}
.note{font-size:3.8mm;line-height:1.6;color:#8A2E28;background:#FDF3F2;border:.35mm solid #E0A9A4;
 border-radius:2mm;padding:3.5mm 4.5mm;margin-bottom:7mm}
.ft{position:absolute;left:18mm;right:18mm;bottom:14mm;border-top:.35mm solid #C6D2DE;padding-top:3mm}
.ft-tx{font-size:3.8mm;color:#5A6674}`;
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
           '<title>' + esc(st.dtitle || '충전함 사용 유의사항') + '</title>' +
           '<style>' + css + '</style></head><body>' + cabPage(st) + '</body></html>';
  }

  function cbPrompt(st) {
    const notes = cbLines(st.notes);
    const rules = cbRules(st);
    const school = st.school || '○○학교';
    const dept = contactLine(st);
    const title = st.dtitle || '충전함 사용 유의사항';
    const body = notes.map((n, i) => '  ' + (i + 1) + '. ' + n).join('\n');
    const ruleTxt = rules.map(r => '  · ' + r.t + (r.b ? ' — ' + r.b : '')).join('\n');

    if (st.out === 'flow') {
      return [
        'A vertical A4 poster for a Korean middle school classroom, flat vector illustration style.',
        'Subject: a wall-mounted device charging cabinet with numbered slots and tablets charging inside.',
        'Mood: clean, friendly, high contrast, amber and warm grey palette, plenty of white space.',
        'Composition: bold title at the top, a numbered list of short rules below, a footer line at the bottom.',
        'Include small simple icons beside each rule (lock, key card, plug, power switch, door, battery, fire bucket).',
        '',
        'IMPORTANT — render the following Korean text exactly as written, no spelling changes, no extra words:',
        '',
        'TITLE: ' + title,
        'SCHOOL: ' + school,
        'RULES:',
        body,
        (ruleTxt ? 'OPERATION:\n' + ruleTxt : null),
        'FOOTER: 문의 : ' + dept,
        '',
        'Do not add any English text. Do not invent extra rules. Keep every Korean character intact.'
      ].filter(x => x !== null).join('\n');
    }

    if (st.out === 'gpt') {
      return [
        '아래 내용으로 **A4 세로 인쇄용 안내 포스터 이미지**를 만들어 줘.',
        '',
        '[디자인]',
        '· 한국 중학교 교실 게시용, 깔끔한 플랫 벡터 일러스트',
        '· 색: 앰버(호박색) + 따뜻한 회색, 흰 여백 넉넉히',
        '· 맨 위 큰 제목 → 번호가 붙은 규칙 목록 → 맨 아래 문의처 한 줄',
        '· 각 규칙 왼쪽에 작은 아이콘 (자물쇠 · 카드키 · 플러그 · 전원 · 문 · 배터리 · 양동이)',
        '· 가운데나 배경에 번호 칸이 있는 충전함과 태블릿 그림',
        '',
        '[반드시 그대로 넣을 글자 — 맞춤법을 고치지 말 것]',
        '제목 : ' + title,
        '학교 : ' + school,
        '',
        '규칙 :',
        body,
        (ruleTxt ? '\n운영 규칙 :\n' + ruleTxt : null),
        '',
        '문의 : ' + dept,
        '',
        '[주의]',
        '· 영어 문구를 넣지 말 것',
        '· 없는 규칙을 지어내지 말 것',
        '· 글자가 잘리거나 겹치지 않게 배치할 것'
      ].filter(x => x !== null).join('\n');
    }
    return '';
  }

  /* ---------------------------------------------------------
     충전함 「보관 방법」 설명 그림 프롬프트
     글이 많은 안내문 포스터와 달리, 그림으로 방법을 보여 주는 자료다.
     한글은 짧은 라벨만 넣어 오탈자 위험을 줄인다.
     --------------------------------------------------------- */
  function cbHowtoPrompt(st) {
    const school = st.school || '○○중학교';
    const dept = contactLine(st);
    const rules = cbRules(st);
    const ruleTxt = rules.length
      ? rules.map(r => '  · ' + r.t + (r.b ? ' — ' + r.b : '')).join('\n')
      : '  · 시스템을 종료한 뒤 충전선을 연결합니다\n  · 정해진 번호 칸에만 넣습니다\n  · 하교 후 전원을 차단합니다';

    if (st.out === 'flow') {
      return [
'An A4 portrait (3:4) Korean school infographic poster explaining HOW TO STORE tablets in a charging cabinet.',
'Style: clean flat vector illustration, isometric-lite, amber (#B07C0A) and warm grey palette, white background,',
'thick friendly outlines, print quality. This is a HOW-TO DIAGRAM, not a text-heavy notice.',
'',
'THREE STACKED PANELS, each with a numbered circular badge (1, 2, 3) and a short Korean caption:',
'',
'PANEL 1 — WHERE TO PUT IT: a top-down classroom floor plan. Blackboard at the top, rows of desks,',
'the charging cabinet drawn in a CORNER near the blackboard, away from the doorway and walkway.',
'Small icons showing: no direct sunlight, away from a heater, ventilation gap behind the cabinet,',
'a dedicated high-capacity power strip. A dotted arrow points from the walkway to the corner.',
'',
'PANEL 2 — HOW TO PUT A DEVICE IN: three small steps left to right, connected by arrows —',
'(a) a laptop being shut down (power icon with a check), (b) the laptop sliding into a numbered slot,',
'(c) the charging cable being plugged in. The cabinet front shows a grid of numbered slots',
'with small number stickers, and a lock on the door.',
'',
'PANEL 3 — VACATION STORAGE: the same cabinet moved to the middle of the classroom,',
'battery icon showing about 50 percent, cables unplugged and bundled, the power plug pulled out of the wall,',
'a bucket of water and heat-resistant gloves standing beside the cabinet, door locked.',
'',
'Use ONLY these Korean labels, spelled exactly, and no other text:',
'TITLE: "충전함 보관 방법"',
'SCHOOL: "' + school + '"',
'PANEL 1 CAPTION: "교실 구석에 설치 · 통행로와 대피 동선을 막지 않기"',
'PANEL 2 CAPTION: "시스템 종료 → 번호 칸에 넣기 → 충전선 연결"',
'PANEL 3 CAPTION: "방학 중 — 50% 충전 · 충전선 분리 · 전원 플러그 뽑기 · 양동이 비치"',
'FOOTER: "문의 : ' + dept + '"',
'',
'NEGATIVE PROMPT: misspelled Korean, garbled or invented glyphs, English sentences, long paragraphs,',
'watermark, photorealistic style, cluttered background, cropped text, words broken mid-syllable,',
'fire or smoke, alarming imagery.'
      ].join('\n');
    }

    return [
'아래 내용으로 **A4 세로 「충전함 보관 방법」 설명 그림(인포그래픽) 이미지**를 1장 만들어 줘.',
'',
'[성격]',
'· 글이 빽빽한 안내문이 아니라, **그림으로 방법을 보여 주는 자료**야.',
'· 한글은 아래 적은 **짧은 라벨만** 넣고, 나머지는 그림과 아이콘으로 설명해 줘.',
'',
'[디자인]',
'· 깔끔한 플랫 벡터 일러스트, 선이 굵고 친근한 느낌',
'· 색: 앰버(#B07C0A) + 따뜻한 회색, 배경은 흰색, 여백 넉넉히',
'· 위에서 아래로 **3단 구성**, 각 단마다 번호 원(1 · 2 · 3)과 짧은 한 줄 설명',
'',
'[1단 — 어디에 둘까]',
'· 교실을 위에서 내려다본 평면도. 위쪽에 칠판, 가운데 책상 줄',
'· 충전함은 **칠판 쪽 구석 모서리**에 배치하고, 출입문·통행로와 떨어뜨릴 것',
'· 작은 아이콘으로 표시 — 직사광선 피하기, 난방기에서 멀리, 뒤쪽 통풍 공간, 고용량 멀티탭',
'',
'[2단 — 어떻게 넣을까]',
'· 왼쪽에서 오른쪽으로 화살표로 이어지는 3단계',
'· (가) 노트북을 **시스템 종료**하는 모습 (전원 아이콘 + 체크)',
'· (나) 번호가 붙은 **칸에 밀어 넣는** 모습',
'· (다) **충전선을 연결**하는 모습',
'· 충전함 정면에는 번호 스티커가 붙은 칸들이 격자로, 문에는 자물쇠',
'',
'[3단 — 방학 중에는]',
'· 같은 충전함이 **교실 가운데로** 옮겨진 모습',
'· 배터리 아이콘은 **50% 정도**, 충전선은 뽑아서 묶어 둔 모습',
'· 벽 콘센트에서 **전원 플러그를 뽑은** 모습',
'· 옆에 **물 받은 양동이**와 **내열장갑**, 충전함은 잠금 상태',
'',
'[반드시 그대로 넣을 글자 — 맞춤법을 고치거나 문장을 지어내지 말 것]',
'제목 : 충전함 보관 방법',
'학교 : ' + school,
'1단 설명 : 교실 구석에 설치 · 통행로와 대피 동선을 막지 않기',
'2단 설명 : 시스템 종료 → 번호 칸에 넣기 → 충전선 연결',
'3단 설명 : 방학 중 — 50% 충전 · 충전선 분리 · 전원 플러그 뽑기 · 양동이 비치',
'맨 아래 : 문의 : ' + dept,
'',
'[참고 — 우리 학교 운영 규칙 (그림 구성에만 반영하고, 글자로 다 넣지는 말 것)]',
ruleTxt,
'',
'[주의]',
'· 위에 적힌 라벨 외에 **다른 글자를 만들어 넣지 말 것**',
'· 영어 문장을 넣지 말 것',
'· 불꽃이나 연기처럼 **겁을 주는 그림은 넣지 말 것** (교실 게시용입니다)',
'· 글자가 잘리거나 겹치지 않게 배치할 것'
    ].join('\n');
  }

  function cbRender(st) {
    const wrap = $('#cabGen');
    const out = $('#cbOut');
    if (!wrap || !out) return;

    $$('#cabGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      $$('button', seg).forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-v') === st[key]));
    });
    const shotRow = $('#cbShotRow');
    if (shotRow) shotRow.hidden = (st.out === 'doc');

    if (st.out === 'doc') {
      const doc = cabDoc(st);
      CB.doc = doc;
      out.innerHTML =
        '<div class="rg-outhead"><b>미리보기</b><span>A4 세로 · 안내 ' + cbLines(st.notes).length +
          '항목 · 운영 규칙 ' + cbRules(st).length + '개</span></div>' +
        '<div class="rg-actions">' +
          '<button type="button" class="rg-btn" id="cbPrint">🖨️ 인쇄 · PDF로 저장</button>' +
          '<button type="button" class="rg-btn word" id="cbDocx">📝 워드(.docx) 내려받기</button>' +
          '<button type="button" class="rg-btn hwp" id="cbHwpx">🅷 한글(.hwpx) 내려받기</button>' +
          '<button type="button" class="rg-btn ghost" id="cbDl">⬇️ HTML 파일로 내려받기</button>' +
        '</div>' +
        '<div class="note info"><span class="n-em">📌</span><div class="n-wrap">' +
          '<b class="n-t">충전함 문에 붙이세요</b><div class="n-b">' +
          '인쇄해서 <b>충전함 문 안쪽</b>에 붙이면 학생이 열 때마다 보게 됩니다. ' +
          '문구를 더 손보려면 <b>워드(.docx)</b>로 받아 고치면 됩니다.' +
          '</div></div></div>' +
        '<div class="rg-frame"><iframe id="cbFrame" title="충전함 안내문 미리보기"></iframe></div>';
      const f = $('#cbFrame');
      f.setAttribute('srcdoc', doc);
      f.addEventListener('load', () => fitFrame('cbFrame', 794, 1123), { once: true });
      setTimeout(() => fitFrame('cbFrame', 794, 1123), 60);
      return;
    }

    const howto = st.shot === 'howto';
    const p = howto ? cbHowtoPrompt(st) : cbPrompt(st);
    CB.prompt = p;
    out.innerHTML =
      '<div class="rg-outhead"><b>' + (st.out === 'gpt' ? 'ChatGPT' : 'Google Flow') + '용 프롬프트</b>' +
        '<span>' + (howto ? 'A4 세로 · 보관 방법 설명 그림 (3단 구성)' : 'A4 세로 · 사용 안내문 포스터') + '</span></div>' +
      '<div class="rg-actions">' +
        '<button type="button" class="rg-btn" id="cbCopy">📋 프롬프트 복사</button>' +
      '</div>' +
      '<textarea class="rg-prompt" id="cbPromptBox" rows="20" readonly spellcheck="false"></textarea>' +
      (howto
        ? '<div class="note tip"><span class="n-em">🖼️</span><div class="n-wrap">' +
            '<b class="n-t">글자를 최소한으로 줄인 그림 자료입니다</b><div class="n-b">' +
            '① <b>어디에 둘까</b> ② <b>어떻게 넣을까</b> ③ <b>방학 중에는</b> 세 단으로 구성되며, ' +
            '한글은 <b>제목과 단별 한 줄 설명</b>만 들어갑니다. 글자가 적어서 AI가 틀릴 여지도 그만큼 적습니다. ' +
            '완성한 그림은 <b>충전함 위쪽 벽이나 교실 게시판</b>에 붙이면 학생이 순서를 눈으로 익힙니다.' +
            '</div></div></div>' +
          '<div class="note info"><span class="n-em">🔀</span><div class="n-wrap">' +
            '<b class="n-t">글이 많은 규칙은 안내문 쪽으로</b><div class="n-b">' +
            '자세한 규칙 문장까지 넣으려면 <b>사용 안내문 포스터</b>를 고르거나 ' +
            '<b>인쇄물로 만들기</b>를 쓰세요. 두 장을 같이 붙이는 학교도 있습니다 — ' +
            '<b>그림은 위, 글 안내문은 충전함 문 안쪽</b>.' +
            '</div></div></div>'
        : '<div class="note tip"><span class="n-em">🔤</span><div class="n-wrap">' +
            '<b class="n-t">생성 후 반드시 글자를 확인하세요</b><div class="n-b">' +
            'AI 이미지 도구는 <b>한글을 자주 틀리게 씁니다.</b> 나온 이미지의 글자를 하나씩 대조하고, ' +
            '오탈자가 반복되면 항목 수를 줄이거나 <b>인쇄물로 만들기</b>를 쓰세요. ' +
            '게시물은 글자가 정확해야 하므로, <b>확신이 서지 않으면 인쇄물 쪽이 안전합니다.</b>' +
            '</div></div></div>') +
      '<div class="note info"><span class="n-em">' + (st.out === 'gpt' ? '🤖' : '🎬') + '</span><div class="n-wrap">' +
        '<b class="n-t">' + (st.out === 'gpt' ? 'ChatGPT에서 쓰는 법' : 'Google Flow에서 쓰는 법') + '</b><div class="n-b">' +
        (st.out === 'gpt'
          ? '<b>ChatGPT</b>(또는 Gemini) 대화창에 붙여넣고 이미지를 만들어 달라고 하세요. ' +
            '마음에 들지 않으면 <b>“2단을 더 크게”</b>처럼 이어서 고쳐 달라고 하면 됩니다.'
          : '<b>Google Flow</b>의 이미지 생성 칸에 붙여넣으세요. 마지막 <b>NEGATIVE PROMPT</b> 줄은 ' +
            '부정 프롬프트 칸이 따로 있으면 그쪽에 옮겨 넣는 편이 결과가 좋습니다.') +
        '</div></div></div>';
    $('#cbPromptBox').value = p;
  }

  function cbInit() {
    const wrap = $('#cabGen');
    if (!wrap) return;
    let st = cbLoad();

    CB_FIELDS.forEach(k => {
      const el = $('[data-f="' + k + '"]', wrap);
      if (el) el.value = st[k] || '';
    });

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const k = el.getAttribute('data-f');
      st[k] = el.value;
      if (k === 'contact') st.contactEdited = 1;
      if (k === 'school' || k === 'dept') { const q = {}; q[k] = el.value; pfSet(q); }
      cbSave(st); cbRender(st);
    });

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        st[seg.parentNode.getAttribute('data-seg')] = seg.getAttribute('data-v');
        cbSave(st); cbRender(st);
        return;
      }
      if (e.target.closest('#cbReset')) {
        const d = cbDefaults();
        Object.keys(d).forEach(k => {
          st[k] = d[k];
          const el = $('[data-f="' + k + '"]', wrap);
          if (el) el.value = d[k];
        });
        cbSave(st); cbRender(st);
        return;
      }
      if (e.target.closest('#cbPrint')) { printFrame('cbFrame'); return; }
      if (e.target.closest('#cbDocx')) {
        downloadDocx((st.school || '학교') + '_충전함_안내문.docx', CB.doc || cabDoc(st), false);
        return;
      }
      if (e.target.closest('#cbHwpx')) {
        downloadHwpx((st.school || '학교') + '_충전함_안내문.hwpx', CB.doc || cabDoc(st));
        return;
      }
      if (e.target.closest('#cbDl')) {
        downloadDoc((st.school || '학교') + '_충전함_안내문.html', CB.doc || cabDoc(st));
        return;
      }
      if (e.target.closest('#cbCopy')) {
        copyText(CB.prompt || cbPrompt(st), e.target.closest('#cbCopy'));
        return;
      }
    });

    cbRender(st);
    window.addEventListener('resize', () => fitFrame('cbFrame', 794, 1123));
  }

  /* =========================================================
     ③ 디벗 사용 교육 자료 생성기
     ========================================================= */
  const EDU_KEY = 'debut.edugen';
  const LESSON = [
    ['4분', '도입 — 디벗이란', '디벗 = Digital + 벗, 나의 디지털 학습 친구. 왜 쓰는지와 사용 기간·반납 시기 안내', '안내 자료 표지'],
    ['6분', '구성품 · 라벨 확인', '구성품을 하나씩 꺼내 확인, 라벨링 스티커의 학번·이름 대조', '구성품, 라벨 스티커'],
    ['7분', '기본 조작 실습', '전원 켜기·끄기, 강제 종료 방법, 화면 잠금·비밀번호 설정, 밝기·글자 크기 조정', '기기 전원 확인'],
    ['7분', '와이파이 · 계정 로그인', '교실 네트워크 연결 → 학교 계정 로그인 → 임시 비밀번호 변경. 전원 완료 확인', '와이파이·계정 안내표'],
    ['7분', '이용 · 보관 원칙', '충전함 번호순 보관 실습(시스템 종료 후 충전선 연결), 교내·가정·방학 반출 규정', '충전함, 규칙 포스터'],
    ['7분', '파손 · 분실 책임', '빌려주면 안 되는 이유, 자기부담금 기준을 숫자로 안내, 신고 절차 1·2차 경로', '안내 자료 뒤쪽'],
    ['5분', '디지털 윤리', '타인의 인격·사생활 존중, 유해 사이트·저작권, 수업 중 딴짓 금지와 벌점 기준', '윤리 안내 쪽'],
    ['2분', '정리', '오늘의 약속 한 문장 확인, 질의응답, 보호자용 안내문 배부', '보호자용 요약본']
  ];

  /* 학교와 무관하게 공통으로 들어가는 내용 */
  const EDU_FIX = {
    meaning: ['<b>디벗</b> = <b>Di</b>gital + <b>벗</b> — 나의 디지털 학습 친구라는 뜻입니다.',
              '수업에서 자료를 찾고, 정리하고, 함께 나누기 위해 쓰는 <b>학습 도구</b>입니다.'],
    important: [
      '구성품을 하나씩 확인합니다 — 본체 · 펜 · 케이스(파우치) · 충전기와 충전선',
      '기기에 붙은 <b>라벨링 스티커의 학번과 이름</b>을 반드시 확인합니다',
      '학교에 등록된 물품이므로 <b>전학하거나 졸업할 때 반납</b>해야 합니다',
      '충전함에는 <b>번호순으로</b> 넣고, <b>시스템을 종료한 뒤</b> 충전선을 연결합니다',
      '충전함 비밀번호는 <b>선생님만</b> 알고 있습니다',
      '수업 시간 외의 용도로 사용하지 않습니다'
    ],
    lend: [
      '<b>1인 1기기</b>입니다. 친구에게 빌려주지 않습니다',
      '빌려주면 <b>파손·분실 위험</b>이 커지고, 책임 소재를 가리기 어렵습니다',
      '기기 <b>관리의 책임은 사용하는 학생</b>에게 있습니다',
      '수리비와 분실 구입비는 <b>보호자에게 청구</b>됩니다',
      '교육 목적을 위해 사용 시간 제어, 앱 설치 제한 등 <b>일부 기능이 제한</b>될 수 있습니다'
    ],
    cls: [
      '선생님의 지도에 따라 기기를 켜고 끕니다',
      '허락되지 않은 <b>게임 · 메신저 · SNS</b>는 사용하지 않습니다',
      '친구가 조작을 어려워하면 옆에서 도와줍니다',
      '디벗으로 하는 수업에 적극적으로 참여합니다',
      '이동 수업에는 <b>기기를 접어 두 손으로</b> 들고 이동합니다'
    ],
    ethics: [
      '온라인에서는 <b>내 뜻이 정확히 전달되지 않을 수 있습니다.</b> 한 번 더 읽고 보냅니다',
      '타인의 <b>인격과 사생활을 존중</b>합니다',
      '<b>유해 사이트</b>에 접속하지 않습니다 (학교에서 주요 유해·게임 사이트를 차단하고 있습니다)',
      '<b>저작권</b>을 침해하지 않습니다. 이미지·글·음악을 쓸 때는 출처를 밝히고, 무료 이용이 가능한 자료를 씁니다',
      '사전 동의 없이 촬영한 사진·영상을 <b>온라인에 올리지 않습니다</b>'
    ],
    tips: [
      ['화면 캡처', '<b>Win</b> + <b>Shift</b> + <b>S</b> — 원하는 부분만 잘라 복사, 붙여넣기는 Ctrl + V'],
      ['화면 미러링', '<b>Win</b> + <b>P</b> — 전자칠판·TV에 복제 또는 확장으로 연결'],
      ['다른 기기에서 로그인', '브라우저에서 <b>Ctrl</b> + <b>Shift</b> + <b>N</b> (시크릿 창)으로 로그인하고 끝나면 창을 닫기'],
      ['느려졌을 때', '<b>Win</b> + <b>R</b> → <code>%temp%</code> 입력 → 전체 선택 후 삭제 (임시 파일 정리)'],
      ['QR 코드', '브라우저에서 카메라를 허용한 뒤 QR 코드를 비추면 인식됩니다'],
      ['펜이 안 될 때', '펜촉이 닳았거나 내부 건전지가 소모된 경우입니다. 선생님께 문의하세요']
    ]
  };

  const EDU_CSS = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'IBM Plex Sans KR','Gothic A1','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
 color:#1B2430;background:#fff;word-break:keep-all;overflow-wrap:break-word;line-break:strict}
/* height + overflow:hidden 이면 한 장을 넘는 내용이 통째로 잘려 나간다.
   목록이 길어지면 표 뒷부분이 인쇄물에서 사라지므로 min-height 로 두고 흘려보낸다. */
.page{width:210mm;min-height:297mm;padding:16mm 16mm 12mm;position:relative;page-break-after:always;
 display:flex;flex-direction:column}
.page:last-child{page-break-after:auto}
/* 내용이 길어 여러 장으로 넘어가는 장 — 장 나누기가 어긋나지 않게 보통 흐름으로 둔다 */
.page.flow{display:block}
.page.flow .note{margin-top:6mm}
.ph{display:flex;align-items:center;gap:3mm;padding-bottom:3mm;margin-bottom:6mm;border-bottom:1mm solid #0F6FB8}
.ph b{font-family:'Gothic A1',sans-serif;font-size:6mm;font-weight:800;letter-spacing:-.02em;color:#0F6FB8}
.ph i{margin-left:auto;font-style:normal;font-size:3.4mm;color:#7A8894}
.sec{margin-bottom:7mm}
.sec>h2{font-family:'Gothic A1',sans-serif;font-size:4.8mm;font-weight:800;color:#fff;background:#0F6FB8;
 padding:2.2mm 4mm;border-radius:2mm 2mm 0 0;display:flex;align-items:center;gap:2.5mm}
.sec>h2 em{font-style:normal;font-size:5.4mm}
.sec.g>h2{background:#1F7A5B}.sec.o>h2{background:#C0392B}.sec.p>h2{background:#6B4FBF}.sec.y>h2{background:#96690A}
.sbody{border:.4mm solid #D8E2EC;border-top:0;border-radius:0 0 2mm 2mm;padding:4mm 4.5mm}
.kv{display:flex;gap:3mm;margin-bottom:2.4mm;font-size:3.9mm;line-height:1.5}
.kv:last-child{margin-bottom:0}
.kv b{flex-shrink:0;width:32mm;font-weight:700;color:#0F6FB8}
.sec.g .kv b{color:#1F7A5B}.sec.o .kv b{color:#C0392B}.sec.p .kv b{color:#6B4FBF}.sec.y .kv b{color:#96690A}
.li{position:relative;padding-left:5mm;margin-bottom:2mm;font-size:3.9mm;line-height:1.5}
.li:last-child{margin-bottom:0}
.li::before{content:"";position:absolute;left:1mm;top:1.6mm;width:1.8mm;height:1.8mm;border-radius:50%;background:#0F6FB8}
.sec.g .li::before{background:#1F7A5B}.sec.o .li::before{background:#C0392B}
.sec.p .li::before{background:#6B4FBF}.sec.y .li::before{background:#96690A}
table{width:100%;border-collapse:collapse;font-size:3.7mm}
/* 표가 여러 장에 걸칠 때 — 머리글은 장마다 다시 찍고, 한 줄이 반으로 갈리지 않게 한다 */
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
th,td{border:.3mm solid #C9D6E2;padding:2.2mm 3mm;text-align:left;vertical-align:top;line-height:1.45}
th{background:#EDF3F9;font-weight:700;white-space:nowrap}
td.n{white-space:nowrap;font-weight:600}
.cover{align-items:center;justify-content:center;text-align:center;gap:0}
/* 한 장 요약 — 교실 게시용 2단 구성
   내용이 많은 학교도 잘리지 않도록 높이는 늘어나게 두고,
   인쇄할 때는 섹션 단위로 자연스럽게 나뉘도록 한다. */
.page.flow{height:auto;min-height:297mm;overflow:visible}
.two{column-count:2;column-gap:6mm;flex:1}
.two .sec{break-inside:avoid;page-break-inside:avoid;margin-bottom:4mm}
.two .sec>h2{font-size:4mm;padding:1.6mm 3mm;border-radius:1.6mm 1.6mm 0 0}
.two .sbody{padding:2.6mm 3.2mm}
.two .kv,.two .li{font-size:3.3mm;margin-bottom:1.6mm;line-height:1.42}
.two .kv b{width:22mm}
.two .li{padding-left:4.2mm}
.two table{font-size:3.1mm}
.two th,.two td{padding:1.4mm 1.8mm}
.warnbox{border:.7mm solid #C0392B;border-radius:2mm;background:#FDF3F2;padding:3.5mm 4mm;margin-bottom:5mm}
.warnbox b{color:#C0392B;font-size:4.2mm;font-family:'Gothic A1',sans-serif;font-weight:800}
.warnbox p{font-size:3.7mm;line-height:1.55;margin-top:1.5mm;color:#5A2B27}
.cover .cs{font-size:5mm;font-weight:700;color:#0F6FB8;margin-bottom:6mm}
.cover .ct{font-family:'Gothic A1',sans-serif;font-size:12mm;font-weight:800;line-height:1.25;
 letter-spacing:-.03em;margin-bottom:5mm}
.cover .ct em{font-style:normal;color:#0F6FB8}
.cover .cl{width:40mm;height:1.4mm;background:#FFC53D;border-radius:1mm;margin:0 auto 8mm}
.cover .cd{font-size:4.2mm;color:#5A6674;line-height:1.9}
.cover .cf{margin-top:12mm;font-family:'Gothic A1',sans-serif;font-size:5.4mm;font-weight:800}
.cover .cf small{display:block;font-size:3.8mm;font-weight:500;color:#5A6674;margin-top:1.5mm}
.note{margin-top:auto;border:.4mm dashed #C0392B;border-radius:2mm;padding:3.5mm 4mm;
 font-size:3.6mm;line-height:1.55;color:#8A2E28;background:#FDF3F2}
.note b{font-weight:700}
.foot{margin-top:5mm;padding-top:2.5mm;border-top:.3mm solid #DDE4EC;
 display:flex;justify-content:space-between;font-size:3.2mm;color:#8A97A5}
.talk{font-size:3.6mm;color:#42505E;line-height:1.5;background:#F5F8FB;border-left:1mm solid #0F6FB8;
 padding:2.5mm 3.5mm;margin-top:2mm;border-radius:0 1.5mm 1.5mm 0}
.talk b{color:#0F6FB8}
`;

  function eduFoot(p, label) {
    return '<div class="foot"><span>' + esc(pfv(p, 'school')) + ' ' + esc(pfv(p, 'dept')) + '</span>' +
           '<span>' + esc(label) + '</span></div>';
  }
  function kv(p, k, label) {
    const v = pfv(p, k);
    return v ? '<div class="kv"><b>' + label + '</b><span>' + esc(v) + '</span></div>' : '';
  }
  function secBox(cls, em, title, inner) {
    if (!inner) return '';
    return '<div class="sec ' + cls + '"><h2><em>' + em + '</em>' + title + '</h2>' +
           '<div class="sbody">' + inner + '</div></div>';
  }

  const liList = arr => arr.map(x => '<div class="li">' + x + '</div>').join('');

  function eduSections(p) {
    const s = {};
    s.device = secBox('', '💻', '기기 및 계정 개요',
      kv(p, 'device', '기기 종류') + kv(p, 'period', '사용 기간') +
      kv(p, 'account', '계정 지원') + kv(p, 'idForm', '아이디 형식') +
      kv(p, 'idPw', '초기 비밀번호') + kv(p, 'pwReset', '비밀번호 초기화') +
      kv(p, 'benefit', '추가 혜택') + kv(p, 'sw', '사용 가능 프로그램'));

    const parts = pfRows(p.parts);
    s.parts = parts.length ? secBox('p', '📦', '학년별 구성품',
      '<table><tr><th>학년</th><th>기기</th><th>펜</th><th>충전기</th><th>케이스</th><th>문의처</th></tr>' +
      parts.map(r => '<tr><td class="n">' + esc(r[0] || '') + '</td><td>' + esc(r[1] || '') +
        '</td><td>' + esc(r[2] || '') + '</td><td>' + esc(r[3] || '') + '</td><td>' + esc(r[4] || '') +
        '</td><td class="n">' + esc(r[5] || '') + '</td></tr>').join('') + '</table>') : '';

    s.meaning = secBox('', '🤝', '디벗이 무엇인가요', liList(EDU_FIX.meaning));
    s.important = secBox('o', '❗', '중요 사용 안내', liList(EDU_FIX.important) +
      (pfv(p, 'chargeRule') ? '<div class="li">' + esc(pfv(p, 'chargeRule')) + '</div>' : '') +
      (pfv(p, 'tutorDay') ? '<div class="li">디벗 튜터 선생님 방문일 — <b>' + esc(pfv(p, 'tutorDay')) + '</b></div>' : ''));
    s.lend = secBox('o', '🙅', '친구에게 빌려주면 안 되는 이유', liList(EDU_FIX.lend));
    s.cls = secBox('g', '🙋', '디벗 수업 유의사항', liList(EDU_FIX.cls));
    s.ethics = secBox('p', '🌐', '디지털 윤리 약속', liList(EDU_FIX.ethics));
    s.tips = secBox('y', '💡', '알아두면 편한 기능',
      '<table><tr><th style="width:38mm">언제</th><th>이렇게 하세요</th></tr>' +
      EDU_FIX.tips.map(t => '<tr><td class="n">' + t[0] + '</td><td>' + t[1] + '</td></tr>').join('') +
      '</table>');

    s.use = secBox('g', '🔌', '이용 및 보관 원칙',
      kv(p, 'storage', '보관 장소') + kv(p, 'useIn', '교내 이용') +
      kv(p, 'useHome', '가정 반출') + kv(p, 'useVacation', '방학 중'));

    s.risk = secBox('o', '🛠️', '파손 및 분실 시 책임',
      kv(p, 'repairFee', '파손 시') + kv(p, 'lossRule', '분실 시') +
      kv(p, 'leaveRule', '전출·졸업 시') + kv(p, 'repairPay', '비용 납부·배송') +
      (pfv(p, 'report1') ? '<div class="kv"><b>파손 신고</b><span>1차 ' + esc(pfv(p, 'report1')) +
        (pfv(p, 'report2') ? ' → 2차 ' + esc(pfv(p, 'report2')) : '') + '</span></div>' : '') +
      (pfv(p, 'callcenter') ? '<div class="kv"><b>분실 처리</b><span>1차 ' + esc(pfv(p, 'report1') || '담당 부서') +
        ' → 2차 ' + esc(pfv(p, 'callcenter')) + ' 연락</span></div>' : ''));

    /* 「학교 전체가 같음」으로 골랐으면 구역별 목록 대신 SSID·비밀번호 한 줄을 쓴다 */
    let wifi = pfRows(p.wifi);
    if (!wifi.length && pfv(p, 'wifiSsid')) {
      wifi = [['학교 전체', pfv(p, 'wifiSsid'), pfv(p, 'wifiPw') || '담임 안내']];
    }
    s.wifi = wifi.length ? secBox('p', '📶', '학교 와이파이 접속 안내',
      '<table><tr><th>구역</th><th>네트워크 이름</th><th>비밀번호</th></tr>' +
      wifi.map(r => '<tr><td class="n">' + esc(r[0] || '') + '</td><td>' + esc(r[1] || '') +
        '</td><td>' + esc(r[2] || '담임 안내') + '</td></tr>').join('') +
      '</table>' +
      '<div class="li" style="margin-top:3mm">연결이 안 되면 <b>저장된 네트워크를 지우고 다시 연결</b>해 보세요.</div>' +
      '<div class="li">같은 교실 여러 명이 안 되면 담임 선생님께 바로 알립니다.</div>') : '';

    const pen = pfRows(p.penalty);
    s.penalty = pen.length ? secBox('y', '⚖️', '위반 시 조치 안내',
      '<table><tr><th>이런 경우</th><th>조치</th></tr>' +
      pen.map(r => '<tr><td class="n">' + esc(r[0] || '') + '</td><td>' + esc(r[1] || '') + '</td></tr>').join('') +
      '</table>') : '';

    const ex = String(p.extra || '').split('\n').map(x => x.trim()).filter(Boolean);
    s.extra = ex.length ? secBox('', '📝', '우리 학교 추가 안내',
      ex.map(x => '<div class="li">' + esc(x) + '</div>').join('')) : '';

    s.contact = (pfv(p, 'teacher') || pfv(p, 'tel') || pfv(p, 'report1') || pfv(p, 'siteUrl')) ?
      secBox('', '☎️', '문의처',
        kv(p, 'dept', '담당 부서') + kv(p, 'teacher', '담당 교사') +
        kv(p, 'tel', '연락처') + kv(p, 'report1', '방문 접수') +
        kv(p, 'tutorDay', '튜터 방문일') + kv(p, 'siteUrl', '안내 사이트')) : '';

    return s;
  }

  /* ---------------------------------------------------------
     한 장 요약 안내문 — AI 이미지 도구용 프롬프트
     문서에 들어가는 내용을 글자만 뽑아 그대로 넣는다.
     --------------------------------------------------------- */
  const eduStrip = s => String(s == null ? '' : s)
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  /* 안내문에 실을 항목을 [제목, [문장...]] 꼴로 모은다 */
  function eduOneGroups(p) {
    const g = [];
    const add = (t, arr) => {
      const v = (arr || []).map(eduStrip).filter(Boolean);
      if (v.length) g.push([t, v]);
    };
    const kvLine = (k, label) => { const v = pfv(p, k); return v ? label + ' : ' + v : ''; };

    add('꼭 지킬 것', EDU_FIX.important.concat([pfv(p, 'chargeRule')]));
    add('이용 및 보관', [
      kvLine('storage', '보관 장소'), kvLine('useIn', '교내 이용'),
      kvLine('useHome', '가정 반출'), kvLine('useVacation', '방학 중')
    ]);
    add('수업 중 약속', EDU_FIX.cls);
    add('디지털 윤리', EDU_FIX.ethics);
    add('빌려주지 않습니다', EDU_FIX.lend);
    add('파손 · 분실 책임', [
      kvLine('repairFee', '파손 시'), kvLine('lossRule', '분실 시'), kvLine('leaveRule', '전출·졸업 시'),
      kvLine('repairPay', '비용 납부·배송')
    ]);

    const pen = pfRows(p.penalty);
    if (pen.length) add('위반 시 조치', pen.map(r => (r[0] || '') + ' → ' + (r[1] || '')));

    const wifi = pfRows(p.wifi);
    if (wifi.length) {
      add('와이파이', wifi.map(r => (r[0] || '') + ' : ' + (r[1] || '') + ' / ' + (r[2] || '담임 안내')));
    } else if (pfv(p, 'wifiSsid')) {
      add('와이파이', [pfv(p, 'wifiSsid') + ' / ' + (pfv(p, 'wifiPw') || '담임 안내')]);
    }

    const ex = String(p.extra || '').split('\n').map(x => x.trim()).filter(Boolean);
    add('우리 학교 추가 안내', ex);

    add('문의처', [
      kvLine('dept', '담당 부서'), kvLine('teacher', '담당 교사'),
      kvLine('tel', '연락처'), kvLine('report1', '방문 접수')
    ]);
    return g;
  }

  function eduPrompt(mode, p) {
    const school = pfv(p, 'school') || '○○중학교';
    const dept = pfv(p, 'dept') || '담당 부서';
    const y = new Date().getFullYear();
    const title = school + ' 디벗 이용 및 관리 안내';
    const warn = '규칙을 지키지 않으면 교사의 지도를 받고, 학교 규정에 따라 벌점이 부과될 수 있습니다.';
    const groups = eduOneGroups(p);
    const body = groups.map(g => '[' + g[0] + ']\n' + g[1].map(v => '· ' + v).join('\n')).join('\n\n');
    const bodyEn = groups.map(g => 'SECTION "' + g[0] + '":\n' + g[1].map(v => '  - ' + v).join('\n')).join('\n\n');
    const n = groups.length;

    if (mode === 'flow') {
      return [
'A high-resolution Korean school information poster, A4 portrait (3:4 aspect ratio), print quality,',
'flat vector illustration style, clean and friendly, education-oriented.',
'Palette: deep blue (#0F6FB8) headings, warm amber (#FFC53D) accents, white background, generous margins.',
'',
'LAYOUT:',
'- Top: a blue header bar with a large bold Korean title, and the school year on the right.',
'- Below the header: a red-outlined warning box with one short Korean sentence.',
'- Body: ' + n + ' rounded rectangle section cards arranged in TWO EVEN COLUMNS.',
'  Each card has a colored title bar with a small flat icon, and short bullet lines underneath.',
'- Bottom: a thin footer line with the school name and department.',
'',
'ICONS: use simple flat icons matching each section — checklist, plug, classroom, globe, hands,',
'toolbox, scales, wifi signal, note, telephone. No photographic elements, no real logos.',
'',
'RENDER EXACTLY THIS KOREAN TEXT, spelled correctly, and add no other text:',
'TITLE: "' + title + '"',
'YEAR: "' + y + '학년도"',
'WARNING BOX: "' + warn + '"',
'',
bodyEn,
'',
'FOOTER: "' + school + ' ' + dept + '"',
'',
'NEGATIVE PROMPT: misspelled Korean, garbled or invented glyphs, extra invented sentences, English text,',
'watermark, photorealistic faces, cluttered background, text cropped or overflowing its card,',
'Korean words broken in the middle of a syllable, low contrast.'
      ].join('\n');
    }

    return [
'아래 내용으로 **A4 세로 인쇄용 「한 장 요약 안내문」 이미지**를 1장 만들어 줘.',
'',
'[디자인]',
'· 한국 중학교 교실 게시 · 가정통신문용, 깔끔한 플랫 벡터 스타일',
'· 색: 제목은 진한 파랑(#0F6FB8), 강조는 앰버(#FFC53D), 배경은 흰색, 여백 넉넉히',
'· 맨 위 파란 머리띠에 큰 제목, 오른쪽 끝에 학년도',
'· 그 아래 빨간 테두리 경고 상자 한 줄',
'· 본문은 둥근 모서리 카드 ' + n + '개를 **좌우 2단**으로 배치',
'· 카드마다 색 제목띠 + 작은 아이콘, 아래에 짧은 문장들',
'· 맨 아래 얇은 선과 함께 학교명 · 부서명',
'',
'[아이콘] 체크리스트 · 플러그 · 교실 · 지구본 · 두 손 · 공구함 · 저울 · 와이파이 · 메모 · 전화기 정도의 단순한 플랫 아이콘. 실제 브랜드 로고는 넣지 말 것.',
'',
'[반드시 그대로 넣을 글자 — 맞춤법을 고치거나 문장을 지어내지 말 것]',
'제목 : ' + title,
'학년도 : ' + y + '학년도',
'경고 상자 : ' + warn,
'',
body,
'',
'맨 아래 : ' + school + ' ' + dept,
'',
'[주의]',
'· 위에 적힌 글자 외에 **다른 글자를 절대 만들어 넣지 말 것**',
'· 영어 문구를 넣지 말 것',
'· 한국어 단어가 줄 중간에서 잘리지 않게 할 것',
'· 카드 안에서 글자가 넘치거나 잘리지 않게 배치할 것',
'· 멀리서도 읽히도록 글자를 충분히 크게'
    ].join('\n');
  }

  function eduDoc(kind, p) {
    const school = pfv(p, 'school') || '○○중학교';
    const dept = pfv(p, 'dept') || '';
    const s = eduSections(p);
    const y = new Date().getFullYear();
    let body = '';

    if (kind === 'lesson') {
      body += '<div class="page">' +
        '<div class="ph"><b>디벗 사용 교육 — 1차시(45분) 수업 구성안</b><i>' + esc(school) + '</i></div>' +
        '<table><tr><th style="width:16mm">시간</th><th style="width:30mm">단계</th><th>내용</th><th style="width:34mm">준비물</th></tr>' +
        LESSON.map(r => '<tr><td class="n">' + r[0] + '</td><td class="n">' + r[1] + '</td><td>' + r[2] +
          '</td><td>' + r[3] + '</td></tr>').join('') + '</table>' +
        '<div class="sec" style="margin-top:7mm"><h2><em>🗣️</em>진행 요령</h2><div class="sbody">' +
        '<div class="talk"><b>도입</b> — “오늘부터 여러분이 3년 동안 쓸 기기입니다. 잘 쓰는 법을 같이 익혀 봅시다.”</div>' +
        '<div class="talk"><b>기본 조작</b> — 교사가 한 단계씩 시범을 보이고, <b>전원이 따라 한 것을 눈으로 확인한 뒤</b> 다음으로 넘어갑니다.</div>' +
        '<div class="talk"><b>와이파이</b> — 이 단계에서 <b>전원 접속 완료</b>를 확인하지 않으면 이후 수업마다 시간을 뺏깁니다.</div>' +
        '<div class="talk"><b>파손·분실</b> — 자기부담금을 <b>돌려 말하지 말고 숫자로</b> 알려 주세요. 미리 알아야 조심합니다.</div>' +
        '<div class="talk"><b>정리</b> — “기기는 학교 물건이지만, 관리하는 사람은 여러분입니다.”</div>' +
        '</div></div>' +
        (s.wifi || '') +
        '<div class="note"><b>차시 종료 전 반드시 확인:</b> ① 전원 로그인 완료 ② 전원 와이파이 접속 완료 ' +
        '③ 충전함에 각자 자리 확인 ④ 고장·분실 신고 방법 인지' + '</div>' +
        eduFoot(p, '교사용 수업 구성안') +
      '</div>';
      return docShell(school + ' 디벗 사용 교육 수업 구성안', EDU_CSS, body);
    }

    if (kind === 'one') {
      body += '<div class="page flow">' +
        '<div class="ph"><b>' + esc(school) + ' 디벗 이용 및 관리 안내</b><i>' + y + '학년도</i></div>' +
        '<div class="warnbox"><b>⚖️ 규칙을 지키지 않으면 지도와 벌점이 따릅니다</b>' +
        '<p>디벗을 교육 목적 외로 쓰거나 아래 약속을 지키지 않으면 <b>교사의 지도를 받고, 학교 규정에 따라 벌점이 부과</b>될 수 있습니다. ' +
        '반복되면 <b>사용 제한이나 선도위원회 회부</b>까지 이어질 수 있으니, 아래 내용을 꼭 확인해 두세요.</p></div>' +
        '<div class="two">' +
          (s.important || '') + (s.use || '') + (s.cls || '') + (s.ethics || '') +
          (s.risk || '') + (s.penalty || '') + (s.wifi || '') + (s.lend || '') +
          (s.extra || '') + (s.contact || '') +
        '</div>' +
        '<div class="note"><b>꼭 기억하세요.</b> 디벗은 학교 물건이지만 관리하는 사람은 여러분입니다. ' +
        '고장이나 분실은 <b>숨기지 말고 바로 알리는 것</b>이 가장 빠른 해결 방법입니다.</div>' +
        eduFoot(p, '교실 게시용 · 가정통신문') +
      '</div>';
      return docShell(school + ' 디벗 이용 및 관리 안내', EDU_CSS, body);
    }

    // book — 여러 쪽 학생용 안내 자료
    body += '<div class="page cover">' +
      '<div class="cs">' + y + '학년도 학생용 스마트기기</div>' +
      '<div class="ct">디벗 <em>이용 및 관리</em><br>안내서</div>' +
      '<div class="cl"></div>' +
      '<div class="cd">이 안내서는 디벗을 처음 받는 날 함께 읽습니다.<br>' +
      '읽고 나서 집에 가져가 보호자와 한 번 더 확인해 주세요.</div>' +
      '<div class="cf">' + esc(school) + '<small>' + esc(dept) + '</small></div>' +
    '</div>';

    body += '<div class="page">' +
      '<div class="ph"><b>디벗은 어떤 기기인가요</b><i>1</i></div>' +
      (s.meaning || '') + (s.device || '') + (s.parts || '') +
      eduFoot(p, '학생용 안내서') +
    '</div>';

    body += '<div class="page">' +
      '<div class="ph"><b>이렇게 쓰고, 이렇게 보관합니다</b><i>2</i></div>' +
      (s.important || '') + (s.use || '') +
      '<div class="note"><b>충전함 약속</b> — 정해진 내 번호 칸에 넣고, <b>시스템을 종료한 뒤</b> 충전선을 연결합니다. ' +
      '다른 사람 자리에 넣으면 다음 날 기기가 바뀝니다.</div>' +
      eduFoot(p, '학생용 안내서') +
    '</div>';

    body += '<div class="page">' +
      '<div class="ph"><b>고장나거나 잃어버렸을 때</b><i>3</i></div>' +
      (s.lend || '') + (s.risk || '') +
      '<div class="note"><b>가장 중요한 것</b> — 고장이나 분실을 <b>숨기지 마세요.</b> ' +
      '늦게 알릴수록 원인 확인이 어려워지고, 수리 기간도 길어집니다.</div>' +
      eduFoot(p, '학생용 안내서') +
    '</div>';

    body += '<div class="page">' +
      '<div class="ph"><b>수업에서 지킬 것</b><i>4</i></div>' +
      '<div class="warnbox"><b>⚖️ 지키지 않으면 지도와 벌점이 따릅니다</b>' +
      '<p>디벗을 교육 목적 외로 사용하거나 아래 약속을 어기면 <b>교사의 지도를 받고, 학교 규정에 따라 벌점이 부과</b>될 수 있습니다. ' +
      '반복되면 <b>사용 제한이나 선도위원회 회부</b>로 이어질 수 있습니다.</p></div>' +
      (s.cls || '') + (s.ethics || '') + (s.penalty || '') +
      eduFoot(p, '학생용 안내서') +
    '</div>';

    body += '<div class="page">' +
      '<div class="ph"><b>연결하고 익혀 두기</b><i>5</i></div>' +
      (s.wifi || '') + (s.tips || '') + (s.extra || '') + (s.contact || '') +
      eduFoot(p, '학생용 안내서') +
    '</div>';

    return docShell(school + ' 디벗 이용 및 관리 안내서', EDU_CSS, body);
  }

  function eduRender(kind, mode) {
    const out = $('#eduOut');
    if (!out) return;
    const p = pfGet();
    /* 이미지 프롬프트는 「한 장 요약」에만 해당한다 */
    if (kind !== 'one') mode = 'doc';
    mode = mode || 'doc';

    $$('#eduGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      const v = key === 'out' ? mode : kind;
      $$('button', seg).forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-v') === v));
    });
    const outRow = $('#eduOutRow');
    if (outRow) outRow.hidden = (kind !== 'one');

    // 비어 있는 항목 안내
    const want = [
      ['device', '기기 종류'], ['period', '사용 기간'], ['account', '계정 지원'],
      ['storage', '보관 장소'], ['useHome', '가정 반출'], ['repairFee', '파손 시 부담'],
      ['lossRule', '분실 시 부담'], ['wifi', '와이파이'], ['penalty', '벌점 내규']
    ];
    /* 와이파이는 구역별 목록이든 학교 공용 SSID든 하나만 있으면 채워진 것으로 본다 */
    const filled = k => k === 'wifi' ? !!(pfv(p, 'wifi') || pfv(p, 'wifiSsid')) : !!pfv(p, k);
    const miss = want.filter(w => !filled(w[0])).map(w => w[1]);
    const mbox = $('#eduMissing');
    if (mbox) {
      mbox.innerHTML = miss.length
        ? '<div class="note warn"><span class="n-em">✍️</span><div class="n-wrap">' +
          '<b class="n-t">아직 비어 있는 항목 ' + miss.length + '개</b><div class="n-b">' +
          esc(miss.join(' · ')) + ' — <a href="#/setup"><b>학교 기본 정보</b></a>에서 채우면 자료에 함께 들어갑니다. ' +
          '비워 두면 해당 부분은 자료에서 빠집니다.</div></div></div>'
        : '<div class="note tip"><span class="n-em">✅</span><div class="n-wrap">' +
          '<b class="n-t">필요한 항목이 모두 채워졌습니다</b>' +
          '<div class="n-b">바로 인쇄해서 쓰실 수 있습니다.</div></div></div>';
    }

    ED.kind = kind;
    ED.mode = mode;

    /* ChatGPT · Google Flow 이미지 프롬프트 */
    if (mode === 'gpt' || mode === 'flow') {
      const pr = eduPrompt(mode, p);
      ED.prompt = pr;
      const groups = eduOneGroups(p);
      out.innerHTML =
        '<div class="rg-outhead"><b>' + (mode === 'gpt' ? 'ChatGPT' : 'Google Flow') + '용 프롬프트</b>' +
          '<span>A4 세로 · 한 장 요약 안내문 · 항목 ' + groups.length + '개</span></div>' +
        '<div class="rg-actions">' +
          '<button type="button" class="rg-btn" id="eduCopy">📋 프롬프트 복사</button>' +
          '<a class="rg-btn ghost" href="#/setup">⚙️ 학교 정보 수정</a>' +
        '</div>' +
        '<textarea class="rg-prompt" id="eduPromptBox" rows="20" readonly spellcheck="false"></textarea>' +
        '<div class="note tip"><span class="n-em">🔤</span><div class="n-wrap">' +
          '<b class="n-t">생성 후 반드시 글자를 확인하세요</b><div class="n-b">' +
          'AI 이미지 도구는 <b>한글을 자주 틀리게 씁니다.</b> 프롬프트에 우리 학교 내용을 그대로 넣어 두었으니, ' +
          '나온 이미지의 <b>글자를 하나씩 대조</b>하세요. 오탈자가 반복되면 ' +
          '<a href="#/setup">학교 기본 정보</a>에서 항목을 줄이거나 <b>인쇄물로 만들기</b>를 쓰세요. ' +
          '<b>가정통신문처럼 글자가 정확해야 하는 문서는 인쇄물 쪽이 안전합니다.</b>' +
          '</div></div></div>' +
        '<div class="note info"><span class="n-em">🎬</span><div class="n-wrap">' +
          '<b class="n-t">' + (mode === 'gpt' ? 'ChatGPT에서 쓰는 법' : 'Google Flow에서 쓰는 법') + '</b><div class="n-b">' +
          (mode === 'gpt'
            ? '<b>ChatGPT</b>(또는 Gemini) 대화창에 붙여넣고 이미지를 만들어 달라고 하면 됩니다. ' +
              '결과가 마음에 들지 않으면 <b>“카드를 2단이 아니라 3단으로”</b>처럼 이어서 고쳐 달라고 하세요.'
            : '<b>Google Flow</b>의 이미지 생성 칸에 붙여넣으세요. 마지막 <b>NEGATIVE PROMPT</b> 줄은 ' +
              '부정 프롬프트 칸이 따로 있으면 그쪽에 옮겨 넣는 편이 결과가 좋습니다.') +
          '</div></div></div>';
      $('#eduPromptBox').value = pr;
      return;
    }

    const doc = eduDoc(kind, p);
    ED.doc = doc;
    const label = kind === 'lesson' ? '교사용 45분 구성안' : (kind === 'one' ? '한 장 요약 안내문' : '학생용 안내 자료');
    out.innerHTML =
      '<div class="rg-outhead"><b>미리보기</b><span>A4 세로 · ' + label + ' · ' +
        esc(pfv(p, 'school') || '학교 이름 미입력') + '</span></div>' +
      '<div class="rg-actions">' +
        '<button type="button" class="rg-btn" id="eduPrint">🖨️ 인쇄 · PDF로 저장</button>' +
        '<button type="button" class="rg-btn word" id="eduDocx">📝 워드(.docx) 내려받기</button>' +
        '<button type="button" class="rg-btn hwp" id="eduHwpx">🅷 한글(.hwpx) 내려받기</button>' +
        '<button type="button" class="rg-btn ghost" id="eduDl">⬇️ HTML 파일로 내려받기</button>' +
        '<a class="rg-btn ghost" href="#/setup">⚙️ 학교 정보 수정</a>' +
      '</div>' +
      '<div class="note info"><span class="n-em">💾</span><div class="n-wrap">' +
        '<b class="n-t">어떤 형식으로 받을까요</b><div class="n-b">' +
        '<b>PDF</b>는 인쇄 창에서 대상을 “PDF로 저장”으로 바꿔 저장하면 화면 그대로 나옵니다. ' +
        '<b>워드(.docx)</b>는 맑은 고딕으로 열리며 <b>내용을 직접 고칠 수 있어</b> 학교 상황에 맞게 다듬을 때 좋습니다.' +
        '</div></div></div>' +
      '<div class="rg-frame"><iframe id="eduFrame" title="안내 자료 미리보기"></iframe></div>';
    const f = $('#eduFrame');
    f.setAttribute('srcdoc', doc);
    f.addEventListener('load', () => fitFrame('eduFrame', 794, 1123), { once: true });
    setTimeout(() => fitFrame('eduFrame', 794, 1123), 60);
    ED.kind = kind;
  }

  function eduInit() {
    const wrap = $('#eduGen');
    if (!wrap) return;

    /* 예전에는 종류 하나만 저장했다 — 그 값도 그대로 읽어 준다 */
    let kind = 'book', mode = 'doc';
    try {
      const raw = lsGet(EDU_KEY) || '';
      if (raw.charAt(0) === '{') {
        const o = JSON.parse(raw);
        kind = o.kind || 'book';
        mode = o.mode || 'doc';
      } else if (raw) { kind = raw; }
    } catch (e) {}
    const save = () => {
      lsSet(EDU_KEY, JSON.stringify({ kind: kind, mode: mode }));
    };

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        const key = seg.parentNode.getAttribute('data-seg');
        if (key === 'out') { mode = seg.getAttribute('data-v'); }
        else { kind = seg.getAttribute('data-v'); if (kind !== 'one') mode = 'doc'; }
        save();
        eduRender(kind, mode);
        return;
      }
      if (e.target.closest('#eduCopy')) {
        copyText(ED.prompt || eduPrompt(ED.mode, pfGet()), e.target.closest('#eduCopy'));
        return;
      }
      if (e.target.closest('#eduPrint')) { printFrame('eduFrame'); return; }
      if (e.target.closest('#eduDocx')) {
        const pf = pfGet();
        const nm = { book: '안내서', one: '안내문', lesson: '수업구성안' }[ED.kind] || '안내서';
        downloadDocx((pfv(pf, 'school') || '학교') + '_디벗_' + nm + '.docx',
                     ED.doc || eduDoc(ED.kind, pf), false);
        return;
      }
      if (e.target.closest('#eduHwpx')) {
        const pf = pfGet();
        const nm = { book: '안내서', one: '안내문', lesson: '수업구성안' }[ED.kind] || '안내서';
        downloadHwpx((pfv(pf, 'school') || '학교') + '_디벗_' + nm + '.hwpx',
                     ED.doc || eduDoc(ED.kind, pf));
        return;
      }
      if (e.target.closest('#eduDl')) {
        const p = pfGet();
        const nm = { book: '안내서', one: '안내문', lesson: '수업구성안' }[ED.kind] || '안내서';
        downloadDoc((pfv(p, 'school') || '학교') + '_디벗_' + nm + '.html', ED.doc || eduDoc(ED.kind, p));
        return;
      }
    });

    eduRender(kind, mode);
    window.addEventListener('resize', () => fitFrame('eduFrame', 794, 1123));
  }

  /* 「학교 기본 정보」에서 쓰는 엑셀 양식 — 각 페이지 생성기와 같은 것을 쓴다 */
  const PF_XLSX = {
    wifi: { file: WIFI_XL.file, sheets: wifiTplSheets, read: wifiReadFile }
  };

  /* ---------- 학교 기본 정보 화면 ---------- */
  function pfInit() {
    const wrap = $('#profBox');
    if (!wrap) return;
    const p = pfGet();
    $$('[data-p]', wrap).forEach(el => { el.value = p[el.getAttribute('data-p')] || ''; });

    /* 선택 버튼 상태와, 그에 따라 보여줄 입력칸 */
    const syncSeg = () => {
      const cur = pfGet();
      $$('.rg-seg[data-pseg]', wrap).forEach(seg => {
        const k = seg.getAttribute('data-pseg');
        const v = cur[k] || (($('button', seg) || {}).getAttribute ? $('button', seg).getAttribute('data-v') : '');
        $$('button', seg).forEach(b => b.classList.toggle('on', b.getAttribute('data-v') === v));
        wrap.setAttribute('data-' + k.toLowerCase(), v);
      });
    };
    syncSeg();

    const flash = () => {
      const s = $('#pfSaved');
      if (!s) return;
      s.textContent = '저장했습니다';
      s.classList.add('hit');
      clearTimeout(ED.pfT);
      ED.pfT = setTimeout(() => { s.textContent = '자동 저장됨'; s.classList.remove('hit'); }, 1400);
    };

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-p]');
      if (!el) return;
      const patch = {};
      patch[el.getAttribute('data-p')] = el.value;
      pfSet(patch);
      flash();
    });

    wrap.addEventListener('click', e => {
      const segBtn = e.target.closest('.rg-seg[data-pseg] button');
      if (segBtn) {
        const patch = {};
        patch[segBtn.parentNode.getAttribute('data-pseg')] = segBtn.getAttribute('data-v');
        pfSet(patch);
        syncSeg();
        flash();
        return;
      }
      /* 엑셀 양식 내려받기 */
      const tpl = e.target.closest('[data-xltpl]');
      if (tpl) {
        const spec = PF_XLSX[tpl.getAttribute('data-xltpl')];
        if (spec) downloadXlsx(spec.file, spec.sheets());
        return;
      }
      if (e.target.closest('#pfDl')) {
        const d = new Date();
        const stamp = d.getFullYear() + '-' +
                      String(d.getMonth() + 1).padStart(2, '0') + '-' +
                      String(d.getDate()).padStart(2, '0');
        downloadDoc('디벗_업무도우미_백업_' + stamp + '.json',
                    JSON.stringify(bkDump(), null, 2));
        return;
      }
      if (e.target.closest('#pfUpBtn')) { $('#pfUp', wrap).click(); return; }
      if (e.target.closest('#pfClear')) {
        if (!window.confirm('입력한 학교 정보를 모두 지울까요? 되돌릴 수 없습니다.')) return;
        lsDel(PF_KEY);
        route();
        return;
      }
    });

    /* 엑셀 · CSV 올려서 목록 칸 채우기 */
    $$('[data-xlfile]', wrap).forEach(inp => {
      const k = inp.getAttribute('data-xlfile');
      const spec = PF_XLSX[k];
      if (!spec) return;
      inp.addEventListener('change', e => {
        const msg = $('[data-xlmsg="' + k + '"]', wrap);
        const say = (txt, cls) => { if (msg) { msg.innerHTML = txt; msg.className = 'wf-xl-msg ' + (cls || ''); } };
        spec.read(e.target.files && e.target.files[0], say, lines => {
          const patch = {};
          patch[k] = lines.join('\n');
          pfSet(patch);
          const ta = $('[data-p="' + k + '"]', wrap);
          if (ta) ta.value = patch[k];
          flash();
        });
        e.target.value = '';
      });
    });

    const up = $('#pfUp', wrap);
    if (up) {
      up.addEventListener('change', () => {
        const file = up.files && up.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const n = bkRestore(JSON.parse(r.result));
            if (n) {
              CHECKS = loadChecks();      // 체크리스트도 백업에 들어 있다
              route();
              window.alert('백업을 되살렸습니다. (' + n + '개 항목)');
            } else {
              window.alert('백업 파일 형식이 올바르지 않습니다.');
            }
          } catch (e2) { window.alert('백업 파일을 읽지 못했습니다.'); }
        };
        r.readAsText(file);
      });
    }
  }

  /* =========================================================
     ④ 에듀테크 소프트웨어 학교운영위원회 자료 생성기
     ========================================================= */
  const SW_KEY = 'debut.swgen';
  const SW_FIELDS = ['year', 'planDate', 'meetDate', 'proposer', 'basis', 'edzipDate', 'swList', 'steps'];

  /* 필수기준 5개 기준 9개 항목 */
  const SW_MUST = [
    ['① 최소처리원칙 준수', '개인정보가 최소한으로 수집되는가?'],
    ['', '개인정보 수집·이용 목적이 기재되어 있는가?'],
    ['', '개인정보 수집항목, 보유기간 등이 기재되어 있는가?'],
    ['② 개인정보 안전조치 의무', '개인정보 안전성 확보에 필요한 조치 사항이 기재되어 있는가?'],
    ['③ 열람/정정/삭제/처리정지 절차', '이용자에게 언제든지 자신의 정보를 열람·정정·삭제·처리정지를 요구할 수 있는 절차가 안내되어 있는가?'],
    ['④ 만 14세 미만 아동의 개인정보 보호', '만 14세 미만 아동의 경우 법정대리인 동의 등 아동의 개인정보 보호를 위한 절차가 마련되어 있는가?'],
    ['⑤ 보호책임자/제3자 제공/위탁 등', '개인정보 보호책임자 관련 정보가 안내되어 있는가?'],
    ['', '개인정보 제3자 제공에 관한 정보가 기재되어 있는가? (필요시)'],
    ['', '개인정보 위·수탁 정보가 기재되어 있는가? (필요시)']
  ];
  /* 선택기준 5개 */
  const SW_OPT = [
    ['① 교육목표 및 학생 특성 적합성', '수업 목표와 학생의 학습 수준에 적합한 내용과 기능을 제공하는가?'],
    ['② 콘텐츠 품질 및 안전성', '학습 콘텐츠가 정확하고 신뢰할 수 있으며, 학생 연령에 적합·안전한가?'],
    ['③ 사용 환경 적합성', '학교의 기기·네트워크 환경에서 모든 학생이 안정적으로 사용할 수 있는가?'],
    ['④ 접근성 및 사용성', '교사와 학생이 필요한 기능과 자료에 쉽게 접근하고 활용할 수 있는가?'],
    ['⑤ 서비스 운영 및 지원 체계', '이용 안내, 기술 지원, 문의 대응 등 서비스 지원 체계를 갖추고 있는가?']
  ];

  function swLoad() {
    const d = SW.defaults || {};
    let st = { kind: 'plan' };
    SW_FIELDS.forEach(k => {
      st[k] = k === 'swList' || k === 'steps'
        ? (d[k] || []).join('\n') : (d[k] || '');
    });
    try {
      const saved = JSON.parse(lsGet(SW_KEY) || 'null');
      if (saved) st = Object.assign(st, saved);
    } catch (e) {}
    return st;
  }
  function swSave(st) { lsSet(SW_KEY, JSON.stringify(st)); }
  const SW = {};

  /* ---------------------------------------------------------
     에듀테크 이름 사전
     제품명만 적었을 때 「관련 교과」와 「활용 목적」을 채워 준다.
     [대표 이름, 관련 교과, 활용 목적, 별칭...]
     여기 없는 제품은 '전 교과'로 잡히니 필요하면 직접 고쳐 쓰면 된다.
     --------------------------------------------------------- */
  const SW_KB_RAW = [
    /* 종합 교수학습 플랫폼(LMS) */
    ['웨일 스페이스', '전 교과', '종합 교수학습 지원 플랫폼(LMS)', '웨일스페이스', 'whalespace', '웨일'],
    ['구글 클래스룸', '전 교과', '종합 교수학습 지원 플랫폼(LMS)', 'google classroom', 'classroom', '클래스룸'],
    ['구글 워크스페이스', '전 교과', '문서·협업 및 학습 관리 플랫폼', 'google workspace', 'workspace', '구글워크스페이스'],
    ['MS 팀즈', '전 교과', '수업·과제·협업 통합 플랫폼', 'teams', 'microsoft teams', '팀즈', 'ms365', 'microsoft 365', '마이크로소프트 365'],
    ['클래스팅', '전 교과', '학급 소통 및 학습 관리 플랫폼', 'classting'],
    ['하이클래스', '전 교과', '학급 소통 및 알림 플랫폼', 'hiclass'],
    ['e학습터', '전 교과', '학습 콘텐츠 제공 및 학습 관리', 'e학습터', '이학습터'],
    ['EBS 온라인클래스', '전 교과', '학습 콘텐츠 제공 및 학습 관리', '온라인클래스', 'ebs온라인클래스'],
    ['하이러닝', '전 교과', '교수학습 지원 플랫폼', 'hi-learning'],
    ['위두랑', '전 교과', '수업 활동 공유 및 학습 관리', 'wedorang'],
    ['에듀넷', '전 교과', '수업 자료 및 디지털 교과서 제공', '에듀넷 티클리어', '에듀넷티클리어', 'edunet'],
    ['비바샘', '전 교과', '교과 수업 자료 제공', 'vivasam'],
    ['T셀파', '전 교과', '교과 수업 자료 제공', 't셀파', '티셀파', '천재교육 t셀파'],
    ['티솔루션', '전 교과', '교과 수업 자료 제공'],
    ['두클래스', '전 교과', '교과 수업 자료 제공', 'doclass'],
    ['미래엔 엠티처', '전 교과', '교과 수업 자료 제공', '엠티처', 'm티처', 'mteacher'],
    ['메가클래스', '전 교과', '교과 수업 자료 제공'],
    ['나이스플러스', '전 교과', '교수학습 지원 서비스', 'neis플러스'],

    /* 서울시교육청 */
    ['SEN스쿨', '전 교과', '서울시교육청 교수학습 플랫폼', '센스쿨', 'sen스쿨', 'senschool'],
    ['서울 수학 ON 스페이스', '수학', '서울시교육청 수학 학습 지원', '수학on', '수학온', '서울수학on스페이스'],
    ['서울학생미래역량진단시스템', '전 교과', '학생 역량 진단 및 결과 활용', '채움ai', '채움에이아이'],
    ['서울런', '전 교과', '학습 콘텐츠 제공', 'seoullearn'],
    ['senedu.kr', '전 교과', 'AI 맞춤형 교수학습 플랫폼', 'senedu', '세네듀', 'aiep'],

    /* 제작·표현 도구 */
    ['캔바', '전 교과', '시각 자료 및 발표 자료 제작', 'canva'],
    ['미리캔버스', '전 교과', '시각 자료 및 발표 자료 제작', 'miricanvas'],
    ['북크리에이터', '전 교과', '전자책 형태의 학습 결과물 제작', 'book creator', 'bookcreator'],
    ['투닝', '전 교과', '웹툰 형식의 학습 결과물 제작', 'tooning'],
    ['브루', '전 교과', '영상 편집 및 자막 제작', 'vrew'],
    ['Goodnotes', '전 교과', '필기 및 학습 자료 정리', '굿노트', 'goodnote'],
    ['카미', '전 교과', '학습지 배포 및 주석 활동', 'kami'],
    ['망고보드', '전 교과', '시각 자료 제작', 'mangoboard'],
    ['크롬 뮤직랩', '음악', '소리·리듬 탐구 활동', 'chrome music lab', '뮤직랩', 'song maker', '송메이커'],

    /* 참여·형성평가 */
    ['패들렛', '전 교과', '수업 참여 및 학습 결과물 공유', 'padlet', 'padlet for schools'],
    ['띵커벨', '전 교과', '수업 참여 및 형성평가', 'thinkerbell'],
    ['퀴즈앤', '전 교과', '수업 참여 및 형성평가', 'quizn'],
    ['클래스카드', '영어', '어휘 학습 및 형성평가', 'classcard'],
    ['카훗', '전 교과', '수업 참여 및 형성평가', 'kahoot'],
    ['웨이그라운드', '전 교과', '수업 참여 및 형성평가', 'wayground'],
    ['멘티미터', '전 교과', '실시간 의견 수렴 및 수업 참여', 'mentimeter'],
    ['슬라이도', '전 교과', '실시간 질의응답 및 수업 참여', 'slido'],
    ['미로', '전 교과', '협업 보드를 활용한 모둠 활동', 'miro'],
    ['젭', '전 교과', '가상 공간을 활용한 수업 활동', 'zep'],

    /* 수학 */
    ['똑똑! 수학탐험대', '수학', '개별 맞춤형 수학 학습 및 진단', '똑똑수학탐험대', '수학탐험대'],
    ['알지오매스', '수학', '수학 개념 탐구 및 시각화', 'algeomath'],
    ['애스크매스', '수학', '개별 맞춤형 수학 학습 및 진단', 'askmath'],
    ['수학대왕', '수학', '개별 맞춤형 수학 학습 및 진단', '수학대왕class', '수학대왕클래스'],
    ['매쓰홀릭', '수학', '개별 맞춤형 수학 학습 및 진단', '매쓰홀릭t', 'mathholic'],
    ['지오지브라', '수학', '수학 개념 탐구 및 시각화', 'geogebra'],
    ['칸아카데미', '전 교과', '개별 맞춤형 학습 콘텐츠 제공', 'khan academy', 'khanacademy', '칸 아카데미'],

    /* 영어 */
    ['AI 펭톡', '영어', '영어 말하기 연습 및 진단', 'ai펭톡', '펭톡'],
    ['EBS AI 단추', '전 교과', '개별 맞춤형 학습 진단 및 문항 추천', 'ai단추', '단추플러스', 'ebs ai 단추플러스'],
    ['스마트리영어', '영어', '영어 읽기·듣기 학습', '스마트리'],
    ['리딩게이트', '영어', '영어 원서 읽기 학습', 'readinggate'],
    ['듀오링고', '영어', '어휘·문장 반복 학습', 'duolingo'],

    /* 국어·독서 */
    ['책열매', '국어', '읽기 능력 진단 및 어휘 학습'],
    ['독서로', '국어', '독서 활동 기록 및 관리'],
    ['리딩오션', '국어', '독서 활동 및 읽기 학습', 'readingocean'],
    ['매일국어', '국어', '국어 어휘·문법 반복 학습'],
    ['한글 또박또박', '국어', '한글 해득 수준 진단', '한글또박또박'],

    /* 정보·SW */
    ['엔트리', '정보', '블록 코딩을 활용한 프로그래밍 학습', 'entry', 'playentry'],
    ['스크래치', '정보', '블록 코딩을 활용한 프로그래밍 학습', 'scratch'],
    ['알버트 AI', '정보', '로봇을 활용한 코딩 학습', '알버트ai', 'albert'],
    ['코들', '정보', '프로그래밍 학습 및 실습 환경', 'codle', '코들 ai 클래스룸'],
    ['로보이드', '정보', '로봇을 활용한 코딩 학습', 'roboid'],
    ['마이크로비트', '정보', '피지컬 컴퓨팅 실습', 'micro:bit', 'microbit'],
    ['햄스터 로봇', '정보', '로봇을 활용한 코딩 학습', '햄스터로봇', 'hamster'],

    /* 디지털교과서·AI 코스웨어 */
    ['AI·디지털 교육자료 포털', '전 교과', '교육부 통합 관리 디지털 교육자료', 'ai디지털교육자료포털', '교육자료포털'],
    ['디지털교과서', '전 교과', '교과 학습을 위한 디지털 교과서', '디지털 교과서', 'webdt'],
    ['클래스팅 AI', '전 교과', 'AI 기반 개별 맞춤 학습', '클래스팅ai'],

    /* 그 밖 */
    ['도란도란', '전 교과', '사이버폭력 예방 교육'],
    ['열린배움터', '전 교과', '특수교육 AI·디지털 교육자료', '특수교육 ai·디지털 교육자료'],
    ['사이언스올', '과학', '과학 학습 자료 및 콘텐츠 제공', 'scienceall'],
    ['패들렛 백채널', '전 교과', '수업 참여 및 학습 결과물 공유', 'backchannel']
  ];

  /* 이름 비교용 정규화 — 공백·괄호·기호·대소문자를 무시한다 */
  const swNorm = s => String(s || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\s·・~!?.,'’"“”\/\-_+&:;]/g, '')
    .trim();

  const SW_KB = (() => {
    const m = new Map();
    SW_KB_RAW.forEach(row => {
      const entry = { name: row[0], sub: row[1], pur: row[2] };
      [row[0]].concat(row.slice(3)).forEach(alias => {
        const k = swNorm(alias);
        if (k && !m.has(k)) m.set(k, entry);
      });
    });
    return m;
  })();

  /* 이름 하나를 사전에서 찾는다. 정확히 없으면 포함 관계로 한 번 더 본다. */
  function swMatch(name) {
    const k = swNorm(name);
    if (!k) return null;
    if (SW_KB.has(k)) return SW_KB.get(k);
    let hit = null;
    SW_KB.forEach((v, key) => {
      if (hit || key.length < 3) return;
      if (k.indexOf(key) >= 0 || key.indexOf(k) >= 0) hit = v;
    });
    return hit;
  }

  /* 소프트웨어 목록 파싱 — "이름" 또는 "이름 | 교과 | 활용 목적"
     교과·목적을 비워 두면 이름 사전에서 채운다. */
  /* 이름 목록을 학운위 「소프트웨어 목록」에 넣는다.
     replace 가 참이면 적혀 있던 줄을 지우고 새로 채운다(에듀집 목록 넣기).
     거짓이면 있던 줄은 그대로 두고 없는 이름만 뒤에 붙인다(자주 쓰는 제품 단추).
     돌려주는 값은 실제로 들어간 줄 수, -1 이면 이 페이지에 학운위 생성기가 없다는 뜻. */
  function swPutNames(names, replace) {
    const st = SW.st;
    if (!st) return -1;
    const wrap = $('#swGen');
    const cur = replace ? '' : (st.swList || '').replace(/\s+$/, '');
    const have = {};
    cur.split('\n').forEach(l => {
      const k = swNorm((l.split('|')[0] || ''));
      if (k) have[k] = 1;
    });
    const add = [];
    (names || []).forEach(n => {
      const nm = String(n || '').trim();
      const k = swNorm(nm);
      if (!k || have[k]) return;              // 같은 이름이 두 번 들어가지 않게
      have[k] = 1;
      add.push(nm);
    });
    if (!add.length && !replace) return 0;
    st.swList = cur ? cur + '\n' + add.join('\n') : add.join('\n');
    const ta = wrap && $('[data-s="swList"]', wrap);
    if (ta) { ta.value = st.swList; ta.scrollTop = 0; }
    swSave(st);
    swRender(st);
    return add.length;
  }

  function swItems(st) {
    return pfRows(st.swList).map(r => {
      const name = (r[0] || '').trim();
      if (!name) return null;

      const names = name.split(',').map(s => s.trim()).filter(Boolean);
      const hits = names.map(swMatch).filter(Boolean);

      let subject = (r[1] || '').trim();
      let purpose = (r[2] || '').trim();
      const autoSub = !subject, autoPur = !purpose;

      if (autoSub) {
        const subs = [];
        hits.forEach(h => { if (subs.indexOf(h.sub) < 0) subs.push(h.sub); });
        subject = subs.length === 1 ? subs[0] : '전 교과';
      }
      if (autoPur) {
        const purs = [];
        hits.forEach(h => { if (purs.indexOf(h.pur) < 0) purs.push(h.pur); });
        purpose = purs.length ? purs.slice(0, 2).join(' · ') : '교육과정 운영을 위한 학습활동 지원';
      }

      return {
        name: name, subject: subject, purpose: purpose,
        autoSub: autoSub, autoPur: autoPur,
        known: hits.length, total: names.length
      };
    }).filter(Boolean);
  }

  /* 빠른 추가 버튼 — 자주 올라오는 제품을 교과별로 묶어 둔다 */
  const SW_QUICK = [
    ['전 교과', ['패들렛', '띵커벨', '퀴즈앤', '캔바', '미리캔버스', '북크리에이터', '구글 클래스룸', 'MS 팀즈', '웨일 스페이스', '클래스팅']],
    ['교과별', ['똑똑! 수학탐험대', '알지오매스', '매쓰홀릭', 'AI 펭톡', '클래스카드', '책열매', '독서로', '엔트리', '스크래치', '사이언스올']],
    ['서울 · 교육부', ['SEN스쿨', '서울 수학 ON 스페이스', '에듀넷', '디지털교과서', 'AI·디지털 교육자료 포털', '위두랑', '열린배움터']]
  ];

  const SW_CSS = EDU_CSS + `
.doc-h{text-align:center;font-family:'Gothic A1',sans-serif;font-weight:800;font-size:7mm;
 letter-spacing:-.02em;line-height:1.35;margin-bottom:3mm}
.doc-sub{text-align:center;font-size:4.4mm;font-weight:700;margin-bottom:8mm}
.meta{text-align:right;font-size:3.8mm;line-height:1.7;margin-bottom:7mm}
.h1n{display:flex;align-items:center;gap:3mm;margin:6mm 0 3mm}
.h1n em{font-style:normal;background:#1B2430;color:#fff;font-weight:800;font-size:4mm;
 width:8mm;height:8mm;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.h1n b{font-family:'Gothic A1',sans-serif;font-weight:800;font-size:5.2mm}
.h2n{font-family:'Gothic A1',sans-serif;font-weight:700;font-size:4.4mm;margin:5mm 0 2mm}
.dot{position:relative;padding-left:5.5mm;margin-bottom:1.8mm;font-size:3.9mm;line-height:1.55}
.dot::before{content:"◦";position:absolute;left:1mm;top:0}
.dash{position:relative;padding-left:5.5mm;margin-bottom:1.5mm;font-size:3.7mm;line-height:1.5;color:#333}
.dash::before{content:"-";position:absolute;left:2mm;top:0}
/* 서명란 — 손으로 적을 높이와 너비를 남긴다 */
.signs{display:flex;flex-direction:column;gap:9mm;font-size:4mm}
.srow{display:flex;align-items:flex-end;gap:2mm;flex-wrap:wrap}
.srow em{font-style:normal;font-size:3.4mm;color:#555;white-space:nowrap}
.ln{display:inline-block;border-bottom:.35mm solid #000;height:8mm;vertical-align:-2.4mm}
.w1{width:15mm}.w3{width:42mm}
`;

  function swPlanDoc(st, p) {
    const school = pfv(p, 'school') || '○○학교';
    const dept = pfv(p, 'dept') || '담당 부서';
    const steps = pfRows(st.steps);
    const items = swItems(st);

    let body = '<div class="page">' +
      '<div class="doc-h">' + esc(st.year) + '학년도 학습지원 소프트웨어<br>교육자료 선정 계획(안)</div>' +
      '<div class="doc-sub">' + esc(school) + '</div>' +

      '<div class="h1n"><em>Ⅰ</em><b>추진 근거</b></div>' +
      '<div class="dot">「초·중등교육법」 제29조의2 (2025. 8. 14. 신설 / 2026. 3. 1. 시행)</div>' +
      '<div class="dot">' + esc(st.basis) + '</div>' +

      '<div class="h1n"><em>Ⅱ</em><b>추진 목적</b></div>' +
      '<div class="dot">AI·디지털 기반 교육자료의 개인정보 보호 안전성 확보</div>' +
      '<div class="dot">교육과정 성취기준에 부합하는 교육적 효과성 및 질 높은 소프트웨어 선정</div>' +
      '<div class="dot">법적 절차 준수를 통한 행정의 투명성 및 신뢰도 제고</div>' +

      '<div class="h1n"><em>Ⅲ</em><b>추진 방침</b></div>' +
      '<div class="dot">「개인정보 보호법」에 따른 <b>5개 기준 9개 항목을 모두 충족</b>한 소프트웨어만 선정 (미충족 시 사용 불가)</div>' +
      '<div class="dot">교원 수요조사를 통해 실제 수업에 필요한 소프트웨어를 우선 선정</div>' +
      '<div class="dot">에듀집(edzip.kr)에 공급자가 등록한 체크리스트와 증빙자료를 활용하여 검토 절차 간소화</div>' +
      '<div class="dot">최초 선정 시 기간의 촉박함을 고려하여 서면 심의 병행 가능</div>' +

      '<div class="h1n"><em>Ⅳ</em><b>세부 추진 계획</b></div>' +
      '<table><tr><th style="width:32mm">단계</th><th style="width:30mm">일정</th><th>주요 내용</th><th style="width:28mm">담당</th></tr>' +
      steps.map(r => '<tr><td class="n">' + esc(r[0] || '') + '</td><td class="n">' + esc(r[1] || '') +
        '</td><td>' + esc(r[2] || '') + '</td><td class="n">' + esc(r[3] || dept) + '</td></tr>').join('') +
      '</table>' +

      '<div class="h1n"><em>Ⅴ</em><b>기대 효과</b></div>' +
      '<div class="dot">학생의 개인정보 유출 사고를 사전에 예방하고 안전한 디지털 학습 환경 조성</div>' +
      '<div class="dot">교육적 효과성을 고려한 AI·디지털 도구 활용을 통해 맞춤형 교육 및 교육과정 운영의 내실화</div>' +
      eduFoot(p, '계획(안)') +
    '</div>';

    // 참고 1 — 선정 기준
    body += '<div class="page">' +
      '<div class="ph"><b>참고 1. 학습지원 소프트웨어 선정 기준</b><i>' + esc(school) + '</i></div>' +
      '<div class="h2n">가. 필수기준 — 5개 기준 9개 항목 (모두 충족해야 선정 가능)</div>' +
      '<table><tr><th style="width:52mm">선정기준</th><th>세부 내용</th></tr>' +
      SW_MUST.map(r => '<tr><td class="n">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') +
      '</table>' +
      '<div class="dash">교육행정정보시스템(NEIS)과 연계되는 AI·디지털 교육자료는 교육부가 통합 관리하는 ' +
        '“AI·디지털 교육자료 포털”(한국교육학술정보원 관리)을 통해 운영되어야 함</div>' +
      '<div class="dash">특수교육 AI·디지털 교육자료는 “열린배움터”(교육부 국립특수교육원 관리)를 통해 운영</div>' +
      '<div class="h2n">나. 선택기준 — 교육적 효과성 (학교 자율)</div>' +
      '<table><tr><th style="width:52mm">선정기준</th><th>세부 내용</th></tr>' +
      SW_OPT.map(r => '<tr><td class="n">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') +
      '</table>' +
      eduFoot(p, '계획(안)') +
    '</div>';

    // 참고 2 — 심의 대상 판단
    body += '<div class="page">' +
      '<div class="ph"><b>참고 2. 심의 대상 판단 기준</b><i>' + esc(school) + '</i></div>' +
      '<div class="h2n">가. 심의가 필요한 경우 (아래 중 하나 이상 해당)</div>' +
      '<div class="dot">학생의 개인정보를 수집·이용·제공 등 <b>처리</b>하는 경우</div>' +
      '<div class="dot">교육과정 상 <b>교과 성취기준과 관련된 학습 콘텐츠</b>를 포함하는 경우</div>' +
      '<div class="dash">예시 — 교수학습 플랫폼, AI 코스웨어, 디지털교과서, 전자저작물, 학습 진단 도구 등</div>' +
      '<div class="h2n">나. 심의 대상이 아닌 경우</div>' +
      '<div class="dot">교사가 <b>수업 준비·행정업무</b>를 위해 학생 개인정보 수집 없이 활용하는 소프트웨어</div>' +
      '<div class="dash">예시 — 학생 정보 수집이 없는 알림장·캘린더, 교사 전용 수업 준비 도구</div>' +
      '<div class="dot"><b>정규 교과 외</b>에 활용하는 소프트웨어</div>' +
      '<div class="dash">예시 — 맞춤형 학업성취도 자율평가, 국가·국제수준 학업성취도 평가, 방과후·돌봄 수업, 학교 홈페이지, 나이스(NEIS)</div>' +
      '<div class="h2n">다. 확인 방법</div>' +
      '<div class="dot">에듀집(edzip.kr/utilization/learning-sw)에서 필수기준 충족 여부 확인</div>' +
      '<div class="dot">등록되지 않은 소프트웨어는 <b>공급 업체에 에듀집 등록을 요청</b></div>' +
      '<div class="dot">에듀집 “미등록 자료 요청 처리 현황”에서 <b>‘해당 없음’</b>으로 표시된 자료는 심의 없이 활용 가능</div>' +
      (items.length ? '<div class="note"><b>이번 심의 요청 대상</b> — 총 ' + items.length +
        '종 (에듀집 기준일 ' + esc(st.edzipDate) + ')</div>' : '') +
      eduFoot(p, '계획(안)') +
    '</div>';

    return docShell(school + ' ' + st.year + '학년도 학습지원 소프트웨어 선정 계획(안)', SW_CSS, body);
  }

  /* 심의 요청 목록의 표 줄 — 교과 순서를 지키면서 한 줄에 한 종씩, 번호를 이어 붙인다 */
  function swListRows(bySub) {
    const out = [];
    let no = 0;
    Object.keys(bySub).forEach(sub => {
      bySub[sub].forEach(i => {
        out.push('<tr><td class="n">' + (++no) + '</td>' +
                 '<td class="n">' + esc(sub) + '</td>' +
                 '<td>' + esc(i.name) + '</td>' +
                 '<td class="n">모두 충족</td></tr>');
      });
    });
    return out.join('');
  }

  function swReviewDoc(st, p) {
    const school = pfv(p, 'school') || '○○학교';
    const dept = pfv(p, 'dept') || '담당 부서';
    const items = swItems(st);
    const names = items.map(i => i.name).join(', ');

    // 교과별 묶음
    const bySub = {};
    items.forEach(i => { (bySub[i.subject] = bySub[i.subject] || []).push(i); });

    let body = '<div class="page">' +
      '<div class="doc-h">' + esc(st.year) + '학년도 학습지원 소프트웨어<br>교육자료 선정(안)</div>' +
      '<div class="meta">제안년월일 : ' + esc(st.meetDate) + '<br>' +
        '제 안 자 : 학교장(' + esc(dept) + ')<br>' +
        '제안설명자 : ' + esc(dept) + ' ' + esc(st.proposer) + '</div>' +

      '<div class="h1n"><em>1</em><b>제안 이유</b></div>' +
      '<div class="dot">「초·중등교육법」 제29조의2 신설에 따라 학교의 장이 학습지원 소프트웨어를 교육자료로 ' +
        '선정할 경우, 교육부장관이 정한 기준을 준수하고 <b>학교운영위원회 심의</b>를 거쳐야 함</div>' +
      '<div class="dot">' + esc(st.basis) + '</div>' +
      '<div class="dot">AI·디지털 기반 교육자료 활용이 증가함에 따라 학생들의 개인정보를 안전하게 관리하고 ' +
        '유출 사고를 사전에 방지하기 위함임</div>' +
      '<div class="dot">학교 교육과정 성취기준에 부합하고 교육적 효과가 검증된 우수한 소프트웨어를 ' +
        '투명하게 선정하여 공교육의 질을 제고하고자 함</div>' +

      '<div class="h1n"><em>2</em><b>주요 내용</b></div>' +
      '<div class="h2n">가. 심의 대상 범위</div>' +
      '<div class="dash">학생들의 개인정보를 수집·이용·제공 등 처리하는 경우</div>' +
      '<div class="dash">교육과정 상 교과 성취기준과 관련된 학습 콘텐츠를 포함하는 경우</div>' +
      '<div class="h2n">나. 선정 기준</div>' +
      '<div class="dash"><b>필수기준</b> — 개인정보 최소처리 원칙, 안전조치 의무, 이용자 권리(열람·정정·삭제·처리정지) 보장, ' +
        '만 14세 미만 아동 보호, 보호책임자 지정 등 <b>5개 기준 9개 항목을 모두 충족</b></div>' +
      '<div class="dash"><b>선택기준</b> — 교육목표 적합성, 콘텐츠 품질, 사용 환경 적합성, 접근성 및 사용성, ' +
        '서비스 지원 체계 등 학교 자율 기준</div>' +
      eduFoot(p, '학운위 심의(안)') +
    '</div>';

    /* 심의 요청 목록은 종수에 따라 여러 장으로 늘어난다.
       세로 정렬(flex)을 그대로 두면 인쇄할 때 장 나누기가 어긋나는 브라우저가 있어
       이 장만 보통 흐름(block)으로 둔다. */
    body += '<div class="page flow">' +
      '<div class="ph"><b>심의 요청 목록</b><i>총 ' + items.length + '종</i></div>' +
      '<div class="dot">본교 ' + esc(st.year) + '학년도 활용 예정인 학습지원 소프트웨어 <b>총 ' + items.length + '종</b> ' +
        '(에듀집 기준일 ' + esc(st.edzipDate) + ' / 에듀집 탑재 자료 : https://edzip.kr/)</div>' +
      /* 예전에는 교과별로 이름을 한 칸에 쉼표로 몰아넣었다. 종수가 많아지면
         그 한 칸이 한 장보다 길어지는데, 한글도 워드도 «칸 하나»는 장을 넘겨 쪼개지 못해
         뒷부분이 통째로 잘려 나갔다. 한 줄에 한 종씩 두면 줄 단위로 넘어간다. */
      '<table><thead><tr><th style="width:14mm">번호</th>' +
        '<th style="width:30mm">관련 교과</th><th>제품·서비스명</th>' +
        '<th style="width:22mm">기준 충족</th></tr></thead><tbody>' +
      swListRows(bySub) +
      '</tbody></table>' +
      '<div class="note"><b>선정 의견</b> — 해당 학습지원 소프트웨어는 에듀집에 등록된 자료 중 ' +
        '<b>필수기준을 모두 충족</b>하였으며, 교사들의 원활한 수업 활동을 위해 필요한 제품으로 선정함. ' +
        '체크리스트와 증빙자료는 에듀집 사이트 및 별도 파일로 제공함.</div>' +
      '<div class="h2n">추후 소프트웨어 추가 시 참고 사항</div>' +
      '<div class="dash">' + esc(st.edzipDate) + ' 이후 에듀집에 새롭게 등재되는 학습지원 소프트웨어는 ' +
        '본 심의를 통과한 것으로 갈음함</div>' +
      '<div class="dash">에듀집에 등록되지 않은 새로운 소프트웨어를 추가로 사용하려는 경우 ' +
        '<b>차기 학교운영위원회의 심의</b>를 거쳐야 함</div>' +
      '<div class="dash">에듀집 미등록 자료 요청 처리 현황에서 ‘해당 없음’으로 표시된 자료는 심의 없이 활용 가능</div>' +
      '<div class="dash">대표 플랫폼 내에서 제공되는 하위 서비스는 대표 플랫폼과 동일한 보안 관제 및 ' +
        '개인정보 보호 정책을 적용받으므로 <b>플랫폼 단위로 통합 심의</b>를 요청함</div>' +
      eduFoot(p, '학운위 심의(안)') +
    '</div>';

    // 선정기준 체크리스트
    body += '<div class="page">' +
      '<div class="ph"><b>선정 기준 체크리스트</b><i>필수기준 5개 기준 9개 항목</i></div>' +
      '<table><tr><th style="width:44mm">선정기준</th><th>세부 내용</th>' +
        '<th style="width:14mm">충족</th><th style="width:14mm">미충족</th><th style="width:16mm">해당없음</th></tr>' +
      SW_MUST.map(r => '<tr><td class="n">' + esc(r[0]) + '</td><td>' + esc(r[1]) +
        '</td><td class="n">■</td><td class="n">□</td><td class="n">□</td></tr>').join('') +
      '</table>' +
      '<div class="dash">증빙자료 — 추천 학습지원 소프트웨어 목록에 대한 필수기준 충족 여부를 에듀집 등록 자료로 확인</div>' +
      '<div class="h2n">선택기준 (학교 자율)</div>' +
      '<table><tr><th style="width:44mm">선정기준</th><th>세부 내용</th><th style="width:20mm">확인</th></tr>' +
      SW_OPT.map(r => '<tr><td class="n">' + esc(r[0]) + '</td><td>' + esc(r[1]) +
        '</td><td class="n">■</td></tr>').join('') +
      '</table>' +
      eduFoot(p, '학운위 심의(안)') +
    '</div>';

    // 심의 결과란
    body += '<div class="page">' +
      '<div class="ph"><b>심의 결과</b><i>' + esc(st.meetDate) + '</i></div>' +
      '<table><tr><th style="width:34mm">심의 일시</th><td>' + esc(st.meetDate) + '</td></tr>' +
        '<tr><th>안건명</th><td>' + esc(st.year) + '학년도 학습지원 소프트웨어 교육자료 선정(안)</td></tr>' +
        '<tr><th>심의 결과</th><td>□ 원안 가결 &nbsp;&nbsp; □ 수정 가결 &nbsp;&nbsp; □ 부결 &nbsp;&nbsp; □ 보류</td></tr>' +
        '<tr><th>수정·조건 사항</th><td><br><br><br></td></tr>' +
        '<tr><th>위원 의견</th><td><br><br><br></td></tr>' +
      '</table>' +
      '<div class="signs" style="margin-top:14mm">' +
        '<div class="srow">학교운영위원장 : <span class="ln w3"></span><em>(서명)</em></div>' +
        '<div class="srow">학교장 : <span class="ln w3"></span><em>(서명)</em></div>' +
      '</div>' +
      '<p class="date" style="margin-top:12mm">' + esc(st.meetDate) + '</p>' +
      '<p class="school">' + esc(school) + '</p>' +
      '<p class="dept">' + esc(dept) + '</p>' +
    '</div>';

    return docShell(school + ' ' + st.year + '학년도 학습지원 소프트웨어 선정 학운위 심의(안)', SW_CSS, body);
  }

  function swXlsxSheets(st, p) {
    const school = pfv(p, 'school') || '○○학교';
    const dept = pfv(p, 'dept') || '';
    const items = swItems(st);

    const list = {
      name: '소프트웨어 목록',
      cols: [6, 34, 18, 40, 14, 14],
      rows: [
        [{ v: st.year + '학년도 학습지원 소프트웨어 심의 요청 목록  |  ' + school + ' ' + dept, b: true }],
        [{ v: '에듀집 기준일 ' + st.edzipDate + '  /  총 ' + items.length + '종  /  학운위 심의 ' + st.meetDate }],
        [],
        [{ v: '번호', h: true }, { v: '제품·서비스명', h: true }, { v: '관련 교과', h: true },
         { v: '활용 목적', h: true }, { v: '필수기준', h: true }, { v: '에듀집 등록', h: true }]
      ]
    };
    items.forEach((it, i) => {
      list.rows.push([{ v: i + 1, n: true }, it.name, it.subject, it.purpose, '충족', '등록']);
    });

    const must = {
      name: '필수기준 체크리스트',
      cols: [30, 62, 10, 10, 12, 26],
      rows: [
        [{ v: '필수기준 — 5개 기준 9개 항목 (모두 충족해야 선정 가능)', b: true }],
        [],
        [{ v: '선정기준', h: true }, { v: '세부 내용', h: true }, { v: '충족', h: true },
         { v: '미충족', h: true }, { v: '해당없음', h: true }, { v: '증빙자료', h: true }]
      ]
    };
    SW_MUST.forEach(r => {
      must.rows.push([r[0], r[1], '■', '□', '□', '에듀집 등록 자료로 확인']);
    });
    must.rows.push([]);
    must.rows.push([{ v: '선택기준 — 교육적 효과성 (학교 자율)', b: true }]);
    must.rows.push([{ v: '선정기준', h: true }, { v: '세부 내용', h: true }, { v: '확인', h: true }]);
    SW_OPT.forEach(r => { must.rows.push([r[0], r[1], '■']); });

    const survey = {
      name: '교원 수요조사(서식1)',
      cols: [8, 14, 14, 30, 18, 30, 12],
      rows: [
        [{ v: st.year + '학년도 학습지원 소프트웨어 사용 희망 조사  |  ' + school, b: true }],
        [{ v: '※ 학년·교과별로 수업에 사용하려는 소프트웨어를 적어 주세요. 제출 기한 : ' + st.planDate }],
        [],
        [{ v: '번호', h: true }, { v: '학년', h: true }, { v: '교과', h: true },
         { v: '소프트웨어명', h: true }, { v: '요청 교사', h: true },
         { v: '활용 목적(단원·성취기준)', h: true }, { v: '개인정보 처리', h: true }]
      ]
    };
    for (let i = 1; i <= 20; i++) survey.rows.push([{ v: i, n: true }, '', '', '', '', '', '']);

    return [list, must, survey];
  }

  /* 입력한 이름이 어떻게 해석되었는지 표로 보여 준다.
     자동으로 채운 칸은 표시해 두어 선생님이 눈으로 확인하고 고칠 수 있게 한다. */
  function swRenderParsed(items) {
    const box = $('#swParsed');
    if (!box) return;

    if (!items.length) {
      box.innerHTML = '<div class="note info"><span class="n-em">✍️</span><div class="n-wrap">' +
        '<b class="n-t">제품명만 적어도 됩니다</b><div class="n-b">' +
        '위 칸에 <b>한 줄에 하나씩</b> 이름을 적거나, 바로 위 버튼을 눌러 추가하세요. ' +
        '관련 교과와 활용 목적은 사이트가 채워 넣습니다.</div></div></div>';
      return;
    }

    const autoN = items.filter(i => i.autoSub || i.autoPur).length;
    const unknown = items.filter(i => !i.known).length;

    box.innerHTML =
      '<div class="rg-outhead"><b>인식 결과</b><span>' + items.length + '줄 · 자동으로 채운 줄 ' + autoN + '개</span></div>' +
      '<div class="tbl-wrap"><table><tr>' +
        '<th style="width:34%">제품 · 서비스명</th><th style="width:18%">관련 교과</th><th>활용 목적</th>' +
      '</tr>' +
      items.map(i =>
        '<tr><td>' + esc(i.name) + '</td>' +
        '<td>' + esc(i.subject) + (i.autoSub ? ' <em class="sw-auto">자동</em>' : '') + '</td>' +
        '<td>' + esc(i.purpose) + (i.autoPur ? ' <em class="sw-auto">자동</em>' : '') + '</td></tr>').join('') +
      '</table></div>' +
      '<div class="note ' + (unknown ? 'warn' : 'tip') + '"><span class="n-em">' + (unknown ? '🔍' : '✅') + '</span>' +
        '<div class="n-wrap"><b class="n-t">' +
        (unknown
          ? '사전에 없는 이름이 ' + unknown + '줄 있습니다'
          : '모든 줄을 인식했습니다') + '</b><div class="n-b">' +
        (unknown
          ? '이름을 못 찾은 줄은 <b>전 교과 / 일반 문구</b>로 채워집니다. 그대로 두어도 문서는 만들어지지만, ' +
            '정확히 적으려면 <code>제품명 | 관련 교과 | 활용 목적</code> 형식으로 직접 써 주세요.'
          : '자동으로 채운 값은 <b>작성 편의를 위한 초안</b>입니다. 우리 학교 수업 내용과 다르면 ' +
            '<code>제품명 | 관련 교과 | 활용 목적</code> 형식으로 고쳐 쓰세요.') +
        ' 필수기준 충족 여부는 반드시 <a href="https://edzip.kr/utilization/learning-sw" target="_blank" rel="noopener">에듀집</a>에서 확인하세요.' +
        '</div></div></div>';
  }

  /* 어느 자료 종류에서든 함께 붙는 목록 손보기 단추 */
  function swEditBtns() {
    return '<span class="rg-sep" aria-hidden="true"></span>' +
           '<button type="button" class="rg-btn ghost" id="swReset">처음 예시로 되돌리기</button>' +
           '<button type="button" class="rg-btn ghost" id="swClear">목록 비우기</button>';
  }

  function swRender(st) {
    const out = $('#swOut'), acts = $('#swActs');
    if (!out) return;
    const p = pfGet();
    const items = swItems(st);

    $$('#swGen .rg-seg').forEach(seg => {
      const key = seg.getAttribute('data-seg');
      $$('button', seg).forEach(b => b.classList.toggle('on', b.getAttribute('data-v') === st[key]));
    });
    const cnt = $('#swCount');
    if (cnt) cnt.textContent = items.length + '종';

    swRenderParsed(items);

    if (st.kind === 'xlsx') {
      const sheets = swXlsxSheets(st, p);
      SW.sheets = sheets;
      if (acts) acts.innerHTML =
        '<button type="button" class="rg-btn excel" id="swXlsx">📊 엑셀(.xlsx) 내려받기</button>' + swEditBtns();
      out.innerHTML =
        '<div class="rg-outhead"><b>엑셀 자료</b><span>시트 3개 · 소프트웨어 ' + items.length + '종</span></div>' +
        '<div class="tbl-wrap"><table><tr><th>시트</th><th>내용</th></tr>' +
        sheets.map(s => '<tr><td><b>' + esc(s.name) + '</b></td><td>' +
          (s.rows.length - 4 > 0 ? (s.rows.length - 4) + '행 ' : '') + '작성됨</td></tr>').join('') +
        '</table></div>' +
        '<div class="note info"><span class="n-em">📊</span><div class="n-wrap">' +
          '<b class="n-t">엑셀 시트 구성</b><div class="n-b">' +
          '<b>① 소프트웨어 목록</b> — 심의 요청 목록 (학운위 제출·보관용) · ' +
          '<b>② 필수기준 체크리스트</b> — 5개 기준 9개 항목 + 선택기준 · ' +
          '<b>③ 교원 수요조사(서식1)</b> — 학년·교과별 사용 희망 조사표 (빈 20행)' +
          '</div></div></div>';
      return;
    }

    const doc = st.kind === 'review' ? swReviewDoc(st, p) : swPlanDoc(st, p);
    SW.doc = doc;
    const label = st.kind === 'review' ? '학운위 심의(안)' : '선정 계획(안)';
    if (acts) acts.innerHTML =
      '<button type="button" class="rg-btn word" id="swDocx">📝 워드(.docx) 내려받기</button>' +
      '<button type="button" class="rg-btn hwp" id="swHwpx">🅷 한글(.hwpx) 내려받기</button>' +
      '<button type="button" class="rg-btn" id="swPrint">🖨️ 인쇄 · PDF로 저장</button>' +
      '<button type="button" class="rg-btn ghost" id="swDl">⬇️ HTML 파일로 내려받기</button>' + swEditBtns();
    out.innerHTML =
      '<div class="rg-outhead"><b>미리보기</b><span>A4 세로 · ' + label + ' · 소프트웨어 ' + items.length + '종</span></div>' +
      '<div class="rg-frame"><iframe id="swFrame" title="' + label + ' 미리보기"></iframe></div>';
    const f = $('#swFrame');
    f.setAttribute('srcdoc', doc);
    f.addEventListener('load', () => fitFrame('swFrame', 794, 1123), { once: true });
    setTimeout(() => fitFrame('swFrame', 794, 1123), 60);
  }

  function swInit() {
    const wrap = $('#swGen');
    if (!wrap) return;
    let st = swLoad();
    SW.st = st;          // 에듀집 목록에서 이름을 넘겨받을 때 쓴다

    SW_FIELDS.forEach(k => {
      const el = $('[data-s="' + k + '"]', wrap);
      if (el) el.value = st[k] || '';
    });

    wrap.addEventListener('input', e => {
      const el = e.target.closest('[data-s]');
      if (!el) return;
      st[el.getAttribute('data-s')] = el.value;
      swSave(st); swRender(st);
    });

    wrap.addEventListener('click', e => {
      const seg = e.target.closest('.rg-seg button');
      if (seg) {
        st[seg.parentNode.getAttribute('data-seg')] = seg.getAttribute('data-v');
        swSave(st); swRender(st);
        return;
      }
      /* 자주 쓰는 제품 버튼 — 목록에 한 줄 추가 (이미 있으면 넣지 않는다) */
      const add = e.target.closest('[data-add]');
      if (add) {
        const name = add.getAttribute('data-add');
        const ta = $('[data-s="swList"]', wrap);
        const cur = (st.swList || '').replace(/\s+$/, '');
        const already = cur.split('\n').some(l => swNorm(l.split('|')[0]) === swNorm(name));
        if (!already) {
          st.swList = cur ? cur + '\n' + name : name;
          if (ta) { ta.value = st.swList; ta.scrollTop = ta.scrollHeight; }
          swSave(st); swRender(st);
        }
        add.classList.add('on');
        setTimeout(() => add.classList.remove('on'), 900);
        return;
      }
      if (e.target.closest('#swClear')) {
        st.swList = '';
        const ta = $('[data-s="swList"]', wrap);
        if (ta) ta.value = '';
        swSave(st); swRender(st);
        return;
      }
      if (e.target.closest('#swReset')) {
        const d = SW.defaults || {};
        SW_FIELDS.forEach(k => {
          st[k] = (k === 'swList' || k === 'steps') ? (d[k] || []).join('\n') : (d[k] || '');
          const el = $('[data-s="' + k + '"]', wrap);
          if (el) el.value = st[k];
        });
        swSave(st); swRender(st);
        return;
      }
      if (e.target.closest('#swPrint')) { printFrame('swFrame'); return; }
      const pf = pfGet();
      const base = (pfv(pf, 'school') || '학교') + '_' + st.year + '학년도_학습지원SW_';
      if (e.target.closest('#swDocx')) {
        downloadDocx(base + (st.kind === 'review' ? '학운위_심의안' : '선정_계획안') + '.docx',
                     SW.doc || (st.kind === 'review' ? swReviewDoc(st, pf) : swPlanDoc(st, pf)), false);
        return;
      }
      if (e.target.closest('#swHwpx')) {
        downloadHwpx(base + (st.kind === 'review' ? '학운위_심의안' : '선정_계획안') + '.hwpx',
                     SW.doc || (st.kind === 'review' ? swReviewDoc(st, pf) : swPlanDoc(st, pf)));
        return;
      }
      if (e.target.closest('#swDl')) {
        downloadDoc(base + (st.kind === 'review' ? '학운위_심의안' : '선정_계획안') + '.html',
                    SW.doc || swPlanDoc(st, pf));
        return;
      }
      if (e.target.closest('#swXlsx')) {
        downloadXlsx(base + '목록_체크리스트.xlsx', SW.sheets || swXlsxSheets(st, pf));
        return;
      }
    });

    swRender(st);
    window.addEventListener('resize', () => fitFrame('swFrame', 794, 1123));
  }

  /* =========================================================
     ⑧ 에듀집 「확인완료」 학습지원 소프트웨어 목록 조회 · 엑셀
     ---------------------------------------------------------
     교육부 에듀집(edzip.kr) 목록 화면이 쓰는 공개 API를 그대로 부른다.
     응답에 Access-Control-Allow-Origin: * 이 붙어 있어 서버 없이
     브라우저에서 바로 받아올 수 있다 — 깃허브 페이지에서도 동작한다.
     받아 온 목록은 브라우저에 남겨 두어 다음에 들어와도 다시 받지 않아도 된다.
     ========================================================= */
  const EZ_KEY  = 'debut.edzip';
  const EZ_API  = 'https://api.edzip.kr/self-inspection/free';
  const EZ_PAGE = 200;                 // 한 번에 200건 — 1,700여 건이면 아홉 번이면 끝난다
  const EZ_LINK = 'https://edzip.kr/utilization/learning-sw/';
  const EZ_CLASS = {
    public_including_city_province: '공공(시도포함)',
    ai_digital_educational_materials: 'AI·디지털 교육자료',
    private_domestic: '민간(국산)',
    private_foreign: '민간(외산)',
    other: '기타(교사 등 개인)'
  };
  /* 한 줄 = [구분, 서비스명, 공급자, 작성일, 에듀집 링크]
     엑셀에는 앞의 네 칸만 나가고, 링크는 미리보기에서 증빙을 열어 보는 데 쓴다 */
  const EZ = { rows: [], at: '', src: '', cls: '', q: '' };

  function ezRestore() {
    try {
      const o = JSON.parse(lsGet(EZ_KEY) || 'null');
      if (o && Array.isArray(o.rows) && o.rows.length) {
        EZ.rows = o.rows; EZ.at = o.at || ''; EZ.src = o.src || '';
      }
    } catch (e) {}
  }
  function ezStore() {
    lsSet(EZ_KEY, JSON.stringify({ rows: EZ.rows, at: EZ.at, src: EZ.src }));
  }

  // 에듀집 화면이 보여 주는 「작성일」은 한국 시간 기준 날짜다
  function ezDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10).replace(/-/g, '.');
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return k.getUTCFullYear() + '.' +
           String(k.getUTCMonth() + 1).padStart(2, '0') + '.' +
           String(k.getUTCDate()).padStart(2, '0');
  }
  const ezNow = () => {
    const d = new Date();
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '. ' +
           String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  /* ---- 에듀집에서 받아오기 ---- */
  async function ezFetchAll(onStep) {
    const rows = [];
    let skip = 0, total = 0, guard = 0;
    for (;;) {
      const url = EZ_API + '?keywordOption=all&verificationStatus=confirmed' +
                  '&limit=' + EZ_PAGE + '&skip=' + skip;
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('에듀집이 응답하지 않습니다 (' + res.status + ')');
      const j = await res.json();
      const data = (j && j.data) || [];
      if (j && j.paging && j.paging.total) total = j.paging.total;
      data.forEach(r => {
        const name = (r.productName || (r.product && r.product.name) || '').trim();
        if (!name) return;
        rows.push([
          EZ_CLASS[r.classification] || r.classification || '',
          name,
          (((r.company && r.company.name) || r.companyName) || '').trim(),
          ezDate(r.modifiedAt || r.updatedAt || r.createdAt),
          r.id ? EZ_LINK + r.id : ''
        ]);
      });
      if (onStep) onStep(rows.length, total);
      if (!data.length || !j.paging || j.paging.last) break;
      skip += EZ_PAGE;
      if (++guard > 80) break;                    // 혹시 모를 무한 반복 차단
    }
    return rows;
  }

  /* ---- 걸러 보기 ---- */
  function ezFiltered() {
    const q = String(EZ.q || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    return EZ.rows.filter(r => {
      if (EZ.cls && r[0] !== EZ_CLASS[EZ.cls]) return false;
      if (!q.length) return true;
      const hay = (r[1] + ' ' + r[2]).toLowerCase();
      return q.some(t => hay.indexOf(t) > -1);
    });
  }

  function ezSheets(list) {
    const rows = [[{ v: '구분', h: true }, { v: '서비스명', h: true },
                   { v: '공급자', h: true }, { v: '작성일', h: true }]];
    list.forEach(r => rows.push([r[0], r[1], r[2], r[3]]));
    return [{ name: '확인완료 목록', cols: [18, 46, 30, 14], rows: rows }];
  }

  function ezRender() {
    const out = $('#ezOut');
    if (!out) return;

    $$('#ezCls button').forEach(b =>
      b.classList.toggle('on', (b.getAttribute('data-v') || '') === EZ.cls));

    const cnt = $('#ezCount');
    if (cnt) cnt.textContent = EZ.rows.length ? EZ.rows.length.toLocaleString() + '종' : '';

    if (!EZ.rows.length) {
      out.innerHTML = '<div class="note warn"><span class="n-em">📭</span><div class="n-wrap">' +
        '<b class="n-t">아직 목록이 없습니다</b><div class="n-b">' +
        '위의 <b>에듀집에서 최신 목록 불러오기</b>를 누르면 그 시점의 확인완료 항목을 모두 받아옵니다. ' +
        '1,700여 종이라 20~30초쯤 걸리고, 한 번 받아 두면 이 브라우저에 남아 ' +
        '다음에 들어와도 그대로 보입니다.' +
        '</div></div></div>';
      return;
    }

    const list = ezFiltered();
    const cap = 60;
    let h = '<div class="rg-outhead"><b>목록</b><span>' +
            '전체 ' + EZ.rows.length.toLocaleString() + '종 중 <b>' + list.length.toLocaleString() + '종</b>' +
            (EZ.at ? ' · ' + esc(EZ.at) + ' 기준' : '') +
            '</span></div>';

    h += '<div class="rg-actions">' +
         '<button type="button" class="rg-btn" id="ezXlsx">📊 엑셀(.xlsx) 내려받기 <small>구분 · 서비스명 · 공급자 · 작성일</small></button>' +
         ($('#swGen')
           ? '<button type="button" class="rg-btn" id="ezToSw">🔁 학운위 목록에 넣기 <small>받아 온 ' +
             EZ.rows.length.toLocaleString() + '종으로 바꿔 넣기</small></button>'
           : '') +
         '</div>';

    if (!list.length) {
      h += '<div class="note warn"><span class="n-em">🔍</span><div class="n-wrap">' +
           '<b class="n-t">찾는 이름이 없습니다</b><div class="n-b">' +
           '검색어를 지우거나 구분을 <b>전체</b>로 바꿔 보세요. ' +
           '에듀집에 아직 올라오지 않은 소프트웨어라면 <b>「미등록 자료 요청」</b> 게시판으로 등록을 요청할 수 있습니다.' +
           '</div></div></div>';
      out.innerHTML = h;
      return;
    }

    h += '<div class="tbl-wrap"><table><thead><tr>' +
         '<th>구분</th><th>서비스명</th><th>공급자</th><th>작성일</th>' +
         '</tr></thead><tbody>';
    list.slice(0, cap).forEach(r => {
      const nm = r[4] ? '<a href="' + esc(r[4]) + '" target="_blank" rel="noopener">' + esc(r[1]) + '</a>'
                      : esc(r[1]);
      h += '<tr><td>' + esc(r[0]) + '</td><td>' + nm + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (list.length > cap) {
      h += '<p class="ez-more">화면에는 ' + cap + '종까지만 보여 줍니다 — <b>엑셀에는 ' +
           list.length.toLocaleString() + '종이 모두 들어갑니다.</b></p>';
    }
    out.innerHTML = h;
  }

  function ezInit() {
    const wrap = $('#ezGen');
    if (!wrap) return;
    ezRestore();

    const state = $('#ezState');
    const say = (txt, cls) => { if (state) { state.innerHTML = txt; state.className = 'ez-state ' + (cls || ''); } };
    const busy = on => {
      $$('#ezGen .rg-btn').forEach(b => { b.disabled = on; });
    };

    const done = src => {
      EZ.at = ezNow();
      EZ.src = src;
      ezStore();
      ezRender();
      say('✅ 에듀집에서 ' + EZ.rows.length.toLocaleString() + '종을 받았습니다', 'ok');
    };

    wrap.addEventListener('click', async e => {
      if (e.target.closest('#ezLoad')) {
        busy(true);
        say('에듀집에서 받아오는 중…');
        try {
          EZ.rows = await ezFetchAll((n, t) =>
            say('에듀집에서 받아오는 중… <b>' + n.toLocaleString() +
                (t ? ' / ' + t.toLocaleString() : '') + '종</b>'));
          done('api');
        } catch (err) {
          say('⚠️ ' + esc(err.message || '받아오지 못했습니다') +
              ' — 학교망에서 막혔을 수 있습니다. 잠시 뒤 다시 누르거나 ' +
              '<b>에듀집에서 직접 보기</b>로 확인하세요.', 'bad');
        }
        busy(false);
        return;
      }
      const seg = e.target.closest('#ezCls button');
      if (seg) { EZ.cls = seg.getAttribute('data-v') || ''; ezRender(); return; }
      if (e.target.closest('#ezToSw')) {
        /* 화면에서 걸러 보고 있더라도 「받아 온 목록 전체」를 넣는다.
           그리고 적혀 있던 줄은 지우고 새로 채운다 — 이어 붙이면 지난번 목록이
           섞여 남아 무엇이 이번 심의 대상인지 알 수 없게 된다. */
        const list = EZ.rows;
        if (!$('#swGen')) { say('이 페이지에 「학운위 자료 만들기」가 없습니다.', 'bad'); return; }
        /* 손으로 적어 둔 줄까지 사라지는 자리라 비어 있지 않을 때만 한 번 묻는다 */
        const had = pfRows((SW.st && SW.st.swList) || '').length;
        if (had && !window.confirm(
              '학운위 목록에 적혀 있는 ' + had.toLocaleString() + '줄을 지우고\n' +
              '에듀집에서 받아 온 ' + list.length.toLocaleString() + '종으로 바꿉니다.\n\n' +
              '직접 적어 둔 「제품명 | 관련 교과 | 활용 목적」도 함께 지워집니다.')) return;
        say('학운위 목록을 바꾸는 중… <b>' + list.length.toLocaleString() + '종</b>');
        const n = swPutNames(list.map(r => r[1]), true);
        if (n > 0) {
          const dup = list.length - n;
          say('🔁 학운위 목록을 ' + n.toLocaleString() + '종으로 바꿨습니다' +
              (dup > 0 ? ' <b>(이름이 겹치는 ' + dup.toLocaleString() + '종 제외)</b>' : ''), 'ok');
          const g = $('#swGen');
          if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          say('학운위 자료 만들기를 찾지 못했습니다', 'bad');
        }
        return;
      }
      if (e.target.closest('#ezXlsx')) {
        const list = ezFiltered();
        const tag = EZ.cls ? '_' + EZ_CLASS[EZ.cls] : '';
        downloadXlsx('에듀집_확인완료_학습지원SW' + tag + '.xlsx', ezSheets(list));
      }
    });

    const q = $('#ezQ', wrap);
    if (q) q.addEventListener('input', () => { EZ.q = q.value; ezRender(); });

    if (EZ.rows.length) say('저장해 둔 목록 ' + EZ.rows.length.toLocaleString() + '종' +
                            (EZ.at ? ' · ' + esc(EZ.at) + ' 기준' : ''), 'ok');
    ezRender();
  }

  /* ---------- 내비 ---------- */
  const NAV_NUDGED = 'debut.navhint';

  function buildNav() {
    const wrap = $('#navScroll');
    let h = '<a class="nav-item" href="#/home" data-id="home"><span class="em">🏠</span>홈</a>';
    PAGES.forEach(p => {
      h += '<a class="nav-item" href="#/' + p.id + '" data-id="' + p.id + '">' +
           '<span class="em">' + p.em + '</span>' + p.short + '</a>';
    });
    wrap.innerHTML = h;
    navScrollUI(wrap);
  }

  /* 메뉴가 화면보다 길다는 것을 눈으로 알 수 있게 —
     끝 흐림 · 화살표 단추 · 남은 양 막대를 붙이고 스크롤에 맞춰 갱신한다. */
  function navScrollUI(wrap) {
    const nav = $('#nav');
    if (!nav || nav.querySelector('.nav-bar')) { navScrollSync(); return; }

    const arrow = (side, d) =>
      '<button type="button" class="nav-ar ' + side + '" data-nav="' + side + '" ' +
      'tabindex="-1" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg></button>';

    nav.insertAdjacentHTML('beforeend',
      arrow('l', 'M15 5l-7 7 7 7') + arrow('r', 'M9 5l7 7-7 7') +
      '<div class="nav-bar"><i></i></div>');

    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-nav]');
      if (!b) return;
      const step = Math.max(120, Math.round(wrap.clientWidth * 0.8));
      wrap.scrollBy({ left: b.getAttribute('data-nav') === 'l' ? -step : step, behavior: 'smooth' });
    });

    wrap.addEventListener('scroll', navScrollSync, { passive: true });
    window.addEventListener('resize', navScrollSync);
    navScrollSync();

    /* 처음 온 사람에게 한 번만 살짝 밀어 보여 준다.
       한 번 봤으면 다시 하지 않는다 — 매번 흔들리면 성가시다. */
    if (!lsGet(NAV_NUDGED) && wrap.scrollWidth > wrap.clientWidth + 8) {
      nav.classList.add('nudge');
      lsSet(NAV_NUDGED, '1');
      setTimeout(() => nav.classList.remove('nudge'), 2600);
    }
  }

  function navScrollSync() {
    const nav = $('#nav'), wrap = $('#navScroll');
    if (!nav || !wrap) return;
    const max = wrap.scrollWidth - wrap.clientWidth;
    const x = wrap.scrollLeft;
    nav.classList.toggle('can-l', x > 8);
    nav.classList.toggle('can-r', x < max - 8);
    const bar = nav.querySelector('.nav-bar i');
    if (bar && wrap.scrollWidth > 0) {
      const w = Math.max(8, wrap.clientWidth / wrap.scrollWidth * 100);
      bar.style.width = w + '%';
      bar.style.left = (max > 0 ? (x / max) * (100 - w) : 0) + '%';
    }
  }

  function markNav(id) {
    $$('.nav-item').forEach(a => {
      const on = a.getAttribute('data-id') === id;
      a.classList.toggle('on', on);
      if (on && window.innerWidth > 620) {
        a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    });
    setTimeout(navScrollSync, 420);   // 부드럽게 옮겨간 뒤의 위치로 맞춘다
  }

  /* ---------- 라우터 ---------- */
  function route() {
    const id = (location.hash || '#/home').replace(/^#\/?/, '') || 'home';
    const view = $('#view');
    const page = PAGES.find(p => p.id === id);

    if (id === 'home' || !page) {
      view.className = 'view';
      view.innerHTML = renderHome();
      document.title = '송쌤과학 디벗 업무 도우미';
      markNav('home');
    } else {
      /* 분류 색(--cat)을 페이지 전체에 흘려보냄 — 블록 제목 막대까지 같은 색으로 */
      view.className = 'view t-' + page.tag;
      view.innerHTML = renderPage(page);
      document.title = page.title + ' | 송쌤과학 디벗 업무 도우미';
      markNav(page.id);
    }

    /* 머리 부분이 먼저 떠오르는 전환 — 애니메이션이 끝나면 클래스를 뗀다 */
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');
    setTimeout(() => view.classList.remove('enter'), 700);

    afterRender();
    $('#nav').classList.remove('open');
    $('#navBtn').setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ---------- 이벤트 ---------- */
  function toggleCheck(el) {
    const key = el.getAttribute('data-key');
    if (CHECKS[key]) delete CHECKS[key]; else CHECKS[key] = 1;
    saveChecks(CHECKS);
    el.classList.toggle('on', !!CHECKS[key]);
    el.setAttribute('aria-checked', !!CHECKS[key]);

    // 블록 카운터 갱신
    const block = el.closest('.block');
    if (block) {
      const bi = block.getAttribute('data-block');
      const items = $$('.ck-item', block);
      const done = items.filter(i => i.classList.contains('on')).length;
      const cnt = $('[data-cnt="' + bi + '"]', block);
      if (cnt) cnt.textContent = done + ' / ' + items.length;
    }

    // 페이지 헤더 진행 태그 갱신
    const id = (location.hash || '').replace(/^#\/?/, '');
    const page = PAGES.find(p => p.id === id);
    if (page) {
      const pr = pageProgress(page);
      const tag = $$('.ph-tags .tag')[1];
      if (tag && pr) {
        tag.textContent = '진행 ' + pr.done + ' / ' + pr.total;
        tag.classList.toggle('done', pr.done === pr.total);
      }
    }
  }

  document.addEventListener('click', e => {
    const ck = e.target.closest('.ck-item');
    if (ck) { toggleCheck(ck); return; }

    const chip = e.target.closest('.mon-chip');
    if (chip) {
      const card = $('[data-mon-card="' + chip.getAttribute('data-mon') + '"]');
      if (card) {
        const top = card.getBoundingClientRect().top + window.scrollY - 118;
        window.scrollTo({ top: top, behavior: 'smooth' });
        card.classList.add('flash');
        setTimeout(() => card.classList.remove('flash'), 1200);
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const ck = e.target.closest && e.target.closest('.ck-item');
    if (ck) { e.preventDefault(); toggleCheck(ck); }
  });

  let themeTimer = null;
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme');
    const nx = cur === 'dark' ? 'light' : 'dark';
    /* 색이 뚝 바뀌지 않도록 잠깐만 전환 효과를 켠다 */
    root.classList.add('theming');
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove('theming'), 320);
    root.setAttribute('data-theme', nx);
    lsSet(LS_THEME, nx);
  });

  $('#navBtn').addEventListener('click', () => {
    const nav = $('#nav');
    const open = nav.classList.toggle('open');
    $('#navBtn').setAttribute('aria-expanded', String(open));
  });

  window.addEventListener('hashchange', route);

  /* ---------- 시작 ---------- */
  (function init() {
    let th = null;
    th = lsGet(LS_THEME);
    if (!th) th = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', th);

    renderSocial();
    buildNav();
    route();
  })();
})();
