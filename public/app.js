import { state, save, onChange, cloud, initCloud, login, logout, addAnexo, urlAnexo, delAnexo, arquivoAnexo, avisoZapAgora, restaurar, uid } from './store.js';

// ---------- utilidades ----------
const app = document.getElementById('app');
const dlg = document.getElementById('dlg');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => iso(new Date());
const fmtData = s => s ? s.split('-').reverse().join('/') : '—';
const diff = v => Math.round((new Date(v + 'T00:00') - new Date(hoje() + 'T00:00')) / 864e5);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const FORMAS = ['PIX', 'BOLETO', 'TRANSFERÊNCIA', 'CARTÃO', 'DINHEIRO'];
const addMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const nomeMes = ym => `${MESES[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;

const I = {
  painel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mensais: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
  pedidos: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  prestadores: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a6 6 0 013.5 5.5"/>',
  sino: '<path d="M6 9a6 6 0 0112 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zM10 20a2 2 0 004 0"/>',
  clip: '<path d="M20 11.5l-8 8a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7L9.7 17.2a1.7 1.7 0 01-2.4-2.4L15 7"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  esq: '<path d="M15 5l-7 7 7 7"/>', dir: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  enviar: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  documentos: '<path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  zap: '<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-3.9-1z"/>',
  nuvem: '<path d="M7 18a4.5 4.5 0 01-.6-9A6 6 0 0118 10.5a3.8 3.8 0 01-.5 7.5z"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

const ui = { view: 'painel', mes: hoje().slice(0, 7), dia: null, filtro: 'todos', busca: '', fPed: 'abertos', anim: true };
let ctx = null; // item aberto no diálogo

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- modelo ----------
function itensDoMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  const ult = new Date(y, m, 0).getDate();
  const out = [];
  for (const e of state.empresas) {
    if (e.cat !== 'mensal') continue;
    const key = `${e.id}_${ym}`, p = state.pagamentos[key] || {};
    out.push({
      kind: 'mensal', key, titulo: e.nome, sub: e.area, tipo: e.tipo, forma: e.forma,
      valor: p.pago ? p.valor : e.valor, venc: `${ym}-${pad(Math.min(e.dia || 1, ult))}`,
      pago: !!p.pago, dataPago: p.data, enviado: p.enviado, anexos: p.anexos || [], e,
    });
  }
  for (const d of state.pedidos) {
    if (d.venc.slice(0, 7) !== ym) continue;
    out.push({
      kind: 'pedido', key: d.id, titulo: d.fornecedor, sub: d.descricao, tipo: 'PEDIDO', forma: d.forma,
      valor: d.valor, venc: d.venc, pago: !!d.pago, dataPago: d.dataPago, enviado: d.enviado, anexos: d.anexos || [], d,
    });
  }
  return out.sort((a, b) => a.venc.localeCompare(b.venc) || a.titulo.localeCompare(b.titulo));
}

function status(it) {
  if (it.pago) return 'pago';
  const d = diff(it.venc);
  if (d < 0) return 'atrasado';
  if (it.enviado) return 'enviado';
  if (d === 0) return 'hoje';
  return d <= state.config.diasAlerta ? 'proximo' : 'pendente';
}

function alertas() {
  const lim = new Date(); lim.setDate(lim.getDate() + state.config.diasAlerta);
  const fim = iso(lim).slice(0, 7);
  const inicio = state.inicio || hoje().slice(0, 7);
  let ini = inicio;
  for (const d of state.pedidos) if (!d.pago && d.venc.slice(0, 7) < ini) ini = d.venc.slice(0, 7);
  const out = [];
  for (let c = ini, i = 0; c <= fim && i < 36; c = addMes(c, 1), i++) out.push(...itensDoMes(c).filter(x => x.kind === 'pedido' || c >= inicio));
  return out.filter(i => ['atrasado', 'hoje', 'proximo'].includes(status(i))).sort((a, b) => a.venc.localeCompare(b.venc));
}

function achar(kind, key) {
  if (kind === 'pedido') {
    const d = state.pedidos.find(x => x.id === key);
    return d && itensDoMes(d.venc.slice(0, 7)).find(i => i.kind === 'pedido' && i.key === key);
  }
  return itensDoMes(key.slice(key.lastIndexOf('_') + 1)).find(i => i.key === key);
}

// registro gravável do item (pagamento do mês ou o próprio pedido)
function rec(it) {
  const r = it.kind === 'pedido' ? state.pedidos.find(d => d.id === it.key) : (state.pagamentos[it.key] ??= { pago: false });
  r.anexos ??= [];
  return r;
}

async function subir(files) {
  const out = [];
  for (const f of files || []) {
    if (f.size > 10 * 1048576) { toast(`${f.name} passa de 10 MB e não foi anexado`); continue; }
    out.push(await addAnexo(f));
  }
  return out;
}

// ---------- componentes ----------
function badge(it) {
  const s = status(it), d = diff(it.venc);
  const t = s === 'pago' ? 'Pago' : s === 'enviado' ? 'No financeiro' : s === 'atrasado' ? `Atrasado ${-d}d${it.enviado ? ' · no financeiro' : ''}` : s === 'hoje' ? 'Vence hoje'
    : s === 'proximo' ? (d === 1 ? 'Vence amanhã' : `Vence em ${d}d`) : 'A vencer';
  return `<span class="badge ${s}">${t}</span>`;
}
const ref = it => `data-kind="${it.kind}" data-key="${esc(it.key)}"`;
const btnFin = it => it.pago || it.enviado ? '' : `<button class="btn sm ico fin" data-act="enviarFin" ${ref(it)} title="Enviar ao financeiro">${ic('enviar')}<span>Financeiro</span></button>`;
const btnBaixa = it => it.pago ? '' : `<button class="btn sm primary ico" data-act="pagar" ${ref(it)} title="Dar baixa">${ic('check')}<span>Dar baixa</span></button>`;
const acoes = it => btnFin(it) + btnBaixa(it);

// ---------- WhatsApp ----------
const zapUrl = (num, txt) => {
  let n = String(num || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(txt)}`;
};
function msgFin(it) {
  const e = it.e || state.empresas.find(x => x.nome === it.titulo);
  return ['*Pagamento para o financeiro*', `Fornecedor: ${it.titulo}`, it.sub && `Referente: ${it.sub}`,
    `Valor: ${brl(it.valor)}`, `Vencimento: ${fmtData(it.venc)}`,
    it.forma && `Forma: ${it.forma}${e?.dados ? ' — ' + e.dados : ''}`, e?.cnpj && `CNPJ: ${e.cnpj}`,
    it.anexos.length && `Anexos: ${it.anexos.length} arquivo(s)`].filter(Boolean).join('\n');
}
// Celular: compartilha texto + arquivos pelo menu do sistema. Computador: abre o WhatsApp só com o texto.
async function compartilhar(txt, metas, num) {
  metas = metas || [];
  if (metas.length && navigator.share && navigator.canShare) {
    const files = (await Promise.all(metas.map(arquivoAnexo))).filter(Boolean);
    if (files.length && navigator.canShare({ files })) {
      try { await navigator.share({ text: txt, files }); return 'share'; }
      catch (e) { if (e.name === 'AbortError') return null; }
    }
  }
  window.open(zapUrl(num, txt), '_blank', 'noopener');
  return metas.length ? 'zap+arquivos' : 'zap';
}
const AVISO_ARQ = 'No computador o WhatsApp não recebe o arquivo sozinho: anexe-o na conversa.';

