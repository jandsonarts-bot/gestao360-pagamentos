// Controle de impressoras locadas: regras de cálculo (sem tela).
// Dinheiro nunca passa por número quebrado (float): preços e descontos são textos decimais
// ("0.076", "51.00") convertidos para inteiros em décimos de milésimo de real (R$ 0,0001).
// Só o resultado final de cada valor é arredondado para centavos (meio para cima).

export const TIPOS = { SEG: 'Semanal – Segunda', SEX: 'Semanal – Sexta', FECHAMENTO: 'Fechamento do mês' };
export const TIPO_CURTO = { SEG: 'Seg', SEX: 'Sex', FECHAMENTO: 'Fechamento' };
export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const FORMATO = 'gestao360-impressoras-v1';

export const novo = () => ({ setores: [], impressoras: [], precos: [], leituras: [], meses: {}, totais: [], log: [], dias: [1, 5], diaConf: 5 });

export function normalizar(imp) {
  const d = Object.assign(novo(), imp || {});
  for (const k of ['setores', 'impressoras', 'precos', 'leituras', 'totais', 'log']) if (!Array.isArray(d[k])) d[k] = [];
  if (!d.meses || typeof d.meses !== 'object') d.meses = {};
  if (!Array.isArray(d.dias)) d.dias = [1, 5];
  if (!(d.diaConf >= 1 && d.diaConf <= 28)) d.diaConf = 6;
  migrarFolha(d);
  return d;
}

// Regra da folha (v2): a folha fecha com a leitura do dia 06 e tem o nome do mês em que fecha; a leitura de fechamento
// (lida dia 06) pertence a ela e o pagamento é no mês seguinte. Ex.: leitura de 06/11 = folha de Novembro, paga em dezembro.
// Dados antigos (v1) usavam o nome do mês do consumo (a leitura de 06/11 era "Outubro"): andam um mês.
const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export function migrarFolha(imp) {
  if (imp.folhaV2) return false;
  const m1 = ym => (ym ? somaMes(ym, 1) : ym);
  const vazio = !imp.leituras.length && !imp.impressoras.length && !imp.precos.length && !imp.totais.length && !Object.keys(imp.meses).length;
  if (!vazio) {
    for (const l of imp.leituras) l.mes = m1(l.mes);
    for (const t of imp.totais) t.mes = m1(t.mes);
    for (const l of imp.log) if (l.l) l.l.mes = m1(l.l.mes);
    for (const p of imp.precos) p.desde = m1(p.desde);
    for (const p of imp.impressoras) if (p.iniMes) p.iniMes = m1(p.iniMes);
    const novos = {};
    for (const [mes, v] of Object.entries(imp.meses)) {
      v.obs = `[aba ${NOMES_MES[+mes.slice(5) - 1]} da planilha] ${v.obs || ''}`.trim();
      novos[m1(mes)] = v;
    }
    imp.meses = novos;
    if (imp.diaConf === 5) imp.diaConf = 6;
    imp.atualizado = Date.now();
  }
  imp.folhaV2 = true;
  return !vazio;
}
// "Pagamento em": a folha de um mês é paga no mês seguinte.
export const mesPagamento = mes => somaMes(mes, 1);

