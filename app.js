// ECD PDF — central de ordens de serviço e documentos em PDF (demonstração estática)
// ECD Tecnologia · github.com/Du-Edu-Duarte
import * as pdfjs from './vendor/pdf.min.mjs';
import { configureAuth, guard, authRoute, me } from './ecd-auth.js';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
configureAuth({ name: 'ECD PDF', tagline: 'Suas ordens de serviço organizadas e corrigidas em minutos.', bullets: ['Importe dezenas de PDFs de uma vez', 'Busque qualquer palavra dentro deles', 'Corrija em lote e envie para assinar'], home: '#/' });

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (n = 10) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const fmtD = t => t ? new Date(t).toLocaleDateString('pt-BR') : '';
const fmtDT = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const winSafe = s => String(s ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF—–•…€]/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = s => norm(s).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const clone = o => JSON.parse(JSON.stringify(o));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2800); }
function download(bytes, name) { const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
async function sha256(bytes) { const h = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const who = () => me()?.nome || 'Usuário';

/* ---------------- banco ---------------- */
function openDB(name, ver, up) { return new Promise((res, rej) => { const r = indexedDB.open(name, ver); r.onupgradeneeded = () => up(r.result); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
const dbp = openDB('ecd-pdf', 1, d => { d.createObjectStore('docs', { keyPath: 'id' }); d.createObjectStore('files', { keyPath: 'id' }); });
async function tx(store, mode, fn, dbPromise = dbp) { const d = await dbPromise; return new Promise((res, rej) => { const t = d.transaction(store, mode); const o = fn(t.objectStore(store)); t.oncomplete = () => res(o && 'result' in o ? o.result : o); t.onerror = () => rej(t.error); }); }
const DB = {
  all: () => tx('docs', 'readonly', s => s.getAll()),
  get: id => tx('docs', 'readonly', s => s.get(id)),
  put: d => { d.updatedAt = Date.now(); return tx('docs', 'readwrite', s => s.put(d)); },
  del: id => tx('docs', 'readwrite', s => s.delete(id)),
  file: id => tx('files', 'readonly', s => s.get(id)).then(r => r && r.bytes),
  putFile: (id, bytes) => tx('files', 'readwrite', s => s.put({ id, bytes })),
  clear: () => Promise.all([tx('docs', 'readwrite', s => s.clear()), tx('files', 'readwrite', s => s.clear())]),
};

/* ---------------- pdf.js: arquivos, páginas e textos ---------------- */
const pdfCache = new Map();
async function srcPdf(fid) { if (!pdfCache.has(fid)) pdfCache.set(fid, DB.file(fid).then(b => pdfjs.getDocument({ data: b.slice() }).promise)); return pdfCache.get(fid); }
const textCache = new Map();
async function pageItems(pg) {
  const k = pg.f + ':' + pg.i + ':' + pg.rot; if (textCache.has(k)) return textCache.get(k);
  const pdf = await srcPdf(pg.f); const p = await pdf.getPage(pg.i + 1); const vp = p.getViewport({ scale: 1, rotation: (p.rotate + pg.rot) % 360 }); const tc = await p.getTextContent();
  const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
    const [a, b] = it.transform; const fs = Math.hypot(a, b) || 10;
    const p1 = vp.convertToViewportPoint(it.transform[4], it.transform[5] + fs * 0.92), p2 = vp.convertToViewportPoint(it.transform[4] + it.width, it.transform[5] - fs * 0.22);
    const x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]);
    return { str: it.str, x: x / vp.width, y: y / vp.height, w: Math.abs(p2[0] - p1[0]) / vp.width, h: Math.abs(p2[1] - p1[1]) / vp.height, size: fs, bold: /bold|black|heavy/i.test(it.fontName + ' ' + (tc.styles[it.fontName]?.fontFamily || '')) };
  });
  const out = { items, w: vp.width, h: vp.height }; textCache.set(k, out); return out;
}
async function extractText(fid) {
  const pdf = await srcPdf(fid); let all = '';
  for (let i = 1; i <= pdf.numPages; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); all += tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n'; }
  return { text: all.replace(/[ \t]+/g, ' '), pages: pdf.numPages };
}
function parseOS(text, fileName = '') {
  const STOP = /\s+(?:data(?:\s+de)?|cidade|endere[çc]o|contato|modelo|n[º°o]\.?\s|n[ºo°]\s*de\s*s[ée]rie|qtd|hor[ií]metro|combust[ií]vel|assinatura|telefone|cnpj|cpf)\b.*$/i;
  const g = (re) => { const m = text.match(re); return m ? m[1].trim().replace(/\s{2,}.*$/, '').replace(/[|·].*$/, '').replace(STOP, '').replace(/[:\-–]\s*$/, '').trim() : ''; };
  const os = g(/ordem\s+de\s+servi[çc]o[^\n\d]{0,20}?(\d{3,})/i) || g(/\bO\.?\s?S\.?\s*(?:n[º°o.]*)?\s*[:\-]?\s*(\d{3,})/i) || g(/\bn[º°]\s*[:\-]?\s*(\d{4,})/i) || (fileName.match(/\d{3,}/) || [''])[0];
  const tipo = (text.match(/\b(preventiva|corretiva|instala[çc][ãa]o|vistoria|inspe[çc][ãa]o|emergencial|start[- ]?up)\b/i) || [, ''])[1];
  const sub = g(/sistema\s+(\w+)/i);
  const d = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  return {
    os, tipo: tipo ? tipo[0].toUpperCase() + tipo.slice(1).toLowerCase() : 'Outro', subtipo: sub ? 'Sistema ' + sub.toLowerCase() : '',
    cliente: g(/cliente\s*[:\-]\s*([^\n]{3,70})/i), equipamento: g(/equipamento\s*[:\-]\s*([^\n]{3,70})/i), tecnico: g(/t[ée]cnico(?:\s+respons[áa]vel)?\s*[:\-]\s*([^\n]{3,50})/i),
    data: d ? `${d[3]}-${d[2]}-${d[1]}` : '',
  };
}
const STATUS = { pendente: ['Pendente', 'b-warn'], revisada: ['Revisada', 'b-info'], enviada: ['Enviada ao cliente', 'b-ok'], assinatura: ['Em assinatura', 'b-mut'] };

/* ---------------- importação ---------------- */
async function importFiles(files) {
  const list = [...files].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf'); if (!list.length) return toast('Escolha arquivos PDF');
  const md = $('#modal'); md.hidden = false; md.className = 'modal';
  md.innerHTML = `<div class="box"><h2>Importando ${list.length} PDF${list.length > 1 ? 's' : ''}</h2><p class="mut sm">Lendo o texto de cada arquivo para encontrar número da OS, cliente, tipo e data.</p><div class="imp" id="imp"></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn dark" id="impOk" disabled>Ver documentos</button></div></div>`;
  const box = $('#imp'); let ok = 0;
  for (const f of list) {
    const row = document.createElement('div'); row.className = 'imp-row'; row.innerHTML = `<span class="spin sm-spin"></span><b>${esc(f.name)}</b><span class="mut sm">lendo…</span>`; box.appendChild(row);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer()); const fid = uid(8); await DB.putFile(fid, bytes);
      const { text, pages } = await extractText(fid); const meta = parseOS(text, f.name);
      const doc = newDoc({ fileName: f.name, fid, pages, text, meta, size: bytes.length }); log(doc, `Importado por ${who()}`); await DB.put(doc); ok++;
      row.innerHTML = `<span class="ok">✓</span><b>${esc(meta.os ? 'OS ' + meta.os : f.name)}</b><span class="mut sm">${esc([meta.tipo, meta.cliente, meta.data && fmtD(meta.data + 'T12:00')].filter(Boolean).join(' · ') || 'sem dados reconhecidos')} · ${pages} pág.</span>`;
    } catch (e) { console.error(e); row.innerHTML = `<span class="bad">✕</span><b>${esc(f.name)}</b><span class="sm" style="color:var(--bad)">não foi possível ler este PDF</span>`; }
  }
  $('#impOk').disabled = false; $('#impOk').textContent = `Ver documentos (${ok} importado${ok === 1 ? '' : 's'})`;
  $('#impOk').onclick = () => { md.hidden = true; md.innerHTML = ''; if (location.hash === '#/' || !location.hash) route(); else location.hash = '#/'; };
}
function newDoc({ fileName, fid, pages, text, meta, size, when = Date.now() }) {
  const pg = Array.from({ length: pages }, (_, i) => ({ id: uid(6), f: fid, i, rot: 0 }));
  return { id: uid(8), fileName, ...meta, status: 'pendente', text, size, pages: pg, anns: [], versions: [{ id: uid(6), at: when, by: who(), note: 'Original importado', pages: clone(pg), anns: [] }], events: [], createdAt: when, updatedAt: when, origPages: clone(pg) };
}
const log = (doc, text, at = Date.now()) => (doc.events ||= []).push({ at, text });