function linha(it) {
  const [, m, d] = it.venc.split('-');
  return `<div class="row" data-act="detalhe" ${ref(it)}>
    <div class="dt ${status(it)}"><b>${d}</b><span>${MESES[m - 1].slice(0, 3)}</span></div>
    <div class="info"><strong>${esc(it.titulo)}</strong>
      <span>${esc(it.sub || '')}${it.forma ? ' · ' + esc(it.forma) : ''}${it.anexos.length ? ` · ${ic('clip')}${it.anexos.length}` : ''}</span></div>
    <div class="val"><b>${brl(it.valor)}</b>${badge(it)}</div>
    ${acoes(it)}
  </div>`;
}
const vazio = (t, s = '') => `<div class="empty"><b>${t}</b><span>${s}</span></div>`;

// ---------- telas ----------
function vPainel() {
  const its = itensDoMes(ui.mes);
  const soma = f => its.filter(f).reduce((s, i) => s + (+i.valor || 0), 0);
  const total = soma(() => true), pago = soma(i => i.pago);
  const atras = its.filter(i => status(i) === 'atrasado');
  const pct = total ? Math.round(pago / total * 100) : 0;
  const al = alertas();
  const alKeys = new Set(al.map(i => i.key));
  const prox = its.filter(i => !i.pago && !alKeys.has(i.key)).slice(0, 6);
  const tipos = [['FIXO', 'Fixos'], ['VARIÁVEL', 'Variáveis'], ['PEDIDO', 'Pedidos']]
    .map(([k, n]) => [n, soma(i => i.tipo === k)]).filter(t => t[1] > 0);
  return `
  <div class="kpis">
    <button class="kpi" data-act="kpi" data-f="todos"><span>Previsto no mês</span><b>${brl(total)}</b><small>${its.length} pagamentos</small></button>
    <button class="kpi ok" data-act="kpi" data-f="pagos"><span>Pago</span><b>${brl(pago)}</b><small>${its.filter(i => i.pago).length} quitados</small></button>
    <button class="kpi" data-act="kpi" data-f="abertos"><span>A pagar</span><b>${brl(total - pago)}</b><small>${its.filter(i => !i.pago).length} em aberto · ${its.filter(i => i.enviado && !i.pago).length} no financeiro</small></button>
    <button class="kpi ${atras.length ? 'bad' : ''}" data-act="kpi" data-f="atrasados"><span>Atrasado</span><b>${brl(atras.reduce((s, i) => s + +i.valor, 0))}</b><small>${atras.length ? atras.length + ' vencidos' : 'nada vencido'}</small></button>
  </div>
  <div class="card prog"><div class="prog-h"><span>Progresso de ${nomeMes(ui.mes)}</span><b>${pct}% pago</b></div>
    <div class="bar"><i style="width:${pct}%"></i></div></div>
  <div class="cols">
    <div class="card"><h3>Precisa de atenção <em class="${al.length ? 'warn' : ''}">${al.length}</em></h3>
      ${al.length ? al.map(linha).join('') : vazio('Tudo em dia', `Nenhum pagamento vencido ou vencendo em ${state.config.diasAlerta} dias.`)}</div>
    <div>
      <div class="card"><h3>Próximos do mês</h3>
        ${prox.length ? prox.map(linha).join('') : vazio('Sem pendências futuras', 'Nada mais em aberto neste mês.')}</div>
      <div class="card"><h3>Para onde vai o dinheiro</h3>
        ${tipos.map(([n, v]) => `<div class="tipo"><div><span>${n}</span><b>${brl(v)}</b></div><div class="bar thin"><i style="width:${total ? v / total * 100 : 0}%"></i></div></div>`).join('')}</div>
    </div>
  </div>`;
}

