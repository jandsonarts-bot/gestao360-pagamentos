// Aba "Atas de reunião": registro de reuniões (pauta, discussão, decisões, plano de ação) e relatório padrão
// com a logo do Gestão 360 e o nome "Colégio Vita". Os dados ficam na conta do usuário (state.atas).
import { state, save, uid, cloud, gerarAtaIA } from './store.js';

let h; // utilidades do app.js
export function initAtas(util) { h = util; }

const TIPOS = ['Equipe de apoio', 'Gestão', 'Pedagógica', 'Compras e fornecedores', 'Pais e responsáveis', 'Outra'];
const A = () => (state.atas ??= []);
const U = () => (h.ui.atas ??= { sub: 'atas', busca: '' });
const ata = id => A().find(a => a.id === id);
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const linhas = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const atrasada = x => !x.ok && x.p && x.p < h.hoje();

function toISO(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return '';
  const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : h.hoje().slice(0, 4);
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Leitura das anotações por regras simples (sem enviar nada para fora do aparelho).
// Reconhece linhas "Data:", "Hora:", "Local:", "Participantes:", "Pauta:", "Próxima reunião:" e marcadores "-".
export function lerAnotacoes(txt) {
  const L = String(txt || '').split('\n').map(s => s.trim()).filter(Boolean);
  const o = { titulo: '', tipo: 'Outra', data: '', ini: '', fim: '', local: '', part: [], pauta: [], disc: [], dec: [], acoes: [], prox: '' };
  if (L.length && !/^[-•\d]/.test(L[0]) && !/:/.test(L[0])) o.titulo = L[0];
  const low = txt.toLowerCase();
  if (/compra|fornecedor|material/.test(low)) o.tipo = 'Compras e fornecedores';
  else if (/apoio|limpeza/.test(low)) o.tipo = 'Equipe de apoio';
  else if (/pedag/.test(low)) o.tipo = 'Pedagógica';
  else if (/pais|respons[aá]veis/.test(low)) o.tipo = 'Pais e responsáveis';
  else if (/gest[aã]o|dire[cç][aã]o/.test(low)) o.tipo = 'Gestão';
  for (const l of L) {
    let m;
    if ((m = l.match(/^data\s*:\s*(.+)/i))) { o.data = toISO(m[1]); continue; }
    if ((m = l.match(/^(?:hora|hor[aá]rio)\s*:\s*(\d{1,2})h?(?::?(\d{2}))?\s*(?:às|as|a|-)\s*(\d{1,2})h?(?::?(\d{2}))?/i))) {
      o.ini = m[1].padStart(2, '0') + ':' + (m[2] || '00'); o.fim = m[3].padStart(2, '0') + ':' + (m[4] || '00'); continue;
    }
    if ((m = l.match(/^local\s*:\s*(.+)/i))) { o.local = m[1]; continue; }
    if ((m = l.match(/^(?:participantes|presentes)\s*:\s*(.+)/i))) { o.part = m[1].split(/[,;]| e /).map(s => s.trim()).filter(Boolean); continue; }
    if ((m = l.match(/^(?:pauta|temas?)\s*:\s*(.+)/i))) { o.pauta = m[1].split(/[;,]/).map(s => s.trim()).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)); continue; }
    if ((m = l.match(/^pr[oó]xima reuni[aã]o\s*:\s*(.+)/i))) { o.prox = toISO(m[1]); continue; }
    if (/^[-•]|^\d+[.)]/.test(l)) {
      const t = l.replace(/^[-•]\s*|^\d+[.)]\s*/, '');
      const rm = t.match(/(?:respons[aá]vel|resp\.?)\s*:?\s*([A-ZÀ-Ú][\p{L}]+)/u);
      const pm = t.match(/at[eé]\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
      if (rm || pm) o.acoes.push({ t: t.split(/\s[—–-]\s|\(/)[0].replace(/[.,;]$/, ''), r: rm ? rm[1] : 'A definir', p: pm ? toISO(pm[1]) : '', ok: false });
      else if (/decid|ficou (?:definido|acordado)|fica definido|aprovad/i.test(t)) o.dec.push(t.replace(/^(?:ficou definido|decidido|ficou acordado)\s*(?:que\s*)?/i, '').replace(/^./, c => c.toUpperCase()));
      else o.disc.push(t);
    }
  }
  return o;
}