// ---------- dinheiro ----------
// "0,076" | "0.076" | "1.234,56" -> inteiro em R$ 0,0001. Devolve null se não for um valor válido.
export function dec4(txt) {
  let s = String(txt ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(s);
  return m ? Number(m[1]) * 10000 + Number((m[2] || '').padEnd(4, '0')) : null;
}
// inteiro em R$ 0,0001 -> texto decimal ("0.076", "51.00")
export function txt4(n) {
  const s = String(Math.abs(n)).padStart(5, '0');
  const frac = s.slice(-4).replace(/0+$/, '').padEnd(2, '0');
  return `${n < 0 ? '-' : ''}${s.slice(0, -4)}.${frac}`;
}
// R$ 0,0001 -> centavos, arredondando meio para cima
export const centavos = v4 => Math.sign(v4) * Math.floor((Math.abs(v4) + 50) / 100);
export const txtCent = c => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`;

// ---------- datas ----------
const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dataDe = s => new Date(s + 'T00:00');
export const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const somaDia = (s, n) => { const d = dataDe(s); d.setDate(d.getDate() + n); return iso(d); };
export const mesValido = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');
export const dataValida = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(dataDe(s)) && iso(dataDe(s)) === s;

// Sugestão do tipo e do mês de referência a partir da data da leitura.
export function sugerir(data) {
  const d = dataDe(data), dia = d.getDay(), mes = data.slice(0, 7), d6 = d.getDate() <= 6;
  // até o dia 6 (fechamento e leitura da folha) vale a folha do próprio mês; depois, já conta para a folha que fecha no mês seguinte
  const folha = d6 ? mes : somaMes(mes, 1);
  if (d.getDate() === 6) return { tipo: 'FECHAMENTO', mes };   // dia 06: leitura de fechamento da folha, fechada com a leitura do dia 06
  if (dia === 1) return { tipo: 'SEG', mes: folha };
  if (dia === 5) return { tipo: 'SEX', mes: folha };
  return { tipo: 'FECHAMENTO', mes: folha };
}

// ---------- consultas ----------
const ORD = { SEG: 0, SEX: 0, FECHAMENTO: 1 };
const ordLeitura = (a, b) => ORD[a.tipo] - ORD[b.tipo] || a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id));

export const infoMes = (imp, mes) => imp.meses[mes] || { desconto: '0', status: 'ABERTO' };
export const mesFechado = (imp, mes) => infoMes(imp, mes).status === 'FECHADO';
export const ativas = imp => imp.impressoras.filter(p => p.status === 'ATIVA');
export const nomeSetor = (imp, id) => imp.setores.find(s => s.id === id)?.nome || 'Sem setor';
export const rotulo = p => p.apelido ? `${p.serie} (${p.apelido})` : p.serie;

export function ordenadas(imp) {
  const pos = id => { const i = imp.setores.findIndex(s => s.id === id); return i < 0 ? 999 : i; };
  return imp.impressoras.map((p, i) => [p, i]).sort((a, b) => pos(a[0].setorId) - pos(b[0].setorId) || a[1] - b[1]).map(x => x[0]);
}

// Preço que vale para o mês de referência. Mês fechado usa o preço congelado no fechamento.
export function precoDoMes(imp, mes) {
  const i = infoMes(imp, mes);
  if (i.status === 'FECHADO' && i.precoCor && i.precoPb) return { cor: dec4(i.precoCor), pb: dec4(i.precoPb), desde: null };
  const p = imp.precos.filter(x => x.desde <= mes).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  return p ? { cor: dec4(p.cor), pb: dec4(p.pb), desde: p.desde } : null;
}

// Contador que serve de "fechamento do mês anterior" para o mês informado.
export function baseAnterior(imp, p, mes) {
  let f = null;
  for (const l of imp.leituras) if (l.imp === p.id && l.tipo === 'FECHAMENTO' && l.mes < mes && (!f || l.mes > f.mes)) f = l;
  const ini = p.ini != null && p.iniMes && p.iniMes < mes ? { cont: p.ini, mes: p.iniMes, origem: 'inicial' } : null;
  if (f && (!ini || f.mes >= ini.mes)) return { cont: f.cont, mes: f.mes, origem: 'fechamento', data: f.data };
  return ini;
}

// Última leitura registrada da impressora (opcionalmente até uma data, ignorando uma leitura).
export function ultimaLeitura(imp, impId, ate, ignorarId) {
  let u = null;
  for (const l of imp.leituras) {
    if (l.imp !== impId || l.id === ignorarId || (ate && l.data > ate)) continue;
    if (!u || l.data > u.data || (l.data === u.data && l.cont > u.cont)) u = l;
  }
  return u;
}

// Maior referência anterior a uma leitura nova: última leitura até a data ou o fechamento anterior.
export function referenciaAnterior(imp, p, mes, data, ignorarId) {
  const u = ultimaLeitura(imp, p.id, data, ignorarId), b = baseAnterior(imp, p, mes);
  return Math.max(u ? u.cont : -1, b ? b.cont : -1);
}

function linha(imp, p, mes, importado) {
  const leituras = imp.leituras.filter(l => l.imp === p.id && l.mes === mes).sort(ordLeitura);
  const base = baseAnterior(imp, p, mes);
  const fechamento = leituras.find(l => l.tipo === 'FECHAMENTO') || null;
  const ultima = leituras[leituras.length - 1] || null;
  let pag = null, sit, alerta = null;
  if (importado) { sit = 'IMPORTADO'; pag = importado.pag; }
  else if (!leituras.length) sit = 'SEM_LEITURA';
  else if (!base) { sit = 'SEM_BASE'; alerta = 'Sem leitura inicial: informe no cadastro da impressora.'; }
  else {
    sit = fechamento ? 'FECHADO' : 'PARCIAL';
    pag = (fechamento || ultima).cont - base.cont;
    if (pag < 0) alerta = 'Contador menor que o fechamento anterior: possível troca de máquina ou erro de digitação.';
  }
  return { p, setorId: p.setorId, setor: nomeSetor(imp, p.setorId), base, leituras, fechamento, ultima, pag, sit, alerta, obsImportado: importado?.obs || null };
}

// Tudo o que as telas "Mês" e "Cobrança" precisam para um mês de referência.
export function resumoMes(imp, mes) {
  const info = infoMes(imp, mes), preco = precoDoMes(imp, mes);
  const importados = new Map(), soltos = [];
  for (const t of imp.totais) {
    if (t.mes !== mes) continue;
    if (t.imp) importados.set(t.imp, t); else soltos.push({ tipo: t.tipo, pag: t.pag, obs: t.obs });
  }
  const linhas = [];
  for (const p of ordenadas(imp)) {
    const l = linha(imp, p, mes, importados.get(p.id));
    if (!l.leituras.length && l.sit !== 'IMPORTADO') {
      // sem nada no mês: só aparece se estiver ativa e já existia nesse mês
      if (p.status !== 'ATIVA' || (p.iniMes && p.iniMes >= mes)) continue;
    }
    linhas.push(l);
  }
  const chave = t => t === 'COLORIDA' ? 'cor' : 'pb';
  const pag = { cor: 0, pb: 0 }, setores = new Map();
  for (const l of linhas) {
    const n = l.pag || 0, k = chave(l.p.tipo);
    pag[k] += n;
    l.valor = preco && l.pag != null ? centavos(n * preco[k]) : null;
    if (!setores.has(l.setorId)) setores.set(l.setorId, { setorId: l.setorId, setor: l.setor, cor: 0, pb: 0 });
    setores.get(l.setorId)[k] += n;
  }
  for (const t of soltos) { pag[chave(t.tipo)] += t.pag; t.valor = preco ? centavos(t.pag * preco[chave(t.tipo)]) : null; }
  const brutoCor = preco ? pag.cor * preco.cor : 0, brutoPb = preco ? pag.pb * preco.pb : 0;
  const desconto = dec4(info.desconto) || 0;
  const porSetor = [...setores.values()].map(s => ({ ...s, valor: preco ? centavos(s.cor * preco.cor + s.pb * preco.pb) : null }));
  const pendentes = linhas.filter(l => l.p.status === 'ATIVA' && l.sit !== 'FECHADO' && l.sit !== 'IMPORTADO').length;
  return {
    mes, info, status: info.status || 'ABERTO', preco, linhas, soltos, porSetor,
    pagCor: pag.cor, pagPb: pag.pb,
    valorCor: centavos(brutoCor), valorPb: centavos(brutoPb),
    subtotal: centavos(brutoCor + brutoPb), desconto: centavos(desconto),
    total: centavos(brutoCor + brutoPb - desconto),
    parcial: pendentes > 0, pendentes,
    temDado: linhas.some(l => l.sit !== 'SEM_LEITURA') || soltos.length > 0,
  };
}

// Meses que têm algum dado, do mais antigo até o mês atual.
export function mesesComDados(imp, mesAtual) {
  let ini = mesAtual, fim = mesAtual;
  for (const m of [...imp.leituras.map(l => l.mes), ...imp.totais.map(t => t.mes)]) { if (m < ini) ini = m; if (m > fim) fim = m; }
  const out = [];
  for (let m = ini, i = 0; m <= fim && i < 240; m = somaMes(m, 1), i++) out.push(m);
  return out;
}

// ---------- avisos e agenda ----------
// Situação das leituras num dia: quantas impressoras ativas já têm leitura com aquela data.
export function situacaoDia(imp, data) {
  const at = ativas(imp), ids = new Set(imp.leituras.filter(l => l.data === data).map(l => l.imp));
  return { total: at.length, feitas: at.filter(p => ids.has(p.id)).length, diaDeLeitura: imp.dias.includes(dataDe(data).getDay()) };
}

// Quantas impressoras do mês já foram marcadas como conferidas (a marca vale só se o total não mudou).
export function confFeitas(imp, r) {
  const c = r.info.conf || {};
  return r.linhas.filter(l => l.pag != null && c[l.p.id] && c[l.p.id].pag === l.pag).length;
}

// Conferência do mês anterior: vale a partir do "dia da conferência" e some quando o mês é fechado ou todas estão conferidas.
export function conferenciaDoMes(imp, mes) {
  const r = resumoMes(imp, mes);
  if (!r.temDado) return null;
  const feitas = confFeitas(imp, r), total = r.linhas.length;
  return { mes, feitas, total, pronta: r.status === 'FECHADO' || (total > 0 && feitas >= total) };
}

export function avisos(imp, hoje) {
  const out = [], at = ativas(imp);
  if (!at.length) return out;
  const d = dataDe(hoje), segunda = somaDia(hoje, -((d.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const dia = somaDia(segunda, i);
    if (dia > hoje) break;
    const s = situacaoDia(imp, dia);
    if (!s.diaDeLeitura || s.feitas >= s.total) continue;
    const nome = DIAS[dataDe(dia).getDay()].toLowerCase(), falta = s.total - s.feitas;
    out.push(dia === hoje
      ? { tipo: 'hoje', data: dia, txt: `Hoje (${nome}) é dia de registrar o consumo das impressoras: ${falta === s.total ? 'nenhuma leitura lançada ainda' : `faltam ${falta} de ${s.total}`}.` }
      : { tipo: 'falta', data: dia, txt: `Falta a leitura de ${nome} (${dia.slice(8)}/${dia.slice(5, 7)}): ${falta} de ${s.total} impressoras.` });
  }
  const ant = hoje.slice(0, 7);
  const semFech = at.filter(p => baseAnterior(imp, p, ant) && !imp.leituras.some(l => l.imp === p.id && l.mes === ant && l.tipo === 'FECHAMENTO')
    && !imp.totais.some(t => t.imp === p.id && t.mes === ant)).length;
  if (semFech && Number(hoje.slice(8)) >= imp.diaConf) out.push({ tipo: 'fechamento', mes: ant, txt: `Falta a leitura de fechamento da folha de ${MESES_PT[+ant.slice(5) - 1]} (fecha com a leitura do dia 06) para ${semFech} impressora${semFech > 1 ? 's' : ''}.` });
  const cf = Number(hoje.slice(8)) >= imp.diaConf ? conferenciaDoMes(imp, hoje.slice(0, 7)) : null;   // folha do mês, fechada com a leitura do dia 06
  if (cf && !cf.pronta) out.push({ tipo: 'conferir', mes: cf.mes, txt: `Dia de conferir a folha de ${MESES_PT[+cf.mes.slice(5) - 1]}/${cf.mes.slice(0, 4)} (paga em ${MESES_PT[+mesPagamento(cf.mes).slice(5) - 1]}): ${cf.feitas} de ${cf.total} conferidas.` });
  return out;
}
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ---------- gravação ----------
export function registrar(imp, acao, leitura, por, antes) {
  imp.log.push({ q: new Date().toISOString(), por, acao, l: { imp: leitura.imp, data: leitura.data, mes: leitura.mes, tipo: leitura.tipo, cont: leitura.cont }, antes: antes ?? null });
  if (imp.log.length > 300) imp.log.splice(0, imp.log.length - 300);
}

// Importa um arquivo no formato do sistema (cadastro + histórico). Não apaga nada: só acrescenta.
export function importar(imp, arq, por, novoId) {
  if (!arq || arq.formato !== FORMATO) throw new Error('Arquivo não é um histórico de impressoras do Gestão 360.');
  const r = { setores: 0, impressoras: 0, precos: 0, leituras: 0, totais: 0, meses: 0, ignoradas: [] };
  if (!arq.folhaV2) {   // arquivo com a regra antiga: os meses andam um à frente (leitura de 06/11 = folha de novembro)
    const m1 = ym => (ym ? somaMes(ym, 1) : ym);
    arq = { ...arq, folhaV2: true,
      impressoras: (arq.impressoras || []).map(p => ({ ...p, iniMes: m1(p.iniMes) })),
      precos: (arq.precos || []).map(p => ({ ...p, desde: m1(p.desde) })),
      leituras: (arq.leituras || []).map(l => ({ ...l, mes: m1(l.mes) })),
      totais: (arq.totais || []).map(t => ({ ...t, mes: m1(t.mes) })),
      meses: (arq.meses || []).map(m => ({ ...m, mes: m1(m.mes), obs: `[aba ${NOMES_MES[+m.mes.slice(5) - 1]} da planilha] ${m.obs || ''}`.trim() })) };
  }
  const setorId = nome => {
    if (!nome) return null;
    let s = imp.setores.find(x => x.nome.toLowerCase() === nome.toLowerCase());
    if (!s) { s = { id: novoId(), nome, ativo: true }; imp.setores.push(s); r.setores++; }
    return s.id;
  };
  (arq.setores || []).forEach(setorId);
  const porSerie = () => new Map(imp.impressoras.map(p => [p.serie.toUpperCase(), p]));
  for (const a of arq.impressoras || []) {
    let p = porSerie().get(String(a.serie).toUpperCase());
    if (!p) {
      p = { id: novoId(), setorId: setorId(a.setor), resp: a.resp || '', serie: String(a.serie).toUpperCase(), apelido: a.apelido || '', modelo: a.modelo || '',
        tipo: a.tipo === 'COLORIDA' ? 'COLORIDA' : 'PB', locadora: a.locadora || 'COPYGRAF', ini: null, iniMes: null, status: a.status || 'ATIVA', substPor: null, obs: a.obs || '' };
      imp.impressoras.push(p); r.impressoras++;
    }
    if (p.ini == null && a.ini != null) { p.ini = a.ini; p.iniMes = a.iniMes; }
  }
  const series = porSerie();
  for (const a of arq.impressoras || []) {
    const p = series.get(String(a.serie).toUpperCase()), s = a.substPorSerie && series.get(String(a.substPorSerie).toUpperCase());
    if (p && s && !p.substPor) p.substPor = s.id;
  }
  for (const a of arq.precos || []) {
    if (imp.precos.some(x => x.desde === a.desde) || dec4(a.cor) == null || dec4(a.pb) == null) continue;
    imp.precos.push({ id: novoId(), desde: a.desde, cor: txt4(dec4(a.cor)), pb: txt4(dec4(a.pb)), obs: a.obs || '' }); r.precos++;
  }
  for (const a of arq.meses || []) {
    if (imp.meses[a.mes]) continue;
    const m = { desconto: txt4(dec4(a.desconto) || 0), obs: a.obs || '', status: a.status === 'FECHADO' ? 'FECHADO' : 'ABERTO' };
    imp.meses[a.mes] = m; r.meses++;
  }
  const agora = new Date().toISOString();
  for (const a of arq.leituras || []) {
    const p = series.get(String(a.serie).toUpperCase());
    const motivo = !p ? 'impressora não cadastrada' : !mesValido(a.mes) || !dataValida(a.data) || !TIPOS[a.tipo] || !Number.isInteger(a.cont) || a.cont < 0 ? 'dados inválidos'
      : imp.leituras.some(l => l.imp === p.id && (a.tipo === 'FECHAMENTO' ? l.tipo === 'FECHAMENTO' && l.mes === a.mes : l.tipo === a.tipo && l.data === a.data)) ? 'já existe' : null;
    if (motivo) { r.ignoradas.push(`${a.serie} ${a.data} ${a.tipo}: ${motivo}`); continue; }
    imp.leituras.push({ id: novoId(), imp: p.id, data: a.data, mes: a.mes, tipo: a.tipo, cont: a.cont, obs: a.obs || '', origem: a.origem || 'planilha', por, em: agora });
    r.leituras++;
  }
  for (const a of arq.totais || []) {
    const p = a.serie ? series.get(String(a.serie).toUpperCase()) : null;
    if (a.serie && !p) { r.ignoradas.push(`total ${a.mes} ${a.serie}: impressora não cadastrada`); continue; }
    if (imp.totais.some(t => t.mes === a.mes && (t.imp || null) === (p?.id || null) && t.tipo === a.tipo)) continue;
    imp.totais.push({ mes: a.mes, imp: p?.id || null, tipo: a.tipo, pag: a.pag, obs: a.obs || '' }); r.totais++;
  }
  // meses que chegaram fechados guardam o preço da época
  for (const a of arq.meses || []) {
    const m = imp.meses[a.mes];
    if (m && m.status === 'FECHADO' && !m.precoCor) {
      const pr = precoDoMes({ ...imp, meses: {} }, a.mes);
      if (pr) { m.precoCor = txt4(pr.cor); m.precoPb = txt4(pr.pb); m.fechadoPor = 'importação'; m.fechadoEm = agora; }
    }
  }
  return r;
}