function vAgenda() {
  const [y, m] = ui.mes.split('-').map(Number);
  const n = new Date(y, m, 0).getDate(), ini = new Date(y, m - 1, 1).getDay();
  const its = itensDoMes(ui.mes), porDia = {};
  its.forEach(i => (porDia[+i.venc.slice(8)] ??= []).push(i));
  const h = hoje();
  if (!ui.dia || ui.dia.slice(0, 7) !== ui.mes) {
    ui.dia = h.slice(0, 7) === ui.mes ? h : (its.find(i => !i.pago) || its[0])?.venc || `${ui.mes}-01`;
  }
  let cel = '<i></i>'.repeat(ini);
  for (let d = 1; d <= n; d++) {
    const data = `${ui.mes}-${pad(d)}`, l = porDia[d] || [];
    cel += `<button class="day ${data === h ? 'today' : ''} ${data === ui.dia ? 'sel' : ''}" data-act="dia" data-dia="${data}">
      <span class="num">${d}</span>
      <span class="chips">${l.slice(0, 3).map(i => `<span class="chip ${status(i)}">${esc(i.titulo)}</span>`).join('')}${l.length > 3 ? `<span class="more">+${l.length - 3}</span>` : ''}</span>
      <span class="dots">${l.slice(0, 5).map(i => `<i class="${status(i)}"></i>`).join('')}</span>
    </button>`;
  }
  const sel = porDia[+ui.dia.slice(8)] || [];
  return `<div class="cols agenda">
    <div class="card cal"><div class="dow">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="grid">${cel}</div>
      <div class="legend"><span><i class="pago"></i>Pago</span><span><i class="pendente"></i>A vencer</span><span><i class="enviado"></i>No financeiro</span><span><i class="proximo"></i>Vence em breve</span><span><i class="atrasado"></i>Atrasado</span></div></div>
    <div class="card"><h3>${fmtData(ui.dia)} <em>${brl(sel.reduce((s, i) => s + +i.valor, 0))}</em></h3>
      ${sel.length ? sel.map(linha).join('') : vazio('Dia livre', 'Nenhum pagamento agendado.')}
      <button class="btn block" data-act="novoPedido" data-venc="${ui.dia}">${ic('mais')}Agendar pagamento neste dia</button></div>
  </div>`;
}