/* ---------------- exportação (PDF final) ---------------- */
async function renderCanvas(pg, scale, covers = []) {
  const pdf = await srcPdf(pg.f); const p = await pdf.getPage(pg.i + 1); const vp = p.getViewport({ scale, rotation: (p.rotate + pg.rot) % 360 });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await p.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; covers.forEach(a => g.fillRect(a.x * c.width, a.y * c.height, a.w * c.width, a.h * c.height));
  return c;
}
async function buildPdf(doc, { light = false } = {}) {
  const out = await PDFDocument.create(); const F = await out.embedFont(StandardFonts.Helvetica), B = await out.embedFont(StandardFonts.HelveticaBold);
  const srcLib = new Map(); const lib = async fid => { if (!srcLib.has(fid)) srcLib.set(fid, await PDFDocument.load(await DB.file(fid))); return srcLib.get(fid); };
  for (const pg of doc.pages) {
    const anns = doc.anns.filter(a => a.page === pg.id); const covers = anns.filter(a => a.type === 'cover'); const erase = covers.filter(a => !a.soft); const texts = anns.filter(a => a.type === 'text' && a.text.trim());
    const src = await lib(pg.f); const sp = src.getPage(pg.i); const { width: W0, height: H0 } = sp.getSize(); const r = ((sp.getRotation().angle || 0) + pg.rot) % 360;
    const W = r % 180 ? H0 : W0, H = r % 180 ? W0 : H0; const page = out.addPage([W, H]);
    if (erase.length || light) {
      const c = await renderCanvas(pg, light ? 1.6 : 2.2, covers); const jpg = await (await fetch(c.toDataURL('image/jpeg', light ? 0.62 : 0.9))).arrayBuffer();
      page.drawImage(await out.embedJpg(jpg), { x: 0, y: 0, width: W, height: H });
    } else {
      const emb = await out.embedPage(sp);
      const pos = { 0: { x: 0, y: 0, rotate: degrees(0) }, 90: { x: 0, y: W0, rotate: degrees(-90) }, 180: { x: W0, y: H0, rotate: degrees(180) }, 270: { x: H0, y: 0, rotate: degrees(90) } }[r];
      page.drawPage(emb, { ...pos, width: W0, height: H0 });
      covers.forEach(c => page.drawRectangle({ x: c.x * W, y: H - (c.y + c.h) * H, width: c.w * W, height: c.h * H, color: rgb(1, 1, 1) }));
    }
    for (const t of texts) {
      const font = t.bold ? B : F; const size = t.size || 10; const col = hexRgb(t.color || '#112c43');
      t.text.split('\n').forEach((ln, k) => page.drawText(winSafe(ln), { x: t.x * W + 1, y: H - t.y * H - size * 0.85 - k * size * 1.2, size, font, color: rgb(col[0], col[1], col[2]) }));
    }
  }
  out.setTitle(doc.os ? `OS ${doc.os}` : doc.fileName); out.setProducer('ECD PDF · ECD Tecnologia');
  return out.save({ useObjectStreams: true });
}
const hexRgb = h => { const m = h.replace('#', '').match(/.{2}/g) || ['11', '2c', '43']; return m.map(x => parseInt(x, 16) / 255); };
const docName = d => (d.os ? `OS-${d.os}` : slug(d.fileName.replace(/\.pdf$/i, ''))) + '.pdf';

/* ---------------- modais ---------------- */
function modal(html, cls = '') { const md = $('#modal'); md.hidden = false; md.className = 'modal ' + cls; md.innerHTML = `<div class="box">${html}</div>`; return md; }
const closeModal = () => { const md = $('#modal'); md.hidden = true; md.innerHTML = ''; md.onclick = null; };
function confirmBox(title, text, ok = 'Confirmar') {
  return new Promise(res => { const md = modal(`<h2 style="margin-bottom:8px">${esc(title)}</h2><p class="mut">${esc(text)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-a="n">Cancelar</button><button class="btn dark" data-a="y">${esc(ok)}</button></div>`); $('.box', md).style.width = 'min(440px,100%)';
    md.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; closeModal(); res(a === 'y'); }; });
}

