// Aba "Impressoras": controle das impressoras locadas (COPYGRAF) e do valor a pagar por mês.
// As contas ficam em imp-calc.js; aqui estão as telas, os diálogos e as ações.
import { state, save, cloud, uid, delAnexo, souFuncionario, lerFuncionarios, salvarFuncionarios } from './store.js';
import * as C from './imp-calc.js';
import { criarXlsx, lerXlsx, lerCsv, serialParaIso, E } from './xlsx.js';

let h; // utilidades do app.js (esc, ic, abrir, fechar, cab, campo, toast, render, ui, subir, dVer, baixar, dPedido, hoje, fmtData, nomeMes, MESES, vazio)
export function initImp(util) { h = util; }

const D = () => state.imp;
const btnAviso = a => a.tipo === 'conferir'
  ? `<button class="btn sm primary" data-act="impIrConferir" data-mes="${a.mes}">Conferir</button>`
  : `<button class="btn sm primary" data-act="impIrLancar" data-data="${a.data || ''}" data-mes="${a.mes || ''}">Lançar</button>`;
const botaoZap = () => `<button class="btn sm zapc" data-act="impZap" title="Abre o WhatsApp com o aviso pronto">${h.ic('zap')}Avisar no WhatsApp</button>`;
const U = () => (h.ui.imp ??= { sub: 'conferir', setor: '', lanc: null, rel: null });
const eu = () => cloud.user?.email || 'neste aparelho';
// Administrador = dono dos dados (quem compartilhou) ou quem usa sozinho.
const souAdmin = () => !cloud.user || !cloud.equipe || cloud.equipe.id === cloud.user.uid;
const int = n => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const brl = c => c == null ? '—' : ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const precoTxt = v4 => 'R$ ' + C.txt4(v4).replace('.', ',');
const mesCurto = ym => `${h.MESES[+ym.slice(5) - 1].slice(0, 3).toLowerCase()}/${ym.slice(2, 4)}`;
const quando = t => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const tagTipo = t => `<span class="tag ${t === 'COLORIDA' ? 'vr' : 'fx'}">${t === 'COLORIDA' ? 'Colorida' : 'P&amp;B'}</span>`;
const num = t => { const s = String(t ?? '').replace(/[.\s]/g, ''); return /^\d{1,9}$/.test(s) ? Number(s) : null; };
const agrupar = (itens, chave) => { const m = new Map(); for (const i of itens) { const k = chave(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); } return [...m.entries()]; };
const sel = (name, pares, atual, extra = '') => `<select name="${name}" ${extra}>${pares.map(([v, t]) => `<option value="${h.esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${h.esc(t)}</option>`).join('')}</select>`;
const nomeImp = id => { const p = D().impressoras.find(x => x.id === id); return p ? C.rotulo(p) : '—'; };
const aberto = mes => { if (!C.mesFechado(D(), mes)) return true; h.toast(`${h.nomeMes(mes)} está fechado. Só o administrador reabre.`); return false; };
const garantirMes = mes => (D().meses[mes] ??= { desconto: '0', obs: '', status: 'ABERTO' });
function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- lançamento rápido ----------
function lanc() {
  const u = U();
  if (!u.lanc) { const data = h.hoje(), s = C.sugerir(data, D()); u.lanc = { data, tipo: s.tipo, mes: s.mes, vals: {} }; }
  return u.lanc;
}
const noLugar = (pid, L) => D().leituras.find(l => l.imp === pid && (L.tipo === 'FECHAMENTO' ? l.tipo === 'FECHAMENTO' && l.mes === L.mes : l.tipo === L.tipo && l.data === L.data));

function parcialHtml(p, L) {
  const d = D(), ex = noLugar(p.id, L), digitado = L.vals[p.id];
  const txt = digitado ?? (ex ? String(ex.cont) : '');
  if (!txt.trim()) return '<span class="muted">—</span>';
  const n = num(txt);
  if (n == null) return '<span class="badge atrasado">número inválido</span>';
  const base = C.baseAnterior(d, p, L.mes);
  if (!base) return '<span class="badge proximo">sem leitura inicial</span>';
  const menor = n < C.referenciaAnterior(d, p, L.mes, L.data, ex?.id);
  return `<b>${int(n - base.cont)}</b>${menor ? ' <span class="badge atrasado" title="Contador menor que o anterior – possível troca de máquina ou erro de digitação">menor que o anterior</span>'
    : ex && (digitado == null || num(digitado) === ex.cont) ? ' <span class="badge pago">lançado</span>' : ''}`;
}

function vLancar() {
  const d = D(), L = lanc(), trava = C.mesFechado(d, L.mes);
  const grupos = agrupar(C.ordenadas(d).filter(p => p.status === 'ATIVA'), p => p.setorId);
  const jaFech = L.tipo === 'FECHAMENTO' && grupos.some(([, ps]) => ps.some(p => noLugar(p.id, L)));
  const mesFolha = h.hoje().slice(0, 7), fechou = L.tipo === 'FECHAMENTO' && L.mes === mesFolha;
  return `<div class="card lc-atalhos"><b>O que você vai lançar?</b>
      <div class="pills">
        <button class="pill ${!fechou && L.tipo !== 'FECHAMENTO' ? 'on' : ''}" data-act="impAtalhoHoje">Leitura de hoje (segunda ou sexta)</button>
        <button class="pill ${fechou ? 'on' : ''}" data-act="impAtalhoFech" data-mes="${mesFolha}">Fechamento da folha de ${h.nomeMes(mesFolha)} (lido em ${h.fmtData(mesFolha + '-06').slice(0, 5)})</button>
      </div>
      <p class="nota">A folha fecha com a leitura do dia 06 e leva o nome do mês em que fecha. O pagamento é no mês seguinte: a folha de ${h.nomeMes(mesFolha)} é paga em ${h.nomeMes(C.mesPagamento(mesFolha))}.
        Os números que já estão nos campos são os que estão salvos: é só trocar pelo contador do relatório e salvar.</p></div>
    <div class="card">
      <div class="g3">
        ${h.campo('Data da leitura', `<input id="lcData" type="date" value="${L.data}" data-change="impLanc" data-k="data">`)}
        ${h.campo('Tipo da leitura', sel('tipo', Object.entries(C.TIPOS), L.tipo, 'id="lcTipo" data-change="impLanc" data-k="tipo"'))}
        ${h.campo('Mês de referência', `<input id="lcMes" type="month" value="${L.mes}" data-change="impLanc" data-k="mes">`)}
      </div>
      <p class="nota">Digite o número que aparece no contador de cada impressora. A subtração é feita pelo sistema.
        O tipo é sugerido pelo dia da semana (${C.DIAS[C.dataDe(L.data).getDay()].toLowerCase()}); confira o mês de referência quando o fechamento for lido no começo do mês seguinte.</p>
      ${trava ? `<p class="hint">${h.nomeMes(L.mes)} está fechado: as leituras desse mês estão travadas.</p>` : ''}
      ${jaFech && !trava ? `<p class="hint">Já existe fechamento de ${h.nomeMes(L.mes)}. Se você mudar o número, o sistema pede confirmação antes de substituir.</p>` : ''}
    </div>
    ${grupos.map(([sid, ps]) => `<div class="card flush"><h3 class="imp-h">${h.esc(C.nomeSetor(d, sid))}${ps[0].resp ? ` <em>${h.esc(ps[0].resp)}</em>` : ''}</h3>
      <div class="imp-scroll"><table class="imp-lanc">
      <thead><tr><th>Impressora</th><th class="h-sm">Tipo</th><th class="r">Fech. anterior</th><th class="r">Última leitura</th><th class="r">Contador agora</th><th class="r">Parcial do mês</th></tr></thead>
      <tbody>${ps.map(p => {
        const ex = noLugar(p.id, L), base = C.baseAnterior(d, p, L.mes), ult = C.ultimaLeitura(d, p.id);
        return `<tr><td><strong>${h.esc(C.rotulo(p))}</strong><small>${h.esc(p.modelo || '')}</small></td>
          <td class="h-sm">${tagTipo(p.tipo)}</td>
          <td class="r mono">${base ? int(base.cont) : '—'}</td>
          <td class="r mono">${ult ? `${int(ult.cont)}<small> · ${h.fmtData(ult.data).slice(0, 5)}</small>` : base ? `${int(base.cont)}<small> · inicial</small>` : '—'}</td>
          <td class="r"><input id="lc-${p.id}" class="cont" inputmode="numeric" autocomplete="off" placeholder="contador" data-input="impCont" data-id="${p.id}"
            value="${h.esc(L.vals[p.id] ?? (ex ? String(ex.cont) : ''))}" ${trava ? 'disabled' : ''}></td>
          <td class="r mono" id="lp-${p.id}">${parcialHtml(p, L)}</td></tr>`;
      }).join('')}</tbody></table></div></div>`).join('')}
    <div class="tools imp-salvar"><span class="grow muted">${Object.keys(L.vals).length ? 'Há números digitados ainda não salvos.' : 'Um botão salva todas as impressoras de uma vez.'}</span>
      <button class="btn ghost" data-act="impLimparLote">Limpar</button>
      <button class="btn primary" data-act="impSalvarLote" ${trava ? 'disabled' : ''}>${h.ic('check')}Salvar leituras</button></div>`;
}

function salvarLote() {
  const d = D(), L = lanc();
  if (!C.dataValida(L.data) || !C.mesValido(L.mes)) return h.toast('Confira a data e o mês de referência.');
  if (!aberto(L.mes)) return;
  const itens = [];
  for (const p of C.ativas(d)) {
    const txt = L.vals[p.id];
    if (txt == null) continue;
    const ex = noLugar(p.id, L);
    if (!txt.trim()) continue;
    const n = num(txt);
    if (n == null) return h.toast(`Número inválido em ${C.rotulo(p)}.`);
    if (ex && ex.cont === n) continue;
    itens.push({ p, n, ex, ref: C.referenciaAnterior(d, p, L.mes, L.data, ex?.id) });
  }
  if (!itens.length) return h.toast('Nenhum número novo para salvar.');
  const menores = itens.filter(i => i.n < i.ref);
  if (menores.length && !confirm(`Contador menor que o anterior – possível troca de máquina ou erro de digitação:\n\n${menores.map(i => `• ${C.rotulo(i.p)}: digitado ${int(i.n)}, anterior ${int(i.ref)}`).join('\n')}\n\nSalvar mesmo assim?`)) return;
  const subst = itens.filter(i => i.ex && L.tipo === 'FECHAMENTO');
  if (subst.length && !confirm(`Já existe fechamento de ${h.nomeMes(L.mes)} para:\n\n${subst.map(i => `• ${C.rotulo(i.p)}: ${int(i.ex.cont)} → ${int(i.n)}`).join('\n')}\n\nSubstituir?`)) return;
  const agora = new Date().toISOString();
  for (const i of itens) {
    if (i.ex) {
      const antes = { data: i.ex.data, mes: i.ex.mes, tipo: i.ex.tipo, cont: i.ex.cont };
      Object.assign(i.ex, { cont: i.n, data: L.data, altPor: eu(), altEm: agora });
      C.registrar(d, 'ALTEROU', i.ex, eu(), antes);
    } else {
      const l = { id: uid(), imp: i.p.id, data: L.data, mes: L.mes, tipo: L.tipo, cont: i.n, obs: '', origem: 'manual', por: eu(), em: agora };
      d.leituras.push(l); C.registrar(d, 'CRIOU', l, eu());
    }
  }
  L.vals = {};
  h.ui.mes = L.mes;
  save();
  h.toast(`${itens.length} leitura${itens.length > 1 ? 's' : ''} salva${itens.length > 1 ? 's' : ''} em ${h.nomeMes(L.mes)}`);
}