function vMensais() {
  const q = ui.busca.trim().toLowerCase();
  const todos = itensDoMes(ui.mes).filter(i => i.kind === 'mensal');
  const its = todos.filter(i => {
    const s = status(i);
    if (ui.filtro === 'abertos' && i.pago) return false;
    if (ui.filtro === 'pagos' && !i.pago) return false;
    if (ui.filtro === 'atrasados' && s !== 'atrasado') return false;
    if (ui.filtro === 'financeiro' && !(i.enviado && !i.pago)) return false;
    return !q || `${i.titulo} ${i.sub} ${i.e.cnpj}`.toLowerCase().includes(q);
  });
  const chip = (k, t) => `<button class="pill ${ui.filtro === k ? 'on' : ''}" data-act="filtro" data-f="${k}">${t}</button>`;
  return `<div class="tools">
      <input id="busca" class="search" type="search" placeholder="Buscar empresa, área ou CNPJ" value="${esc(ui.busca)}" data-input="busca">
      <div class="pills">${chip('todos', 'Todos')}${chip('abertos', 'Em aberto')}${chip('financeiro', 'No financeiro')}${chip('pagos', 'Pagos')}${chip('atrasados', 'Atrasados')}</div>
      <button class="btn primary" data-act="novaEmpresa" data-cat="mensal">${ic('mais')}Empresa</button>
    </div>
    <div class="card so-cel">${its.length ? its.map(linha).join('') + `<div class="tot"><span>${its.length} de ${todos.length} contratos</span><b>${brl(its.reduce((s, i) => s + +i.valor, 0))}</b></div>` : vazio('Nada por aqui', 'Ajuste a busca ou o filtro.')}</div>
    <div class="card flush so-tela">${its.length ? `<table>
      <thead><tr><th>Empresa</th><th class="h-md">CNPJ</th><th class="h-sm">Tipo</th><th>Vence</th><th class="h-md">Forma</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${its.map(i => `<tr data-act="detalhe" ${ref(i)}>
        <td><strong>${esc(i.titulo)}</strong><small>${esc(i.sub)}</small></td>
        <td class="h-md mono">${esc(i.e.cnpj) || '—'}</td>
        <td class="h-sm"><span class="tag ${i.tipo === 'FIXO' ? 'fx' : 'vr'}">${i.tipo === 'FIXO' ? 'Fixo' : 'Variável'}</span></td>
        <td>dia ${+i.venc.slice(8)}</td>
        <td class="h-md">${esc(i.forma)}</td>
        <td class="r mono"><b>${brl(i.valor)}</b></td>
        <td>${badge(i)}${i.anexos.length ? `<span class="clipn">${ic('clip')}${i.anexos.length}</span>` : ''}</td>
        <td class="r acts">${acoes(i)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="8"><span>${its.length} de ${todos.length} contratos</span><b>${brl(its.reduce((s, i) => s + +i.valor, 0))}</b></td></tr></tfoot>
    </table>` : vazio('Nada por aqui', 'Ajuste a busca ou o filtro.')}</div>`;
}

function vPedidos() {
  const todos = state.pedidos.map(d => achar('pedido', d.id)).filter(Boolean);
  const its = todos.filter(i => ui.fPed === 'todos' || (ui.fPed === 'pagos') === i.pago)
    .sort((a, b) => ui.fPed === 'abertos' ? a.venc.localeCompare(b.venc) : b.venc.localeCompare(a.venc));
  const chip = (k, t) => `<button class="pill ${ui.fPed === k ? 'on' : ''}" data-act="fPed" data-f="${k}">${t}</button>`;
  return `<div class="tools">
      <div class="pills">${chip('abertos', 'Em aberto')}${chip('pagos', 'Pagos')}${chip('todos', 'Todos')}</div>
      <span class="grow"></span>
      <button class="btn primary" data-act="novoPedido">${ic('mais')}Pagamento único</button>
    </div>
    <div class="card">${its.length ? its.map(linha).join('')
      : vazio(todos.length ? 'Nenhum pedido neste filtro' : 'Nenhum pedido ainda', 'Anexe o pedido, a nota ou o boleto e defina o vencimento — ele entra na agenda e nos alertas.')}</div>`;
}

function vPrestadores() {
  const l = state.empresas.filter(e => e.cat === 'prestador').sort((a, b) => a.nome.localeCompare(b.nome));
  return `<div class="tools"><span class="grow muted">${l.length} prestadores cadastrados</span>
      <button class="btn primary" data-act="novaEmpresa" data-cat="prestador">${ic('mais')}Prestador</button></div>
    <div class="people">${l.map(e => `<div class="person">
      <div class="av">${esc(e.nome.slice(0, 2))}</div>
      <div class="info"><strong>${esc(e.nome)}</strong><span>${esc(e.area)}</span>${e.contato ? `<span>${esc(e.contato)}</span>` : ''}</div>
      <div class="pa"><button class="btn sm" data-act="novoPedido" data-forn="${esc(e.nome)}">Novo pedido</button>
      <button class="btn sm ghost" data-act="editarEmpresa" data-id="${e.id}">Editar</button></div></div>`).join('')}</div>`;
}

function vDocs() {
  const l = [...state.docs].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  return `<div class="tools"><span class="grow muted">${l.length} documento${l.length === 1 ? '' : 's'} arquivado${l.length === 1 ? '' : 's'}</span>
      <button class="btn primary" data-act="novoDoc">${ic('mais')}Arquivar documento</button></div>
    ${l.length ? `<div class="people">${l.map(d => `<div class="person doc">
      <div class="av">${ic('pedidos')}</div>
      <div class="info"><strong>${esc(d.titulo)}</strong><span>${fmtData(d.data)} · ${esc(d.anexo.nome)}</span></div>
      ${d.descricao ? `<p class="desc">${esc(d.descricao)}</p>` : ''}
      ${d.enviadoEm ? `<span class="badge enviado">Enviado em ${fmtData(d.enviadoEm)}</span>` : ''}
      <div class="pa"><button class="btn sm" data-act="verDoc" data-id="${d.id}">Ver</button>
        <button class="btn sm primary" data-act="enviarDoc" data-id="${d.id}">${ic('enviar')}Enviar</button>
        <span class="grow"></span><button class="btn sm danger" data-act="excluirDoc" data-id="${d.id}">Excluir</button></div></div>`).join('')}</div>`
      : `<div class="card">${vazio('Nenhum documento arquivado', 'Guarde contratos, notas e comprovantes com uma descrição e envie quando precisar.')}</div>`}`;
}

const VIEWS = {
  painel: ['Painel', vPainel], agenda: ['Agenda', vAgenda], mensais: ['Mensais', vMensais],
  pedidos: ['Pedidos', vPedidos], documentos: ['Documentos', vDocs, 'Docs'], prestadores: ['Prestadores', vPrestadores, 'Prestad.'],
};

function render() {
  const act = document.activeElement, fid = act?.id, pos = act?.selectionStart;
  if (cloud.ativo && !cloud.user) {
    app.innerHTML = `<div class="login"><div class="card"><img class="logo big" src="logo.png" alt="Gestão 360"><h1>Gestão 360</h1>
      <p>Pagamentos, pedidos e agenda em um só lugar.</p>
      ${cloud.pronto ? `<button class="btn primary block" data-act="login">Entrar com Google</button>` : '<p class="muted">Conectando…</p>'}
      ${cloud.erro ? `<p class="err">${esc(cloud.erro)}</p>` : ''}</div></div>`;
    return;
  }
  const nAl = alertas().length;
  const nav = cls => Object.entries(VIEWS).map(([k, [t, , curto]]) =>
    `<button class="${cls} ${ui.view === k ? 'on' : ''}" data-act="ir" data-v="${k}">${ic(k)}<span>${cls === 'tab' && curto || t}</span></button>`).join('');
  const comMes = !['pedidos', 'prestadores', 'documentos'].includes(ui.view);
  const anim = ui.anim ? 'in' : ''; ui.anim = false;
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img class="logo" src="logo.png" alt="Gestão 360"><div><b>Gestão 360</b><span>Pagamentos</span></div></div>
      <nav>${nav('nav')}</nav>
      <div class="cloud">${ic('nuvem')}<div>${cloud.user
        ? `<b>Sincronizado</b><span>${esc(cloud.user.email || '')}</span><button class="link" data-act="logout">Sair</button>`
        : `<b>Modo local</b><span>Dados só neste navegador</span>`}<button class="link" data-act="backup">Backup</button></div></div>
    </aside>
    <main>
      <header class="top">
        <h1>${VIEWS[ui.view][0]}</h1>
        ${comMes ? `<div class="mes"><button data-act="mes" data-d="-1" aria-label="Mês anterior">${ic('esq')}</button>
          <button class="lbl" data-act="mes" data-d="0" title="Voltar para o mês atual">${nomeMes(ui.mes)}</button>
          <button data-act="mes" data-d="1" aria-label="Próximo mês">${ic('dir')}</button></div>` : '<span class="grow"></span>'}
        <button class="btn primary novo" data-act="novo" title="Novo pagamento">${ic('mais')}<span>Novo pagamento</span></button>
        <button class="bell ${nAl ? 'on' : ''}" data-act="alertas" aria-label="Alertas de pagamento">${ic('sino')}${nAl ? `<em>${nAl}</em>` : ''}</button>
      </header>
      <section class="view ${anim}">${VIEWS[ui.view][1]()}</section>
    </main>
    <nav class="tabs">${nav('tab')}</nav>
  </div>`;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
}

// ---------- diálogos ----------
function abrir(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); }
const fechar = () => { if (dlg.open) dlg.close(); ctx = null; };
const cab = (t, s = '') => `<header><div><h2>${t}</h2>${s ? `<p>${s}</p>` : ''}</div><button class="xbtn" data-act="fechar" aria-label="Fechar">${ic('x')}</button></header>`;
const campo = (l, html, cls = '') => `<label class="f ${cls}"><span>${l}</span>${html}</label>`;
const opts = (l, v) => l.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('');

