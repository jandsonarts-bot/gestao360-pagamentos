/**
 * Gestão 360 · aviso automático de pagamentos pelo WhatsApp (API oficial da Meta).
 *
 * Todo dia às 8h (horário de Aracaju) lê os dados de cada usuário, calcula os
 * pagamentos atrasados, que vencem hoje ou em breve, e manda um resumo para o
 * número cadastrado em "Meu WhatsApp" no app.
 *
 * Modelo de mensagem que precisa existir e estar aprovado na Meta
 * (nome: alerta_pagamentos · categoria: Utilidade · idioma: Português (BR)):
 *
 *   Gestão 360: {{1}} pagamento(s) pedem atenção, total de {{2}}.
 *   {{3}}
 *
 * Configuração (uma vez):
 *   firebase functions:secrets:set WHATSAPP_TOKEN     -> token permanente da Meta
 *   WHATSAPP_PHONE_ID é perguntado no primeiro deploy -> ID do número remetente
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const TOKEN = defineSecret('WHATSAPP_TOKEN');
const PHONE_ID = defineString('WHATSAPP_PHONE_ID');
const TEMPLATE = defineString('WHATSAPP_TEMPLATE', { default: 'alerta_pagamentos' });
const TEMPLATE_IMP = defineString('WHATSAPP_TEMPLATE_IMPRESSORAS', { default: 'aviso_impressoras' });
const API_VERSION = defineString('WHATSAPP_API_VERSION', { default: 'v21.0' });

const REGION = 'southamerica-east1';
const TZ = 'America/Maceio';

const pad = n => String(n).padStart(2, '0');
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const dias = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
const addMes = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** Mesma regra do app: atrasados, vence hoje e vence dentro do prazo de alerta. */
function alertas(state, hoje) {
  const prazo = state.config?.diasAlerta ?? 3;
  const limite = new Date(Date.parse(hoje + 'T00:00:00Z') + prazo * 864e5).toISOString().slice(0, 10);
  const pedidos = state.pedidos || [];
  const inicio = state.inicio || hoje.slice(0, 7);
  let ini = inicio;
  for (const d of pedidos) if (!d.pago && d.venc.slice(0, 7) < ini) ini = d.venc.slice(0, 7);

  const itens = [];
  for (let ym = ini, i = 0; ym <= limite.slice(0, 7) && i < 36; ym = addMes(ym, 1), i++) {
    const [y, m] = ym.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const e of state.empresas || []) {
      if (e.cat !== 'mensal' || ym < inicio) continue; // mensais só contam a partir do mês em que o app começou
      const p = (state.pagamentos || {})[`${e.id}_${ym}`] || {};
      if (p.pago) continue;
      itens.push({ titulo: e.nome, valor: e.valor, venc: `${ym}-${pad(Math.min(e.dia || 1, ultimo))}`, enviado: p.enviado });
    }
    for (const d of pedidos) {
      if (d.pago || d.venc.slice(0, 7) !== ym) continue;
      itens.push({ titulo: d.fornecedor, valor: d.valor, venc: d.venc, enviado: d.enviado });
    }
  }
  return itens
    .map(i => ({ ...i, d: dias(i.venc, hoje) }))
    .filter(i => !i.enviado && i.d <= prazo) // o que já foi enviado ao financeiro não gera mais aviso
    .sort((a, b) => a.venc.localeCompare(b.venc));
}

function numero(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 ? d : null;
}