// ---------- relatório padrão ----------
const lista = arr => arr && arr.length ? `<ul>${arr.map(x => `<li>${h.esc(x)}</li>`).join('')}</ul>` : '<p class="vz">Nada registrado.</p>';
export function relatorio(a) {
  const logo = new URL('logo.png', location.href).href;
  return `<div class="ata-papel">
    <div class="ata-top"><div class="ata-logo"><img src="${logo}" alt="Gestão 360"><b>Gestão 360</b></div><div class="ata-esc"><b>Colégio Vita</b><small>Ata de reunião</small></div></div>
    <h2>ATA DE REUNIÃO</h2><div class="ata-nr">${h.esc(a.titulo)} · nº ${h.esc(a.n)}</div>
    <div class="ata-ig"><div><small>Data</small>${h.fmtData(a.data)}</div><div><small>Horário</small>${h.esc(a.ini || '—')} às ${h.esc(a.fim || '—')}</div><div><small>Local</small>${h.esc(a.local || '—')}</div><div><small>Tipo</small>${h.esc(a.tipo)}</div></div>
    <h4>Participantes</h4><p>${a.part.length ? a.part.map(h.esc).join(', ') : '<span class="vz">Não informado.</span>'}</p>
    <h4>Pauta / temas abordados</h4>${lista(a.pauta)}
    <h4>Discussão</h4>${lista(a.disc)}
    <h4>Decisões</h4>${lista(a.dec)}
    <h4>Plano de ação</h4>${a.acoes.length ? `<table><thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>${a.acoes.map(x => `<tr><td>${h.esc(x.t)}</td><td>${h.esc(x.r)}</td><td>${h.fmtData(x.p)}</td><td>${x.ok ? 'Concluída' : atrasada(x) ? 'Atrasada' : 'Em aberto'}</td></tr>`).join('')}</tbody></table>` : '<p class="vz">Sem ações definidas.</p>'}
    <h4>Próxima reunião</h4><p>${a.prox ? h.fmtData(a.prox) : '<span class="vz">A definir.</span>'}</p>
    <div class="ata-ass"><div>${h.esc(a.resp || '')}<br>Responsável pelo registro</div><div>Direção / Coordenação<br>Ciente</div></div>
    <div class="ata-pe"><span>Gestão 360 · Colégio Vita</span><span>Ata nº ${h.esc(a.n)}</span></div></div>`;
}

const CSS_IMPRESSAO = `body{font:13px/1.5 system-ui,Arial,sans-serif;color:#111;margin:24px}
.ata-top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e6bff;padding-bottom:10px;margin-bottom:12px}
.ata-logo{display:flex;align-items:center;gap:8px;font-size:20px}.ata-logo img{width:36px;height:36px;border-radius:8px}
.ata-esc{text-align:right;color:#0a2e8a;font-size:15px}.ata-esc small{display:block;color:#667085;font-size:11px;font-weight:600}
h2{text-align:center;margin:6px 0 2px;font-size:17px}.ata-nr{text-align:center;color:#667085;font-size:12px;margin-bottom:12px}
.ata-ig{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d9dfeb;margin-bottom:10px}
.ata-ig div{padding:6px 8px;border-right:1px solid #d9dfeb}.ata-ig small{display:block;color:#667085;font-size:10px;text-transform:uppercase;font-weight:700}
h4{margin:14px 0 4px;font-size:12px;text-transform:uppercase;color:#fff;background:#1e6bff;padding:4px 8px;border-radius:4px}
ul{margin:4px 0;padding-left:20px}table{width:100%;border-collapse:collapse;border:1px solid #d9dfeb}
th{background:#eef2fb;text-align:left}th,td{padding:5px 7px;border-bottom:1px solid #e8ecf5;font-size:12.5px}
.ata-ass{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:36px}.ata-ass div{border-top:1px solid #111;padding-top:4px;text-align:center;font-size:12px}
.ata-pe{margin-top:18px;padding-top:6px;border-top:1px solid #d9dfeb;font-size:10.5px;color:#667085;display:flex;justify-content:space-between}
.vz{color:#667085;font-style:italic}`;