function dDetalhe(it) {
  ctx = { kind: it.kind, key: it.key };
  const e = it.e, d = it.d;
  const dados = e?.dados || '';
  const info = (l, v) => v ? `<div><span>${l}</span><b>${v}</b></div>` : '';
  abrir(`${cab(esc(it.titulo), esc(it.sub || ''))}
    <div class="body">
      <div class="hero"><div><span>${it.pago ? 'Valor pago' : 'Valor'}</span><b>${brl(it.valor)}</b></div>${badge(it)}</div>
      <div class="infos">
        ${info('Vencimento', fmtData(it.venc))}
        ${info('Pago em', it.pago ? fmtData(it.dataPago) : '')}
        ${info('Enviado ao financeiro', it.enviado ? fmtData(it.enviado) : '')}
        ${info('Forma', esc(it.forma))}
        ${info('Tipo', it.kind === 'pedido' ? 'Pedido avulso' : it.tipo === 'FIXO' ? 'Mensal fixo' : 'Mensal variável')}
        ${info('CNPJ', esc(e?.cnpj))}
        ${info('Contato', esc(e?.contato))}
      </div>
      ${dados ? `<div class="pix"><div><span>Dados para pagamento (${esc(it.forma)})</span><b class="mono">${esc(dados)}</b></div>
        <button class="btn sm" data-act="copiar" data-t="${esc(dados)}">${ic('copiar')}Copiar</button></div>` : ''}
      ${d?.obs ? `<p class="obs">${esc(d.obs)}</p>` : ''}
      <h4>Anexos</h4>
      <div class="files">${it.anexos.map(a => `<div class="file"><button class="link" data-act="ver" data-aid="${a.id}">${ic('clip')}${esc(a.nome)}</button>
        <button class="xbtn sm" data-act="delAnexo" data-aid="${a.id}" aria-label="Remover anexo">${ic('x')}</button></div>`).join('') || '<p class="muted">Nenhum arquivo anexado.</p>'}</div>
      <label class="drop">${ic('clip')}<span>Anexar pedido, boleto, nota ou comprovante</span><input type="file" multiple data-change="anexar" accept="image/*,.pdf,.xml,.doc,.docx,.xls,.xlsx"></label>
    </div>
    <footer>
      <button class="btn ghost" data-act="${it.kind === 'pedido' ? 'editarPedido' : 'editarEmpresa'}" data-id="${it.kind === 'pedido' ? it.key : e.id}">Editar</button>
      <span class="grow"></span>
      ${it.pago ? `<button class="btn" data-act="desfazer">Desfazer baixa</button>` : `${it.enviado ? `<button class="btn" data-act="desfazerEnvio">Desfazer envio</button>` : `<button class="btn fin" data-act="enviarFin" ${ref(it)}>${ic('enviar')}Financeiro</button>`}
        <button class="btn primary" data-act="pagar" ${ref(it)}>${ic('check')}Dar baixa</button>`}
    </footer>`);
}

function dPagar(it) {
  ctx = { kind: it.kind, key: it.key };
  abrir(`${cab('Dar baixa no pagamento', `${esc(it.titulo)} · vence ${fmtData(it.venc)}`)}
    <form data-form="pagar"><div class="body">
      <div class="g2">
        ${campo('Valor pago (R$)', `<input name="valor" type="number" step="0.01" min="0" required value="${(+it.valor || 0).toFixed(2)}">`)}
        ${campo('Data do pagamento', `<input name="data" type="date" required value="${hoje()}">`)}
      </div>
      ${it.tipo === 'VARIÁVEL' ? '<p class="hint">Conta variável: confira o valor da fatura deste mês.</p>' : ''}
      ${campo('Comprovante (opcional)', `<input name="arq" type="file" multiple accept="image/*,.pdf">`)}
    </div><footer><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><span class="grow"></span>
      <button class="btn primary" type="submit">${ic('check')}Confirmar pagamento</button></footer></form>`);
}

function dEmpresa(e, cat) {
  const n = !e; e ??= { cat, tipo: 'FIXO', forma: 'PIX', dia: 10 };
  const mensal = e.cat === 'mensal';
  abrir(`${cab(n ? (mensal ? 'Nova empresa mensal' : 'Novo prestador') : 'Editar cadastro')}
    <form data-form="empresa" data-id="${e.id || ''}" data-cat="${e.cat}"><div class="body">
      ${campo('Nome', `<input name="nome" required value="${esc(e.nome)}" autocomplete="off">`)}
      ${campo(mensal ? 'Área de manutenção' : 'Serviço', `<input name="area" value="${esc(e.area)}">`)}
      <div class="g2">
        ${campo('CNPJ / CPF', `<input name="cnpj" value="${esc(e.cnpj)}">`)}
        ${campo('Contato', `<input name="contato" value="${esc(e.contato)}" placeholder="Telefone ou e-mail">`)}
      </div>
      ${mensal ? `<div class="g3">
        ${campo('Valor (R$)', `<input name="valor" type="number" step="0.01" min="0" required value="${e.valor ?? ''}">`)}
        ${campo('Dia do vencimento', `<input name="dia" type="number" min="1" max="31" required value="${e.dia}">`)}
        ${campo('Tipo', `<select name="tipo">${opts(['FIXO', 'VARIÁVEL'], e.tipo)}</select>`)}
      </div>
      <div class="g2">
        ${campo('Forma de pagamento', `<select name="forma">${opts(FORMAS, e.forma)}</select>`)}
        ${campo('Chave PIX / dados', `<input name="dados" value="${esc(e.dados)}">`)}
      </div>` : campo('Chave PIX / dados de pagamento', `<input name="dados" value="${esc(e.dados)}">`)}
    </div><footer>${n ? '' : `<button type="button" class="btn danger" data-act="excluirEmpresa" data-id="${e.id}">Excluir</button>`}
      <span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button>
      <button class="btn primary" type="submit">Salvar</button></footer></form>`);
}