// ---------- tela do mês (grade parecida com a planilha) ----------
function vMes() {
  const d = D(), mes = h.ui.mes, r = C.resumoMes(d, mes);
  if (!r.linhas.length && !r.soltos.length) return `<div class="card">${h.vazio(`Nada em ${h.nomeMes(mes)}`, 'Nenhuma impressora tinha leitura neste mês.')}</div>`;
  const ord = { SEG: 0, SEX: 0, FECHAMENTO: 1 };
  const grade = ([sid, ls]) => {
    const chaves = [...new Set(ls.flatMap(l => l.leituras.map(x => `${ord[x.tipo]}|${x.data}|${x.tipo}`)))].sort();
    const completo = ls.every(l => l.sit === 'FECHADO' || l.sit === 'IMPORTADO');
    return `<div class="card flush"><h3 class="imp-h">${h.esc(C.nomeSetor(d, sid))}${ls[0].p.resp ? ` <em>${h.esc(ls[0].p.resp)}</em>` : ''}</h3>
      <div class="imp-scroll"><table class="imp-grade">
      <thead><tr><th>Leitura</th>${ls.map(l => `<th class="r">${h.esc(C.rotulo(l.p))}<small>${l.p.tipo === 'COLORIDA' ? 'Colorida' : 'P&amp;B'}${l.p.status !== 'ATIVA' ? ' · ' + l.p.status.toLowerCase() : ''}</small></th>`).join('')}</tr></thead>
      <tbody>
        <tr class="imp-base"><td>Fechamento mês anterior</td>${ls.map(l => `<td class="r mono">${l.base ? `${int(l.base.cont)}${l.base.mes !== C.somaMes(mes, -1) ? `<small> ${mesCurto(l.base.mes)}</small>` : ''}` : '—'}</td>`).join('')}</tr>
        ${chaves.map(k => { const [, data, tipo] = k.split('|');
          return `<tr><td>${h.fmtData(data)} <span class="badge ${tipo === 'FECHAMENTO' ? 'enviado' : ''}">${C.TIPO_CURTO[tipo]}</span></td>${ls.map(l => {
            const x = l.leituras.find(q => q.data === data && q.tipo === tipo);
            return `<td class="r mono">${x ? `<button class="link" data-act="impEditar" data-id="${x.id}" title="Editar ou excluir">${int(x.cont)}</button>` : ''}</td>`;
          }).join('')}</tr>`; }).join('')}
        <tr class="imp-tot"><td>${completo ? 'Total do mês' : 'PARCIAL'}</td>${ls.map(l => `<td class="r mono">${
          l.sit === 'SEM_LEITURA' ? '<span class="muted">sem leitura</span>' : l.sit === 'SEM_BASE' ? '<span class="badge proximo">sem leitura inicial</span>'
          : `<b>${int(l.pag)}</b>${l.sit === 'PARCIAL' ? ' <span class="badge proximo">parcial</span>' : l.sit === 'IMPORTADO' ? ' <span class="badge">planilha</span>' : ''}${l.pag < 0 ? ' <span class="badge atrasado">conferir</span>' : ''}`}</td>`).join('')}</tr>
      </tbody></table></div></div>`;
  };
  const logs = d.log.filter(x => x.l.mes === mes).slice(-12).reverse();
  return `<div class="tools"><span class="badge ${r.status === 'FECHADO' ? 'pago' : 'pendente'}">${r.status === 'FECHADO' ? 'Mês fechado' : 'Mês aberto'}</span>
      <span class="grow muted">${r.parcial ? `${r.pendentes} impressora${r.pendentes > 1 ? 's' : ''} sem fechamento: total parcial pela última leitura.` : 'Todas as impressoras com total definido.'}</span>
      ${souFuncionario() ? '' : `<button class="btn" data-act="impSub" data-s="cobranca">Ver cobrança</button>`}
      ${r.status === 'FECHADO' ? '' : `<button class="btn primary" data-act="impIrLancar">${h.ic('mais')}Lançar leituras</button>`}</div>
    ${agrupar(r.linhas, l => l.setorId).map(grade).join('')}
    ${r.soltos.length ? `<div class="card"><h3>Páginas sem impressora identificada</h3>${r.soltos.map(t => `<p class="nota">${tagTipo(t.tipo)} <b>${int(t.pag)}</b> páginas — ${h.esc(t.obs || '')}</p>`).join('')}</div>` : ''}
    ${logs.length ? `<div class="card"><h3>Alterações registradas</h3>${logs.map(x => `<p class="nota">${quando(x.q)} · <b>${h.esc(x.por)}</b> ${x.acao === 'CRIOU' ? 'lançou' : x.acao === 'ALTEROU' ? 'alterou' : 'excluiu'}
      ${h.esc(nomeImp(x.l.imp))} · ${C.TIPO_CURTO[x.l.tipo]} ${h.fmtData(x.l.data)} · ${x.antes && x.antes.cont !== x.l.cont ? `${int(x.antes.cont)} → ` : ''}${int(x.l.cont)}</p>`).join('')}</div>` : ''}`;
}


// ---------- conferência (tela simples para bater número por número) ----------
function vConferir() {
  const d = D(), mes = h.ui.mes, r = C.resumoMes(d, mes), info = r.info, conf = info.conf || {};
  if (!r.temDado) return `<div class="card">${h.vazio(`Sem leituras em ${h.nomeMes(mes)}`, 'Lance as leituras para poder conferir.')}</div>`;
  const nums = new Map(); let n = 0;
  for (const p of C.ordenadas(d)) if (p.status === 'ATIVA') nums.set(p.id, ++n);
  const ok = l => !!conf[l.p.id] && conf[l.p.id].pag === l.pag && l.pag != null;
  const feitas = r.linhas.filter(ok).length, tot = r.linhas.length, pct = tot ? Math.round(feitas / tot * 100) : 0;
  const nf = info.valorNf ? C.dec4(info.valorNf) : null, dif = nf != null ? C.centavos(nf) - r.total : null;
  const chip = l => l.sit === 'FECHADO' ? '<span class="badge pago">Fechamento</span>' : l.sit === 'PARCIAL' ? '<span class="badge proximo">Parcial</span>'
    : l.sit === 'IMPORTADO' ? '<span class="badge">Da planilha</span>' : l.sit === 'SEM_BASE' ? '<span class="badge proximo">Sem leitura inicial</span>' : '<span class="badge atrasado">Sem leitura</span>';
  const linha = l => {
    const ref = l.fechamento || l.ultima, c = ok(l);
    return `<div class="cf-row ${c ? 'feito' : ''} ${l.alerta ? 'alerta' : ''}">
      <div class="cf-id"><b>${nums.get(l.p.id) ? String(nums.get(l.p.id)).padStart(2, '0') : '—'}</b></div>
      <div class="cf-nome"><strong>${h.esc(C.rotulo(l.p))}</strong><span>${h.esc(l.p.modelo || '')} ${tagTipo(l.p.tipo)} ${l.p.status !== 'ATIVA' ? `<span class="badge proximo">${l.p.status === 'SUBSTITUIDA' ? 'substituída' : 'desativada'}</span>` : ''}</span></div>
      <div class="cf-ant cf-cont"><span>Anterior</span><b>${l.base ? int(l.base.cont) : '—'}</b></div>
      <div class="cf-seta">→</div>
      <div class="cf-atu cf-cont"><span>${l.fechamento ? 'Fechamento' : 'Última leitura'}</span>${ref
        ? `<button class="cf-edit" data-act="impEditar" data-id="${ref.id}" title="Corrigir esta leitura">${int(ref.cont)}</button>`
        : l.sit === 'IMPORTADO' ? '<b>—</b>' : `<button class="cf-edit" data-act="impIrLancar" data-mes="${mes}">lançar</button>`}</div>
      <div class="cf-pag"><b>${l.pag == null ? '—' : int(l.pag)}</b><span>páginas ${chip(l)}</span></div>
      <div class="cf-val"><b>${brl(l.valor)}</b></div>
      <button class="cf-ok" data-act="impConf" data-id="${l.p.id}" ${l.pag == null ? 'disabled' : ''} aria-pressed="${c}" title="${c ? 'Conferido — toque para desmarcar' : 'Marcar como conferido'}">${h.ic('check')}</button>
      ${l.alerta ? `<p class="cf-alerta">${h.esc(l.alerta)}</p>` : ''}
    </div>`;
  };
  return `<div class="cf-topo card">
      <div class="cf-total"><span>Folha de ${h.nomeMes(mes)} · paga em ${h.nomeMes(C.mesPagamento(mes)).split(' ')[0]}${r.parcial ? ' · parcial' : ''}</span><b>${brl(r.total)}</b>
        <small>${int(r.pagCor)} coloridas × ${r.preco ? precoTxt(r.preco.cor) : '—'} + ${int(r.pagPb)} P&amp;B × ${r.preco ? precoTxt(r.preco.pb) : '—'}${r.desconto ? ` − desconto ${brl(r.desconto)}` : ''}</small></div>
      <div class="cf-prog"><div class="prog-h"><span>Conferidas</span><b>${feitas} de ${tot}</b></div><div class="bar"><i style="width:${pct}%"></i></div>
        <div class="cf-btns no-print"><button class="btn sm" data-act="impConfTodas">${h.ic('check')}Marcar todas</button><button class="btn sm ghost" data-act="impConfLimpar">Limpar</button></div></div>
    </div>
    ${agrupar(r.linhas, l => l.setorId).map(([sid, ls]) => `<div class="card flush cf-setor"><h3 class="imp-h">${h.esc(C.nomeSetor(d, sid))}${ls[0].p.resp ? ` <em>${h.esc(ls[0].p.resp)}</em>` : ''}
        <span class="cf-sub">${int(ls.reduce((s, l) => s + (l.pag || 0), 0))} pág. · ${brl(ls.reduce((s, l) => s + (l.valor || 0), 0))}</span></h3>${ls.map(linha).join('')}</div>`).join('')}
    ${r.soltos.length ? `<div class="card"><h3>Páginas sem impressora identificada</h3>${r.soltos.map(t => `<p class="nota">${tagTipo(t.tipo)} <b>${int(t.pag)}</b> páginas · ${brl(t.valor)} — ${h.esc(t.obs || '')}</p>`).join('')}</div>` : ''}
    <form class="card cf-nf no-print" data-form="impConfNf"><h3>Bater com a nota fiscal</h3>
      <div class="cf-nfl">${h.campo('Valor da NF da COPYGRAF (R$)', `<input name="valorNf" inputmode="decimal" value="${h.esc(info.valorNf ? info.valorNf.replace('.', ',') : '')}" placeholder="0,00">`)}
        <button class="btn" type="submit">Comparar</button></div>
      ${dif == null ? '<p class="nota">Digite o valor da NF para ver se bate com o cálculo.</p>'
        : dif === 0 ? `<p class="cf-bate ok">${h.ic('check')} A NF bate com o cálculo: ${brl(r.total)}.</p>`
        : `<p class="cf-bate dif">NF ${brl(C.centavos(nf))} · cálculo ${brl(r.total)} · diferença de <b>${brl(Math.abs(dif))}</b> ${dif > 0 ? 'a mais na NF' : 'a menos na NF'}.</p>`}</form>`;
}