function texto(a) {
  const b = arr => (arr.length ? arr.map(x => '• ' + x).join('\n') : '—');
  return `ATA DE REUNIÃO nº ${a.n} — Colégio Vita (Gestão 360)\n${a.titulo}\nData: ${h.fmtData(a.data)} · ${a.ini || '—'} às ${a.fim || '—'} · Local: ${a.local || '—'}\n\nParticipantes: ${a.part.join(', ') || '—'}\n\nPauta:\n${b(a.pauta)}\n\nDiscussão:\n${b(a.disc)}\n\nDecisões:\n${b(a.dec)}\n\nAções:\n${a.acoes.length ? a.acoes.map(x => `• ${x.t} — ${x.r} — até ${h.fmtData(x.p)}`).join('\n') : '—'}\n\nPróxima reunião: ${a.prox ? h.fmtData(a.prox) : 'a definir'}`;
}

// ---------- telas ----------
function vLista() {
  const q = U().busca.trim().toLowerCase();
  const l = [...A()].sort((a, b) => b.data.localeCompare(a.data) || b.n.localeCompare(a.n))
    .filter(a => !q || [a.titulo, a.tipo, a.local, a.part.join(' ')].join(' ').toLowerCase().includes(q));
  return `<div class="tools"><input id="atasBusca" class="search" type="search" placeholder="Buscar por título, tipo, local ou participante..." value="${h.esc(U().busca)}" data-input="atasBusca">
      <button class="btn primary" data-act="atasNova">${h.ic('mais')}Nova ata</button></div>
    ${l.length ? `<div class="people">${l.map(a => `<div class="person doc">
      <div class="av">${h.ic('documentos')}</div>
      <div class="info"><strong>${h.esc(a.titulo)}</strong><span>Ata ${h.esc(a.n)} · ${h.fmtData(a.data)} · ${h.esc(a.tipo)} · ${plural(a.part.length, 'participante', 'participantes')}</span></div>
      <span class="badge ${a.acoes.some(atrasada) ? 'atrasado' : a.acoes.some(x => !x.ok) ? 'hoje' : 'pago'}">${a.acoes.filter(x => x.ok).length}/${a.acoes.length} ações</span>
      <div class="pa"><button class="btn sm primary" data-act="atasVer" data-id="${a.id}">Ver ata</button>
        <button class="btn sm" data-act="atasEditar" data-id="${a.id}">Editar</button>
        <span class="grow"></span><button class="btn sm danger" data-act="atasExcluir" data-id="${a.id}">Excluir</button></div></div>`).join('')}</div>`
      : `<div class="card">${h.vazio(q ? 'Nada encontrado' : 'Nenhuma ata registrada', q ? 'Tente outra palavra na busca.' : 'Use o botão Nova ata: cole as anotações da reunião e o app monta a ata no padrão Gestão 360.')}</div>`}`;
}

function vAcoes() {
  const l = A().flatMap(a => a.acoes.map((x, i) => ({ a, x, i }))).sort((p, q) => (p.x.ok - q.x.ok) || String(p.x.p || '9999').localeCompare(String(q.x.p || '9999')));
  return `<div class="tools"><span class="grow muted">${plural(l.filter(r => !r.x.ok).length, 'ação em aberto', 'ações em aberto')} · ${l.filter(r => atrasada(r.x)).length} atrasada(s)</span></div>
    ${l.length ? `<div class="people">${l.map(({ a, x, i }) => `<div class="person doc">
      <div class="av">${h.ic('check')}</div>
      <div class="info"><strong>${h.esc(x.t)}</strong><span>${h.esc(x.r)} · prazo ${h.fmtData(x.p)} · ata ${h.esc(a.n)}</span></div>
      <span class="badge ${x.ok ? 'pago' : atrasada(x) ? 'atrasado' : 'hoje'}">${x.ok ? 'Concluída' : atrasada(x) ? 'Atrasada' : 'Em aberto'}</span>
      <div class="pa"><button class="btn sm" data-act="atasToggle" data-id="${a.id}" data-i="${i}">${x.ok ? 'Reabrir' : 'Concluir'}</button></div></div>`).join('')}</div>`
      : `<div class="card">${h.vazio('Nenhuma ação registrada', 'As ações definidas nas atas aparecem aqui, com responsável e prazo.')}</div>`}`;
}

export function vAtas() {
  const u = U();
  const pill = (k, t, n) => `<button class="pill ${u.sub === k ? 'on' : ''}" data-act="atasSub" data-s="${k}">${t}${n != null ? ` <em>${n}</em>` : ''}</button>`;
  const ab = A().flatMap(a => a.acoes).filter(x => !x.ok).length;
  return `<div class="tools imp-subs"><div class="pills">${pill('atas', 'Atas', A().length)}${pill('acoes', 'Ações e prazos', ab)}</div></div>${u.sub === 'acoes' ? vAcoes() : vLista()}`;
}