function dPedido(d, pre = {}) {
  const n = !d; d ??= { fornecedor: pre.forn || '', venc: pre.venc || hoje(), forma: 'PIX' };
  abrir(`${cab(n ? 'Novo pagamento único' : 'Editar pagamento', 'Entra na agenda e nos alertas pelo vencimento.')}
    <form data-form="pedido" data-id="${d.id || ''}"><div class="body">
      ${campo('Fornecedor', `<input name="fornecedor" required list="forn" value="${esc(d.fornecedor)}" autocomplete="off">
        <datalist id="forn">${state.empresas.map(e => `<option value="${esc(e.nome)}">`).join('')}</datalist>`)}
      ${campo('Descrição', `<input name="descricao" required value="${esc(d.descricao)}" placeholder="Ex.: troca de vidro da portaria">`)}
      <div class="g3">
        ${campo('Valor (R$)', `<input name="valor" type="number" step="0.01" min="0" required value="${d.valor ?? ''}">`)}
        ${campo('Vencimento', `<input name="venc" type="date" required value="${d.venc}">`)}
        ${campo('Forma', `<select name="forma">${opts(FORMAS, d.forma)}</select>`)}
      </div>
      ${campo('Observações', `<textarea name="obs" rows="2">${esc(d.obs)}</textarea>`)}
      ${campo(n ? 'Anexar pedido / nota / boleto' : 'Adicionar anexos', `<input name="arq" type="file" multiple accept="image/*,.pdf,.xml,.doc,.docx,.xls,.xlsx">`)}
    </div><footer>${n ? '' : `<button type="button" class="btn danger" data-act="excluirPedido" data-id="${d.id}">Excluir</button>`}
      <span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button>
      <button class="btn primary" type="submit">Salvar pagamento</button></footer></form>`);
}

function dAlertas() {
  const al = alertas();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  abrir(`${cab('Alertas de pagamento', al.length ? `${al.length} pagamentos pedem atenção` : 'Tudo em dia')}
    <div class="body">
      <div class="cfg">
        <label>Avisar com <select data-change="dias">${[1, 2, 3, 5, 7, 10].map(n => `<option value="${n}" ${n === state.config.diasAlerta ? 'selected' : ''}>${n} dia${n > 1 ? 's' : ''}</option>`).join('')}</select> de antecedência</label>
        ${perm === 'granted' ? '<span class="badge pago">Notificações ativas</span>'
          : perm === 'default' ? `<button class="btn sm" data-act="notif">${ic('sino')}Ativar notificações</button>`
          : '<span class="muted">Notificações bloqueadas no navegador</span>'}
      </div>
      ${al.length ? al.map(linha).join('') : vazio('Nenhum alerta', 'Nada vencido nem vencendo no período.')}
      <h4 class="sec">Dados</h4>
      <button class="btn block" style="margin-top:0" data-act="backup">Backup: baixar ou restaurar os dados</button>
      <h4 class="sec">WhatsApp</h4>
      <div class="g2">
        ${campo('Meu WhatsApp (com DDD)', `<input type="tel" data-change="zapMeu" value="${esc(state.config.zapMeu)}" placeholder="(79) 90000-0000">`)}
        ${campo('WhatsApp do financeiro', `<input type="tel" data-change="zapFin" value="${esc(state.config.zapFin)}" placeholder="(79) 90000-0000">`)}
      </div>
      <button class="btn block zapc" data-act="zapResumo">${ic('zap')}Enviar resumo dos alertas no meu WhatsApp</button>
      <div class="auto"><div><b>Aviso automático</b><span>${cloud.user ? 'Todo dia às 8h o resumo chega no seu WhatsApp, mesmo com o app fechado.' : 'Todo dia às 8h, mesmo com o app fechado. Fica disponível depois de conectar ao Firebase.'}</span></div>
        ${cloud.user ? `<button class="btn sm" data-act="zapTeste">Testar agora</button>` : ''}</div>
    </div>`);
}

function dNovo() {
  abrir(`${cab('Novo pagamento', 'Que tipo de pagamento você quer criar?')}
    <div class="body opts">
      <button class="opt" data-act="novoPedido">${ic('pedidos')}<b>Pagamento único</b><span>Pedido, nota ou boleto com data de vencimento. Dá para anexar o documento.</span></button>
      <button class="opt" data-act="novaEmpresa" data-cat="mensal">${ic('mensais')}<b>Mensal recorrente</b><span>Contrato que se repete todo mês no mesmo dia, fixo ou variável.</span></button>
    </div>`);
}

function dEnviar(it) {
  ctx = { kind: it.kind, key: it.key };
  const num = state.config.zapFin;
  abrir(`${cab('Enviar ao financeiro', `${esc(it.titulo)} · ${brl(it.valor)}`)}
    <form data-form="enviar"><div class="body">
      ${campo('Mensagem', `<textarea name="msg" rows="8">${esc(msgFin(it))}</textarea>`)}
      <p class="nota">${it.anexos.length ? `${it.anexos.length} anexo(s): pelo celular vão junto com a mensagem; pelo computador, anexe na conversa.` : 'Este pagamento não tem anexos.'}
        ${num ? `Destino: ${esc(num)}.` : 'Sem número do financeiro salvo, você escolhe o contato no WhatsApp (cadastre no sino de alertas).'}</p>
    </div><footer><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><span class="grow"></span>
      <button class="btn" type="submit" value="marcar">Só marcar como enviado</button>
      <button class="btn zapc" type="submit" value="zap">${ic('zap')}Enviar pelo WhatsApp</button></footer></form>`);
}

function dDoc() {
  abrir(`${cab('Arquivar documento', 'Guarde o arquivo com uma descrição e envie quando quiser.')}
    <form data-form="doc"><div class="body">
      ${campo('Título', `<input name="titulo" required placeholder="Ex.: Contrato de manutenção do elevador" autocomplete="off">`)}
      ${campo('Descrição', `<textarea name="descricao" rows="3" placeholder="O que é, de quem, para quê"></textarea>`)}
      ${campo('Arquivo', `<input name="arq" type="file" required accept="image/*,.pdf,.xml,.doc,.docx,.xls,.xlsx">`)}
    </div><footer><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><span class="grow"></span>
      <button class="btn" type="submit" value="arquivar">Só arquivar</button>
      <button class="btn primary" type="submit" value="enviar">${ic('enviar')}Arquivar e enviar</button></footer></form>`);
}

