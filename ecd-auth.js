// ECD Auth — cadastro com convite, login por código e configurações da empresa.
// Módulo compartilhado pelos sistemas da ECD Tecnologia (mesmo login em todos).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rid = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const initials = n => (n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const fmtD = t => t ? new Date(t).toLocaleDateString('pt-BR') : '';
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 30);
function toast(msg) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2600); }

const LS = {
  get(k, d) { try { const v = localStorage.getItem('ecd-auth-' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ecd-auth-' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('ecd-auth-' + k); } catch {} },
};
export const DEMO_EMAIL = 'demo@ecdtecnologia.com.br';
const defaultConfig = () => ({
  empresa: 'Construtora Exemplo Ltda', dominio: '', demo: true,
  setores: ['Administrativo', 'Almoxarifado', 'Manutenção', 'Obras', 'RH', 'Segurança do Trabalho'],
  extras: [{ id: 'matricula', label: 'Matrícula', type: 'text', required: false, options: [] }],
});
export const getConfig = () => ({ ...defaultConfig(), ...(LS.get('config', null) || {}) });
export const OWNER_EMAIL = 'eduardoduartecostaduarte@gmail.com';
const OWNER = () => ({ id: 'owner', nome: 'Eduardo Costa Duarte', email: OWNER_EMAIL, setor: 'Administrativo', extras: {}, role: 'admin', owner: true, createdAt: Date.now(), verifiedAt: Date.now() });
export const getUsers = () => {
  let u = LS.get('users', null);
  if (!u) u = [{ id: 'demo', nome: 'Usuário Demonstração', email: DEMO_EMAIL, setor: 'Segurança do Trabalho', extras: { matricula: '0001' }, role: 'admin', createdAt: Date.now(), verifiedAt: Date.now() }];
  let o = u.find(x => x.email === OWNER_EMAIL);
  if (!o) { u.unshift(OWNER()); LS.set('users', u); }
  else if (!o.owner || o.role !== 'admin' || o.blocked) { o.owner = true; o.role = 'admin'; o.blocked = false; LS.set('users', u); }
  else if (!LS.get('users', null)) LS.set('users', u);
  return u;
};
const getInvites = () => LS.get('invites', []);
export const me = () => { const s = LS.get('session', null); if (!s || Date.now() - s.at > 7 * 864e5) return null; return getUsers().find(u => u.id === s.userId) || null; };
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(ECD)?(.{4})(.{4})$/, 'ECD-$2-$3');
function inviteStatus(iv) {
  if (iv.revoked) return ['Cancelado', 'b-mut'];
  if (iv.exp && Date.now() > iv.exp) return ['Expirado', 'b-mut'];
  if (iv.max && iv.uses >= iv.max) return ['Usado', 'b-ok'];
  return ['Ativo', 'b-info'];
}
function checkInvite(code, email) {
  const iv = getInvites().find(i => i.code === normCode(code));
  if (!iv) return 'Código de convite não encontrado. Peça um convite ao administrador da sua empresa.';
  const [st] = inviteStatus(iv);
  if (st !== 'Ativo') return `Este convite ${({ Cancelado: 'foi cancelado', Expirado: 'expirou', Usado: 'já foi usado' })[st]}. Peça um novo ao administrador.`;
  if (iv.email && iv.email !== email) return `Este convite foi criado para ${iv.email}. Use esse e-mail ou peça outro convite.`;
  return null;
}
function newCode(email, purpose, data) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
  LS.set('pending', { email, purpose, data, code, exp: Date.now() + 10 * 6e4, tries: 0, sentAt: Date.now() }); return code;
}
function login(u) { LS.set('session', { userId: u.id, at: Date.now() }); LS.del('pending'); paintUser(); }

let APP = { name: 'ECD', tagline: '', bullets: [], home: '#/' };
// Tema preto e branco (vale para todos os sistemas ECD neste navegador)
export const isPB = () => LS.get('theme', 'cor') === 'pb';
export function applyTheme() { document.documentElement.dataset.theme = isPB() ? 'pb' : 'cor'; document.dispatchEvent(new Event('ecd-theme')); }
export function toggleTheme() { LS.set('theme', isPB() ? 'cor' : 'pb'); applyTheme(); paintUser(); }
applyTheme();
window.__ecdTheme = () => { toggleTheme(); location.reload(); };
export function configureAuth(opts) { APP = { ...APP, ...opts }; }

export function paintUser() {
  const u = me(); const nav = $('.top nav'); if (!nav) return;
  $('#userBox')?.remove();
  nav.style.display = u ? '' : 'none';
  if (!u) return;
  const box = document.createElement('div'); box.id = 'userBox'; box.className = 'userbox';
  box.innerHTML = `<button class="uchip" id="uBtn"><span class="av" style="background:#c8952e;border-color:#2a2213">${initials(u.nome)}</span><span class="un">${esc(u.nome.split(' ')[0])}</span></button>
    <div class="umenu" hidden><div class="uhead"><b>${esc(u.nome)}</b><span>${esc(u.email)}</span><span>${esc(u.setor)}${u.owner ? ' · Dono (acesso total)' : u.role === 'admin' ? ' · Administrador' : ''}</span></div>${u.role === 'admin' ? '<a href="#/config">⚙️ Empresa, cadastro e convites</a>' : ''}${(APP.links || []).map(l => `<a href="${l.href}">${l.text}</a>`).join('')}<button id="themeBtn">◐ Preto e branco: ${isPB() ? 'ligado' : 'desligado'}</button><button id="logout">Sair</button></div>`;
  nav.appendChild(box);
  const m = $('.umenu', box); $('#uBtn').onclick = e => { e.stopPropagation(); m.hidden = !m.hidden; if (!m.hidden) document.addEventListener('click', () => m.hidden = true, { once: true }); };
  $('#logout').onclick = () => { LS.del('session'); paintUser(); location.hash = '#/entrar'; };
  $('#themeBtn').onclick = e => { e.stopPropagation(); toggleTheme(); toast(isPB() ? 'Preto e branco ligado' : 'Cores ligadas'); };
}
const shell = inner => `<div class="auth"><div class="auth-side"><img src="logo.jpg" alt=""><h2>${esc(APP.tagline)}</h2><ul>${APP.bullets.map(b => `<li>${esc(b)}</li>`).join('')}<li>Acesso só para clientes convidados</li></ul><small>${esc(getConfig().empresa)} · ${esc(APP.name)} · <button class="link" style="color:inherit" onclick="window.__ecdTheme()">◐ ${isPB() ? 'Cores' : 'Preto e branco'}</button></small></div><div class="auth-main card">${inner}</div></div>`;
const view = () => $('#view');

export function Entrar(msg = '') {
  const cfg = getConfig();
  view().innerHTML = shell(`
    <div class="eyebrow">Entrar</div><h1>Acesse sua conta</h1><p class="mut" style="margin:6px 0 22px">Digite seu e-mail. Vamos enviar um código de 6 números para confirmar que é você.</p>
    ${msg ? `<div class="tip" style="margin-bottom:14px">${msg}</div>` : ''}
    <form id="fl" class="grid"><label class="f">E-mail<input name="email" type="email" autocomplete="email" placeholder="voce@empresa.com.br" required></label>
      <button class="btn primary">Enviar código</button></form>
    <p class="sm" style="margin:18px 0 0">Recebeu um convite? <a href="#/cadastro"><b>Criar conta com o código de convite</b></a></p>
    ${cfg.demo ? `<div class="or"><span>ou</span></div><button class="btn" id="demo" style="width:100%">Ver a demonstração (dados fictícios)</button>` : ''}`);
  $('#fl').onsubmit = e => {
    e.preventDefault(); const email = normEmail(e.target.email.value);
    const u = getUsers().find(x => x.email === email);
    if (!u) return Entrar(`O e-mail <b>${esc(email)}</b> não tem acesso. O cadastro é só para clientes: peça um convite ao administrador e use <a href="#/cadastro"><b>Criar conta</b></a>.`);
    if (u.blocked) return Entrar('Seu acesso está bloqueado. Fale com o administrador da sua empresa.');
    newCode(email, 'login'); location.hash = '#/codigo';
  };
  const d = $('#demo'); if (d) d.onclick = () => { login(getUsers().find(u => u.email === DEMO_EMAIL) || getUsers()[0]); location.hash = APP.home; };
}
function extraInput(f, v = '') {
  const req = f.required ? 'required' : '';
  if (f.type === 'select') return `<label class="f">${esc(f.label)}${f.required ? ' *' : ''}<select name="x_${f.id}" ${req}><option value="">Selecione</option>${(f.options || []).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  const t = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'phone' ? 'tel' : 'text';
  return `<label class="f">${esc(f.label)}${f.required ? ' *' : ''}<input name="x_${f.id}" type="${t}" value="${esc(v)}" ${req} ${f.type === 'cpf' ? 'inputmode="numeric" placeholder="000.000.000-00"' : ''}></label>`;
}
export function Cadastro() {
  const cfg = getConfig(); const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const pre = qs.get('email') || '', inv = qs.get('convite') || '';
  view().innerHTML = shell(`
    <div class="eyebrow">Cadastro de cliente</div><h1>Crie sua conta</h1><p class="mut" style="margin:6px 0 22px">O acesso é só para clientes. Use o código de convite que você recebeu e confirme o e-mail com um código.</p>
    <form id="fc" class="grid">
      <label class="f">Código de convite *<input name="convite" value="${esc(inv)}" placeholder="ECD-XXXX-XXXX" required style="font:700 16px 'DejaVu Sans Mono',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase"></label>
      <label class="f">Nome completo *<input name="nome" autocomplete="name" required></label>
      <div class="form2"><label class="f">Setor *<select name="setor" required><option value="">Selecione</option>${cfg.setores.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label class="f">E-mail *<input name="email" type="email" autocomplete="email" value="${esc(pre)}" placeholder="${cfg.dominio ? 'voce@' + esc(cfg.dominio) : 'voce@empresa.com.br'}" required></label></div>
      ${cfg.extras.length ? `<div class="form2">${cfg.extras.map(f => extraInput(f)).join('')}</div>` : ''}
      <label class="row sm" style="gap:8px;align-items:flex-start"><input type="checkbox" required style="margin-top:3px"> Concordo com o uso dos meus dados para acesso ao sistema e registro das minhas ações (LGPD).</label>
      <div id="err" class="sm" style="color:var(--bad)"></div>
      <button class="btn primary">Criar conta e receber código</button></form>
    <p class="sm" style="margin:18px 0 0">Já tem conta? <a href="#/entrar"><b>Entrar</b></a></p>`);
  $('#fc').onsubmit = e => {
    e.preventDefault(); const f = e.target; const email = normEmail(f.email.value);
    const err = t => $('#err').textContent = t;
    if (!validEmail(email)) return err('Confira o e-mail.');
    const ie = checkInvite(f.convite.value, email); if (ie) return err(ie);
    if (cfg.dominio && !email.endsWith('@' + cfg.dominio.replace(/^@/, '').toLowerCase())) return err(`Use seu e-mail da empresa (@${cfg.dominio.replace(/^@/, '')}).`);
    if (getUsers().some(u => u.email === email)) return err('Este e-mail já tem cadastro. Use "Entrar".');
    const extras = {}; for (const x of cfg.extras) { const v = (f['x_' + x.id]?.value || '').trim(); if (x.type === 'cpf' && v && v.replace(/\D/g, '').length !== 11) return err(`${x.label}: CPF incompleto.`); extras[x.id] = v; }
    newCode(email, 'signup', { nome: f.nome.value.trim(), setor: f.setor.value, email, extras, convite: normCode(f.convite.value) });
    location.hash = '#/codigo';
  };
  $$('#fc input[inputmode=numeric]').forEach(i => i.oninput = () => { const d = i.value.replace(/\D/g, '').slice(0, 11); i.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });
}
export function Codigo() {
  const p = LS.get('pending', null); if (!p) { location.hash = '#/entrar'; return; }
  const nome = p.purpose === 'signup' ? p.data.nome.split(' ')[0] : (getUsers().find(u => u.email === p.email)?.nome.split(' ')[0] || '');
  view().innerHTML = shell(`
    <div class="eyebrow">Confirmação</div><h1>Digite o código</h1><p class="mut" style="margin:6px 0 22px">Enviamos um código de 6 números para <b style="color:var(--ink)">${esc(p.email)}</b>. Ele vale por 10 minutos.</p>
    <form id="fk"><div class="otp">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Dígito ${i + 1}">`).join('')}</div>
      <div id="err" class="sm" style="color:var(--bad);min-height:20px;margin:10px 0"></div>
      <button class="btn primary" style="width:100%" id="ok" disabled>Confirmar</button></form>
    <div class="row between sm" style="margin-top:14px"><a href="#/entrar">← Usar outro e-mail</a><button class="link" id="resend"></button></div>
    <div class="mail"><div class="mail-tag">📧 Caixa de entrada (demonstração)</div>
      <div class="mail-h"><b>${esc(APP.name)}</b> &lt;nao-responda@ecdtecnologia.com.br&gt;<br><span>Para: ${esc(p.email)}</span></div>
      <div class="mail-s">Seu código de acesso: ${p.code}</div>
      <div class="mail-b">Olá${nome ? ', ' + esc(nome) : ''}! Use o código abaixo para ${p.purpose === 'signup' ? 'confirmar seu cadastro' : 'entrar'} no ${esc(APP.name)} da ${esc(getConfig().empresa)}.<div class="mail-code">${p.code.split('').join(' ')}</div>Se não foi você, ignore este e-mail.</div>
      <div class="mail-note">Na versão para empresas este e-mail chega de verdade na caixa de entrada. Aqui ele aparece na tela para você testar.</div></div>`);
  const ins = $$('.otp input'); const val = () => ins.map(i => i.value).join('');
  ins.forEach((i, k) => {
    i.oninput = () => { i.value = i.value.replace(/\D/g, '').slice(-1); if (i.value && ins[k + 1]) ins[k + 1].focus(); $('#ok').disabled = val().length !== 6; if (val().length === 6) $('#fk').requestSubmit(); };
    i.onkeydown = e => { if (e.key === 'Backspace' && !i.value && ins[k - 1]) ins[k - 1].focus(); };
    i.onpaste = e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!d) return; e.preventDefault(); d.split('').forEach((c, j) => ins[j] && (ins[j].value = c)); $('#ok').disabled = d.length !== 6; if (d.length === 6) $('#fk').requestSubmit(); };
  });
  setTimeout(() => ins[0].focus(), 50);
  $('#fk').onsubmit = e => {
    e.preventDefault(); const q = LS.get('pending', null); if (!q) return location.hash = '#/entrar';
    const err = t => { $('#err').textContent = t; ins.forEach(i => i.value = ''); ins[0].focus(); $('#ok').disabled = true; };
    if (Date.now() > q.exp) return err('O código expirou. Peça um novo.');
    if (q.tries >= 5) return err('Muitas tentativas. Peça um novo código.');
    if (val() !== q.code) { q.tries++; LS.set('pending', q); return err(`Código incorreto. Restam ${5 - q.tries} tentativas.`); }
    let u;
    if (q.purpose === 'signup') {
      const ie = checkInvite(q.data.convite, q.email); if (ie) return err(ie);
      const invites = getInvites(); const iv = invites.find(i => i.code === q.data.convite); iv.uses = (iv.uses || 0) + 1; (iv.usedBy ||= []).push(q.email); LS.set('invites', invites);
      const users = getUsers(); u = { id: rid(8), ...q.data, role: iv.role || 'user', createdAt: Date.now(), verifiedAt: Date.now() }; users.push(u); LS.set('users', users);
    } else u = getUsers().find(x => x.email === q.email);
    login(u); location.hash = APP.home; setTimeout(() => toast(q.purpose === 'signup' ? `Conta criada! Bem-vindo(a), ${u.nome.split(' ')[0]}.` : `Olá, ${u.nome.split(' ')[0]}!`), 300);
  };
  const rb = $('#resend'); const tick = () => { const s = Math.ceil((p.sentAt + 30e3 - Date.now()) / 1000); if (!document.body.contains(rb)) return; if (s > 0) { rb.textContent = `Reenviar em ${s}s`; rb.disabled = true; setTimeout(tick, 1000); } else { rb.textContent = 'Reenviar código'; rb.disabled = false; } }; tick();
  rb.onclick = () => { newCode(p.email, p.purpose, p.data); Codigo(); toast('Novo código enviado'); };
}
export function Config() {
  const u = me(); if (!u || u.role !== 'admin') { view().innerHTML = '<div class="card pad"><h2>Só administradores</h2><a class="btn" href="#/">Voltar</a></div>'; return; }
  const cfg = getConfig(); const users = getUsers(); const invites = getInvites();
  const TYPES = { text: 'Texto', number: 'Número', date: 'Data', phone: 'Telefone', cpf: 'CPF', select: 'Lista de opções' };
  const base = `${location.origin}${location.pathname}`;
  const invLink = iv => `${base}#/cadastro?convite=${iv.code}${iv.email ? '&email=' + encodeURIComponent(iv.email) : ''}`;
  const draw = () => {
    view().innerHTML = `
    <div class="head"><div><div class="eyebrow">Configurações</div><h1>Empresa, cadastro e convites</h1><p class="mut" style="margin:6px 0 0">Só entra quem recebeu um convite. Defina também o que cada pessoa preenche ao criar a conta.</p></div><a class="btn" href="${APP.home}">← Voltar</a></div>
    <div class="detail">
      <div class="grid">
        <div class="card pad grid"><div class="row between"><h2>Convites de acesso</h2><span class="mut sm">${invites.filter(i => inviteStatus(i)[0] === 'Ativo').length} ativos</span></div>
          <p class="mut sm" style="margin:-6px 0 0">Gere um convite para cada cliente. Sem convite válido ninguém consegue se cadastrar.</p>
          <form id="fi" class="form3" style="align-items:end"><label class="f">E-mail do cliente (opcional)<input name="email" type="email" placeholder="Deixe vazio para qualquer e-mail"></label>
            <label class="f">Vale por<select name="dias"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="0">Sem prazo</option></select></label>
            <label class="f">Usos<select name="max"><option value="1">1 pessoa</option><option value="5" selected>Até 5 pessoas</option><option value="20">Até 20 pessoas</option><option value="0">Ilimitado</option></select></label>
            <label class="f">Perfil<select name="role"><option value="user">Usuário</option><option value="admin">Administrador</option></select></label>
            <button class="btn primary">Gerar convite</button></form>
          ${invites.length ? `<table class="list"><thead><tr><th>Código</th><th>Para</th><th>Situação</th><th></th></tr></thead><tbody>${invites.slice().reverse().map(iv => { const [st, c] = inviteStatus(iv); return `<tr style="cursor:default"><td class="doc-t"><span style="font-family:'DejaVu Sans Mono',monospace">${iv.code}</span><small>${iv.max ? `${iv.uses || 0}/${iv.max} usos` : `${iv.uses || 0} usos`} · ${iv.exp ? 'até ' + fmtD(iv.exp) : 'sem prazo'}${iv.role === 'admin' ? ' · administrador' : ''}</small></td><td class="sm">${esc(iv.email || 'Qualquer e-mail')}</td><td><span class="badge ${c}">${st}</span></td><td style="text-align:right;white-space:nowrap">${st === 'Ativo' ? `<a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Olá! Seu acesso ao ${APP.name} da ${cfg.empresa} está liberado.\nCrie sua conta pelo link: ${invLink(iv)}\nCódigo de convite: ${iv.code}`)}">WhatsApp</a> <button class="btn sm" data-cp="${iv.code}">Copiar link</button> <button class="link sm" data-rv="${iv.code}">Cancelar</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : ''}
        </div>
        <div class="card pad grid"><h2>Empresa</h2>
          <div class="form2"><label class="f">Nome da empresa<input id="cEmp" value="${esc(cfg.empresa)}"></label>
          <label class="f">Aceitar só e-mails do domínio (opcional)<input id="cDom" value="${esc(cfg.dominio)}" placeholder="empresa.com.br"></label></div>
          <label class="row sm" style="gap:8px"><input type="checkbox" id="cDemo" ${cfg.demo ? 'checked' : ''}> Mostrar o botão "Ver a demonstração" na tela de entrada</label></div>
        <div class="card pad grid"><h2>Setores</h2>
          <div class="row">${cfg.setores.map((s, i) => `<span class="tagx">${esc(s)}<button data-rs="${i}" title="Remover">✕</button></span>`).join('')}</div>
          <form id="fs" class="row"><input class="search" name="s" placeholder="Novo setor (ex.: Financeiro)" required><button class="btn sm">+ Adicionar</button></form></div>
        <div class="card pad grid"><div><h2>Campos extras do cadastro</h2><p class="mut sm" style="margin:4px 0 0">Nome, setor e e-mail são pedidos sempre. Aqui você inclui o que mais a empresa precisa.</p></div>
          <table class="items"><thead><tr><th>Campo</th><th>Tipo</th><th>Opções (para lista)</th><th>Obrigatório</th><th></th></tr></thead><tbody>
          ${cfg.extras.map((f, i) => `<tr data-i="${i}"><td><input data-k="label" value="${esc(f.label)}"></td><td><select data-k="type" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td><input data-k="options" value="${esc((f.options || []).join(', '))}" placeholder="Separe por vírgula" ${f.type === 'select' ? '' : 'disabled'}></td><td style="text-align:center"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}></td><td><button class="link" data-rf="${i}">✕</button></td></tr>`).join('')}
          </tbody></table>
          <form id="ff" class="row"><input class="search" name="l" placeholder="Novo campo (ex.: Unidade)"><button class="btn sm">+ Adicionar campo</button>${['CPF', 'Telefone', 'Cargo', 'Unidade / obra', 'Data de admissão'].filter(n => !cfg.extras.some(f => f.label === n)).map(n => `<button type="button" class="chipbtn" data-q="${n}">+ ${n}</button>`).join('')}</form></div>
        <div class="card" style="overflow:hidden"><div class="pad" style="padding-bottom:6px"><h2>Pessoas com acesso (${users.length})</h2></div>
          <table class="list"><thead><tr><th>Nome</th><th>Setor</th><th class="hide-m">E-mail</th><th>Perfil</th></tr></thead><tbody>
          ${users.map(x => `<tr style="cursor:default"><td class="doc-t">${esc(x.nome)}<small>${cfg.extras.map(f => x.extras?.[f.id] ? `${esc(f.label)}: ${esc(x.extras[f.id])}` : '').filter(Boolean).join(' · ') || 'Desde ' + fmtD(x.createdAt)}${x.convite ? ' · convite ' + x.convite : ''}</small></td><td>${esc(x.setor)}</td><td class="hide-m sm">${esc(x.email)}</td><td>${x.owner ? '<span class="badge b-ok">Dono · acesso total</span>' : ''}<select data-role="${x.id}" ${x.id === u.id || x.owner ? 'disabled hidden' : ''} style="border:1px solid var(--line);border-radius:8px;padding:5px"><option value="user" ${x.role !== 'admin' && !x.blocked ? 'selected' : ''}>Usuário</option><option value="admin" ${x.role === 'admin' && !x.blocked ? 'selected' : ''}>Administrador</option><option value="blocked" ${x.blocked ? 'selected' : ''}>Bloqueado</option></select></td></tr>`).join('')}
          </tbody></table></div>
      </div>
      <aside class="grid" style="position:sticky;top:84px"><div class="card pad"><div class="eyebrow">Prévia</div><h3 style="margin-bottom:12px">Tela de cadastro</h3>
        <div class="grid" style="pointer-events:none;opacity:.95"><label class="f">Código de convite *<input placeholder="ECD-XXXX-XXXX"></label><label class="f">Nome completo *<input></label><label class="f">Setor *<select><option>${esc(cfg.setores[0] || '')}</option></select></label><label class="f">E-mail *<input placeholder="${cfg.dominio ? 'voce@' + esc(cfg.dominio) : 'voce@empresa.com.br'}"></label>${cfg.extras.map(f => extraInput(f)).join('')}</div></div></aside>
    </div>`;
    const save = (redraw = false) => { LS.set('config', cfg); if (redraw) draw(); };
    $('#cEmp').oninput = e => { cfg.empresa = e.target.value; save(); };
    $('#cDom').onchange = e => { cfg.dominio = e.target.value.trim().replace(/^@/, '').toLowerCase(); save(true); };
    $('#cDemo').onchange = e => { cfg.demo = e.target.checked; save(); };
    $('#fi').onsubmit = e => {
      e.preventDefault(); const f = e.target; const em = normEmail(f.email.value); if (em && !validEmail(em)) return toast('Confira o e-mail');
      const iv = { code: `ECD-${rid(4)}-${rid(4)}`, email: em, exp: +f.dias.value ? Date.now() + +f.dias.value * 864e5 : 0, max: +f.max.value, uses: 0, role: f.role.value, createdAt: Date.now(), createdBy: u.nome };
      invites.push(iv); LS.set('invites', invites); draw(); toast(`Convite ${iv.code} criado`);
    };
    $$('[data-cp]').forEach(b => b.onclick = async () => { const iv = invites.find(i => i.code === b.dataset.cp); try { await navigator.clipboard.writeText(invLink(iv)); toast('Link do convite copiado'); } catch { toast(invLink(iv)); } });
    $$('[data-rv]').forEach(b => b.onclick = () => { invites.find(i => i.code === b.dataset.rv).revoked = Date.now(); LS.set('invites', invites); draw(); });
    $('#fs').onsubmit = e => { e.preventDefault(); const v = e.target.s.value.trim(); if (v && !cfg.setores.includes(v)) { cfg.setores.push(v); cfg.setores.sort((a, b) => a.localeCompare(b)); } save(true); };
    $$('[data-rs]').forEach(b => b.onclick = () => { cfg.setores.splice(+b.dataset.rs, 1); save(true); });
    $$('tr[data-i]').forEach(tr => { const f = cfg.extras[+tr.dataset.i]; $$('[data-k]', tr).forEach(el => el.onchange = () => { const k = el.dataset.k; f[k] = k === 'required' ? el.checked : k === 'options' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : el.value; save(true); }); });
    $$('[data-rf]').forEach(b => b.onclick = () => { cfg.extras.splice(+b.dataset.rf, 1); save(true); });
    const add = (label, type = 'text') => { cfg.extras.push({ id: slug(label) + '_' + rid(3).toLowerCase(), label, type, required: false, options: type === 'select' ? ['Opção 1', 'Opção 2'] : [] }); save(true); };
    $('#ff').onsubmit = e => { e.preventDefault(); const v = e.target.l.value.trim(); if (v) add(v); };
    $$('[data-q]').forEach(b => b.onclick = () => { const n = b.dataset.q; add(n, n === 'CPF' ? 'cpf' : n === 'Telefone' ? 'phone' : n === 'Data de admissão' ? 'date' : 'text'); });
    $$('[data-role]').forEach(s => s.onchange = () => { const x = users.find(y => y.id === s.dataset.role); x.blocked = s.value === 'blocked'; if (!x.blocked) x.role = s.value; LS.set('users', users); toast('Perfil atualizado'); });
  };
  draw();
}

// Proteção de rotas: devolve true se a rota pode seguir.
export function guard(route, publicRoutes = []) {
  const pub = ['entrar', 'cadastro', 'codigo', ...publicRoutes];
  const u = me();
  if (u && u.blocked) { LS.del('session'); location.hash = '#/entrar'; return false; }
  if (!u && !pub.includes(route)) { location.hash = '#/entrar'; return false; }
  if (u && ['entrar', 'cadastro', 'codigo'].includes(route)) { location.hash = APP.home; return false; }
  paintUser(); return true;
}
export function authRoute(route) {
  if (route === 'entrar') { Entrar(); return true; }
  if (route === 'cadastro') { Cadastro(); return true; }
  if (route === 'codigo') { Codigo(); return true; }
  if (route === 'config') { Config(); return true; }
  return false;
}
