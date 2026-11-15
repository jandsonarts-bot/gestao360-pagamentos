// Planilhas do Excel (.xlsx) sem biblioteca externa: gerar (exportação) e ler (importação).
// Um .xlsx é um arquivo ZIP com XML dentro.

const enc = new TextEncoder(), dec = new TextDecoder();
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ZIP sem compressão (suficiente para planilhas pequenas).
function zip(arquivos) {
  const partes = [], central = [];
  let pos = 0;
  for (const [nomeTxt, texto] of arquivos) {
    const nome = enc.encode(nomeTxt), dados = enc.encode(texto), crc = crc32(dados), n = dados.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true);
    h.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(h.buffer), nome, dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true);
    c.setUint16(28, nome.length, true); c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nome);
    pos += 30 + nome.length + n;
  }
  const tam = central.reduce((s, b) => s + b.length, 0);
  const f = new DataView(new ArrayBuffer(22));
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tam, true); f.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(f.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const coluna = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

// Estilos: 0 normal · 1 negrito · 2 inteiro (1.234) · 3 dinheiro (1.234,56) · 4 preço (0,000) · 5 dinheiro negrito · 6 inteiro negrito
export const E = { N: 0, B: 1, INT: 2, BRL: 3, PRECO: 4, BRL_B: 5, INT_B: 6 };
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs></styleSheet>`;

// abas: [{ nome, larguras: [18, 12...], linhas: [[celula...]] }]
// celula: texto | número | null | { v: texto, e: estilo } | { n: 'número em texto' ou número, e: estilo }
export function criarXlsx(abas) {
  const folha = aba => {
    const linhas = aba.linhas.map((lin, r) => `<row r="${r + 1}">${lin.map((cel, c) => {
      if (cel == null || cel === '') return '';
      const ref = `${coluna(c)}${r + 1}`;
      const o = typeof cel === 'object' ? cel : typeof cel === 'number' ? { n: cel } : { v: cel };
      const s = o.e ? ` s="${o.e}"` : '';
      return o.n != null ? `<c r="${ref}"${s}><v>${o.n}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(o.v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = (aba.larguras || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${linhas}</sheetData></worksheet>`;
  };
  const P = 'http://schemas.openxmlformats.org/package/2006/relationships', O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${P}"><Relationship Id="rId1" Type="${O}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${O}"><sheets>${abas.map((a, i) => `<sheet name="${x(a.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${P}">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${O}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="${O}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, folha(a)]),
  ]);
}

// ---------- leitura ----------
// Devolve [{ nome, linhas: [[valor...]] }]. Números (inclusive datas do Excel) vêm como número.
export async function lerXlsx(arquivo) {
  const buf = new Uint8Array(await arquivo.arrayBuffer()), dv = new DataView(buf.buffer);
  let fim = buf.length - 22;
  while (fim >= 0 && dv.getUint32(fim, true) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error('Este arquivo não é uma planilha .xlsx.');
  const total = dv.getUint16(fim + 10, true), itens = {};
  for (let p = dv.getUint32(fim + 16, true), k = 0; k < total; k++) {
    const nl = dv.getUint16(p + 28, true);
    itens[dec.decode(buf.subarray(p + 46, p + 46 + nl))] = { metodo: dv.getUint16(p + 10, true), tam: dv.getUint32(p + 20, true), pos: dv.getUint32(p + 42, true) };
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  const texto = async nome => {
    const a = itens[nome];
    if (!a) return null;
    const ini = a.pos + 30 + dv.getUint16(a.pos + 26, true) + dv.getUint16(a.pos + 28, true), bruto = buf.subarray(ini, ini + a.tam);
    if (a.metodo === 0) return dec.decode(bruto);
    if (a.metodo !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir a planilha. Salve como CSV e tente de novo.');
    return new Response(new Blob([bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
  const xml = async nome => { const t = await texto(nome); return t ? new DOMParser().parseFromString(t, 'application/xml') : null; };
  const filhos = (no, tag) => [...no.getElementsByTagName('*')].filter(e => e.localName === tag);

  const ss = await xml('xl/sharedStrings.xml');
  const textos = ss ? filhos(ss, 'si').map(si => filhos(si, 't').map(t => t.textContent).join('')) : [];
  const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) throw new Error('Planilha .xlsx incompleta.');
  const alvo = Object.fromEntries(filhos(rels, 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const abas = [];
  for (const sh of filhos(wb, 'sheet')) {
    const rid = [...sh.attributes].find(a => a.localName === 'id' && a.name !== 'sheetId')?.value;
    const caminho = (alvo[rid] || '').replace(/^\//, '');
    const doc = await xml(caminho.startsWith('xl/') ? caminho : 'xl/' + caminho);
    const linhas = [];
    for (const row of doc ? filhos(doc, 'row') : []) {
      const lin = [];
      for (const c of filhos(row, 'c')) {
        const letras = (c.getAttribute('r') || '').replace(/\d/g, '');
        let col = 0; for (const ch of letras) col = col * 26 + ch.charCodeAt(0) - 64;
        const t = c.getAttribute('t'), v = filhos(c, 'v')[0]?.textContent;
        let val = null;
        if (t === 's') val = textos[+v] ?? '';
        else if (t === 'inlineStr') val = filhos(c, 't').map(e => e.textContent).join('');
        else if (v != null) val = t === 'str' || isNaN(+v) ? v : +v;
        if (val != null) lin[Math.max(col - 1, 0)] = val;
      }
      linhas[(+row.getAttribute('r') || linhas.length + 1) - 1] = lin;
    }
    abas.push({ nome: sh.getAttribute('name'), linhas: [...linhas].map(l => [...(l || [])].map(v => v ?? null)) });
  }
  return abas;
}

// CSV simples (separado por ; ou ,) -> linhas
export function lerCsv(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  return texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()).map(l => l.split(sep).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
}

// Número de data do Excel (46332) -> '2026-11-06'
export function serialParaIso(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
  return d.toISOString().slice(0, 10);
}