async function enviarDoc(d) {
  const r = await compartilhar(`*${d.titulo}*${d.descricao ? '\n' + d.descricao : ''}`, [d.anexo], state.config.zapFin);
  if (!r) return;
  d.enviadoEm = hoje(); save();
  toast(r === 'zap+arquivos' ? AVISO_ARQ : 'Documento enviado');
}

async function dVer(a) {
  const u = await urlAnexo(a);
  if (!u) return toast('Este arquivo foi anexado em outro aparelho.');
  const img = (a.tipo || '').startsWith('image/');
  abrir(`${cab(esc(a.nome))}<div class="body viewer">${img ? `<img src="${u}" alt="">` : `<iframe src="${u}" title="${esc(a.nome)}"></iframe>`}</div>
    <footer><button class="btn ghost" data-act="voltar">Voltar</button><span class="grow"></span><a class="btn primary" href="${u}" download="${esc(a.nome)}">Baixar</a></footer>`);
}

// ---------- ações ----------
const atual = () => ctx && achar(ctx.kind, ctx.key);
const reabrir = () => { const it = atual(); it ? dDetalhe(it) : fechar(); };

const acts = {
  ir: el => { ui.view = el.dataset.v; ui.anim = true; render(); window.scrollTo(0, 0); },
  kpi: el => { ui.view = 'mensais'; ui.filtro = el.dataset.f; ui.anim = true; render(); window.scrollTo(0, 0); },
  novo: dNovo,
  enviarFin: el => { const it = achar(el.dataset.kind, el.dataset.key); if (it) dEnviar(it); },
  desfazerEnvio: () => { const it = atual(); if (!it) return; delete rec(it).enviado; save(); reabrir(); toast('Envio desfeito'); },
  novoDoc: dDoc,
  verDoc: el => { const d = state.docs.find(x => x.id === el.dataset.id); if (d) dVer(d.anexo); },
  enviarDoc: el => { const d = state.docs.find(x => x.id === el.dataset.id); if (d) enviarDoc(d); },
  excluirDoc: el => {
    const d = state.docs.find(x => x.id === el.dataset.id);
    if (!d || !confirm(`Excluir "${d.titulo}" e o arquivo?`)) return;
    delAnexo(d.anexo); state.docs = state.docs.filter(x => x !== d); save(); toast('Documento excluído');
  },
  backup: () => abrir(`${cab('Backup dos dados', 'Guarde uma cópia ou traga os dados de outro lugar.')}
    <div class="body">
      <button class="btn block" data-act="exportar">Baixar cópia dos dados (.json)</button>
      <label class="drop">${ic('clip')}<span>Restaurar de um arquivo de backup</span><input type="file" accept=".json,application/json" data-change="importar"></label>
      <p class="nota" style="margin-top:10px">Restaurar troca todos os cadastros e pagamentos atuais pelos do arquivo. Os anexos não entram no backup.</p>
    </div>`),
  exportar: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `gestao360-backup-${hoje()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  zapTeste: async el => {
    el.disabled = true;
    try { const r = await avisoZapAgora(); toast(r.enviado ? `Resumo enviado: ${r.quantidade} pagamento(s)` : r.motivo); }
    catch (e) { toast('Não foi possível enviar: ' + e.message); }
    finally { el.disabled = false; }
  },
  zapResumo: () => {
    const al = alertas();
    const linhas = al.map(i => `${status(i) === 'atrasado' ? '🔴' : '🟡'} ${fmtData(i.venc).slice(0, 5)} · ${i.titulo} · ${brl(i.valor)}`);
    const txt = al.length ? `*Gestão 360 · Alertas de pagamento*\n${linhas.join('\n')}\n\nTotal: ${brl(al.reduce((s, i) => s + +i.valor, 0))}`
      : '*Gestão 360*\nTudo em dia: nenhum pagamento vencido ou vencendo.';
    window.open(zapUrl(state.config.zapMeu, txt), '_blank', 'noopener');
  },
  mes: el => { ui.mes = +el.dataset.d ? addMes(ui.mes, +el.dataset.d) : hoje().slice(0, 7); ui.dia = null; render(); },
  dia: el => { ui.dia = el.dataset.dia; render(); },
  filtro: el => { ui.filtro = el.dataset.f; render(); },
  fPed: el => { ui.fPed = el.dataset.f; render(); },
  fechar, voltar: reabrir,
  alertas: dAlertas,
  login: () => login().catch(e => toast(e.message)),
  logout: () => logout(),
  detalhe: el => { const it = achar(el.dataset.kind, el.dataset.key); if (it) dDetalhe(it); },
  pagar: el => { const it = achar(el.dataset.kind, el.dataset.key); if (it) dPagar(it); },
  desfazer: () => { const it = atual(); if (!it) return; rec(it).pago = false; save(); reabrir(); toast('Baixa desfeita'); },
  novaEmpresa: el => dEmpresa(null, el.dataset.cat),
  editarEmpresa: el => dEmpresa(state.empresas.find(e => e.id === el.dataset.id)),
  excluirEmpresa: el => {
    const e = state.empresas.find(x => x.id === el.dataset.id);
    if (!e || !confirm(`Excluir ${e.nome}? O histórico de pagamentos dela também sai da agenda.`)) return;
    state.empresas = state.empresas.filter(x => x !== e); save(); fechar(); toast('Cadastro excluído');
  },
  novoPedido: el => dPedido(null, { forn: el.dataset.forn, venc: el.dataset.venc }),
  editarPedido: el => dPedido(state.pedidos.find(d => d.id === el.dataset.id)),
  excluirPedido: el => {
    const d = state.pedidos.find(x => x.id === el.dataset.id);
    if (!d || !confirm('Excluir este pedido e seus anexos?')) return;
    (d.anexos || []).forEach(delAnexo);
    state.pedidos = state.pedidos.filter(x => x !== d); save(); fechar(); toast('Pedido excluído');
  },
  copiar: el => navigator.clipboard.writeText(el.dataset.t).then(() => toast('Copiado'), () => toast('Não foi possível copiar')),
  ver: el => { const a = atual()?.anexos.find(x => x.id === el.dataset.aid); if (a) dVer(a); },
  delAnexo: el => {
    const it = atual(); if (!it) return;
    const r = rec(it), a = r.anexos.find(x => x.id === el.dataset.aid);
    if (!a || !confirm(`Remover ${a.nome}?`)) return;
    delAnexo(a); r.anexos = r.anexos.filter(x => x !== a); save(); reabrir();
  },
  notif: async () => { await Notification.requestPermission(); dAlertas(); notificar(true); },
};

const forms = {
  async enviar(v, f, sub) {
    const it = atual(); if (!it) return;
    let r = 'marcar';
    if (sub?.value === 'zap') { r = await compartilhar(v.msg, it.anexos, state.config.zapFin); if (!r) return; }
    rec(it).enviado = hoje(); save(); fechar();
    toast(r === 'zap+arquivos' ? AVISO_ARQ : `${it.titulo}: enviado ao financeiro`);
  },
  async doc(v, f, sub) {
    const [anexo] = await subir(f.arq.files);
    if (!anexo) return;
    const d = { id: uid(), titulo: v.titulo.trim(), descricao: (v.descricao || '').trim(), data: hoje(), anexo };
    state.docs.push(d); ui.view = 'documentos'; save(); fechar();
    if (sub?.value === 'enviar') await enviarDoc(d); else toast('Documento arquivado');
  },
  async pagar(v, f) {
    const it = atual(); if (!it) return;
    const novos = await subir(f.arq.files);
    const r = rec(it);
    r.pago = true; r.valor = +v.valor; r.anexos.push(...novos);
    if (it.kind === 'pedido') r.dataPago = v.data; else r.data = v.data;
    save(); fechar(); toast(`Pagamento de ${it.titulo} registrado`);
  },
  empresa(v, f) {
    const dados = { nome: v.nome.trim(), area: (v.area || '').trim(), cnpj: (v.cnpj || '').trim(), contato: (v.contato || '').trim(), dados: (v.dados || '').trim() };
    if (f.dataset.cat === 'mensal') Object.assign(dados, { valor: +v.valor, dia: Math.min(31, Math.max(1, +v.dia)), tipo: v.tipo, forma: v.forma });
    const e = state.empresas.find(x => x.id === f.dataset.id);
    if (e) Object.assign(e, dados); else state.empresas.push({ id: uid(), cat: f.dataset.cat, ...dados });
    save(); fechar(); toast('Cadastro salvo');
  },
  async pedido(v, f) {
    const novos = await subir(f.arq.files);
    const dados = { fornecedor: v.fornecedor.trim(), descricao: v.descricao.trim(), valor: +v.valor, venc: v.venc, forma: v.forma, obs: (v.obs || '').trim() };
    const d = state.pedidos.find(x => x.id === f.dataset.id);
    if (d) { Object.assign(d, dados); (d.anexos ??= []).push(...novos); }
    else state.pedidos.push({ id: uid(), pago: false, criado: hoje(), anexos: novos, ...dados });
    ui.mes = v.venc.slice(0, 7); ui.dia = v.venc;
    save(); fechar(); toast('Pedido salvo na agenda');
  },
};

document.addEventListener('click', ev => {
  if (ev.target === dlg) return fechar();
  const el = ev.target.closest('[data-act]');
  if (el && acts[el.dataset.act]) acts[el.dataset.act](el, ev);
});
document.addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, h = forms[f.dataset.form];
  if (!h) return;
  const b = f.querySelector('[type=submit]'); b.disabled = true;
  try { await h(Object.fromEntries(new FormData(f)), f, ev.submitter); }
  catch (e) { console.error(e); toast('Não foi possível salvar: ' + e.message); }
  finally { b.disabled = false; }
});
document.addEventListener('input', ev => {
  if (ev.target.dataset.input === 'busca') { ui.busca = ev.target.value; render(); }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.change === 'zapMeu' || t.dataset.change === 'zapFin') { state.config[t.dataset.change] = t.value.trim(); save(); toast('Número salvo'); }
  if (t.dataset.change === 'importar' && t.files[0]) {
    try {
      const dados = JSON.parse(await t.files[0].text());
      if (!confirm(`Trocar os dados atuais pelos do backup (${(dados.empresas || []).length} cadastros)?`)) return;
      restaurar(dados); fechar(); toast('Backup restaurado');
    } catch (e) { toast('Não foi possível restaurar: ' + e.message); }
  }
  if (t.dataset.change === 'dias') { state.config.diasAlerta = +t.value; save(); dAlertas(); }
  if (t.dataset.change === 'anexar') {
    const it = atual(); if (!it || !t.files.length) return;
    t.closest('.drop').classList.add('busy');
    const novos = await subir(t.files);
    rec(it).anexos.push(...novos); save(); reabrir();
    if (novos.length) toast(`${novos.length} arquivo${novos.length > 1 ? 's' : ''} anexado${novos.length > 1 ? 's' : ''}`);
  }
});
dlg.addEventListener('close', () => { ctx = null; });

// ---------- lembretes ----------
function notificar(forcar) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const al = alertas(); if (!al.length) return;
  const k = 'gestao360:notif';
  if (!forcar && localStorage.getItem(k) === hoje()) return;
  localStorage.setItem(k, hoje());
  const c = s => al.filter(i => status(i) === s).length;
  const partes = [[c('atrasado'), 'atrasado(s)'], [c('hoje'), 'vence(m) hoje'], [c('proximo'), 'vence(m) em breve']].filter(p => p[0]).map(p => p.join(' '));
  try { new Notification('Gestão 360 · Pagamentos', { body: `${partes.join(' · ')} — total ${brl(al.reduce((s, i) => s + +i.valor, 0))}`, tag: 'gestao360' }); } catch {}
}

onChange(render);
render();
initCloud();
notificar();
setInterval(() => { render(); notificar(); }, 30 * 60 * 1000);