async function enviarTemplate(para, params, modelo) {
  const url = `https://graph.facebook.com/${API_VERSION.value()}/${PHONE_ID.value()}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'template',
      template: {
        name: modelo || TEMPLATE.value(),
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }],
      },
    }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo?.error?.message || `WhatsApp respondeu ${r.status}`);
  return corpo;
}

/** Envia o resumo de um usuário. Devolve o que aconteceu, sem lançar erro por falta de dados. */
async function avisar(state) {
  const para = numero(state.config?.zapMeu);
  if (!para) return { enviado: false, motivo: 'Cadastre "Meu WhatsApp" no sino de alertas.' };
  const hoje = hojeISO();
  const al = alertas(state, hoje);
  if (!al.length) return { enviado: false, motivo: 'Nenhum pagamento pedindo atenção hoje.' };

  const total = al.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  // Parâmetro de modelo não aceita quebra de linha: lista em uma linha só.
  let lista = al.map(i => {
    const quando = i.d < 0 ? `atrasado ${-i.d}d` : i.d === 0 ? 'vence hoje' : `vence em ${i.d}d`;
    return `${i.titulo} ${brl(i.valor)} (${quando})`;
  }).join(' | ').replace(/\s+/g, ' ');
  if (lista.length > 900) lista = lista.slice(0, 897) + '...';

  await enviarTemplate(para, [String(al.length), brl(total), lista]);
  return { enviado: true, quantidade: al.length };
}

exports.avisoDiarioWhatsApp = onSchedule(
  { schedule: 'every day 08:00', timeZone: TZ, region: REGION, secrets: [TOKEN] },
  async () => {
    const snap = await getFirestore().collectionGroup('dados').get();
    for (const doc of snap.docs) {
      if (doc.id !== 'principal' || doc.ref.path.startsWith('impressoras/') || doc.get('movidoParaEquipe')) continue; // dados pessoais que viraram equipe não avisam em dobro
      try {
        const r = await avisar(doc.data());
        console.log(doc.ref.path, JSON.stringify(r));
      } catch (e) {
        console.error(doc.ref.path, e.message);
      }
    }
  });

/** Botão "Testar aviso automático" do app: manda agora o resumo de quem chamou. */
exports.enviarAlertasAgora = onCall({ region: REGION, secrets: [TOKEN] }, async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const db = getFirestore();
  const email = String(req.auth.token.email || '').toLowerCase();
  const equipes = email ? await db.collection('equipes').where('membros', 'array-contains', email).limit(1).get() : { empty: true };
  const doc = await db.doc(equipes.empty ? `users/${req.auth.uid}/dados/principal` : `equipes/${equipes.docs[0].id}/dados/principal`).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Nenhum dado salvo ainda.');
  try {
    return await avisar(doc.data());
  } catch (e) {
    throw new HttpsError('internal', e.message);
  }
});


// ---------- Impressoras: dia de leitura e dia de conferência ----------
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const diaSemana = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const somaDia = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Mesma ideia do app: leituras da semana que faltam e conferência do mês anterior. Devolve frases curtas. */
function avisosImpressoras(imp, hoje) {
  const out = [];
  const ativas = (imp.impressoras || []).filter(p => p.status === 'ATIVA');
  const leituras = imp.leituras || [], diasLeitura = imp.dias || [1, 5];
  if (ativas.length) {
    const segunda = somaDia(hoje, -((diaSemana(hoje) + 6) % 7));
    for (let i = 0; i < 7; i++) {
      const dia = somaDia(segunda, i);
      if (dia > hoje) break;
      if (!diasLeitura.includes(diaSemana(dia))) continue;
      const feitas = new Set(leituras.filter(l => l.data === dia).map(l => l.imp));
      const falta = ativas.filter(p => !feitas.has(p.id)).length;
      if (!falta) continue;
      const nome = DIAS_SEMANA[diaSemana(dia)];
      out.push(dia === hoje
        ? `hoje (${nome}) é dia de registrar o consumo das impressoras: faltam ${falta} de ${ativas.length}`
        : `falta a leitura de ${nome} ${dia.slice(8)}/${dia.slice(5, 7)}: ${falta} de ${ativas.length} impressoras`);
    }
  }
  const diaConf = imp.diaConf >= 1 && imp.diaConf <= 28 ? imp.diaConf : 5;
  if (Number(hoje.slice(8)) >= diaConf) {
    const mes = addMes(hoje.slice(0, 7), -1), info = (imp.meses || {})[mes] || {};
    const temDado = leituras.some(l => l.mes === mes) || (imp.totais || []).some(t => t.mes === mes);
    const conferidas = Object.keys(info.conf || {}).length;
    if (temDado && info.status !== 'FECHADO' && conferidas < ativas.length) {
      out.push(`dia de conferir as impressoras de ${MESES_PT[+mes.slice(5) - 1]}/${mes.slice(0, 4)}: ${conferidas} de ${ativas.length} conferidas`);
    }
  }
  return out;
}

async function lerImpressoras(db, pathPrincipal, state) {
  // o documento próprio das impressoras (alimentado também pelos funcionários) vale se for mais novo
  const m = pathPrincipal.match(/^(?:users|equipes)\/([^/]+)\//);
  let imp = state.imp || {};
  if (m) {
    const d = await db.doc(`impressoras/${m[1]}/dados/principal`).get();
    if (d.exists && (d.get('atualizado') || 0) >= (imp.atualizado || 0)) imp = d.data();
  }
  return imp;
}

async function avisarImpressoras(db, pathPrincipal, state) {
  const para = numero(state.config?.zapMeu);
  if (!para) return { enviado: false, motivo: 'Cadastre "Meu WhatsApp" no sino de alertas.' };
  const av = avisosImpressoras(await lerImpressoras(db, pathPrincipal, state), hojeISO());
  if (!av.length) return { enviado: false, motivo: 'Nada pendente nas impressoras hoje.' };
  let texto = av.join(' | ').replace(/\s+/g, ' ');
  if (texto.length > 900) texto = texto.slice(0, 897) + '...';
  await enviarTemplate(para, [texto], TEMPLATE_IMP.value());
  return { enviado: true, quantidade: av.length };
}

/**
 * Todo dia às 8h10: se for dia de ler as impressoras (e faltar leitura) ou dia de conferir o mês,
 * manda o aviso para o "Meu WhatsApp" do dono. Modelo aprovado na Meta:
 *   nome: aviso_impressoras · categoria: Utilidade · idioma: Português (BR)
 *   Gestão 360 · Impressoras: {{1}}
 */
exports.avisoImpressorasWhatsApp = onSchedule(
  { schedule: 'every day 08:10', timeZone: TZ, region: REGION, secrets: [TOKEN] },
  async () => {
    const db = getFirestore();
    const snap = await db.collectionGroup('dados').get();
    for (const doc of snap.docs) {
      if (doc.id !== 'principal' || doc.ref.path.startsWith('impressoras/') || doc.get('movidoParaEquipe')) continue;
      try {
        console.log(doc.ref.path, JSON.stringify(await avisarImpressoras(db, doc.ref.path, doc.data())));
      } catch (e) {
        console.error(doc.ref.path, e.message);
      }
    }
  });

/** Botão "Testar" da aba Impressoras: manda agora o aviso de quem chamou. */
exports.enviarAvisoImpressorasAgora = onCall({ region: REGION, secrets: [TOKEN] }, async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const db = getFirestore();
  const email = String(req.auth.token.email || '').toLowerCase();
  const equipes = email ? await db.collection('equipes').where('membros', 'array-contains', email).limit(1).get() : { empty: true };
  const caminho = equipes.empty ? `users/${req.auth.uid}/dados/principal` : `equipes/${equipes.docs[0].id}/dados/principal`;
  const doc = await db.doc(caminho).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Nenhum dado salvo ainda.');
  try {
    return await avisarImpressoras(db, caminho, doc.data());
  } catch (e) {
    throw new HttpsError('internal', e.message);
  }
});

exports._teste = { alertas, numero, avisosImpressoras };