// ---------- diálogos ----------
function dVer(a) {
  h.abrir(`${h.cab(h.esc(a.titulo), `Ata ${h.esc(a.n)}`)}
    <div class="body">${relatorio(a)}</div>
    <footer><button type="button" class="btn" data-act="atasCopiar" data-id="${a.id}">${h.ic('copiar')}Copiar texto</button>
      <button type="button" class="btn primary" data-act="atasImprimir" data-id="${a.id}">${h.ic('baixar')}Imprimir / PDF</button>
      <span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Fechar</button></footer>`);
}

function dForm(a) {
  const v = a || { titulo: '', tipo: 'Gestão', data: h.hoje(), ini: '', fim: '', local: '', part: [], pauta: [], disc: [], dec: [], acoes: [], prox: '' };
  const acoesTxt = v.acoes.map(x => `${x.t} | ${x.r} | ${x.p ? h.fmtData(x.p).replace(/-/g, '/') : ''}`).join('\n');
  h.abrir(`${h.cab(a ? 'Editar ata' : 'Nova ata', 'Cole as anotações para a leitura automática ou preencha os campos.')}
    <form data-form="atasSalvar" data-id="${a ? a.id : ''}"><div class="body">
      ${a ? '' : `<div class="card ata-ia"><h3>Leitura automática das anotações</h3>
        <textarea id="atasRaw" rows="7" placeholder="Reunião de compras&#10;Data: 24/11/2026&#10;Hora: 14h às 15h&#10;Local: Sala de reunião&#10;Participantes: Ana, Bruno&#10;Pauta: tema 1; tema 2&#10;- Decidido que ...&#10;- Enviar lista — responsável: Ana, até 28/11&#10;Próxima reunião: 01/12/2026"></textarea>
        <p class="nota">Reconhece Data, Hora, Local, Participantes, Pauta, Próxima reunião e itens com "-". Itens com "responsável" ou "até dd/mm" viram ações; itens com "decidido/definido/aprovado" viram decisões. Revise antes de salvar.</p>
        <button type="button" class="btn primary" data-act="atasLer">Montar ata com as anotações</button></div>`}
      <div class="g2">${h.campo('Título da reunião', `<input name="titulo" required value="${h.esc(v.titulo)}" autocomplete="off">`, 'full')}
        ${h.campo('Tipo', `<select name="tipo">${TIPOS.map(t => `<option ${t === v.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${h.campo('Data', `<input name="data" type="date" required value="${h.esc(v.data)}">`)}
        ${h.campo('Início', `<input name="ini" type="time" value="${h.esc(v.ini)}">`)}
        ${h.campo('Fim', `<input name="fim" type="time" value="${h.esc(v.fim)}">`)}
        ${h.campo('Local', `<input name="local" value="${h.esc(v.local)}" autocomplete="off">`)}
        ${h.campo('Próxima reunião', `<input name="prox" type="date" value="${h.esc(v.prox)}">`)}</div>
      ${h.campo('Participantes (separe por vírgula)', `<input name="part" value="${h.esc(v.part.join(', '))}" autocomplete="off">`)}
      ${h.campo('Pauta / temas (um por linha)', `<textarea name="pauta" rows="3">${h.esc(v.pauta.join('\n'))}</textarea>`)}
      ${h.campo('Discussão (um item por linha)', `<textarea name="disc" rows="3">${h.esc(v.disc.join('\n'))}</textarea>`)}
      ${h.campo('Decisões (uma por linha)', `<textarea name="dec" rows="3">${h.esc(v.dec.join('\n'))}</textarea>`)}
      ${h.campo('Ações: ação | responsável | prazo (dd/mm/aaaa), uma por linha', `<textarea name="acoes" rows="3">${h.esc(acoesTxt)}</textarea>`)}
    </div><footer><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><span class="grow"></span>
      <button class="btn primary" type="submit">Salvar ata</button></footer></form>`);
}

function preencher(o) {
  const f = document.querySelector('form[data-form=atasSalvar]'); if (!f) return;
  const set = (n, val) => { if (f.elements[n] && val) f.elements[n].value = val; };
  set('titulo', o.titulo); set('tipo', o.tipo); set('data', o.data); set('ini', o.ini); set('fim', o.fim); set('local', o.local); set('prox', o.prox);
  set('part', o.part.join(', ')); set('pauta', o.pauta.join('\n')); set('disc', o.disc.join('\n')); set('dec', o.dec.join('\n'));
  set('acoes', o.acoes.map(x => `${x.t} | ${x.r} | ${x.p ? h.fmtData(x.p) : ''}`).join('\n'));
}

function proximoNumero(data) {
  const ano = (data || h.hoje()).slice(0, 4);
  const n = Math.max(0, ...A().filter(a => a.n.endsWith('/' + ano)).map(a => parseInt(a.n, 10) || 0)) + 1;
  return `${String(n).padStart(3, '0')}/${ano}`;
}

// ---------- ações ----------
export const atasActs = {
  atasSub: el => { U().sub = el.dataset.s; h.ui.anim = true; h.render(); window.scrollTo(0, 0); },
  atasNova: () => dForm(null),
  atasVer: el => { const a = ata(el.dataset.id); if (a) dVer(a); },
  atasEditar: el => { const a = ata(el.dataset.id); if (a) dForm(a); },
  atasExcluir: el => {
    const a = ata(el.dataset.id);
    if (!a || !confirm(`Excluir a ata ${a.n} "${a.titulo}"? Não dá para desfazer.`)) return;
    state.atas = A().filter(x => x !== a); save(); h.toast('Ata excluída');
  },
  atasLer: async el => {
    const t = document.getElementById('atasRaw')?.value.trim();
    if (!t) return h.toast('Cole as anotações da reunião primeiro.');
    // com o Firebase conectado, usa a IA do Claude (função gerarAta); se falhar ou estiver em modo local, usa a leitura por regras
    if (cloud.ativo && cloud.user) {
      el.disabled = true; const rot = el.textContent; el.textContent = 'Lendo com a IA…';
      try { preencher(await gerarAtaIA(t)); h.toast('Ata montada pela IA. Revise os campos antes de salvar.'); return; }
      catch (e) { console.warn('gerarAta:', e); h.toast('IA indisponível (' + (e.message || 'erro') + '). Usei a leitura simples.'); }
      finally { el.disabled = false; el.textContent = rot; }
    }
    preencher(lerAnotacoes(t)); if (!cloud.ativo) h.toast('Ata montada (leitura simples). Revise os campos antes de salvar.');
  },
  atasToggle: el => { const a = ata(el.dataset.id), x = a?.acoes[+el.dataset.i]; if (x) { x.ok = !x.ok; save(); } },
  atasCopiar: el => {
    const a = ata(el.dataset.id); if (!a) return;
    navigator.clipboard?.writeText(texto(a)).then(() => h.toast('Texto da ata copiado'), () => h.toast('Não foi possível copiar'));
  },
  atasImprimir: el => {
    const a = ata(el.dataset.id); if (!a) return;
    const w = window.open('', '_blank');
    if (!w) return h.toast('Permita pop-ups para imprimir ou salvar em PDF.');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata ${h.esc(a.n)} · Colégio Vita</title><style>${CSS_IMPRESSAO}</style></head><body>${relatorio(a)}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
  },
};

export const atasForms = {
  atasSalvar(v, f) {
    const id = f.dataset.id, ex = id ? ata(id) : null;
    const acoes = linhas(v.acoes).map((l, i) => {
      const p = l.split('|').map(s => s.trim());
      return { t: p[0], r: p[1] || 'A definir', p: toISO(p[2]), ok: ex?.acoes.find(x => x.t === p[0])?.ok || false };
    }).filter(x => x.t);
    const dados = { titulo: v.titulo.trim(), tipo: v.tipo, data: v.data, ini: v.ini || '', fim: v.fim || '', local: (v.local || '').trim(),
      part: String(v.part || '').split(',').map(s => s.trim()).filter(Boolean), pauta: linhas(v.pauta), disc: linhas(v.disc), dec: linhas(v.dec), acoes, prox: v.prox || '' };
    if (ex) Object.assign(ex, dados);
    else A().push({ id: uid(), n: proximoNumero(dados.data), resp: cloud.user?.displayName || '', criado: h.hoje(), ...dados });
    save(); h.fechar(); h.toast(ex ? 'Ata atualizada' : 'Ata salva');
  },
};

export const atasInputs = {
  atasBusca: t => { U().busca = t.value; h.render(); },
};
