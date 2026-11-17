// Aba "Patrimônio Vita": inventário por seção (uma para cada aba da planilha), documentos e planilhas anexadas.
// Nenhum dado fica no código: tudo vem da planilha que o usuário anexa e é salvo na conta dele.
import { state, save, uid, delAnexo } from './store.js';
import { lerXlsx, criarXlsx, E } from './xlsx.js';

let h; // utilidades do app.js (esc, ic, abrir, fechar, cab, campo, toast, render, ui, subir, dVer, baixar, hoje, fmtData, vazio)
export function initPat(util) { h = util; }

const P = () => { const p = (state.pat ??= {}); p.cats ??= []; p.docs ??= []; p.planilhas ??= []; return p; };
const U = () => (h.ui.pat ??= { sub: 'resumo', busca: '' });
const cat = id => P().cats.find(c => c.id === id);
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
let aberto = null; // { c, id } do item aberto no diálogo

// ---------- leitura da planilha ----------
const txt = c => c == null ? '' : typeof c === 'number'
  ? (Number.isInteger(c) ? String(c) : c.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))
  : String(c).replace(/\s+/g, ' ').trim();
const CHAVES = /patrim|modelo|respons|unidade|quantidade|local|n[uú]mero|valor|^nf$|s[eé]rie|imei|descri/i;
const PADRAO = ['Unidade', 'Local / Responsável', 'Patrimônio', 'Modelo'];
const bonito = s => s.length <= 3 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Uma aba da planilha -> { nome, cols, itens }. Acha a linha de cabeçalho; sem cabeçalho, usa nomes padrão.
export function lerAba(aba) {
  const linhas = aba.linhas.map(l => { const r = l.map(txt); while (r.length && !r[r.length - 1]) r.pop(); return r; });
  const dados = linhas.map((l, i) => ({ i, l, n: l.filter(Boolean).length })).filter(x => x.n >= 2);   // título e linhas soltas ficam de fora
  if (!dados.length) return null;
  const ehCab = x => x.l.filter(Boolean).every(c => !/^[\d.,\-\s]+$/.test(c)) && x.l.filter(c => CHAVES.test(c)).length >= 2;
  const cab = dados.slice(0, 6).find(ehCab);
  const corpo = dados.filter(x => !cab || x.i > cab.i);
  if (!corpo.length) return null;
  const ncol = Math.max(...corpo.map(x => x.l.length), cab ? cab.l.length : 0);
  const cols = Array.from({ length: ncol }, (_, k) => (cab ? (cab.l[k] ? bonito(cab.l[k]) : `Coluna ${k + 1}`) : PADRAO[k] || `Coluna ${k + 1}`));
  return { nome: aba.nome.trim() || 'Sem nome', cols, itens: corpo.map(x => Array.from({ length: ncol }, (_, k) => x.l[k] || '')) };
}

// Junta uma aba lida com a seção de mesmo nome: atualiza quem tem o mesmo nº de patrimônio, acrescenta o resto. Nunca apaga.
function juntar(nova) {
  const p = P();
  let c = p.cats.find(x => x.nome.toLowerCase() === nova.nome.toLowerCase());
  if (!c) { c = { id: uid(), nome: nova.nome, cols: [...nova.cols], itens: [] }; p.cats.push(c); }
  const pos = nova.cols.map(n => { let k = c.cols.findIndex(x => x.toLowerCase() === n.toLowerCase()); if (k < 0) { c.cols.push(n); k = c.cols.length - 1; } return k; });
  for (const i of c.itens) while (i.v.length < c.cols.length) i.v.push('');
  const kPat = c.cols.findIndex(x => /patrim/i.test(x));
  let novos = 0, atualizados = 0;
  for (const lin of nova.itens) {
    const v = Array(c.cols.length).fill(''); lin.forEach((val, k) => { v[pos[k]] = val; });
    const igual = c.itens.find(i => i.v.join('\u0001') === v.join('\u0001'));
    if (igual) continue;
    const ex = kPat >= 0 && v[kPat] ? c.itens.find(i => i.v[kPat] === v[kPat]) : null;
    if (ex) { lin.forEach((val, k) => { ex.v[pos[k]] = val; }); atualizados++; }
    else { c.itens.push({ id: uid(), v, anexos: [] }); novos++; }
  }
  return { nome: c.nome, novos, atualizados, total: c.itens.length };
}