/* ---------------- lista ---------------- */
const view = () => $('#view');
const busy = msg => view().innerHTML = `<div class="busy"><div class="spin"></div><div>${esc(msg)}</div></div>`;
let F = { q: '', status: 'all', tipo: 'all', mes: 'all' }; let sel = new Set();
function snippet(text, q) { const t = norm(text), i = t.indexOf(norm(q)); if (i < 0) return ''; const a = Math.max(0, i - 40), b = Math.min(text.length, i + q.length + 60); return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, b)) + (b < text.length ? '…' : ''); }
async function Lista() {
  const docs = (await DB.all()).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.createdAt - a.createdAt);
  const tipos = [...new Set(docs.map(d => d.tipo).filter(Boolean))].sort(); const meses = [...new Set(docs.map(d => (d.data || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const q = F.q.trim();
  const rows = docs.filter(d => (F.status === 'all' || d.status === F.status) && (F.tipo === 'all' || d.tipo === F.tipo) && (F.mes === 'all' || (d.data || '').startsWith(F.mes)) && (!q || norm([d.os, d.cliente, d.tipo, d.equipamento, d.tecnico, d.fileName, d.text].join(' ')).includes(norm(q))));
  sel = new Set([...sel].filter(id => docs.some(d => d.id === id)));
  const c = k => docs.filter(d => d.status === k).length;
  const mesN = m => new Date(m + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  view().innerHTML = `
  <div class="head"><div><div class="eyebrow">Central de documentos</div><h1>Ordens de serviço</h1><p class="mut" style="margin:6px 0 0">Importe, encontre, corrija e envie. Busca também pelo que está escrito dentro de cada PDF.</p></div>
    <label class="btn primary" for="imp2">↑ Importar PDFs<input type="file" id="imp2" accept="application/pdf,.pdf" multiple hidden></label></div>
  <div class="kpis">
    <div class="card kpi"><small>Documentos</small><b>${docs.length}</b></div>
    <div class="card kpi warn"><small>Pendentes</small><b>${c('pendente')}</b></div>
    <div class="card kpi info"><small>Revisadas</small><b>${c('revisada')}</b></div>
    <div class="card kpi ok"><small>Enviadas / em assinatura</small><b>${c('enviada') + c('assinatura')}</b></div>
  </div>
  <div class="drop-zone" id="dz">Arraste PDFs aqui para importar vários de uma vez</div>
  <div class="row filters">
    <input class="search" id="q" placeholder="Buscar OS, cliente, equipamento, técnico ou qualquer palavra do PDF" value="${esc(F.q)}">
    <select id="fs" class="sel"><option value="all">Todas as situações</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${F.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
    <select id="ft" class="sel"><option value="all">Todos os tipos</option>${tipos.map(t => `<option ${F.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <select id="fm" class="sel"><option value="all">Qualquer mês</option>${meses.map(m => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${mesN(m)}</option>`).join('')}</select>
  </div>
  <div class="batch" id="batch" ${sel.size ? '' : 'hidden'}><b id="bn"></b><div class="row"><button class="btn sm" data-b="lote">✎ Corrigir em lote</button><button class="btn sm" data-b="revisada">Marcar revisada</button><button class="btn sm" data-b="juntar">⧉ Juntar em um PDF</button><button class="btn sm" data-b="baixar">↓ Baixar</button><button class="link sm" data-b="limpar">Limpar seleção</button></div></div>
  <div class="card" style="overflow:hidden">${rows.length ? `<table class="list os"><thead><tr><th style="width:34px"><input type="checkbox" id="all"></th><th>OS</th><th>Cliente</th><th class="hide-m">Tipo</th><th class="hide-m">Data</th><th>Situação</th></tr></thead><tbody>
    ${rows.map(d => `<tr data-id="${d.id}" class="${sel.has(d.id) ? 'on' : ''}"><td><input type="checkbox" data-s="${d.id}" ${sel.has(d.id) ? 'checked' : ''}></td>
      <td class="doc-t">${d.os ? 'OS ' + esc(d.os) : esc(d.fileName)}<small>${d.pages.length} pág.${d.anns.length ? ` · <span style="color:var(--gold2);font-weight:700">${d.anns.length} edições</span>` : ''}${d.versions.length > 1 ? ` · v${d.versions.length}` : ''}</small></td>
      <td><div style="font-weight:600">${esc(d.cliente || '—')}</div><div class="mut sm">${esc(d.equipamento || '')}</div>${q && !norm([d.os, d.cliente, d.tipo, d.equipamento].join(' ')).includes(norm(q)) ? `<div class="snip">${snippet(d.text, q)}</div>` : ''}</td>
      <td class="hide-m">${esc(d.tipo)}<div class="mut sm">${esc(d.subtipo || '')}</div></td><td class="hide-m mut sm">${d.data ? fmtD(d.data + 'T12:00') : ''}</td>
      <td><span class="badge ${STATUS[d.status][1]}">${STATUS[d.status][0]}</span></td></tr>`).join('')}
  </tbody></table>` : `<div class="empty">${docs.length ? 'Nada encontrado com esses filtros.' : 'Nenhum documento ainda. Importe seus PDFs.'}</div>`}</div>`;
  const upd = () => { $('#batch').hidden = !sel.size; $('#bn').textContent = `${sel.size} selecionado${sel.size > 1 ? 's' : ''}`; };
  upd();
  const q$ = $('#q'); q$.oninput = () => { F.q = q$.value; clearTimeout(q$._t); q$._t = setTimeout(() => Lista().then(() => { const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 220); };
  $('#fs').onchange = e => { F.status = e.target.value; Lista(); }; $('#ft').onchange = e => { F.tipo = e.target.value; Lista(); }; $('#fm').onchange = e => { F.mes = e.target.value; Lista(); };
  $('#imp2').onchange = e => importFiles(e.target.files);
  const dz = $('#dz'); ['dragenter', 'dragover'].forEach(ev => document.body.addEventListener(ev, e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); dz.classList.add('on'); } }));
  dz.ondragleave = () => dz.classList.remove('on'); document.body.ondrop = e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dz.classList.remove('on'); importFiles(e.dataTransfer.files); };
  $$('tr[data-id]').forEach(tr => tr.onclick = e => { if (e.target.closest('input')) return; location.hash = '#/os/' + tr.dataset.id; });
  $$('[data-s]').forEach(cb => cb.onchange = () => { cb.checked ? sel.add(cb.dataset.s) : sel.delete(cb.dataset.s); cb.closest('tr').classList.toggle('on', cb.checked); upd(); });
  const all = $('#all'); if (all) all.onchange = () => { rows.forEach(d => all.checked ? sel.add(d.id) : sel.delete(d.id)); Lista(); };
  $$('[data-b]').forEach(b => b.onclick = async () => {
    const ids = [...sel]; const ds = docs.filter(d => ids.includes(d.id));
    if (b.dataset.b === 'limpar') { sel.clear(); return Lista(); }
    if (b.dataset.b === 'lote') return Lote(ds);
    if (b.dataset.b === 'revisada') { for (const d of ds) { d.status = 'revisada'; log(d, `Marcada como revisada por ${who()}`); await DB.put(d); } toast(`${ds.length} marcada(s) como revisada`); return Lista(); }
    if (b.dataset.b === 'baixar') { for (const d of ds) { download(await buildPdf(d), docName(d)); await new Promise(r => setTimeout(r, 350)); } return; }
    if (b.dataset.b === 'juntar') {
      if (ds.length < 2) return toast('Selecione pelo menos 2 documentos');
      const pages = ds.flatMap(d => d.pages.map(p => ({ ...p, id: uid(6), _from: p.id }))); const anns = ds.flatMap(d => d.anns.map(a => ({ ...a, id: uid(6), page: pages.find(p => p._from === a.page)?.id })));
      pages.forEach(p => delete p._from);
      const nd = { ...newDoc({ fileName: `Juntado · ${ds.map(d => d.os || d.fileName).join(', ')}.pdf`, fid: pages[0].f, pages: 0, text: ds.map(d => d.text).join('\n'), meta: { os: '', tipo: 'Pacote', subtipo: `${ds.length} documentos`, cliente: [...new Set(ds.map(d => d.cliente).filter(Boolean))].join(', '), equipamento: '', tecnico: '', data: ds[0].data }, size: ds.reduce((a, d) => a + (d.size || 0), 0) }) };
      nd.pages = pages; nd.anns = anns; nd.origPages = clone(pages); nd.versions[0].pages = clone(pages); nd.versions[0].anns = clone(anns); log(nd, `Criado juntando ${ds.length} documentos (${who()})`); await DB.put(nd); sel.clear(); location.hash = '#/os/' + nd.id;
    }
  });
}

/* ---------------- correção em lote ---------------- */
async function findOccurrences(doc, find) {
  const out = []; const nf = norm(find); if (!nf) return out;
  const mc = document.createElement('canvas').getContext('2d');
  for (const pg of doc.pages) {
    const { items } = await pageItems(pg);
    for (const it of items) {
      let from = 0; const s = norm(it.str); let i;
      while ((i = s.indexOf(nf, from)) >= 0) {
        mc.font = `${it.bold ? 700 : 400} 100px Arial, Helvetica, sans-serif`; const tot = mc.measureText(it.str).width || 1;
        const x0 = mc.measureText(it.str.slice(0, i)).width / tot, x1 = mc.measureText(it.str.slice(0, i + find.length)).width / tot;
        out.push({ pg, it, x: it.x + it.w * x0, w: it.w * (x1 - x0), original: it.str.slice(i, i + find.length) }); from = i + nf.length;
      }
    }
  }
  return out;
}
function Lote(ds) {
  const md = modal(`<div class="eyebrow">Correção em lote</div><h2>Trocar um texto em ${ds.length} documento${ds.length > 1 ? 's' : ''}</h2><p class="mut sm" style="margin:6px 0 14px">Ex.: corrigir o nome do técnico ou a data em várias OS de uma vez. O sistema encontra o texto dentro de cada PDF, cobre e escreve o novo no mesmo lugar e tamanho.</p>
    <form id="fl" class="grid"><div class="form2"><label class="f">Procurar<input name="a" required placeholder="Ex.: Joao Silva"></label><label class="f">Trocar por<input name="b" placeholder="Ex.: João Silva"></label></div>
    <div id="prev" class="lote-prev mut sm">Digite o texto para ver quantas vezes ele aparece.</div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primary" id="ap" disabled>Aplicar</button></div></form>`);
  let found = [];
  const prev = async () => {
    const a = $('#fl').a.value; if (a.trim().length < 2) { $('#prev').textContent = 'Digite pelo menos 2 letras.'; $('#ap').disabled = true; return; }
    $('#prev').textContent = 'Procurando…'; found = [];
    for (const d of ds) { const occ = await findOccurrences(d, a); found.push([d, occ]); }
    const tot = found.reduce((s, [, o]) => s + o.length, 0);
    $('#prev').innerHTML = tot ? `<b style="color:var(--ink)">${tot} ocorrência${tot > 1 ? 's' : ''}</b> encontrada${tot > 1 ? 's' : ''}:<ul>${found.map(([d, o]) => `<li>${esc(d.os ? 'OS ' + d.os : d.fileName)}: ${o.length ? `<b>${o.length}</b>×` : '<span class="mut">nenhuma</span>'}</li>`).join('')}</ul>` : 'Esse texto não aparece nos documentos selecionados.';
    $('#ap').disabled = !tot; $('#ap').textContent = tot ? `Aplicar em ${found.filter(([, o]) => o.length).length} documento(s)` : 'Aplicar';
  };
  $('#fl').a.oninput = () => { clearTimeout(md._t); md._t = setTimeout(prev, 300); };
  $('[data-x]', md).onclick = closeModal;
  $('#fl').onsubmit = async e => {
    e.preventDefault(); const a = e.target.a.value, b = e.target.b.value; let n = 0;
    for (const [d, occ] of found) {
      if (!occ.length) continue;
      for (const o of occ) {
        const padX = o.it.h * 0.08;
        d.anns.push({ id: uid(6), page: o.pg.id, type: 'cover', soft: true, x: o.x - padX * 0.3, y: o.it.y - o.it.h * 0.05, w: o.w + padX, h: o.it.h * 1.1 });
        d.anns.push({ id: uid(6), page: o.pg.id, type: 'text', x: o.x, y: o.it.y + o.it.h * 0.02, w: Math.max(o.w, 0.05), h: o.it.h, text: b, size: +(o.it.size).toFixed(1), bold: o.it.bold, color: '#111111' }); n++;
      }
      d.text = d.text.split(a).join(b); Object.assign(d, Object.fromEntries(['cliente', 'tecnico', 'equipamento'].map(k => [k, (d[k] || '').split(a).join(b)])));
      d.versions.push({ id: uid(6), at: Date.now(), by: who(), note: `Correção em lote: “${a}” → “${b}”`, pages: clone(d.pages), anns: clone(d.anns) });
      log(d, `Correção em lote por ${who()}: “${a}” → “${b}” (${occ.length}×)`); await DB.put(d);
    }
    closeModal(); toast(`${n} trocas aplicadas`); sel.clear(); Lista();
  };
  setTimeout(() => $('#fl').a.focus(), 30);
}

/* ---------------- editor ---------------- */
async function Editor(id) {
  let doc = await DB.get(id); if (!doc) return view().innerHTML = '<div class="card pad"><h2>Documento não encontrado</h2><a class="btn" href="#/">Voltar</a></div>';
  busy('Abrindo o documento…');
  let tool = 'select', zoom = 1, cur = null; const undo = [], redo = []; let dirty = false;
  const snap = () => { undo.push(JSON.stringify({ pages: doc.pages, anns: doc.anns })); if (undo.length > 80) undo.shift(); redo.length = 0; dirty = true; markDirty(); };
  const setState = s => { const o = JSON.parse(s); doc.pages = o.pages; doc.anns = o.anns; };
  const save = async (note) => { if (note) { doc.versions.push({ id: uid(6), at: Date.now(), by: who(), note, pages: clone(doc.pages), anns: clone(doc.anns) }); log(doc, `${note} (${who()})`); } await DB.put(doc); dirty = false; markDirty(); };
  const autosave = () => { clearTimeout(autosave._t); autosave._t = setTimeout(() => DB.put(doc), 600); };
  const markDirty = () => { const b = $('#saveV'); if (b) b.classList.toggle('primary', dirty); };
  view().innerHTML = `
  <div class="ed-head"><div class="row" style="gap:14px;min-width:0"><a class="btn sm" href="#/">←</a><div style="min-width:0"><div class="eyebrow" style="margin:0">${esc(doc.tipo)}${doc.subtipo ? ' · ' + esc(doc.subtipo) : ''}</div><h1 class="ed-t">${doc.os ? 'OS ' + esc(doc.os) : esc(doc.fileName)}</h1><div class="mut sm ell">${esc([doc.cliente, doc.equipamento, doc.tecnico && 'Técnico: ' + doc.tecnico].filter(Boolean).join(' · '))}</div></div></div>
    <div class="row"><select id="st" class="sel">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${doc.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select><button class="btn" id="saveV">Salvar versão</button><button class="btn" id="sign">✍️ Enviar para assinar</button><button class="btn dark" id="dl">↓ Baixar PDF</button></div></div>
  <div class="tools card"><div class="row" style="gap:6px">
      <button class="tool on" data-t="select" title="Selecionar, mover e editar (duplo clique no texto do PDF para editar)">↖ Selecionar</button>
      <button class="tool" data-t="cover" title="Arraste sobre o trecho para apagar">▧ Cobrir / apagar</button>
      <button class="tool" data-t="text" title="Clique onde quer escrever">T Escrever</button></div>
    <div class="row" style="gap:6px"><button class="tool" id="un" title="Voltar (Ctrl+Z)">↶</button><button class="tool" id="re" title="Refazer (Ctrl+Y)">↷</button><button class="tool" id="delSel" title="Apagar seleção (Delete)">🗑</button></div>
    <div class="row" style="gap:6px"><button class="tool" id="zo">−</button><span id="zv" class="sm" style="min-width:44px;text-align:center">100%</span><button class="tool" id="zi">＋</button></div>
    <div id="props" class="row props" style="gap:8px"></div></div>
  <div class="ed">
    <aside class="thumbs card" id="thumbs"></aside>
    <section class="ed-pages" id="pages"></section>
    <aside class="ed-side">
      <div class="card pad"><h3>Como editar</h3><ol class="sm mut howto"><li><b>Duplo clique</b> num texto do PDF para corrigir.</li><li><b>Cobrir / apagar</b>: arraste sobre o trecho.</li><li><b>Escrever</b>: clique no lugar e digite.</li></ol><p class="sm mut" style="margin:8px 0 0">Correções e textos novos mantêm o PDF original, nítido e pesquisável. Só a página em que você usa <b>Cobrir / apagar</b> vira imagem, para o conteúdo apagado sair de verdade (ex.: dados sensíveis).</p></div>
      <div class="card pad"><div class="row between"><h3>Páginas</h3><label class="btn sm" for="ins">+ Inserir PDF<input type="file" id="ins" accept="application/pdf,.pdf" hidden></label></div>
        <div class="row sm" style="margin-top:10px;gap:6px"><button class="btn sm" id="split">Separar páginas selecionadas</button><button class="btn sm" id="light">Baixar versão leve</button></div><p class="mut sm" id="pinfo" style="margin:8px 0 0"></p></div>
      <div class="card pad"><h3 style="margin-bottom:8px">Versões</h3><div class="vers" id="vers"></div><button class="link sm" id="orig" style="margin-top:10px">Restaurar original</button></div>
      <div class="card pad"><h3 style="margin-bottom:8px">Histórico</h3><div class="hist">${doc.events.slice().reverse().slice(0, 12).map(e => `<div><time>${fmtDT(e.at)}</time><span>${esc(e.text)}</span></div>`).join('')}</div><button class="link sm mut" id="rm" style="margin-top:12px">Excluir documento</button></div>
    </aside>
  </div>`;
  const pagesEl = $('#pages'); let pickPages = new Set();
  async function drawThumbs() {
    const th = $('#thumbs'); th.innerHTML = doc.pages.map((pg, k) => `<div class="th ${pickPages.has(pg.id) ? 'pick' : ''}" data-pg="${pg.id}"><div class="thc"><canvas></canvas><input type="checkbox" class="thk" ${pickPages.has(pg.id) ? 'checked' : ''} title="Selecionar página"></div><div class="tha"><span>${k + 1}</span><button data-a="up" title="Subir" ${k ? '' : 'disabled'}>↑</button><button data-a="down" title="Descer" ${k < doc.pages.length - 1 ? '' : 'disabled'}>↓</button><button data-a="rot" title="Girar">⟳</button><button data-a="del" title="Excluir página" ${doc.pages.length > 1 ? '' : 'disabled'}>✕</button></div></div>`).join('');
    $('#pinfo').textContent = `${doc.pages.length} página${doc.pages.length > 1 ? 's' : ''}${pickPages.size ? ` · ${pickPages.size} selecionada(s)` : ''}`;
    for (const el of $$('.th', th)) { const pg = doc.pages.find(p => p.id === el.dataset.pg); const c = await renderCanvas(pg, 0.22, doc.anns.filter(a => a.page === pg.id && a.type === 'cover')); const t = $('canvas', el); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0); }
  }
  $('#thumbs').onclick = async e => {
    const th = e.target.closest('.th'); if (!th) return; const k = doc.pages.findIndex(p => p.id === th.dataset.pg); const a = e.target.closest('[data-a]')?.dataset.a;
    if (e.target.classList.contains('thk')) { e.target.checked ? pickPages.add(th.dataset.pg) : pickPages.delete(th.dataset.pg); th.classList.toggle('pick', e.target.checked); $('#pinfo').textContent = `${doc.pages.length} páginas · ${pickPages.size} selecionada(s)`; return; }
    if (!a) { $(`.pg[data-pg="${th.dataset.pg}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    snap();
    if (a === 'up' || a === 'down') { const j = a === 'up' ? k - 1 : k + 1; [doc.pages[k], doc.pages[j]] = [doc.pages[j], doc.pages[k]]; }
    if (a === 'del') { const pid = doc.pages[k].id; doc.pages.splice(k, 1); doc.anns = doc.anns.filter(x => x.page !== pid); }
    if (a === 'rot') { const pg = doc.pages[k]; pg.rot = (pg.rot + 90) % 360; doc.anns.filter(x => x.page === pg.id).forEach(x => { const { x: X, y: Y, w, h } = x; x.x = 1 - Y - h; x.y = X; x.w = h; x.h = w; }); }
    autosave(); await drawAll();
  };
  async function drawPages() {
    const keep = pagesEl.scrollTop; pagesEl.innerHTML = '';
    const avail = Math.min(pagesEl.clientWidth - 32, 900);
    for (const pg of doc.pages) {
      const pdf = await srcPdf(pg.f); const p = await pdf.getPage(pg.i + 1); const vp1 = p.getViewport({ scale: 1, rotation: (p.rotate + pg.rot) % 360 });
      const cssW = avail * zoom, scale = cssW / vp1.width * (devicePixelRatio || 1);
      const wrap = document.createElement('div'); wrap.className = 'pg'; wrap.dataset.pg = pg.id; wrap.style.width = cssW + 'px'; wrap.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
      const c = await renderCanvas(pg, scale); c.className = 'pgc'; wrap.appendChild(c); const ov = document.createElement('div'); ov.className = 'ov'; wrap.appendChild(ov); pagesEl.appendChild(wrap);
      wrap._pt = vp1.width; // largura em pontos (para tamanho de letra)
    }
    pagesEl.scrollTop = keep; drawAnns();
  }
  function drawAnns() {
    $$('.pg').forEach(wrap => {
      const ov = $('.ov', wrap); const ptToPx = wrap.clientWidth / wrap._pt;
      ov.innerHTML = doc.anns.filter(a => a.page === wrap.dataset.pg).map(a => a.type === 'cover'
        ? `<div class="an cover ${cur === a.id ? 'sel' : ''}" data-a="${a.id}" style="left:${a.x * 100}%;top:${a.y * 100}%;width:${a.w * 100}%;height:${a.h * 100}%"><span class="rs"></span></div>`
        : `<div class="an text ${cur === a.id ? 'sel' : ''}" data-a="${a.id}" style="left:${a.x * 100}%;top:${a.y * 100}%;font-size:${(a.size || 10) * ptToPx}px;color:${a.color || '#112c43'};font-weight:${a.bold ? 700 : 400}"><div class="tx" contenteditable="${cur === a.id ? 'plaintext-only' : 'false'}" spellcheck="false">${esc(a.text)}</div></div>`).join('');
    });
    drawProps();
    if (cur) { const tx = $(`.an[data-a="${cur}"] .tx`); if (tx && tx._focus !== false && document.activeElement !== tx && editNow) { tx.focus(); const r = document.createRange(); r.selectNodeContents(tx); const s = getSelection(); s.removeAllRanges(); s.addRange(r); editNow = false; } }
  }
  let editNow = false;
  function drawProps() {
    const a = doc.anns.find(x => x.id === cur); const p = $('#props');
    if (!a || a.type !== 'text') { p.innerHTML = a ? '<span class="mut sm">Cobertura branca selecionada · arraste para mover, canto para redimensionar</span>' : `<span class="mut sm">${tool === 'select' ? 'Duplo clique em qualquer texto do PDF para corrigir' : tool === 'cover' ? 'Arraste sobre o trecho que quer apagar' : 'Clique no documento onde quer escrever'}</span>`; return; }
    p.innerHTML = `<label class="sm">Tamanho <input type="number" id="pSz" min="5" max="72" step="0.5" value="${a.size}" style="width:64px"></label><label class="sm">Cor <input type="color" id="pCo" value="${a.color || '#112c43'}"></label><button class="tool ${a.bold ? 'on' : ''}" id="pB"><b>N</b></button>`;
    $('#pSz').onchange = e => { snap(); a.size = +e.target.value || 10; autosave(); drawAnns(); };
    $('#pCo').onchange = e => { snap(); a.color = e.target.value; autosave(); drawAnns(); };
    $('#pB').onclick = () => { snap(); a.bold = !a.bold; autosave(); drawAnns(); };
  }
  function drawVers() {
    $('#vers').innerHTML = doc.versions.slice().reverse().map((v, k) => `<div class="ver"><div><b>v${doc.versions.length - k}</b> · ${esc(v.note)}<div class="mut sm">${fmtDT(v.at)} · ${esc(v.by)} · ${v.anns.length} edições</div></div>${k ? `<button class="btn sm" data-v="${v.id}">Voltar</button>` : '<span class="badge b-ok">atual</span>'}</div>`).join('');
    $$('[data-v]').forEach(b => b.onclick = async () => { const v = doc.versions.find(x => x.id === b.dataset.v); if (!(await confirmBox('Voltar para esta versão?', `O documento volta a ficar como em "${v.note}". A versão atual continua salva no histórico.`, 'Voltar versão'))) return; snap(); doc.pages = clone(v.pages); doc.anns = clone(v.anns); await save(`Voltou para a versão de ${fmtDT(v.at)}`); drawAll(); });
  }
  const drawAll = async () => { await drawPages(); drawThumbs(); drawVers(); };
  // ferramentas
  $$('.tool[data-t]').forEach(b => b.onclick = () => { tool = b.dataset.t; $$('.tool[data-t]').forEach(x => x.classList.toggle('on', x === b)); pagesEl.dataset.tool = tool; cur = null; drawAnns(); });
  pagesEl.dataset.tool = tool;
  const rel = (e, wrap) => { const r = wrap.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  pagesEl.addEventListener('pointerdown', e => {
    const wrap = e.target.closest('.pg'); if (!wrap) return; const an = e.target.closest('.an');
    if (an && tool === 'select') {
      const a = doc.anns.find(x => x.id === an.dataset.a); if (cur === a.id && e.target.closest('.tx') && e.target.closest('[contenteditable="plaintext-only"]')) return;
      e.preventDefault(); if (cur !== a.id) { cur = a.id; drawAnns(); }
      const [sx, sy] = rel(e, wrap); const o = { ...a }; const rs = e.target.classList.contains('rs'); let moved = false;
      const mv = ev => { const [x, y] = rel(ev, wrap); if (!moved) { if (Math.hypot(x - sx, y - sy) < 0.004) return; snap(); moved = true; }
        if (rs) { a.w = Math.max(.01, o.w + x - sx); a.h = Math.max(.006, o.h + y - sy); } else { a.x = Math.max(0, Math.min(1 - (a.w || .02), o.x + x - sx)); a.y = Math.max(0, Math.min(.99, o.y + y - sy)); }
        const el = $(`.an[data-a="${a.id}"]`); Object.assign(el.style, { left: a.x * 100 + '%', top: a.y * 100 + '%' }); if (a.type === 'cover') Object.assign(el.style, { width: a.w * 100 + '%', height: a.h * 100 + '%' }); };
      const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); if (moved) { autosave(); if (a.type === 'cover') drawThumbs(); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', upf); return;
    }
    if (tool === 'cover') {
      e.preventDefault(); const [sx, sy] = rel(e, wrap); const box = document.createElement('div'); box.className = 'an cover drawing'; $('.ov', wrap).appendChild(box); let r = null;
      const mv = ev => { const [x, y] = rel(ev, wrap); r = { x: Math.max(0, Math.min(sx, x)), y: Math.max(0, Math.min(sy, y)), w: Math.abs(x - sx), h: Math.abs(y - sy) }; Object.assign(box.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }); };
      const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); box.remove(); if (r && r.w > .005 && r.h > .003) { snap(); const a = { id: uid(6), page: wrap.dataset.pg, type: 'cover', ...r }; doc.anns.push(a); cur = a.id; autosave(); drawAnns(); drawThumbs(); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', upf); return;
    }
    if (tool === 'text') {
      e.preventDefault(); const [x, y] = rel(e, wrap); snap(); const a = { id: uid(6), page: wrap.dataset.pg, type: 'text', x, y: y - 0.008, text: 'Texto', size: 10, color: '#112c43', bold: false };
      doc.anns.push(a); cur = a.id; editNow = true; tool = 'select'; $$('.tool[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === 'select')); pagesEl.dataset.tool = 'select'; autosave(); drawAnns(); return;
    }
    if (!an && cur) { cur = null; drawAnns(); }
  });
  pagesEl.addEventListener('dblclick', async e => {
    const wrap = e.target.closest('.pg'); if (!wrap || tool !== 'select') return;
    const an = e.target.closest('.an.text'); if (an) { cur = an.dataset.a; editNow = true; drawAnns(); return; }
    const pg = doc.pages.find(p => p.id === wrap.dataset.pg); const [x, y] = rel(e, wrap); const { items } = await pageItems(pg);
    const it = items.find(i => x >= i.x - .003 && x <= i.x + i.w + .003 && y >= i.y - .003 && y <= i.y + i.h + .003);
    if (!it) { toast('Nenhum texto reconhecido aqui. Use "Cobrir / apagar" e "Escrever".'); return; }
    snap(); doc.anns.push({ id: uid(6), page: pg.id, type: 'cover', soft: true, x: it.x - .002, y: it.y - it.h * .04, w: it.w + .006, h: it.h * 1.1 });
    const a = { id: uid(6), page: pg.id, type: 'text', x: it.x, y: it.y + it.h * .02, text: it.str, size: +it.size.toFixed(1), bold: it.bold, color: '#111111' }; doc.anns.push(a); cur = a.id; editNow = true; autosave(); drawAnns(); drawThumbs();
  });
  pagesEl.addEventListener('input', e => { const an = e.target.closest('.an.text'); if (!an) return; const a = doc.anns.find(x => x.id === an.dataset.a); a.text = e.target.innerText; dirty = true; markDirty(); autosave(); });
  pagesEl.addEventListener('focusin', e => { if (e.target.closest('.tx')) snap(); });
  const delCur = () => { if (!cur) return; snap(); doc.anns = doc.anns.filter(a => a.id !== cur); cur = null; autosave(); drawAnns(); drawThumbs(); };
  const onKey = e => {
    if (!document.body.contains(pagesEl)) return removeEventListener('keydown', onKey);
    const typing = e.target.closest?.('[contenteditable="plaintext-only"], input, textarea, select');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); $('#un').click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); $('#re').click(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && cur && !typing) { e.preventDefault(); delCur(); }
    else if (e.key === 'Escape') { cur = null; drawAnns(); }
  };
  addEventListener('keydown', onKey);
  $('#delSel').onclick = delCur;
  $('#un').onclick = () => { if (!undo.length) return toast('Nada para voltar'); redo.push(JSON.stringify({ pages: doc.pages, anns: doc.anns })); setState(undo.pop()); cur = null; autosave(); drawAll(); };
  $('#re').onclick = () => { if (!redo.length) return toast('Nada para refazer'); undo.push(JSON.stringify({ pages: doc.pages, anns: doc.anns })); setState(redo.pop()); cur = null; autosave(); drawAll(); };
  const setZoom = z => { zoom = Math.max(.5, Math.min(2.5, z)); $('#zv').textContent = Math.round(zoom * 100) + '%'; drawPages(); };
  $('#zi').onclick = () => setZoom(zoom + .25); $('#zo').onclick = () => setZoom(zoom - .25);
  $('#st').onchange = async e => { doc.status = e.target.value; log(doc, `Situação: ${STATUS[doc.status][0]} (${who()})`); await DB.put(doc); toast('Situação atualizada'); };
  $('#saveV').onclick = async () => { await save(`Versão salva com ${doc.anns.length} edições`); drawVers(); toast('Versão salva'); };
  $('#dl').onclick = async () => { const b = $('#dl'); b.disabled = true; b.textContent = 'Gerando…'; try { const bytes = await buildPdf(doc); download(bytes, docName(doc)); toast(`PDF pronto · ${kb(bytes.length)}`); } finally { b.disabled = false; b.textContent = '↓ Baixar PDF'; } };
  $('#light').onclick = async () => { const b = $('#light'); b.disabled = true; b.textContent = 'Reduzindo…'; try { const n = await buildPdf(doc), l = await buildPdf(doc, { light: true }); const best = l.length < n.length ? l : n; download(best, docName(doc).replace('.pdf', '-leve.pdf')); toast(l.length < n.length ? `De ${kb(n.length)} para ${kb(l.length)}` : `Este PDF já está leve (${kb(n.length)})`); } finally { b.disabled = false; b.textContent = 'Baixar versão leve'; } };
  $('#ins').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const bytes = new Uint8Array(await f.arrayBuffer()); const fid = uid(8); await DB.putFile(fid, bytes); const { text, pages } = await extractText(fid);
    snap(); doc.pages.push(...Array.from({ length: pages }, (_, i) => ({ id: uid(6), f: fid, i, rot: 0 }))); doc.text += '\n' + text; log(doc, `Inseridas ${pages} página(s) de ${f.name} (${who()})`); autosave(); drawAll(); toast(`${pages} página(s) inseridas no final`);
  };
  $('#split').onclick = async () => {
    if (!pickPages.size) return toast('Marque as páginas na coluna da esquerda');
    const pages = doc.pages.filter(p => pickPages.has(p.id)).map(p => ({ ...p, id: uid(6), _from: p.id })); const anns = doc.anns.filter(a => pickPages.has(a.page)).map(a => ({ ...a, id: uid(6), page: pages.find(p => p._from === a.page).id })); pages.forEach(p => delete p._from);
    const nd = newDoc({ fileName: `${doc.os ? 'OS ' + doc.os : doc.fileName} · páginas separadas.pdf`, fid: pages[0].f, pages: 0, text: doc.text, meta: { os: doc.os, tipo: doc.tipo, subtipo: doc.subtipo, cliente: doc.cliente, equipamento: doc.equipamento, tecnico: doc.tecnico, data: doc.data }, size: 0 });
    nd.pages = pages; nd.anns = anns; nd.origPages = clone(pages); nd.versions[0].pages = clone(pages); nd.versions[0].anns = clone(anns); nd.versions[0].note = `Separado de ${doc.os ? 'OS ' + doc.os : doc.fileName}`; log(nd, `Criado com ${pages.length} página(s) separadas por ${who()}`); await DB.put(nd);
    pickPages.clear(); toast(`Novo documento com ${pages.length} página(s)`); location.hash = '#/os/' + nd.id;
  };
  $('#orig').onclick = async () => { if (!(await confirmBox('Restaurar o original?', 'Tira todas as edições e volta às páginas como foram importadas. As versões anteriores continuam salvas.', 'Restaurar'))) return; snap(); doc.pages = clone(doc.origPages || doc.versions[0].pages); doc.anns = []; await save('Original restaurado'); drawAll(); };
  $('#rm').onclick = async () => { if (await confirmBox('Excluir documento?', 'Ele será apagado deste navegador.', 'Excluir')) { await DB.del(doc.id); location.hash = '#/'; } };
  $('#sign').onclick = () => sendToSign(doc);
  await drawAll();
  let rz; const onRz = () => { if (!document.body.contains(pagesEl)) return removeEventListener('resize', onRz); clearTimeout(rz); rz = setTimeout(drawPages, 250); }; addEventListener('resize', onRz);
}

/* ---------------- integração com o ECD Assina ---------------- */
async function sendToSign(doc) {
  const md = modal(`<div class="eyebrow">ECD Assina</div><h2>Enviar para assinatura</h2><p class="mut sm" style="margin:6px 0 14px">O PDF editado vai para o ECD Assina. Lá você marca onde cada pessoa assina e manda o link pelo WhatsApp.</p>
    <form id="fsg" class="grid"><div class="form2"><label class="f">Quem assina primeiro<input name="n1" value="${esc(doc.cliente || '')}" placeholder="Nome do cliente" required></label><label class="f">Papel<input name="r1" value="Cliente"></label></div>
    <div class="form2"><label class="f">Segunda pessoa (opcional)<input name="n2" value="${esc(doc.tecnico || '')}" placeholder="Ex.: técnico responsável"></label><label class="f">Papel<input name="r2" value="Técnico"></label></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Abrir no ECD Assina →</button></div></form>`);
  $('[data-x]', md).onclick = closeModal;
  $('#fsg').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#fsg button.primary').disabled = true; $('#fsg button.primary').textContent = 'Preparando…';
    const bytes = await buildPdf(doc); const adb = await openDB('ecd-assina', 1, d => { d.createObjectStore('docs', { keyPath: 'id' }); d.createObjectStore('files', { keyPath: 'id' }); });
    const COL = ['#c8952e', '#2f6fb0']; const signers = [[f.n1.value, f.r1.value], [f.n2.value, f.r2.value]].filter(([n]) => n.trim()).map(([n, r], i) => ({ id: uid(6), token: uid(16), name: n.trim(), role: r.trim(), phone: '', color: COL[i] }));
    const id = uid(8); const title = doc.os ? `OS ${doc.os} · ${doc.cliente || doc.tipo}` : doc.fileName.replace(/\.pdf$/i, '');
    const adoc = { id, title, fileName: docName(doc), kind: 'upload', createdAt: Date.now(), draft: true, sequential: true, fields: [], signers, hash: await sha256(bytes), events: [{ at: Date.now(), text: `Recebido do ECD PDF (${who()})` }] };
    await tx('files', 'readwrite', s => s.put({ id, pdf: bytes }), Promise.resolve(adb)); await tx('docs', 'readwrite', s => s.put(adoc), Promise.resolve(adb));
    doc.status = 'assinatura'; log(doc, `Enviado para assinatura no ECD Assina (${who()})`); await DB.put(doc);
    location.href = `../ecd-assina/#/editar/${id}`;
  };
}

/* ---------------- exemplos fictícios ---------------- */
async function makeOS(o) {
  const pdf = await PDFDocument.create(); const Fn = await pdf.embedFont(StandardFonts.Helvetica), Bd = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, L = 40, R = W - 40; const ink = rgb(.1, .1, .1), mut = rgb(.4, .4, .4), line = rgb(.7, .7, .7), band = rgb(.92, .92, .92), blue = rgb(.12, .23, .38);
  const T = s => winSafe(s); let page, y;
  const head = (n, tot) => {
    page = pdf.addPage([W, H]); page.drawRectangle({ x: L, y: H - 92, width: R - L, height: 56, borderColor: ink, borderWidth: 1 });
    page.drawText('EXEMPLO', { x: L + 12, y: H - 66, size: 20, font: Bd, color: blue }); page.drawText(T('Serviços Técnicos'), { x: L + 12, y: H - 80, size: 8, font: Fn, color: mut });
    page.drawText(T(`ORDEM DE SERVIÇO - ${o.tipo.toUpperCase()} ${o.sistema.toUpperCase()}`), { x: L + 150, y: H - 62, size: 11, font: Bd, color: ink });
    page.drawText(T(`Nº ${o.os}`), { x: R - 80, y: H - 62, size: 12, font: Bd, color: ink }); page.drawText(T(`Página ${n} de ${tot}`), { x: L + 150, y: H - 80, size: 8, font: Fn, color: mut }); y = H - 116;
  };
  const sec = t => { page.drawRectangle({ x: L, y: y - 4, width: R - L, height: 16, color: band, borderColor: line, borderWidth: .5 }); page.drawText(T(t), { x: L + (R - L) / 2 - Bd.widthOfTextAtSize(T(t), 9) / 2, y, size: 9, font: Bd, color: ink }); y -= 20; };
  const row = (pairs) => { const cw = (R - L) / pairs.length; pairs.forEach(([k, v], i) => { const x = L + i * cw; page.drawRectangle({ x, y: y - 5, width: cw, height: 17, borderColor: line, borderWidth: .5 }); page.drawText(T(k + ':'), { x: x + 4, y, size: 7.5, font: Bd, color: mut }); page.drawText(T(v), { x: x + 6 + Bd.widthOfTextAtSize(T(k + ':'), 7.5), y, size: 8.5, font: Fn, color: ink }); }); y -= 17; };
  const tot = o.extra ? 2 : 1; head(1, tot);
  sec('DADOS DO CLIENTE'); row([['Cliente', o.cliente]]); row([['Endereço', o.endereco], ['Cidade', o.cidade]]); row([['Contato', o.contato], ['Data', o.data]]); y -= 8;
  sec('DADOS DO EQUIPAMENTO'); row([['Equipamento', o.equip]]); row([['Modelo', o.modelo], ['Nº de série', o.serie]]); row([['Horímetro', o.horas], ['Combustível', o.comb]]); y -= 8;
  sec('VERIFICAÇÕES'); const cols = [['Item', 220], ['Situação', 70], ['Observação', R - L - 290]];
  let x = L; cols.forEach(([t, w]) => { page.drawRectangle({ x, y: y - 5, width: w, height: 16, color: band, borderColor: line, borderWidth: .5 }); page.drawText(T(t), { x: x + 4, y, size: 8, font: Bd, color: ink }); x += w; }); y -= 16;
  o.checks.forEach(([it, st, ob]) => { x = L; [it, st, ob].forEach((v, k) => { page.drawRectangle({ x, y: y - 5, width: cols[k][1], height: 16, borderColor: line, borderWidth: .5 }); page.drawText(T(v), { x: x + 4, y, size: 8, font: k === 1 ? Bd : Fn, color: k === 1 && st === 'NOK' ? rgb(.75, .15, .1) : ink }); x += cols[k][1]; }); y -= 16; });
  y -= 10; sec('SERVIÇOS EXECUTADOS'); o.servicos.forEach(s => { page.drawText(T('• ' + s), { x: L + 6, y, size: 8.5, font: Fn, color: ink }); y -= 13; });
  if (o.extra) { head(2, 2); sec('PEÇAS UTILIZADAS'); o.extra.forEach(([p, q]) => row([['Peça', p], ['Qtd.', q]])); y -= 8; }
  y -= 14; sec('RESPONSÁVEIS'); row([['Técnico responsável', o.tecnico], ['Data de execução', o.data]]); y -= 46;
  [[L + 20, 'Técnico'], [W / 2 + 20, 'Cliente']].forEach(([lx, t]) => { page.drawLine({ start: { x: lx, y }, end: { x: lx + 200, y }, thickness: .8, color: ink }); page.drawText(T('Assinatura ' + t.toLowerCase()), { x: lx + 60, y: y - 12, size: 8, font: Fn, color: mut }); });
  page.drawText(T('Documento fictício para demonstração · ECD PDF'), { x: L, y: 26, size: 7, font: Fn, color: mut });
  return pdf.save();
}
async function seed() {
  const base = { endereco: 'Rua Exemplo, 100', cidade: 'Barueri/SP', contato: '(11) 4000-0000', comb: 'Diesel', sistema: 'Sistema diesel' };
  const ck = (nok) => [['Nível de óleo do motor', 'OK', ''], ['Nível do líquido de arrefecimento', 'OK', ''], ['Baterias e terminais', nok ? 'NOK' : 'OK', nok ? 'Terminal oxidado, limpeza realizada' : ''], ['Filtro de ar', 'OK', ''], ['Correias', 'OK', ''], ['Painel de comando', 'OK', 'Sem alarmes'], ['Teste em carga (15 min)', 'OK', 'Tensão e frequência estáveis']];
  const list = [
    { os: '1043', tipo: 'Preventiva', cliente: 'Mercado Bom Preço Ltda', equip: 'Gerador 150 kVA', modelo: 'GX-150', serie: 'GX150-2291', horas: '1.284 h', data: '04/11/2026', tecnico: 'Joao Silva', checks: ck(false), servicos: ['Inspeção geral do grupo gerador', 'Troca do óleo do motor e filtro', 'Teste em carga com banco resistivo'], status: 'revisada' },
    { os: '1044', tipo: 'Corretiva', cliente: 'Clínica Vida Plena', equip: 'Gerador 80 kVA', modelo: 'GX-80', serie: 'GX80-1170', horas: '3.410 h', data: '06/11/2026', tecnico: 'Joao Silva', checks: ck(true), servicos: ['Diagnóstico de falha na partida', 'Substituição do motor de arranque', 'Limpeza dos terminais da bateria'], extra: [['Motor de arranque 24V', '1'], ['Terminal de bateria', '2']], status: 'pendente' },
    { os: '1045', tipo: 'Preventiva', cliente: 'Condomínio Parque das Flores', equip: 'Gerador 260 kVA', modelo: 'GX-260', serie: 'GX260-0811', horas: '902 h', data: '10/11/2026', tecnico: 'Marcos Lima', checks: ck(false), servicos: ['Inspeção geral', 'Teste de transferência automática (QTA)'], status: 'enviada' },
    { os: '1046', tipo: 'Instalação', cliente: 'Indústria Metalúrgica Alfa', equip: 'Gerador 500 kVA', modelo: 'GX-500', serie: 'GX500-0032', horas: '12 h', data: '12/11/2026', tecnico: 'Joao Silva', checks: ck(false), servicos: ['Posicionamento e nivelamento', 'Interligação com QTA', 'Start-up e treinamento do operador'], status: 'pendente' },
    { os: '1047', tipo: 'Preventiva', cliente: 'Hotel Estrada Real', equip: 'Gerador 150 kVA', modelo: 'GX-150', serie: 'GX150-3302', horas: '2.010 h', data: '14/11/2026', tecnico: 'Ana Rocha', checks: ck(false), servicos: ['Inspeção geral', 'Troca de filtros de combustível'], status: 'pendente' },
    { os: '1048', tipo: 'Corretiva', cliente: 'Escola Aprender Mais', equip: 'Gerador 55 kVA', modelo: 'GX-55', serie: 'GX55-0457', horas: '4.122 h', data: '17/11/2026', tecnico: 'Marcos Lima', checks: ck(true), servicos: ['Correção de vazamento de óleo', 'Troca da junta do cárter'], extra: [['Junta do cárter', '1'], ['Óleo 15W40 (L)', '8']], status: 'pendente' },
  ];
  for (const o of list) {
    const bytes = await makeOS({ ...base, ...o }); const fid = uid(8); await DB.putFile(fid, bytes); const { text, pages } = await extractText(fid);
    const when = new Date(o.data.split('/').reverse().join('-') + 'T17:00').getTime();
    const doc = newDoc({ fileName: `OS_${o.os}.pdf`, fid, pages, text, meta: parseOS(text, `OS_${o.os}.pdf`), size: bytes.length, when }); doc.versions[0].by = 'Importação'; doc.status = o.status;
    log(doc, 'Importado (exemplo)', when); if (o.status !== 'pendente') log(doc, `Situação: ${STATUS[o.status][0]}`, when + 36e5); await DB.put(doc);
  }
  try { localStorage.setItem('ecd-pdf-seeded', '1'); } catch {}
}

/* ---------------- roteador ---------------- */
async function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  if (!guard(h[0])) return;
  $$('.top nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === h[0]));
  $('#modal').hidden = true; window.scrollTo(0, 0); document.body.classList.toggle('wide', h[0] === 'os');
  try {
    if (authRoute(h[0])) return;
    if (!h[0]) await Lista();
    else if (h[0] === 'os') await Editor(h[1]);
    else view().innerHTML = '<div class="card pad"><h2>Página não encontrada</h2><a class="btn" href="#/">Voltar</a></div>';
  } catch (e) { console.error(e); view().innerHTML = `<div class="card pad"><h2>Algo deu errado</h2><p class="mut">${esc(e.message || e)}</p><a class="btn" href="#/">Voltar</a></div>`; }
}
$('#importTop').onchange = e => { if (me()) importFiles(e.target.files); e.target.value = ''; };
$('#resetDemo').onclick = async () => { if (!(await confirmBox('Restaurar exemplos?', 'Apaga os documentos deste navegador e recoloca as ordens de serviço de exemplo.', 'Restaurar'))) return; busy('Restaurando…'); pdfCache.clear(); textCache.clear(); await DB.clear(); await seed(); location.hash = '#/'; route(); };
window.addEventListener('hashchange', route);
(async () => {
  let seeded = false; try { seeded = localStorage.getItem('ecd-pdf-seeded') === '1'; } catch {}
  if (!seeded || !(await DB.all()).length) { busy('Preparando os exemplos…'); await DB.clear(); await seed(); }
  route();
})();