// ---------- cobrança do mês ----------
function vCobranca() {
  const d = D(), mes = h.ui.mes, r = C.resumoMes(d, mes), i = r.info, fech = r.status === 'FECHADO';
  if (!r.temDado) return `<div class="card">${h.vazio(`Sem leituras em ${h.nomeMes(mes)}`, 'Lance as leituras para ver o valor a pagar.')}</div>`;
  const pr = r.preco;
  const anexos = i.anexos || [];
  return `<div class="so-print imp-cab"><h2>Impressoras locadas · COPYGRAF</h2><p>Folha de ${h.nomeMes(mes)} (pagamento em ${h.nomeMes(C.mesPagamento(mes))}) · emitido em ${h.fmtData(h.hoje())}</p></div>
    ${pr ? '' : '<p class="hint">Não há preço cadastrado para este mês. Cadastre em Cadastro → Preços.</p>'}
    <div class="kpis">
      <div class="kpi"><span>Coloridas</span><b>${brl(r.valorCor)}</b><small>${int(r.pagCor)} pág. × ${pr ? precoTxt(pr.cor) : '—'}</small></div>
      <div class="kpi"><span>Preto e branco</span><b>${brl(r.valorPb)}</b><small>${int(r.pagPb)} pág. × ${pr ? precoTxt(pr.pb) : '—'}</small></div>
      <div class="kpi"><span>Desconto / ajuste</span><b>${brl(r.desconto ? -r.desconto : 0)}</b><small>${h.esc(i.obs || 'sem desconto')}</small></div>
      <div class="kpi ok"><span>Total a pagar à COPYGRAF${r.parcial ? ' · parcial' : ''}</span><b>${brl(r.total)}</b><small>Pagamento em ${h.nomeMes(C.mesPagamento(mes))} · ${fech ? `folha fechada${i.pago ? ' e paga' : ''}${i.fechadoPor ? ' por ' + h.esc(i.fechadoPor) : ''}` : r.parcial ? `${r.pendentes} sem fechamento` : 'pronta para fechar'}</small></div>
    </div>
    <div class="tools no-print">
      ${fech ? (souAdmin() ? `<button class="btn" data-act="impReabrir">Reabrir mês</button>` : '<span class="muted">Só o administrador reabre o mês.</span>')
        : `<button class="btn primary" data-act="impFechar">${h.ic('check')}Fechar mês</button>`}
      <span class="grow"></span>
      <button class="btn" data-act="impPaga">${h.ic('check')}${i.pago ? 'Desmarcar como paga' : 'Marcar como paga'}</button>
      <button class="btn" data-act="impPagamento" title="Cria o pagamento na agenda">${h.ic('mais')}Lançar em Pagamentos</button>
      <button class="btn" data-act="impImprimir">${h.ic('baixar')}Imprimir / PDF</button>
      <button class="btn" data-act="impExcel">${h.ic('baixar')}Exportar Excel</button>
    </div>
    <div class="card flush"><h3 class="imp-h">Por impressora</h3><div class="imp-scroll"><table>
      <thead><tr><th>Setor</th><th>Impressora</th><th>Tipo</th><th class="r">Fech. anterior</th><th class="r">${'Fechamento'}</th><th class="r">Páginas</th><th class="r">Valor</th></tr></thead>
      <tbody>${r.linhas.map(l => `<tr><td>${h.esc(l.setor)}</td><td><strong>${h.esc(C.rotulo(l.p))}</strong><small>${h.esc(l.p.modelo || '')}</small></td><td>${tagTipo(l.p.tipo)}</td>
        <td class="r mono">${l.base ? int(l.base.cont) : '—'}</td>
        <td class="r mono">${l.fechamento ? int(l.fechamento.cont) : l.ultima ? `${int(l.ultima.cont)} <span class="badge proximo">parcial</span>` : l.sit === 'IMPORTADO' ? '<span class="badge">planilha</span>' : '—'}</td>
        <td class="r mono"><b>${int(l.pag)}</b></td><td class="r mono">${brl(l.valor)}</td></tr>`).join('')}
        ${r.soltos.map(t => `<tr><td colspan="2">Sem impressora identificada<small>${h.esc(t.obs || '')}</small></td><td>${tagTipo(t.tipo)}</td><td></td><td></td><td class="r mono"><b>${int(t.pag)}</b></td><td class="r mono">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="imp-tot"><td colspan="5">Total${r.desconto ? ` (antes do desconto de ${brl(r.desconto)})` : ''}</td><td class="r mono"><b>${int(r.pagCor + r.pagPb)}</b></td><td class="r mono"><b>${brl(r.subtotal)}</b></td></tr>
      </tbody></table></div></div>
    <div class="card flush"><h3 class="imp-h">Por setor</h3><div class="imp-scroll"><table>
      <thead><tr><th>Setor</th><th class="r">Coloridas</th><th class="r">P&amp;B</th><th class="r">Valor</th></tr></thead>
      <tbody>${r.porSetor.map(s => `<tr><td><strong>${h.esc(s.setor)}</strong></td><td class="r mono">${int(s.cor)}</td><td class="r mono">${int(s.pb)}</td><td class="r mono">${brl(s.valor)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="cols no-print">
      <form class="card" data-form="impDesc"><h3>Desconto / ajuste</h3>
        <div class="g2">${h.campo('Desconto (R$)', `<input name="desconto" inputmode="decimal" value="${h.esc(C.txt4(C.dec4(i.desconto) || 0).replace('.', ','))}" ${fech ? 'disabled' : ''}>`)}
        ${h.campo('Observação', `<input name="obs" value="${h.esc(i.obs || '')}" placeholder="Ex.: desconto combinado" ${fech ? 'disabled' : ''}>`)}</div>
        <button class="btn" type="submit" ${fech ? 'disabled' : ''}>Salvar desconto</button></form>
      <div class="card"><h3>Nota fiscal e pagamento</h3>
        <form data-form="impNf"><div class="g3">${h.campo('Nº da NF', `<input name="nf" value="${h.esc(i.nf || '')}">`)}
          ${h.campo('Data do pagamento', `<input name="dataPag" type="date" value="${h.esc(i.dataPag || '')}">`)}
          ${h.campo('Valor pago (R$)', `<input name="valorPago" inputmode="decimal" value="${h.esc(i.valorPago ? i.valorPago.replace('.', ',') : '')}">`)}</div>
          <button class="btn" type="submit">Salvar dados da NF</button></form>
        <div class="files imp-files">${anexos.map(a => `<div class="file"><button class="link" data-act="impVerAnexo" data-aid="${a.id}">${h.ic('clip')}${h.esc(a.nome)}</button>
          <button class="btn sm" data-act="impBaixarAnexo" data-aid="${a.id}">${h.ic('baixar')}Baixar</button>
          <button class="xbtn sm" data-act="impDelAnexo" data-aid="${a.id}" aria-label="Remover anexo">${h.ic('x')}</button></div>`).join('') || '<p class="muted">Nenhuma NF anexada a este mês.</p>'}</div>
        <label class="drop">${h.ic('clip')}<span>Anexar NF, boleto ou comprovante deste mês</span><input type="file" multiple data-change="impAnexar" accept="image/*,.pdf,.xml"></label>
      </div>
    </div>
    ${i.valorPago && C.dec4(i.valorPago) != null && C.centavos(C.dec4(i.valorPago)) !== r.total ? `<p class="hint">O valor pago (${brl(C.centavos(C.dec4(i.valorPago)))}) é diferente do calculado (${brl(r.total)}).</p>` : ''}`;
}

function exportarExcel() {
  const d = D(), mes = h.ui.mes, r = C.resumoMes(d, mes), pr = r.preco;
  const n4 = v => v == null ? null : { n: C.txt4(v), e: E.PRECO }, R$ = (c, b) => c == null ? null : { n: C.txtCent(c), e: b ? E.BRL_B : E.BRL };
  const I = (n, b) => n == null ? null : { n, e: b ? E.INT_B : E.INT }, B = v => ({ v, e: E.B });
  const blob = criarXlsx([
    { nome: 'Resumo', larguras: [34, 14, 14, 16], linhas: [
      [B('Impressoras locadas · COPYGRAF')], [`Mês de referência: ${h.nomeMes(mes)}`, null, null, r.status === 'FECHADO' ? 'FECHADO' : r.parcial ? 'PARCIAL' : 'ABERTO'], [],
      [B('Item'), B('Páginas'), B('Preço'), B('Valor (R$)')],
      ['Páginas coloridas', I(r.pagCor), n4(pr?.cor), R$(r.valorCor)],
      ['Páginas preto e branco', I(r.pagPb), n4(pr?.pb), R$(r.valorPb)],
      [`Desconto / ajuste${r.info.obs ? ' — ' + r.info.obs : ''}`, null, null, R$(r.desconto ? -r.desconto : 0)],
      [B('VALOR TOTAL A PAGAR À COPYGRAF'), I(r.pagCor + r.pagPb, true), null, R$(r.total, true)], [],
      ['NF nº', r.info.nf || ''], ['Data do pagamento', r.info.dataPag ? h.fmtData(r.info.dataPag) : ''], ['Valor pago', r.info.valorPago ? R$(C.centavos(C.dec4(r.info.valorPago))) : null],
    ] },
    { nome: 'Por impressora', larguras: [22, 24, 16, 10, 15, 15, 12, 14], linhas: [
      ['Setor', 'Série', 'Modelo', 'Tipo', 'Fech. anterior', 'Fechamento', 'Páginas', 'Valor (R$)'].map(B),
      ...r.linhas.map(l => [l.setor, C.rotulo(l.p), l.p.modelo || '', l.p.tipo === 'COLORIDA' ? 'Colorida' : 'P&B', I(l.base?.cont), I((l.fechamento || l.ultima)?.cont), I(l.pag), R$(l.valor)]),
      ...r.soltos.map(t => ['Sem impressora identificada', t.obs || '', '', t.tipo === 'COLORIDA' ? 'Colorida' : 'P&B', null, null, I(t.pag), R$(t.valor)]),
      [B('Total'), null, null, null, null, null, I(r.pagCor + r.pagPb, true), R$(r.subtotal, true)],
    ] },
    { nome: 'Por setor', larguras: [26, 12, 12, 14], linhas: [['Setor', 'Coloridas', 'P&B', 'Valor (R$)'].map(B), ...r.porSetor.map(s => [s.setor, I(s.cor), I(s.pb), R$(s.valor)])] },
    { nome: 'Leituras', larguras: [22, 24, 12, 22, 12, 30], linhas: [['Setor', 'Série', 'Data', 'Tipo', 'Contador', 'Observação'].map(B),
      ...r.linhas.flatMap(l => l.leituras.map(x => [l.setor, C.rotulo(l.p), h.fmtData(x.data), C.TIPOS[x.tipo], I(x.cont), x.obs || '']))] },
  ]);
  baixarBlob(blob, `impressoras-copygraf-${mes}.xlsx`);
}

// ---------- gráficos (SVG) ----------
const CORES_G = ['#2476ff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b', '#14b8a6', '#a16207'];
const teto = max => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const curto = n => n >= 1000 ? (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : int(n);
function grafico(tipo, rotulos, series, fmt, fmtEixo = curto) {
  const W = 720, H = 250, L = 58, R = 10, T = 12, B = 30, n = rotulos.length;
  if (!n || !series.length) return '<p class="muted">Sem dados para o gráfico.</p>';
  const top = teto(Math.max(...series.flatMap(s => s.vals))), y = v => T + (H - T - B) * (1 - v / top), gw = (W - L - R) / n;
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = top * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-linha"/><text x="${L - 8}" y="${y(v) + 4}" class="g-eixo" text-anchor="end">${fmtEixo(v)}</text>`; }
  const passo = Math.ceil(n / 12);
  rotulos.forEach((r, i) => { if (i % passo === 0) g += `<text x="${L + gw * (i + .5)}" y="${H - 9}" class="g-eixo" text-anchor="middle">${r}</text>`; });
  if (tipo === 'barras') {
    const bw = Math.min(28, gw * .76 / series.length);
    series.forEach((s, k) => s.vals.forEach((v, i) => {
      const x = L + gw * (i + .5) - bw * series.length / 2 + bw * k;
      g += `<rect x="${x + 1}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, H - B - y(v))}" rx="3" fill="${s.cor}"><title>${h.esc(s.nome)} · ${rotulos[i]}: ${fmt(v)}</title></rect>`;
    }));
  } else {
    series.forEach(s => {
      g += `<polyline fill="none" stroke="${s.cor}" stroke-width="2.2" stroke-linejoin="round" points="${s.vals.map((v, i) => `${L + gw * (i + .5)},${y(v)}`).join(' ')}"/>`;
      s.vals.forEach((v, i) => { g += `<circle cx="${L + gw * (i + .5)}" cy="${y(v)}" r="3.4" fill="${s.cor}"><title>${h.esc(s.nome)} · ${rotulos[i]}: ${fmt(v)}</title></circle>`; });
    });
  }
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>
    <div class="legend">${series.map(s => `<span><i style="background:${s.cor}"></i>${h.esc(s.nome)}</span>`).join('')}</div>`;
}

// ---------- histórico e painel ----------
function vHist() {
  const d = D(), u = U(), setor = u.setor;
  const todos = C.mesesComDados(d, h.hoje().slice(0, 7)).map(m => [m, C.resumoMes(d, m)]);
  while (todos.length > 1 && !todos[todos.length - 1][1].temDado) todos.pop();   // mês atual ainda sem leitura não entra nos gráficos
  const meses = todos.map(x => x[0]);
  const dados = todos.map(([m, r]) => {
    const ls = setor ? r.linhas.filter(l => l.setorId === setor) : r.linhas;
    const cor = ls.filter(l => l.p.tipo === 'COLORIDA').reduce((s, l) => s + (l.pag || 0), 0) + (setor ? 0 : r.soltos.filter(t => t.tipo === 'COLORIDA').reduce((s, t) => s + t.pag, 0));
    const pb = ls.filter(l => l.p.tipo === 'PB').reduce((s, l) => s + (l.pag || 0), 0) + (setor ? 0 : r.soltos.filter(t => t.tipo === 'PB').reduce((s, t) => s + t.pag, 0));
    const valor = setor ? (r.preco ? C.centavos(cor * r.preco.cor + pb * r.preco.pb) : 0) : r.total;
    return { m, r, cor, pb, valor, porImp: new Map(ls.map(l => [l.p.id, l.pag || 0])) };
  });
  const rot = meses.map(mesCurto);
  const imps = C.ordenadas(d).filter(p => (!setor || p.setorId === setor) && dados.some(x => x.porImp.get(p.id) > 0));
  const ult = [...dados].reverse().find(x => x.cor + x.pb > 0);
  const rank = ult ? imps.map((p, k) => ({ p, v: ult.porImp.get(p.id) || 0, cor: CORES_G[k % CORES_G.length] })).sort((a, b) => b.v - a.v) : [];
  const maxRank = Math.max(1, ...rank.map(x => x.v));
  return `<div class="tools no-print"><label class="imp-filtro">Setor ${sel('setor', [['', 'Todos os setores'], ...d.setores.map(s => [s.id, s.nome])], setor, 'data-change="impSetorHist"')}</label>
      <span class="grow"></span><button class="btn" data-act="impImprimir">${h.ic('baixar')}Imprimir / PDF</button></div>
    <div class="cols">
      <div class="card"><h3>Páginas por mês</h3>${grafico('barras', rot, [{ nome: 'Coloridas', cor: 'var(--c1)', vals: dados.map(x => x.cor) }, { nome: 'Preto e branco', cor: 'var(--muted)', vals: dados.map(x => x.pb) }], v => int(v) + ' páginas')}</div>
      <div class="card"><h3>Valor por mês</h3>${grafico('barras', rot, [{ nome: setor ? 'Valor do setor (sem desconto)' : 'Valor a pagar', cor: 'var(--ok)', vals: dados.map(x => Math.max(0, x.valor)) }], v => brl(v), v => 'R$ ' + curto(Math.round(v / 100)))}</div>
    </div>
    <div class="card"><h3>Consumo por impressora</h3>${grafico('linhas', rot, imps.map((p, k) => ({ nome: `${C.rotulo(p)} · ${C.nomeSetor(d, p.setorId)}`, cor: CORES_G[k % CORES_G.length], vals: dados.map(x => x.porImp.get(p.id) || 0) })), v => int(v) + ' páginas')}</div>
    ${rank.length ? `<div class="card"><h3>Quem mais imprimiu em ${h.nomeMes(ult.m)}</h3>${rank.map(x => `<div class="tipo"><div><span>${h.esc(C.rotulo(x.p))} · ${h.esc(C.nomeSetor(d, x.p.setorId))} ${tagTipo(x.p.tipo)}</span><b>${int(x.v)}</b></div>
      <div class="bar thin"><i style="width:${x.v / maxRank * 100}%;background:${x.cor};box-shadow:none"></i></div></div>`).join('')}</div>` : ''}
    <div class="card flush"><h3 class="imp-h">Meses</h3><div class="imp-scroll"><table>
      <thead><tr><th>Mês</th><th class="r">Coloridas</th><th class="r">P&amp;B</th><th class="r">${setor ? 'Valor do setor' : 'Valor calculado'}</th><th class="r h-sm">Valor pago (NF)</th><th>Situação</th></tr></thead>
      <tbody>${[...dados].reverse().map(x => `<tr data-act="impAbrirMes" data-mes="${x.m}" class="clicavel"><td><strong>${h.nomeMes(x.m)}</strong>${x.r.info.nf ? `<small>NF ${h.esc(x.r.info.nf)}</small>` : ''}</td>
        <td class="r mono">${int(x.cor)}</td><td class="r mono">${int(x.pb)}</td><td class="r mono"><b>${brl(x.valor)}</b></td>
        <td class="r mono h-sm">${x.r.info.valorPago && C.dec4(x.r.info.valorPago) != null ? brl(C.centavos(C.dec4(x.r.info.valorPago))) : '—'}</td>
        <td><span class="badge ${x.r.status === 'FECHADO' ? 'pago' : 'pendente'}">${x.r.status === 'FECHADO' ? 'Fechado' : 'Aberto'}</span>${x.r.parcial && x.r.temDado ? ' <span class="badge proximo">parcial</span>' : ''}${(x.r.info.anexos || []).length ? ` <span class="clipn">${h.ic('clip')}${x.r.info.anexos.length}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function vResumo() {
  const d = D(), hoje = h.hoje(), mes = h.ui.mes, r = C.resumoMes(d, mes), av = C.avisos(d, hoje);
  const prox = []; for (let i = 0, dia = hoje; prox.length < 4 && i < 21; i++, dia = C.somaDia(dia, 1)) if (d.dias.includes(C.dataDe(dia).getDay())) prox.push(dia);
  return `<div class="kpis">
      <button class="kpi ok" data-act="impSub" data-s="cobranca"><span>${r.parcial ? 'Valor parcial' : 'Valor'} de ${h.nomeMes(mes).split(' ')[0]}</span><b>${brl(r.total)}</b><small>${r.status === 'FECHADO' ? 'mês fechado' : r.parcial ? 'pela última leitura' : 'com todos os fechamentos'}</small></button>
      <button class="kpi" data-act="impSub" data-s="mes"><span>Coloridas</span><b>${int(r.pagCor)}</b><small>${brl(r.valorCor)}</small></button>
      <button class="kpi" data-act="impSub" data-s="mes"><span>Preto e branco</span><b>${int(r.pagPb)}</b><small>${brl(r.valorPb)}</small></button>
      <button class="kpi ${av.length ? 'bad' : ''}" data-act="impIrLancar"><span>Leituras da semana</span><b>${av.filter(a => a.tipo === 'hoje' || a.tipo === 'falta').length ? 'Pendente' : 'Em dia'}</b><small>${C.ativas(d).length} impressoras ativas</small></button>
    </div>
    <div class="cols">
      <div class="card"><h3>Avisos <em class="${av.length ? 'warn' : ''}">${av.length}</em><span class="grow"></span>${av.length ? botaoZap() : ''}</h3>
        ${av.length ? av.map(a => `<div class="imp-aviso ${a.tipo}"><span>${h.esc(a.txt)}</span>${btnAviso(a)}</div>`).join('')
          : h.vazio('Leituras em dia', 'Nenhuma leitura de segunda ou sexta pendente nesta semana.')}
        <h4 class="sec">Próximos dias de registro</h4>
        <div class="pills">${prox.map(dia => `<button class="pill ${dia === hoje ? 'on' : ''}" data-act="impIrLancar" data-data="${dia}">${C.DIAS[C.dataDe(dia).getDay()].slice(0, 3)} ${h.fmtData(dia).slice(0, 5)}</button>`).join('')}</div>
        <p class="nota" style="margin-top:10px">Os dias de registro também aparecem na aba Agenda.</p></div>
      <div class="card"><h3>${h.nomeMes(mes)} por setor</h3>
        ${r.porSetor.length ? r.porSetor.map(s => `<div class="tipo"><div><span>${h.esc(s.setor)} · ${int(s.cor + s.pb)} pág.</span><b>${brl(s.valor)}</b></div><div class="bar thin"><i style="width:${r.subtotal ? Math.max(0, s.valor) / r.subtotal * 100 : 0}%"></i></div></div>`).join('')
          : h.vazio('Sem leituras neste mês')}
        <button class="btn block primary" data-act="impIrLancar">${h.ic('mais')}Lançar leituras</button></div>
    </div>`;
}


// ---------- comparativo: último valor pago e mês a mês ----------
function vComparar() {
  const d = D(), u = U();
  const todos = C.mesesComDados(d, h.hoje().slice(0, 7)).map(m => [m, C.resumoMes(d, m)]).filter(x => x[1].temDado);
  if (!todos.length) return `<div class="card">${h.vazio('Sem meses para comparar', 'Lance as leituras ou importe o histórico.')}</div>`;
  const pago = r => r.info.valorPago && C.dec4(r.info.valorPago) != null ? C.centavos(C.dec4(r.info.valorPago)) : null;
  const val = r => pago(r) ?? r.total;
  let ult = -1;
  for (let i = todos.length - 1; i >= 0 && ult < 0; i--) if (pago(todos[i][1]) != null || todos[i][1].info.pago) ult = i;
  for (let i = todos.length - 1; i >= 0 && ult < 0; i--) if (todos[i][1].status === 'FECHADO') ult = i;
  if (ult < 0) ult = todos.length - 1;
  let sel = todos.findIndex(x => x[0] === u.cmp); if (sel < 0) sel = ult;
  const [mes, r] = todos[sel], ant = sel > 0 ? todos[sel - 1][1] : null;
  const rotuloSel = sel !== ult ? 'Mês selecionado' : pago(r) != null || r.info.pago ? 'Último valor pago' : r.status === 'FECHADO' ? 'Último mês fechado' : 'Último mês com leituras · valor calculado';
  const seta = (atual, antes, fmt) => {
    if (antes == null) return '<small class="muted">sem mês anterior</small>';
    const dif = atual - antes, pct = antes ? Math.round(dif / Math.abs(antes) * 1000) / 10 : null;
    if (dif === 0) return '<small class="muted">igual ao mês anterior</small>';
    return `<small class="cmp-d ${dif > 0 ? 'sobe' : 'desce'}">${dif > 0 ? '▲' : '▼'} ${fmt(Math.abs(dif))}${pct != null ? ` (${Math.abs(pct).toLocaleString('pt-BR')}%)` : ''} vs ${mesCurto(todos[sel - 1][0])}</small>`;
  };
  const pr = r.preco, recentes = todos.slice(-12), rot = recentes.map(x => mesCurto(x[0]));
  const linhaTab = ([m, x], i) => { const a = i > 0 ? todos[i - 1][1] : null, dv = a ? val(x) - val(a) : null;
    return `<tr class="clicavel ${i === sel ? 'sel' : ''}" data-act="impCmpMes" data-mes="${m}"><td><strong>${h.nomeMes(m)}</strong>${x.parcial && x.status !== 'FECHADO' ? '<small>parcial</small>' : ''}</td>
      <td class="r mono">${int(x.pagCor)}</td><td class="r mono">${int(x.pagPb)}</td><td class="r mono"><b>${brl(val(x))}</b>${pago(x) != null || x.info.pago ? '<small> pago</small>' : ''}</td>
      <td class="r mono h-sm">${dv == null ? '—' : `<span class="cmp-d ${dv > 0 ? 'sobe' : dv < 0 ? 'desce' : ''}">${dv > 0 ? '▲' : dv < 0 ? '▼' : ''} ${brl(Math.abs(dv))}</span>`}</td></tr>`; };
  return `<div class="card cmp-hero"><div class="cmp-topo"><div><span class="cmp-k">${rotuloSel}</span><h2>Folha de ${h.nomeMes(mes)}</h2>
        <small class="muted">Paga em ${h.nomeMes(C.mesPagamento(mes))} · ${pago(r) != null ? `NF ${h.esc(r.info.nf || '—')} · pago em ${r.info.dataPag ? h.fmtData(r.info.dataPag) : '—'}` : r.info.pago ? 'Folha fechada e paga' : r.status === 'FECHADO' ? 'Mês fechado' : r.parcial ? 'Mês ainda não fechado' : 'Todas as impressoras com fechamento'}</small></div>
      <div class="cmp-total"><b>${brl(val(r))}</b>${seta(val(r), ant ? val(ant) : null, v => brl(v))}</div></div>
    <div class="cmp-folhas">
      <div><span><i class="c-cor"></i>Folhas coloridas</span><b>${int(r.pagCor)}</b><em>${brl(r.valorCor)}${pr ? ` · ${precoTxt(pr.cor)} cada` : ''}</em>${seta(r.pagCor, ant?.pagCor ?? null, v => int(v) + ' fls')}</div>
      <div><span><i class="c-pb"></i>Folhas preto e branco</span><b>${int(r.pagPb)}</b><em>${brl(r.valorPb)}${pr ? ` · ${precoTxt(pr.pb)} cada` : ''}</em>${seta(r.pagPb, ant?.pagPb ?? null, v => int(v) + ' fls')}</div>
      <div><span>Total de folhas</span><b>${int(r.pagCor + r.pagPb)}</b><em>${r.desconto ? `desconto ${brl(r.desconto)}` : 'sem desconto'}</em>${seta(r.pagCor + r.pagPb, ant ? ant.pagCor + ant.pagPb : null, v => int(v) + ' fls')}</div>
    </div></div>
    <div class="cols">
      <div class="card"><h3>Valor por mês (R$)</h3>${grafico('barras', rot, [
        { nome: 'Colorida', cor: 'var(--c1)', vals: recentes.map(x => x[1].valorCor) }, { nome: 'Preto e branco', cor: 'var(--muted)', vals: recentes.map(x => x[1].valorPb) }],
        v => brl(v), v => 'R$ ' + curto(Math.round(v / 100)))}</div>
      <div class="card"><h3>Folhas por mês</h3>${grafico('barras', rot, [
        { nome: 'Coloridas', cor: 'var(--c1)', vals: recentes.map(x => x[1].pagCor) }, { nome: 'Preto e branco', cor: 'var(--muted)', vals: recentes.map(x => x[1].pagPb) }],
        v => int(v) + ' folhas')}</div>
    </div>
    <div class="card flush"><h3 class="imp-h">Comparar mês a mês <small class="muted" style="font-weight:500">· toque num mês para ver em cima</small></h3><div class="imp-scroll"><table>
      <thead><tr><th>Mês</th><th class="r">Coloridas</th><th class="r">P&amp;B</th><th class="r">Valor</th><th class="r h-sm">Diferença</th></tr></thead>
      <tbody>${todos.map((x, i) => [x, i]).reverse().map(([x, i]) => linhaTab(x, i)).join('')}</tbody></table></div></div>`;
}

// ---------- cadastro ----------
function vCadastro() {
  const d = D(), u = U(), ST = { ATIVA: ['pago', 'Ativa'], DESATIVADA: ['', 'Desativada'], SUBSTITUIDA: ['proximo', 'Substituída'] };
  return `<div class="tools"><span class="grow muted">${d.impressoras.length} impressoras · ${C.ativas(d).length} ativas</span>
      <button class="btn" data-act="impNovoSetor">${h.ic('mais')}Setor</button>
      <button class="btn primary" data-act="impNovaImp">${h.ic('mais')}Impressora</button></div>
    <div class="card flush"><div class="imp-scroll"><table>
      <thead><tr><th>Setor</th><th>Série</th><th class="h-sm">Modelo</th><th>Tipo</th><th class="r h-md">Leitura inicial</th><th>Status</th><th></th></tr></thead>
      <tbody>${C.ordenadas(d).map(p => `<tr><td>${h.esc(C.nomeSetor(d, p.setorId))}${p.resp ? `<small>${h.esc(p.resp)}</small>` : ''}</td>
        <td><strong class="mono">${h.esc(C.rotulo(p))}</strong><small>${h.esc(p.locadora || '')}</small></td><td class="h-sm">${h.esc(p.modelo || '')}</td><td>${tagTipo(p.tipo)}</td>
        <td class="r mono h-md">${p.ini != null ? `${int(p.ini)}<small> ${p.iniMes ? mesCurto(p.iniMes) : ''}</small>` : '<span class="badge proximo">em branco</span>'}</td>
        <td><span class="badge ${ST[p.status][0]}">${ST[p.status][1]}</span>${p.status === 'SUBSTITUIDA' && p.substPor ? `<small>por ${h.esc(nomeImp(p.substPor))}</small>` : ''}</td>
        <td class="r"><button class="btn sm ghost" data-act="impEditarImp" data-id="${p.id}">Editar</button></td></tr>`).join('')
        || `<tr><td colspan="7">${h.vazio('Nenhuma impressora cadastrada', 'Use o botão Impressora ou importe o histórico abaixo.')}</td></tr>`}</tbody></table></div></div>
    <div class="cols">
      <div class="card"><h3>Tabela de preços</h3>
        <p class="nota">Cada mês usa o preço vigente naquele mês de referência. Mudou o preço? Inclua uma linha nova; a antiga fica no histórico.</p>
        <table class="imp-mini"><thead><tr><th>Válido a partir de</th><th class="r">Colorida</th><th class="r">P&amp;B</th><th></th></tr></thead>
        <tbody>${[...d.precos].sort((a, b) => b.desde.localeCompare(a.desde)).map(p => `<tr><td><strong>${h.nomeMes(p.desde)}</strong><small>${h.esc(p.obs || '')}</small></td>
          <td class="r mono">${precoTxt(C.dec4(p.cor))}</td><td class="r mono">${precoTxt(C.dec4(p.pb))}</td>
          <td class="r">${souAdmin() ? `<button class="xbtn sm" data-act="impExcluirPreco" data-id="${p.id}" aria-label="Excluir preço">${h.ic('x')}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum preço cadastrado.</td></tr>'}</tbody></table>
        <button class="btn block" data-act="impNovoPreco">${h.ic('mais')}Novo preço</button></div>
      <div>
        <div class="card"><h3>Setores</h3><div class="pills">${d.setores.map(s => `<button class="pill ${s.ativo === false ? 'off' : ''}" data-act="impEditarSetor" data-id="${s.id}">${h.esc(s.nome)}</button>`).join('') || '<span class="muted">Nenhum setor.</span>'}</div></div>
        <div class="card"><h3>Feriados extras</h3>
          <p class="nota">Os feriados nacionais, o Carnaval e a Sexta-feira Santa já estão no sistema. Inclua aqui os da cidade ou da escola.</p>
          ${(d.feriados || []).slice().sort((a, b) => a.data.localeCompare(b.data)).map(f => `<div class="file"><span>${h.fmtData(f.data)} · ${h.esc(f.nome)}</span><button class="xbtn sm" data-act="impDelFeriado" data-data="${f.data}" aria-label="Remover feriado">${h.ic('x')}</button></div>`).join('')}
          <form data-form="impFeriado" class="cf-nfl" style="margin-top:10px">${h.campo('Data', '<input name="data" type="date" required>')}${h.campo('Nome', '<input name="nome" required placeholder="Ex.: Aniversário de Aracaju">')}<button class="btn" type="submit">Adicionar</button></form></div>
        <div class="card"><h3>Dias de registro do consumo</h3>
          <div class="pills">${[1, 2, 3, 4, 5, 6].map(n => `<button class="pill ${d.dias.includes(n) ? 'on' : ''}" data-act="impDia" data-d="${n}">${C.DIAS[n].slice(0, 3)}</button>`).join('')}</div>
          <p class="nota" style="margin-top:10px">Nesses dias a Agenda, o Painel e o WhatsApp avisam que é dia de leitura. Se cair em feriado, passa para o próximo dia útil.</p>
          <label class="imp-filtro" style="margin-top:12px">Conferir a folha do mês no dia ${sel('diaConf', Array.from({ length: 28 }, (_, i) => [i + 1, i + 1]), d.diaConf, 'data-change="impDiaConf"')}</label>
          <p class="nota" style="margin-top:6px">A folha fecha com a leitura do dia 06. Esse dia entra na Agenda e no aviso de WhatsApp até a folha ser conferida ou fechada.</p>
          <p class="nota" style="margin-top:6px">${state.config.zapMeu ? `Aviso pelo WhatsApp vai para <b>${h.esc(state.config.zapMeu)}</b>.` : 'Para receber o aviso no WhatsApp, cadastre "Meu WhatsApp" no sino de alertas (aba Painel).'}</p>
          <button class="btn block" data-act="impIcs">${h.ic('agenda')}Lembrete para a agenda do celular (.ics)</button></div>
      </div>
    </div>
    ${cloud.user && !souFuncionario() && (!cloud.equipe || cloud.equipe.id === cloud.user.uid) ? `<div class="card"><h3>Acesso de funcionários</h3>
      <p class="nota">Libere uma conta Google para ver <b>somente a aba Impressoras</b> e lançar as leituras. A pessoa não enxerga pagamentos, pedidos, documentos nem valores a pagar.</p>
      <button class="btn block" data-act="impFunc">${h.ic('prestadores')}Gerenciar funcionários</button></div>` : ''}
    <div class="card"><h3>Importar planilha</h3>
      <p class="nota">Aceita o arquivo de histórico do sistema (.json) ou uma planilha de leituras (.xlsx ou .csv) com as colunas
        <b>Série, Mês de referência, Data, Tipo, Contador</b>. A importação só acrescenta: nada é apagado e leituras repetidas são ignoradas.</p>
      <label class="drop">${h.ic('clip')}<span>Escolher arquivo para importar</span><input type="file" data-change="impImportar" accept=".json,.xlsx,.csv"></label>
      <div class="tools" style="margin:12px 0 0"><button class="btn sm" data-act="impModelo">${h.ic('baixar')}Baixar planilha modelo</button>
        <button class="btn sm" data-act="impExportarHist">${h.ic('baixar')}Exportar tudo (.json)</button></div>
      ${u.rel ? `<div class="imp-rel"><b>Importação concluída</b><span>${u.rel.leituras} leituras · ${u.rel.impressoras} impressoras · ${u.rel.setores} setores · ${u.rel.precos} preços · ${u.rel.totais} totais · ${u.rel.meses} meses</span>
        ${u.rel.ignoradas.length ? `<details><summary>${u.rel.ignoradas.length} linha(s) ignorada(s)</summary>${u.rel.ignoradas.slice(0, 80).map(t => `<p class="nota">${h.esc(t)}</p>`).join('')}</details>` : ''}</div>` : ''}
    </div>`;
}

// Planilha de leituras (modelo) -> formato de importação
function linhasParaArquivo(linhas) {
  const norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const ih = linhas.findIndex(l => l.some(c => norm(c).startsWith('serie')) && l.some(c => norm(c).startsWith('contador')));
  if (ih < 0) throw new Error('Não achei as colunas "Série" e "Contador" na planilha.');
  const cab = linhas[ih].map(norm), col = ini => cab.findIndex(c => c.startsWith(ini));
  const cS = col('serie'), cM = col('mes'), cD = col('data'), cT = col('tipo'), cC = col('contador');
  if (cD < 0) throw new Error('Falta a coluna "Data" na planilha.');
  const data = v => typeof v === 'number' ? serialParaIso(v) : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(v).trim()) ? String(v).trim().split('/').reverse().map(x => x.padStart(2, '0')).join('-') : String(v ?? '').trim().slice(0, 10);
  const mes = v => typeof v === 'number' ? serialParaIso(v).slice(0, 7) : /^\d{1,2}\/\d{4}$/.test(String(v).trim()) ? String(v).trim().split('/').reverse().map(x => x.padStart(2, '0')).join('-') : String(v ?? '').trim().slice(0, 7);
  const leituras = [], ignoradas = [];
  linhas.slice(ih + 1).forEach((l, k) => {
    if (!l || l[cS] == null || String(l[cS]).trim() === '') return;
    const dt = data(l[cD]), t = norm(cT >= 0 ? l[cT] : ''), cont = num(l[cC]);
    if (!C.dataValida(dt) || cont == null) return ignoradas.push(`linha ${ih + k + 2}: data ou contador inválido`);
    const sug = C.sugerir(dt, D()), tipo = t.startsWith('fech') ? 'FECHAMENTO' : t.includes('seg') ? 'SEG' : t.includes('sex') ? 'SEX' : sug.tipo;
    const m = cM >= 0 && l[cM] != null && String(l[cM]).trim() !== '' ? mes(l[cM]) : (tipo === sug.tipo ? sug.mes : dt.slice(0, 7));
    if (C.mesFechado(D(), m)) return ignoradas.push(`linha ${ih + k + 2}: ${h.nomeMes(m)} está fechado`);
    leituras.push({ serie: String(l[cS]).trim().split(/\s|\(/)[0], data: dt, mes: m, tipo, cont, obs: '', origem: 'importacao' });
  });
  return { arq: { formato: C.FORMATO, leituras }, ignoradas };
}

function ics() {
  const d = D(), cod = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], dias = d.dias.length ? d.dias : [5];
  let dia = h.hoje(); while (!dias.includes(C.dataDe(dia).getDay())) dia = C.somaDia(dia, 1);
  const carimbo = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gestao 360//Impressoras//PT-BR', 'BEGIN:VEVENT', `UID:leitura-impressoras-${uid()}@gestao360`, `DTSTAMP:${carimbo}`,
    `DTSTART:${dia.replace(/-/g, '')}T080000`, 'DURATION:PT30M', `RRULE:FREQ=WEEKLY;BYDAY=${dias.map(n => cod[n]).join(',')}`,
    'SUMMARY:Registrar consumo das impressoras (COPYGRAF)', 'DESCRIPTION:Anotar o contador de cada impressora no Gestão 360 · Pagamentos · aba Impressoras. Se for feriado, o app passa a leitura para o próximo dia útil.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Dia de registrar o consumo das impressoras', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT',
    'BEGIN:VEVENT', `UID:conferencia-impressoras-${uid()}@gestao360`, `DTSTAMP:${carimbo}`, `DTSTART:${h.hoje().slice(0, 8).replace(/-/g, '')}${String(d.diaConf).padStart(2, '0')}T090000`, 'DURATION:PT30M',
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${d.diaConf}`, 'SUMMARY:Conferir as impressoras do mês (COPYGRAF)', 'DESCRIPTION:Conferir o fechamento do mês anterior e a NF no Gestão 360 · Pagamentos · aba Impressoras.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Dia de conferir as impressoras', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  baixarBlob(new Blob([txt], { type: 'text/calendar' }), 'leitura-impressoras.ics');
}

// ---------- tela principal ----------
const SUBS = { conferir: ['Conferir', vConferir], comparar: ['Comparativo', vComparar], resumo: ['Resumo', vResumo], lancar: ['Lançar leituras', vLancar], mes: ['Mês', vMes], cobranca: ['Cobrança', vCobranca], historico: ['Histórico', vHist], cadastro: ['Cadastro', vCadastro] };
const SUBS_FUNC = ['lancar', 'mes'];   // funcionário: lança leituras e confere a grade do mês (sem valores em R$)
export function vImpressoras() {
  const d = D(), u = U(), func = souFuncionario();
  if (func && !SUBS_FUNC.includes(u.sub)) u.sub = 'lancar';
  if (!d.impressoras.length && u.sub !== 'cadastro') {
    if (func) return `<div class="card">${h.vazio('Nenhuma impressora cadastrada ainda', 'Peça ao responsável para cadastrar as impressoras. Assim que existirem, elas aparecem aqui.')}</div>`;
    return `<div class="card">${h.vazio('Controle de impressoras locadas', 'Cadastre as impressoras ou importe o histórico para começar.')}
      <div class="tools" style="justify-content:center;margin:0"><button class="btn primary" data-act="impSub" data-s="cadastro">Abrir cadastro e importação</button></div></div>`;
  }
  return `<div class="tools no-print imp-subs"><div class="pills">${Object.entries(SUBS).filter(([k]) => !func || SUBS_FUNC.includes(k)).map(([k, [t]]) => `<button class="pill ${u.sub === k ? 'on' : ''}" data-act="impSub" data-s="${k}">${t}</button>`).join('')}</div></div>
    ${SUBS[u.sub][1]()}`;
}

// ---------- diálogos ----------
function dImp(p) {
  const d = D(), n = !p; p ??= { tipo: 'COLORIDA', locadora: 'COPYGRAF', status: 'ATIVA' };
  h.abrir(`${h.cab(n ? 'Nova impressora' : 'Editar impressora', n ? '' : h.esc(C.rotulo(p)))}
    <form data-form="impImp" data-id="${p.id || ''}"><div class="body">
      <div class="g2">${h.campo('Setor', sel('setorId', [['', '— escolha —'], ...d.setores.filter(s => s.ativo !== false || s.id === p.setorId).map(s => [s.id, s.nome])], p.setorId, 'required'))}
        ${h.campo('Responsável (opcional)', `<input name="resp" value="${h.esc(p.resp)}" placeholder="Ex.: Tiago">`)}</div>
      <div class="g2">${h.campo('Número de série', `<input name="serie" required value="${h.esc(p.serie)}" autocomplete="off">`)}
        ${h.campo('Apelido (opcional)', `<input name="apelido" value="${h.esc(p.apelido)}" placeholder="Ex.: 426">`)}</div>
      <div class="g3">${h.campo('Modelo / marca', `<input name="modelo" value="${h.esc(p.modelo)}" placeholder="EPSON WF-5810">`)}
        ${h.campo('Tipo', sel('tipo', [['COLORIDA', 'Colorida'], ['PB', 'Preto e branco']], p.tipo))}
        ${h.campo('Empresa locadora', `<input name="locadora" value="${h.esc(p.locadora ?? 'COPYGRAF')}">`)}</div>
      <div class="g2">${h.campo('Leitura inicial do contador', `<input name="ini" inputmode="numeric" value="${p.ini ?? ''}" placeholder="em branco">`)}
        ${h.campo('Mês de referência dessa leitura', `<input name="iniMes" type="month" value="${h.esc(p.iniMes || '')}">`)}</div>
      <p class="nota" style="margin-bottom:12px">A leitura inicial faz o papel de "fechamento anterior" no primeiro mês da impressora no sistema. Ex.: contador do fechamento de outubro → mês de referência outubro.</p>
      <div class="g2">${h.campo('Status', sel('status', [['ATIVA', 'Ativa'], ['DESATIVADA', 'Desativada'], ['SUBSTITUIDA', 'Substituída']], p.status))}
        ${h.campo('Substituída por', sel('substPor', [['', '—'], ...d.impressoras.filter(x => x.id !== p.id).map(x => [x.id, C.rotulo(x)])], p.substPor))}</div>
      ${h.campo('Observações', `<input name="obs" value="${h.esc(p.obs)}">`)}
    </div><footer><span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><button class="btn primary" type="submit">Salvar</button></footer></form>`);
}


function dFunc(lista) {
  h.abrir(`${h.cab('Acesso de funcionários', 'Cada pessoa entra com a própria conta Google e vê só a aba Impressoras.')}
    <form data-form="impFunc"><div class="body">
      <h4>Pessoas com acesso</h4>
      <div class="files">${lista.map(m => `<div class="file"><span class="mail">${h.esc(m)}</span>
        <button type="button" class="xbtn sm" data-act="impTirarFunc" data-m="${h.esc(m)}" aria-label="Remover ${h.esc(m)}">${h.ic('x')}</button>
        <input type="hidden" name="m" value="${h.esc(m)}"></div>`).join('') || '<p class="muted">Nenhum funcionário liberado.</p>'}</div>
      ${h.campo('Adicionar funcionário (e-mail da conta Google)', '<input name="novo" type="email" placeholder="nome@gmail.com" autocomplete="off">')}
      <p class="nota">O funcionário abre o app, toca em Entrar com Google e já cai só na aba Impressoras: pode lançar leituras e ver a grade do mês.
        Para tirar o acesso, remova o e-mail e salve. As telas dele escondem Cobrança, valores e Cadastro; o banco de dados bloqueia o acesso ao resto do sistema.</p>
    </div><footer><button type="button" class="btn ghost" data-act="fechar">Fechar</button><span class="grow"></span><button class="btn primary" type="submit">Salvar</button></footer></form>`);
}

function dLeitura(l) {
  const p = D().impressoras.find(x => x.id === l.imp), trava = C.mesFechado(D(), l.mes);
  h.abrir(`${h.cab('Leitura', `${h.esc(p ? C.rotulo(p) : '')} · ${h.esc(C.nomeSetor(D(), p?.setorId))}`)}
    <form data-form="impLeitura" data-id="${l.id}"><div class="body">
      ${trava ? `<p class="hint">${h.nomeMes(l.mes)} está fechado: a leitura não pode ser alterada.</p>` : ''}
      <div class="g2">${h.campo('Contador', `<input name="cont" inputmode="numeric" required value="${l.cont}" ${trava ? 'disabled' : ''}>`)}
        ${h.campo('Tipo', sel('tipo', Object.entries(C.TIPOS), l.tipo, trava ? 'disabled' : ''))}</div>
      <div class="g2">${h.campo('Data da leitura', `<input name="data" type="date" required value="${l.data}" ${trava ? 'disabled' : ''}>`)}
        ${h.campo('Mês de referência', `<input name="mes" type="month" required value="${l.mes}" ${trava ? 'disabled' : ''}>`)}</div>
      ${h.campo('Observação', `<input name="obs" value="${h.esc(l.obs)}" ${trava ? 'disabled' : ''}>`)}
      <p class="nota">${l.origem === 'planilha' ? 'Importada da planilha' : `Lançada por ${h.esc(l.por || '—')}`}${l.em ? ' em ' + quando(l.em) : ''}${l.altPor ? ` · alterada por ${h.esc(l.altPor)} em ${quando(l.altEm)}` : ''}</p>
    </div><footer>${trava ? '' : `<button type="button" class="btn danger" data-act="impExcluirLeitura" data-id="${l.id}">Excluir</button>`}<span class="grow"></span>
      <button type="button" class="btn ghost" data-act="fechar">Cancelar</button>${trava ? '' : '<button class="btn primary" type="submit">Salvar</button>'}</footer></form>`);
}

// ---------- ações ----------
const irLancar = (data, mes) => {
  const u = U(); u.sub = 'lancar';
  if (data && C.dataValida(data)) { const s = C.sugerir(data, D()); u.lanc = { data, tipo: s.tipo, mes: s.mes, vals: {} }; }
  else if (mes && C.mesValido(mes)) u.lanc = { data: h.hoje(), tipo: 'FECHAMENTO', mes, vals: {} };
  h.ui.view = 'impressoras'; h.ui.anim = true; h.render(); window.scrollTo(0, 0);
};
const anexoDoMes = aid => (D().meses[h.ui.mes]?.anexos || []).find(a => a.id === aid);

export const impActs = {
  impDelFeriado: el => { D().feriados = (D().feriados || []).filter(f => f.data !== el.dataset.data); save(); },
  impAtalhoHoje: () => { U().lanc = null; h.render(); },
  impAtalhoFech: el => {
    const mes = el.dataset.mes, d = D();
    const ja = d.leituras.find(l => l.tipo === 'FECHAMENTO' && l.mes === mes);
    U().lanc = { data: ja ? ja.data : mes + '-06', tipo: 'FECHAMENTO', mes, vals: {} };
    h.render(); window.scrollTo(0, 0);
  },
  impCmpMes: el => { U().cmp = el.dataset.mes; h.render(); window.scrollTo(0, 0); },
  impSub: el => { if (souFuncionario() && !SUBS_FUNC.includes(el.dataset.s)) return; U().sub = el.dataset.s; h.ui.anim = true; h.render(); window.scrollTo(0, 0); },
  impIrLancar: el => irLancar(el.dataset.data, el.dataset.mes),
  impIrConferir: el => { if (C.mesValido(el.dataset.mes)) h.ui.mes = el.dataset.mes; U().sub = 'conferir'; h.ui.view = 'impressoras'; h.ui.anim = true; h.render(); window.scrollTo(0, 0); },
  impZap: () => {
    const av = C.avisos(D(), h.hoje());
    if (!av.length) return h.toast('Nada pendente nas impressoras agora.');
    const txt = `*Gestão 360 · Impressoras*\n${av.map(a => '• ' + a.txt).join('\n')}\n\nhttps://jandsonarts-bot.github.io/gestao360-pagamentos/`;
    window.open(h.zapUrl(state.config.zapMeu, txt), '_blank', 'noopener');
  },
  impAbrirMes: el => { h.ui.mes = el.dataset.mes; U().sub = 'cobranca'; h.ui.anim = true; h.render(); window.scrollTo(0, 0); },
  impConf: el => {
    const mes = h.ui.mes, l = C.resumoMes(D(), mes).linhas.find(x => x.p.id === el.dataset.id);
    if (!l || l.pag == null) return;
    const m = garantirMes(mes), conf = (m.conf ??= {});
    if (conf[l.p.id] && conf[l.p.id].pag === l.pag) delete conf[l.p.id]; else conf[l.p.id] = { pag: l.pag, por: eu(), em: new Date().toISOString() };
    save();
  },
  impConfTodas: () => {
    const mes = h.ui.mes, m = garantirMes(mes), conf = (m.conf ??= {}), agora = new Date().toISOString();
    for (const l of C.resumoMes(D(), mes).linhas) if (l.pag != null && l.pag >= 0) conf[l.p.id] = { pag: l.pag, por: eu(), em: agora };
    save(); h.toast('Todas marcadas como conferidas');
  },
  impConfLimpar: () => { const m = garantirMes(h.ui.mes); m.conf = {}; save(); },
  impFunc: async () => {
    try { dFunc(await lerFuncionarios()); }
    catch (e) { h.toast('Não foi possível abrir: ' + e.message); }
  },
  impTirarFunc: el => dFunc([...document.querySelectorAll('#dlg input[name=m]')].map(i => i.value).filter(m => m !== el.dataset.m)),
  impSalvarLote: salvarLote,
  impLimparLote: () => { lanc().vals = {}; h.render(); },
  impEditar: el => { const l = D().leituras.find(x => x.id === el.dataset.id); if (l) dLeitura(l); },
  impExcluirLeitura: el => {
    const d = D(), l = d.leituras.find(x => x.id === el.dataset.id);
    if (!l || !aberto(l.mes) || !confirm(`Excluir a leitura de ${h.fmtData(l.data)} (${int(l.cont)})?`)) return;
    d.leituras = d.leituras.filter(x => x !== l); C.registrar(d, 'EXCLUIU', l, eu());
    save(); h.fechar(); h.toast('Leitura excluída');
  },
  impNovaImp: () => dImp(null),
  impEditarImp: el => dImp(D().impressoras.find(p => p.id === el.dataset.id)),
  impNovoSetor: () => h.abrir(`${h.cab('Novo setor')}<form data-form="impSetor" data-id=""><div class="body">${h.campo('Nome do setor', '<input name="nome" required autocomplete="off">')}</div>
    <footer><span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><button class="btn primary" type="submit">Salvar</button></footer></form>`),
  impEditarSetor: el => { const s = D().setores.find(x => x.id === el.dataset.id); if (!s) return;
    h.abrir(`${h.cab('Editar setor')}<form data-form="impSetor" data-id="${s.id}"><div class="body">${h.campo('Nome do setor', `<input name="nome" required value="${h.esc(s.nome)}" autocomplete="off">`)}
      ${h.campo('Situação', sel('ativo', [['1', 'Em uso'], ['0', 'Não usar em novos cadastros']], s.ativo === false ? '0' : '1'))}</div>
      <footer><span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><button class="btn primary" type="submit">Salvar</button></footer></form>`); },
  impNovoPreco: () => h.abrir(`${h.cab('Novo preço', 'O preço antigo continua valendo para os meses anteriores.')}<form data-form="impPreco"><div class="body">
      ${h.campo('Válido a partir do mês', `<input name="desde" type="month" required value="${h.hoje().slice(0, 7)}">`)}
      <div class="g2">${h.campo('Página colorida (R$)', '<input name="cor" inputmode="decimal" required placeholder="0,076">')}${h.campo('Página preto e branco (R$)', '<input name="pb" inputmode="decimal" required placeholder="0,025">')}</div>
      ${h.campo('Observação', '<input name="obs">')}</div>
    <footer><span class="grow"></span><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><button class="btn primary" type="submit">Salvar</button></footer></form>`),
  impExcluirPreco: el => {
    const d = D(), p = d.precos.find(x => x.id === el.dataset.id);
    if (!p || !souAdmin() || !confirm(`Excluir o preço válido a partir de ${h.nomeMes(p.desde)}? Os meses abertos passam a usar o preço anterior.`)) return;
    d.precos = d.precos.filter(x => x !== p); save(); h.toast('Preço excluído');
  },
  impDia: el => { const d = D(), n = +el.dataset.d; d.dias = d.dias.includes(n) ? d.dias.filter(x => x !== n) : [...d.dias, n].sort(); save(); },
  impFechar: () => {
    const d = D(), mes = h.ui.mes, r = C.resumoMes(d, mes);
    if (!r.preco) return h.toast('Cadastre o preço deste mês antes de fechar.');
    if (r.pendentes && !confirm(`${r.pendentes} impressora(s) ativa(s) ainda sem leitura de fechamento em ${h.nomeMes(mes)}. O total delas é parcial.\n\nFechar o mês mesmo assim?`)) return;
    if (!confirm(`Fechar ${h.nomeMes(mes)} com total de ${brl(r.total)}?\n\nAs leituras do mês ficam travadas; só o administrador reabre.`)) return;
    Object.assign(garantirMes(mes), { status: 'FECHADO', precoCor: C.txt4(r.preco.cor), precoPb: C.txt4(r.preco.pb), total: C.txtCent(r.total), fechadoPor: eu(), fechadoEm: new Date().toISOString() });
    save(); h.toast(`${h.nomeMes(mes)} fechado`);
  },
  impReabrir: () => {
    const mes = h.ui.mes;
    if (!souAdmin()) return h.toast('Só o administrador reabre o mês.');
    if (!confirm(`Reabrir ${h.nomeMes(mes)}? As leituras voltam a poder ser alteradas.`)) return;
    const m = garantirMes(mes); m.status = 'ABERTO'; delete m.precoCor; delete m.precoPb; delete m.total; m.reabertoPor = eu(); m.reabertoEm = new Date().toISOString();
    save(); h.toast(`${h.nomeMes(mes)} reaberto`);
  },
  impPaga: () => { const m = garantirMes(h.ui.mes); m.pago = !m.pago; if (m.pago) m.pagoEm = new Date().toISOString(); save(); h.toast(m.pago ? 'Folha marcada como paga' : 'Marca de paga removida'); },
  impImprimir: () => window.print(),
  impExcel: exportarExcel,
  impPagamento: () => { const mes = h.ui.mes, r = C.resumoMes(D(), mes);
    h.dPedido(null, { forn: 'COPYGRAF', venc: C.mesPagamento(mes) + '-10', valor: C.txtCent(r.total), descricao: `Impressoras locadas – folha de ${h.nomeMes(mes)} (${int(r.pagCor)} color. + ${int(r.pagPb)} P&B)` }); },
  impVerAnexo: el => { const a = anexoDoMes(el.dataset.aid); if (a) h.dVer(a); },
  impBaixarAnexo: el => { const a = anexoDoMes(el.dataset.aid); if (a) h.baixar(a); },
  impDelAnexo: el => { const m = D().meses[h.ui.mes], a = anexoDoMes(el.dataset.aid);
    if (!a || !confirm(`Remover ${a.nome}?`)) return;
    delAnexo(a); m.anexos = m.anexos.filter(x => x !== a); save(); },
  impModelo: () => baixarBlob(criarXlsx([{ nome: 'Leituras', larguras: [24, 18, 14, 22, 12], linhas: [
    ['Série', 'Mês de referência', 'Data', 'Tipo', 'Contador'].map(v => ({ v, e: E.B })),
    ['XBJX000000', '11/2026', '13/11/2026', 'Semanal – Sexta', 150500], ['XBJX000000', '11/2026', '30/11/2026', 'Fechamento do mês', 152300]] }]), 'modelo-leituras-impressoras.xlsx'),
  impExportarHist: () => { const d = D(), serie = id => d.impressoras.find(p => p.id === id)?.serie || null;
    baixarBlob(new Blob([JSON.stringify({ formato: C.FORMATO, setores: d.setores.map(s => s.nome),
      impressoras: d.impressoras.map(p => ({ setor: C.nomeSetor(d, p.setorId), resp: p.resp, serie: p.serie, apelido: p.apelido, modelo: p.modelo, tipo: p.tipo, locadora: p.locadora, ini: p.ini, iniMes: p.iniMes, status: p.status, substPorSerie: serie(p.substPor), obs: p.obs })),
      precos: d.precos.map(({ desde, cor, pb, obs }) => ({ desde, cor, pb, obs })),
      leituras: d.leituras.map(l => ({ serie: serie(l.imp), data: l.data, mes: l.mes, tipo: l.tipo, cont: l.cont, obs: l.obs, origem: l.origem })),
      totais: d.totais.map(t => ({ mes: t.mes, serie: serie(t.imp), tipo: t.tipo, pag: t.pag, obs: t.obs })),
      meses: Object.entries(d.meses).map(([mes, m]) => ({ mes, desconto: m.desconto, obs: m.obs, status: m.status })) }, null, 1)], { type: 'application/json' }), `impressoras-historico-${h.hoje()}.json`); },
  impIcs: ics,
};

export const impForms = {
  impImp(v, f) {
    const d = D(), serie = v.serie.trim().toUpperCase(), p = d.impressoras.find(x => x.id === f.dataset.id);
    if (d.impressoras.some(x => x !== p && x.serie.toUpperCase() === serie)) throw new Error('já existe uma impressora com esse número de série.');
    const ini = v.ini.trim() === '' ? null : num(v.ini);
    if (v.ini.trim() !== '' && ini == null) throw new Error('leitura inicial inválida.');
    if (ini != null && !C.mesValido(v.iniMes)) throw new Error('informe o mês de referência da leitura inicial.');
    const dados = { setorId: v.setorId || null, resp: v.resp.trim(), serie, apelido: v.apelido.trim(), modelo: v.modelo.trim(), tipo: v.tipo, locadora: v.locadora.trim() || 'COPYGRAF',
      ini, iniMes: ini != null ? v.iniMes : null, status: v.status, substPor: v.status === 'SUBSTITUIDA' ? (v.substPor || null) : null, obs: v.obs.trim() };
    if (p) Object.assign(p, dados); else d.impressoras.push({ id: uid(), ...dados });
    save(); h.fechar(); h.toast('Impressora salva');
  },
  impSetor(v, f) {
    const d = D(), nome = v.nome.trim(), s = d.setores.find(x => x.id === f.dataset.id);
    if (d.setores.some(x => x !== s && x.nome.toLowerCase() === nome.toLowerCase())) throw new Error('já existe um setor com esse nome.');
    if (s) Object.assign(s, { nome, ativo: v.ativo !== '0' }); else d.setores.push({ id: uid(), nome, ativo: true });
    save(); h.fechar(); h.toast('Setor salvo');
  },
  impPreco(v) {
    const d = D(), cor = C.dec4(v.cor), pb = C.dec4(v.pb);
    if (!C.mesValido(v.desde)) throw new Error('informe o mês de início.');
    if (cor == null || pb == null) throw new Error('preço inválido. Use até 4 casas, por exemplo 0,076.');
    if (d.precos.some(p => p.desde === v.desde)) throw new Error(`já existe um preço válido a partir de ${h.nomeMes(v.desde)}. Para corrigir, exclua aquele e inclua de novo.`);
    d.precos.push({ id: uid(), desde: v.desde, cor: C.txt4(cor), pb: C.txt4(pb), obs: (v.obs || '').trim(), por: eu(), em: new Date().toISOString() });
    save(); h.fechar(); h.toast('Preço incluído');
  },
  impLeitura(v, f) {
    const d = D(), l = d.leituras.find(x => x.id === f.dataset.id), p = l && d.impressoras.find(x => x.id === l.imp);
    if (!l || !p) return;
    const cont = num(v.cont);
    if (cont == null) throw new Error('contador inválido.');
    if (!C.dataValida(v.data) || !C.mesValido(v.mes)) throw new Error('confira a data e o mês de referência.');
    if (!aberto(l.mes) || !aberto(v.mes)) return;
    if (v.tipo === 'FECHAMENTO' && d.leituras.some(x => x !== l && x.imp === l.imp && x.tipo === 'FECHAMENTO' && x.mes === v.mes)) throw new Error(`já existe fechamento de ${h.nomeMes(v.mes)} para esta impressora.`);
    const ref = C.referenciaAnterior(d, p, v.mes, v.data, l.id);
    if (cont < ref && !confirm(`Contador menor que o anterior (${int(ref)}) – possível troca de máquina ou erro de digitação.\n\nSalvar mesmo assim?`)) return;
    const antes = { data: l.data, mes: l.mes, tipo: l.tipo, cont: l.cont };
    Object.assign(l, { cont, data: v.data, mes: v.mes, tipo: v.tipo, obs: (v.obs || '').trim(), altPor: eu(), altEm: new Date().toISOString() });
    C.registrar(d, 'ALTEROU', l, eu(), antes);
    save(); h.fechar(); h.toast('Leitura alterada');
  },
  impConfNf(v) {
    const nf = v.valorNf.trim() ? C.dec4(v.valorNf) : 0;
    if (nf == null) throw new Error('valor inválido.');
    garantirMes(h.ui.mes).valorNf = nf ? C.txt4(nf) : '';
    save();
  },
  async impFunc(v, f) {
    const lista = [...f.querySelectorAll('input[name=m]')].map(i => i.value);
    if (v.novo?.trim()) lista.push(v.novo);
    const salvo = await salvarFuncionarios(lista);
    h.toast(`Acesso salvo: ${salvo.length} funcionário${salvo.length === 1 ? '' : 's'}`); dFunc(salvo);
  },
  impFeriado(v) {
    if (!C.dataValida(v.data)) throw new Error('data inválida.');
    const d = D(); d.feriados ??= [];
    if (!d.feriados.some(f => f.data === v.data)) d.feriados.push({ data: v.data, nome: v.nome.trim() });
    save(); h.toast('Feriado incluído');
  },
  impDesc(v) {
    const mes = h.ui.mes, valor = C.dec4(v.desconto.trim() || '0');
    if (valor == null) throw new Error('desconto inválido.');
    if (!aberto(mes)) return;
    Object.assign(garantirMes(mes), { desconto: C.txt4(valor), obs: (v.obs || '').trim() });
    save(); h.toast('Desconto salvo');
  },
  impNf(v) {
    const pago = v.valorPago.trim() ? C.dec4(v.valorPago) : 0;
    if (pago == null) throw new Error('valor pago inválido.');
    Object.assign(garantirMes(h.ui.mes), { nf: v.nf.trim(), dataPag: v.dataPag || '', valorPago: pago ? C.txt4(pago) : '' });
    save(); h.toast('Dados da NF salvos');
  },
};

export const impChanges = {
  impLanc: t => {
    const L = lanc(), k = t.dataset.k;
    if (k === 'data' && C.dataValida(t.value)) { const s = C.sugerir(t.value, D()); Object.assign(L, { data: t.value, tipo: s.tipo, mes: s.mes }); }
    else if (k === 'tipo') L.tipo = t.value;
    else if (k === 'mes' && C.mesValido(t.value)) L.mes = t.value;
    h.render();
  },
  impSetorHist: t => { U().setor = t.value; h.render(); },
  impDiaConf: t => { const n = +t.value; if (n >= 1 && n <= 28) { D().diaConf = n; save(); } },
  impAnexar: async t => {
    if (!t.files.length) return;
    t.closest('.drop').classList.add('busy');
    const novos = await h.subir(t.files);
    (garantirMes(h.ui.mes).anexos ??= []).push(...novos);
    save();
    if (novos.length) h.toast(`${novos.length} arquivo${novos.length > 1 ? 's' : ''} anexado${novos.length > 1 ? 's' : ''} a ${h.nomeMes(h.ui.mes)}`);
  },
  impImportar: async t => {
    const f = t.files[0]; if (!f) return;
    try {
      let arq, ignoradas = [];
      if (/\.json$/i.test(f.name)) arq = JSON.parse(await f.text());
      else {
        const linhas = /\.csv$/i.test(f.name) ? lerCsv(await f.text()) : (abas => (abas.find(a => /leitura/i.test(a.nome)) || abas[0])?.linhas || [])(await lerXlsx(f));
        ({ arq, ignoradas } = linhasParaArquivo(linhas));
      }
      const rel = C.importar(D(), arq, eu(), uid);
      rel.ignoradas.unshift(...ignoradas);
      U().rel = rel; save();
      h.toast(`Importação concluída: ${rel.leituras} leituras`);
    } catch (e) { console.error(e); h.toast('Não foi possível importar: ' + e.message); }
  },
};

export const impInputs = {
  impCont: t => {
    const L = lanc(), p = D().impressoras.find(x => x.id === t.dataset.id);
    L.vals[t.dataset.id] = t.value;
    const cel = document.getElementById('lp-' + t.dataset.id);
    if (p && cel) cel.innerHTML = parcialHtml(p, L);
  },
};

// ---------- ganchos para a Agenda, o Painel e os lembretes ----------
export function agendaDia(data) {
  const d = D(), hoje = h.hoje(), itens = [];
  let feitas = 0, total = 0;
  if (C.ativas(d).length) {
    const s = C.situacaoDia(d, data), desde = d.avisoDesde || '0000-00-00', desl = s.diaDeLeitura && !d.dias.includes(C.dataDe(data).getDay());
    if ((s.diaDeLeitura && data >= desde || s.feitas) && (s.feitas || data >= C.somaDia(hoje, -14))) {
      const st = s.feitas >= s.total ? 'pago' : data < hoje ? (s.feitas ? 'proximo' : 'atrasado') : data === hoje ? 'hoje' : 'pendente';
      itens.push({ tipo: 'leitura', st, rotulo: desl ? 'Leitura (pós-feriado)' : 'Leitura impressoras', desl }); feitas = s.feitas; total = s.total;
    }
    const fer = C.nomeFeriado(d, data);   // feriado num dia de leitura: avisa que a leitura passa para o próximo dia útil
    if (fer && d.dias.includes(C.dataDe(data).getDay()) && data >= desde) itens.push({ tipo: 'feriado', st: 'proximo', rotulo: 'Feriado: leitura passa', fer, para: C.proximoUtil(d, data) });
  }
  if (Number(data.slice(8)) === d.diaConf) {   // dia de conferir o mês anterior
    const cf = C.conferenciaDoMes(d, data.slice(0, 7));
    if (cf) itens.push({ tipo: 'conferir', st: cf.pronta ? 'pago' : data < hoje ? 'atrasado' : data === hoje ? 'hoje' : 'pendente', rotulo: 'Conferir e fechar folha', cf });
  }
  return itens.length ? { itens, feitas, total, st: itens[0].st } : null;
}
export function agendaPainel(data) {
  const a = agendaDia(data);
  if (!a) return '';
  const cls = st => st === 'atrasado' ? 'falta' : st === 'hoje' ? 'hoje' : '';
  return a.itens.map(i => i.tipo === 'feriado'
    ? `<div class="imp-aviso hoje"><span><b>${h.esc(i.fer)}</b><br>A leitura das impressoras passa para ${C.DIAS[C.dataDe(i.para).getDay()].toLowerCase()}, ${h.fmtData(i.para).slice(0, 5)}.</span></div>`
    : i.tipo === 'leitura'
    ? `<div class="imp-aviso ${cls(i.st)}"><span><b>Leitura das impressoras${i.desl ? ' (pós-feriado)' : ''}</b><br>${a.feitas} de ${a.total} lançadas${i.st === 'pendente' ? ' · dia de registro do consumo' : ''}</span>
      <button class="btn sm ${i.st === 'pago' ? '' : 'primary'}" data-act="impIrLancar" data-data="${data}">${i.st === 'pago' ? 'Ver' : 'Lançar'}</button></div>`
    : `<div class="imp-aviso ${cls(i.st)}"><span><b>Conferir e fechar a folha de ${h.nomeMes(i.cf.mes)}</b><br>${i.cf.feitas} de ${i.cf.total} conferidas${i.cf.pronta ? ' · concluído' : ''}</span>
      <button class="btn sm ${i.st === 'pago' ? '' : 'primary'}" data-act="impIrConferir" data-mes="${i.cf.mes}">${i.st === 'pago' ? 'Ver' : 'Conferir'}</button></div>`).join('');
}
export function avisoPainel() {
  const av = C.avisos(D(), h.hoje());
  if (!av.length) return '';
  return `<div class="card imp-card-aviso"><h3>${h.ic('impressoras')}Impressoras <em class="warn">${av.length}</em><span class="grow"></span>${botaoZap()}</h3>
    ${av.map(a => `<div class="imp-aviso ${a.tipo}"><span>${h.esc(a.txt)}</span>${btnAviso(a)}</div>`).join('')}</div>`;
}
export function notificarImp() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const av = C.avisos(D(), h.hoje()).filter(a => a.tipo === 'hoje' || a.tipo === 'conferir');
  const k = 'gestao360:notif-imp';
  if (!av.length || localStorage.getItem(k) === h.hoje()) return;
  localStorage.setItem(k, h.hoje());
  try { new Notification('Gestão 360 · Impressoras', { body: av[0].txt, tag: 'gestao360-imp' }); } catch {}
}