// Importa arquivos .xlsx: cada aba vira (ou atualiza) uma seção. guardar=false não anexa o arquivo em si.
export async function importarArquivos(arquivos, { guardar = true } = {}) {
  const res = [];
  for (const arq of arquivos) {
    const abas = (await lerXlsx(arq)).map(lerAba).filter(Boolean);
    if (!abas.length) throw new Error(`Não achei dados em "${arq.name}".`);
    for (const a of abas) res.push(juntar(a));
    if (guardar) {
      const [anexo] = await h.subir([arq]);
      if (anexo) P().planilhas.push({ id: uid(), nome: arq.name, data: h.hoje(), anexo, abas: abas.map(a => a.nome) });
    }
  }
  save();
  return res;
}

function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- telas ----------
const soltar = t => `<label class="drop">${h.ic('clip')}<span>${t}</span><input type="file" accept=".xlsx" multiple data-change="patImportar"></label>`;
const arquivoLinha = (a, extra) => `<div class="file"><button type="button" class="link" data-act="patVer" ${extra} data-aid="${a.id}">${h.ic('clip')}${h.esc(a.nome)}</button>
  <button type="button" class="btn sm" data-act="patBaixar" ${extra} data-aid="${a.id}">${h.ic('baixar')}Baixar</button>
  <button type="button" class="xbtn sm" data-act="patDelAnexo" ${extra} data-aid="${a.id}" aria-label="Remover arquivo">${h.ic('x')}</button></div>`;

function vResumo() {
  const p = P();
  if (!p.cats.length) return `<div class="card">${h.vazio('Nenhum patrimônio cadastrado ainda', 'Anexe a planilha de controle: cada aba dela (Notebooks, Celulares...) vira uma seção aqui.')}
    ${soltar('Anexar planilha de patrimônio (.xlsx)')}</div>`;
  const total = p.cats.reduce((s, c) => s + c.itens.length, 0);
  return `<div class="kpis">${p.cats.map(c => `<button class="kpi" data-act="patSub" data-s="c:${c.id}"><span>${h.esc(c.nome)}</span><b>${c.itens.length.toLocaleString('pt-BR')}</b><small>${plural(c.itens.filter(i => (i.anexos || []).length).length, 'com documento', 'com documento')}</small></button>`).join('')}
      <button class="kpi ok" data-act="patSub" data-s="docs"><span>Documentos</span><b>${p.docs.length.toLocaleString('pt-BR')}</b><small>${plural(p.docs.reduce((s, d) => s + d.anexos.length, 0), 'arquivo', 'arquivos')}</small></button></div>
    <div class="card"><h3>Patrimônio Vita <em>${plural(total, 'item', 'itens')}</em><span class="grow"></span><button class="btn sm" data-act="patExportar">${h.ic('baixar')}Baixar tudo em planilha</button></h3>
      <p class="nota">Toque em uma seção para ver, buscar e editar os itens. Para atualizar, anexe a planilha de novo: itens com o mesmo número de patrimônio são atualizados, os novos são acrescentados e nada é apagado.</p>
      ${soltar('Anexar outra planilha (.xlsx)')}</div>`;
}

function vCat(c) {
  const u = U(), q = u.busca.trim().toLowerCase();
  const itens = q ? c.itens.filter(i => i.v.join(' ').toLowerCase().includes(q)) : c.itens;
  return `<div class="tools">
      <input id="patBusca" class="search" type="search" placeholder="Buscar em ${h.esc(c.nome)}: responsável, patrimônio, modelo..." value="${h.esc(u.busca)}" data-input="patBusca">
      <button class="btn" data-act="patExportar" data-c="${c.id}">${h.ic('baixar')}Planilha</button>
      <button class="btn primary" data-act="patNovoItem" data-c="${c.id}">${h.ic('mais')}Item</button></div>
    <div class="card flush">${itens.length ? `<div class="pat-scroll"><table class="pat-tab">
      <thead><tr>${c.cols.map(n => `<th>${h.esc(n)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${itens.map(i => `<tr data-act="patItem" data-c="${c.id}" data-id="${i.id}">${c.cols.map((_, k) => `<td>${k === 0 ? `<strong>${h.esc(i.v[k] || '—')}</strong>` : h.esc(i.v[k] || '')}</td>`).join('')}
        <td class="r">${(i.anexos || []).length ? `<span class="clipn">${h.ic('clip')}${i.anexos.length}</span>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${c.cols.length + 1}"><span>${itens.length === c.itens.length ? plural(c.itens.length, 'item', 'itens') : `${itens.length} de ${c.itens.length} itens`}</span></td></tr></tfoot>
    </table></div>` : h.vazio(q ? 'Nada encontrado' : 'Seção vazia', q ? 'Tente outra palavra na busca.' : 'Use o botão Item para cadastrar.')}</div>`;
}

function vDocs() {
  const p = P(), l = [...p.docs].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  return `<div class="tools"><span class="grow muted">${plural(l.length, 'documento', 'documentos')}</span>
      <button class="btn primary" data-act="patNovoDoc">${h.ic('mais')}Anexar documento</button></div>
    ${l.length ? `<div class="people">${l.map(d => `<div class="person doc">
      <div class="av">${h.ic('pedidos')}</div>
      <div class="info"><strong>${h.esc(d.titulo)}</strong><span>${h.fmtData(d.data)}${d.cat && cat(d.cat) ? ' · ' + h.esc(cat(d.cat).nome) : ' · Geral'}</span></div>
      ${d.descricao ? `<p class="desc">${h.esc(d.descricao)}</p>` : ''}
      <div class="files" style="width:100%">${d.anexos.map(a => arquivoLinha(a, `data-doc="${d.id}"`)).join('')}</div>
      <div class="pa"><span class="grow"></span><button class="btn sm danger" data-act="patExcluirDoc" data-id="${d.id}">Excluir</button></div></div>`).join('')}</div>`
      : `<div class="card">${h.vazio('Nenhum documento anexado', 'Guarde aqui notas fiscais, termos de responsabilidade, garantias e laudos do patrimônio.')}</div>`}`;
}

function vPlanilhas() {
  const p = P();
  return `<div class="card"><h3>Planilhas anexadas <em>${p.planilhas.length}</em></h3>
      ${p.planilhas.length ? `<div class="files">${[...p.planilhas].reverse().map(x => `<div class="file"><span class="mail">${h.esc(x.nome)}<small class="muted"> · ${h.fmtData(x.data)}${x.abas ? ' · ' + h.esc(x.abas.join(', ')) : ''}</small></span>
        <button class="btn sm" data-act="patBaixar" data-plan="${x.id}" data-aid="${x.anexo.id}">${h.ic('baixar')}Baixar</button>
        <button class="xbtn sm" data-act="patExcluirPlan" data-id="${x.id}" aria-label="Remover planilha da lista">${h.ic('x')}</button></div>`).join('')}</div>` : '<p class="muted">Nenhuma planilha anexada neste aparelho.</p>'}
      ${soltar('Anexar planilha (.xlsx): cada aba vira uma seção')}
      <p class="nota" style="margin-top:10px">Os itens lidos da planilha ficam salvos na conta e aparecem em todos os aparelhos. O arquivo em si fica guardado só no aparelho onde foi anexado.</p></div>
    <div class="card"><h3>Seções</h3>
      ${p.cats.length ? p.cats.map(c => `<div class="row" data-act="patSub" data-s="c:${c.id}"><div class="info"><strong>${h.esc(c.nome)}</strong><span>${plural(c.itens.length, 'item', 'itens')} · ${h.esc(c.cols.join(', '))}</span></div>
        <button class="btn sm danger" data-act="patExcluirCat" data-c="${c.id}">Excluir seção</button></div>`).join('') : '<p class="muted">Nenhuma seção ainda.</p>'}</div>`;
}

export function vPatrimonio() {
  const p = P(), u = U();
  if (u.sub.startsWith('c:') && !cat(u.sub.slice(2))) u.sub = 'resumo';
  const pill = (k, t, n) => `<button class="pill ${u.sub === k ? 'on' : ''}" data-act="patSub" data-s="${k}">${h.esc(t)}${n != null ? ` <em>${n}</em>` : ''}</button>`;
  const corpo = u.sub === 'docs' ? vDocs() : u.sub === 'planilhas' ? vPlanilhas() : u.sub.startsWith('c:') ? vCat(cat(u.sub.slice(2))) : vResumo();
  return `<div class="tools imp-subs"><div class="pills">${pill('resumo', 'Resumo')}${p.cats.map(c => pill('c:' + c.id, c.nome, c.itens.length)).join('')}${pill('docs', 'Documentos', p.docs.length)}${pill('planilhas', 'Planilhas', p.planilhas.length)}</div></div>${corpo}`;
}

// ---------- diálogos ----------
function dItem(c, item) {
  aberto = { c: c.id, id: item?.id || null };
  const v = item ? item.v : c.cols.map(() => '');
  h.abrir(`${h.cab(item ? h.esc(v[0] || c.nome) : `Novo item em ${h.esc(c.nome)}`, h.esc(c.nome))}
    <form data-form="patItem"><div class="body">
      <div class="g2">${c.cols.map((n, k) => h.campo(h.esc(n), `<input name="v${k}" value="${h.esc(v[k] || '')}" autocomplete="off">`)).join('')}</div>
      ${item ? `<h4>Documentos deste item</h4>
        <div class="files">${(item.anexos || []).map(a => arquivoLinha(a, '')).join('') || '<p class="muted">Nenhum arquivo anexado.</p>'}</div>
        <label class="drop">${h.ic('clip')}<span>Anexar nota fiscal, termo de responsabilidade, foto...</span><input type="file" multiple data-change="patAnexar"></label>` : ''}
    </div><footer>${item ? `<button type="button" class="btn danger" data-act="patExcluirItem">Excluir</button>` : ''}
      <span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button>
      <button class="btn primary" type="submit">Salvar</button></footer></form>`);
}

function dDoc() {
  h.abrir(`${h.cab('Anexar documento', 'Nota fiscal, termo, garantia, laudo: fica guardado com uma descrição.')}
    <form data-form="patDoc"><div class="body">
      ${h.campo('Título', `<input name="titulo" required placeholder="Ex.: Nota fiscal dos notebooks Dell" autocomplete="off">`)}
      ${h.campo('Descrição', `<textarea name="descricao" rows="3" placeholder="O que é, de quando, a que itens se refere"></textarea>`)}
      ${h.campo('Seção', `<select name="cat"><option value="">Geral (vale para tudo)</option>${P().cats.map(c => `<option value="${c.id}">${h.esc(c.nome)}</option>`).join('')}</select>`)}
      ${h.campo('Arquivos', `<input name="arq" type="file" multiple required>`)}
    </div><footer><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><span class="grow"></span>
      <button class="btn primary" type="submit">Anexar</button></footer></form>`);
}

// item, documento ou planilha a que um arquivo pertence, a partir do botão clicado
function donoDoArquivo(el) {
  const p = P();
  if (el.dataset.plan) { const x = p.planilhas.find(q => q.id === el.dataset.plan); return x ? { lista: [x.anexo] } : null; }
  if (el.dataset.doc) { const d = p.docs.find(q => q.id === el.dataset.doc); return d ? { lista: d.anexos, dono: d } : null; }
  const it = aberto && cat(aberto.c)?.itens.find(i => i.id === aberto.id);
  return it ? { lista: (it.anexos ??= []), dono: it, item: true } : null;
}
const itemAberto = () => { const c = aberto && cat(aberto.c); return c ? { c, it: c.itens.find(i => i.id === aberto.id) } : {}; };
// guarda o que já foi digitado no formulário do item antes de redesenhar o diálogo
function aplicarForm() {
  const f = document.querySelector('form[data-form=patItem]'), { c, it } = itemAberto();
  if (f && c && it) c.cols.forEach((_, k) => { it.v[k] = (f.elements['v' + k]?.value || '').trim(); });
}

// ---------- ações ----------
export const patActs = {
  patSub: el => { const u = U(); u.sub = el.dataset.s; u.busca = ''; h.ui.anim = true; h.render(); window.scrollTo(0, 0); },
  patItem: el => { const c = cat(el.dataset.c), it = c?.itens.find(i => i.id === el.dataset.id); if (it) dItem(c, it); },
  patNovoItem: el => { const c = cat(el.dataset.c); if (c) dItem(c, null); },
  patExcluirItem: () => {
    const { c, it } = itemAberto(); if (!it || !confirm(`Excluir "${it.v[0] || 'este item'}" de ${c.nome}?`)) return;
    (it.anexos || []).forEach(delAnexo); c.itens = c.itens.filter(i => i !== it); save(); h.fechar(); h.toast('Item excluído');
  },
  patVer: el => { const a = donoDoArquivo(el)?.lista.find(x => x.id === el.dataset.aid); if (a) h.dVer(a); },
  patBaixar: el => { const a = donoDoArquivo(el)?.lista.find(x => x.id === el.dataset.aid); if (a) h.baixar(a); },
  patDelAnexo: el => {
    const d = donoDoArquivo(el), a = d?.lista.find(x => x.id === el.dataset.aid);
    if (!a || !confirm(`Remover ${a.nome}?`)) return;
    if (d.item) aplicarForm();
    delAnexo(a); d.dono.anexos = d.lista.filter(x => x !== a); save();
    if (d.item) { const { c, it } = itemAberto(); dItem(c, it); }
  },
  patNovoDoc: dDoc,
  patExcluirDoc: el => {
    const p = P(), d = p.docs.find(x => x.id === el.dataset.id);
    if (!d || !confirm(`Excluir "${d.titulo}" e os arquivos?`)) return;
    d.anexos.forEach(delAnexo); p.docs = p.docs.filter(x => x !== d); save(); h.toast('Documento excluído');
  },
  patExcluirPlan: el => {
    const p = P(), x = p.planilhas.find(q => q.id === el.dataset.id);
    if (!x || !confirm(`Remover "${x.nome}" da lista? Os itens que vieram dela continuam cadastrados.`)) return;
    delAnexo(x.anexo); p.planilhas = p.planilhas.filter(q => q !== x); save();
  },
  patExcluirCat: (el, ev) => {
    ev?.stopPropagation();
    const p = P(), c = cat(el.dataset.c);
    if (!c || !confirm(`Excluir a seção "${c.nome}" com ${c.itens.length} itens? Não dá para desfazer.`)) return;
    c.itens.forEach(i => (i.anexos || []).forEach(delAnexo));
    p.cats = p.cats.filter(x => x !== c); save(); h.toast('Seção excluída');
  },
  patExportar: el => {
    const cs = el.dataset.c ? [cat(el.dataset.c)].filter(Boolean) : P().cats;
    if (!cs.length) return h.toast('Nada para baixar.');
    baixarBlob(criarXlsx(cs.map(c => ({ nome: c.nome, larguras: c.cols.map((_, k) => (k === c.cols.length - 1 ? 46 : 24)),
      linhas: [c.cols.map(v => ({ v, e: E.B })), ...c.itens.map(i => c.cols.map((_, k) => i.v[k] || ''))] }))),
      `patrimonio-vita${el.dataset.c ? '-' + cs[0].nome.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}-${h.hoje()}.xlsx`);
  },
};

export const patForms = {
  patItem(v) {
    const c = aberto && cat(aberto.c); if (!c) return;
    const vals = c.cols.map((_, k) => (v['v' + k] || '').trim());
    if (!vals.some(Boolean)) throw new Error('preencha pelo menos um campo.');
    const it = c.itens.find(i => i.id === aberto.id);
    if (it) it.v = vals; else c.itens.push({ id: uid(), v: vals, anexos: [] });
    save(); h.fechar(); h.toast(it ? 'Item atualizado' : 'Item cadastrado');
  },
  async patDoc(v, f) {
    const anexos = await h.subir(f.arq.files);
    if (!anexos.length) return;
    P().docs.push({ id: uid(), titulo: v.titulo.trim(), descricao: (v.descricao || '').trim(), cat: v.cat || '', data: h.hoje(), anexos });
    U().sub = 'docs'; save(); h.fechar(); h.toast('Documento anexado');
  },
};

export const patChanges = {
  async patImportar(t) {
    if (!t.files.length) return;
    t.closest('.drop')?.classList.add('busy');
    try {
      const res = await importarArquivos([...t.files]);
      h.toast(`Planilha lida: ${res.map(r => `${r.nome} (${r.novos} novos${r.atualizados ? `, ${r.atualizados} atualizados` : ''})`).join(' · ')}`);
    } catch (e) { h.toast('Não consegui ler a planilha: ' + e.message); h.render(); }
  },
  async patAnexar(t) {
    const { c, it } = itemAberto(); if (!it || !t.files.length) return;
    t.closest('.drop').classList.add('busy');
    aplicarForm();
    (it.anexos ??= []).push(...await h.subir(t.files)); save(); dItem(c, it);
  },
};

export const patInputs = {
  patBusca: t => { U().busca = t.value; h.render(); },
};
