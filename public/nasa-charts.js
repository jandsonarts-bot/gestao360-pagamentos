// Gráficos "central de controle" (estilo NASA): HUD escuro, neon, mira, dica com variação, legenda clicável,
// barras / linha / área, período (3M/6M/12M/Tudo), teclado e modo apresentação em slides.
// Não depende do resto do app: recebe dados prontos e devolve HTML; os eventos são delegados no document.

const W = 720, ML = 78, MR = 18, MT = 30, MB = 38;
let H = 300;   // altura do desenho (gráfico em destaque = mais alto)
const altura = cfg => (cfg.grande ? 400 : 300);
export const PALETA = ['#22d3ee', '#fbbf24', '#a3e635', '#f472b6', '#60a5fa', '#fb7185', '#a78bfa', '#2dd4bf', '#fb923c', '#34d399', '#e879f9', '#facc15'];

const lerPref = (k, v) => { try { return localStorage.getItem('nasa:' + k) || v; } catch { return v; } };
const estado = { tipo: {}, hid: {}, range: 'all', fx: lerPref('fx', 'normal'), tam: lerPref('tam', 'n') };
const aplicarPrefs = () => { document.documentElement.dataset.nasaFx = estado.fx; document.documentElement.dataset.nasaTam = estado.tam; };
aplicarPrefs();
const registro = new Map();
let redesenhar = () => {}, ligado = false;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const teto = max => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const fatiar = (a, r) => (r === 'all' ? a : a.slice(-Number(r)));
const padrao = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const curtoPadrao = v => (v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : String(Math.round(v)));

export const nasaEstado = estado;

/** Controles da tela: período, efeitos (calmo/normal/máximo) e tamanho do texto. Valem para todos os gráficos. */
export function nasaPeriodo() {
  const grupo = (rot, itens, atual, attr) => `<div class="nasa-range" role="group" aria-label="${rot}"><em>${rot}</em>${itens.map(([k, t]) => `<button class="${atual === k ? 'on' : ''}" data-${attr}="${k}">${t}</button>`).join('')}</div>`;
  return `<div class="nasa-controles">${grupo('PERÍODO', [['3', '3M'], ['6', '6M'], ['12', '12M'], ['all', 'TUDO']], estado.range, 'nasa-range')}
    ${grupo('EFEITOS', [['calmo', 'CALMO'], ['normal', 'NORMAL'], ['max', 'MÁXIMO']], estado.fx, 'nasa-fx')}
    ${grupo('TEXTO', [['n', 'A'], ['g', 'A+']], estado.tam, 'nasa-tam')}</div>`;
}

/**
 * cfg = { id, titulo, sub, rotulos: ['abr/26'...], series: [{ nome, cor?, vals: [...] }],
 *         fmt(v) -> texto do valor, fmtEixo(v) -> texto do eixo, tipo: 'barras'|'linha'|'area',
 *         altoEBom: false (subir é ruim, ex.: custo), total: true (linha de total na dica), grande: false }
 */
export function nasaChart(cfg) {
  const rot = fatiar(cfg.rotulos, estado.range);
  const series = cfg.series.map((s, k) => ({ ...s, k, cor: s.cor || PALETA[k % PALETA.length], vals: fatiar(s.vals, estado.range), oculta: !!estado.hid[`${cfg.id}|${k}`] }));
  const tipo = estado.tipo[cfg.id] || cfg.tipo || 'barras';
  H = altura(cfg);
  const ex = (cfg.extras || []).map(e => ({ ...e, vals: fatiar(e.vals, estado.range) }));
  registro.set(cfg.id, { cfg, rot, series, tipo, ex });
  const tipos = [['barras', 'BARRAS'], ['linha', 'LINHA'], ['area', 'ÁREA']];
  return `<section class="nasa ${cfg.grande ? 'grande' : ''}" data-gid="${esc(cfg.id)}">
    <header><div><b>${esc(cfg.titulo)}</b><small>${esc(cfg.sub || '')}</small></div>
      <div class="nasa-tipo">${tipos.map(([t, n]) => `<button class="${tipo === t ? 'on' : ''}" data-nasa-tipo="${t}" data-gid="${esc(cfg.id)}">${n}</button>`).join('')}</div></header>
    <div class="nasa-plot">${desenho(cfg, rot, series, tipo)}<div class="nasa-tip" hidden></div></div>
    <div class="nasa-leitura" aria-live="polite">${leitura(cfg, rot, series, rot.length - 1, ex)}</div>
    <footer class="nasa-leg">${series.map(s => `<button class="${s.oculta ? 'off' : ''}" data-nasa-leg="${s.k}" data-gid="${esc(cfg.id)}" style="--c:${s.cor}"><i></i>${esc(s.nome)}</button>`).join('')}</footer>
  </section>`;
}

const somaMes = (vis, i) => vis.reduce((a, s) => a + (s.vals[i] || 0), 0);
function escalas(rot, series, cfg, tipo) {
  const vis = series.filter(s => !s.oculta), n = rot.length || 1;
  const maximo = cfg.empilhado && tipo === 'barras' ? Math.max(0, ...rot.map((_, i) => somaMes(vis, i))) : Math.max(0, ...vis.flatMap(s => s.vals));
  const top = teto(maximo * 1.08), gw = (W - ML - MR) / n;
  return { vis, n, top, gw, x: i => ML + gw * (i + 0.5), y: v => MT + (H - MT - MB) * (1 - v / top) };
}

function desenho(cfg, rot, series, tipo) {
  const { vis, n, top, gw, x, y } = escalas(rot, series, cfg, tipo), id = cfg.id.replace(/[^\w-]/g, '_');
  const fe = cfg.fmtEixo || curtoPadrao;
  let g = `<defs><filter id="gl-${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${series.map(s => `<linearGradient id="gb-${id}-${s.k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.cor}" stop-opacity=".98"/><stop offset="1" stop-color="${s.cor}" stop-opacity=".28"/></linearGradient>
      <linearGradient id="ga-${id}-${s.k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.cor}" stop-opacity=".42"/><stop offset="1" stop-color="${s.cor}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
  for (let i = 0; i <= 4; i++) {
    const v = top * i / 4;
    g += `<line class="nasa-grid" x1="${ML}" x2="${W - MR}" y1="${y(v)}" y2="${y(v)}"/><text class="nasa-eixo" x="${ML - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fe(v))}</text>`;
  }
  const passo = Math.ceil(n / 12);
  rot.forEach((r, i) => { if (i % passo === 0 || i === n - 1) g += `<text class="nasa-eixo x" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(r)}</text>`; });
  if (!vis.length) g += `<text class="nasa-eixo" x="${W / 2}" y="${H / 2}" text-anchor="middle">TODAS AS SÉRIES OCULTAS · CLIQUE NA LEGENDA</text>`;
  if (tipo === 'barras' && cfg.empilhado) {
    const bw = Math.min(64, gw * 0.62), fmtT = cfg.fmt || padrao, tops = [];
    rot.forEach((_, i) => {
      let base = 0;
      vis.forEach((s, j) => {
        const v = Math.max(s.vals[i] || 0, 0); if (v <= 0) return;
        const y1 = y(base + v), y0 = y(base);
        g += `<rect class="nb" data-k="${s.k}" x="${x(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1.5, y0 - y1)}" rx="${j === vis.length - 1 ? 5 : 1.5}" fill="url(#gb-${id}-${s.k})" stroke="${s.cor}" stroke-width=".8" style="animation-delay:${i * 60 + j * 40}ms"/>`;
        base += v;
      });
      tops.push([x(i), y(base), base]);
      if (cfg.rotuloTopo !== false && base > 0) g += `<text class="nasa-val" x="${x(i)}" y="${y(base) - 9}" text-anchor="middle" style="animation-delay:${i * 60 + 500}ms">${esc(fmtT(base))}</text>`;
    });
    if (cfg.linhaTotal && tops.length > 1) {
      g += `<path class="nl total" pathLength="1" d="${tops.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${(p[1] - 0).toFixed(1)}`).join('')}" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="1" stroke-linecap="round" filter="url(#gl-${id})" opacity=".9"/>`;
      tops.forEach((p, k) => { g += `<circle class="np" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6" fill="#050a14" stroke="#fbbf24" stroke-width="2" style="animation-delay:${700 + k * 50}ms"/>`; });
    }
    if (cfg.media && tops.length) {
      const med = tops.reduce((a, p) => a + p[2], 0) / tops.length;
      g += `<line class="nasa-media" x1="${ML}" x2="${W - MR}" y1="${y(med)}" y2="${y(med)}"/><text class="nasa-media-t" x="${ML + 6}" y="${y(med) - 6}" text-anchor="start">MÉDIA ${esc(fmtT(med))}</text>`;
    }
  } else if (tipo === 'barras') {
    const m = vis.length, bw = Math.min(36, (gw * 0.72) / Math.max(m, 1));
    vis.forEach((s, j) => s.vals.forEach((v, i) => {
      const bx = x(i) - (bw * m) / 2 + bw * j, by = y(Math.max(v, 0)), bh = Math.max(1.5, y(0) - by);
      g += `<rect class="nb" data-k="${s.k}" x="${bx + 1}" y="${by}" width="${Math.max(2, bw - 2)}" height="${bh}" rx="3" fill="url(#gb-${id}-${s.k})" stroke="${s.cor}" stroke-width=".8" style="animation-delay:${i * 45 + j * 25}ms"/>`;
    }));
  } else {
    vis.forEach(s => {
      const pts = s.vals.map((v, i) => [x(i), y(Math.max(v, 0))]), d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
      if (tipo === 'area' && pts.length > 1) g += `<path class="na" data-k="${s.k}" d="${d}L${pts.at(-1)[0].toFixed(1)},${y(0)}L${pts[0][0].toFixed(1)},${y(0)}Z" fill="url(#ga-${id}-${s.k})"/>`;
      g += `<path class="nl" data-k="${s.k}" pathLength="1" d="${d}" fill="none" stroke="${s.cor}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" filter="url(#gl-${id})"/>`;
      pts.forEach((p, i) => { g += `<circle class="np" data-k="${s.k}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.3" fill="#050a14" stroke="${s.cor}" stroke-width="1.8" style="animation-delay:${600 + i * 40}ms"/>`; });
    });
  }
  g += `<g class="nasa-hov"></g><rect class="nasa-hit" x="${ML}" y="${MT - 6}" width="${W - ML - MR}" height="${H - MT - MB + 6}" fill="transparent"/>`;
  return `<svg class="nasa-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(cfg.titulo)}. Use as setas para percorrer os meses.">${g}</svg>`;
}

// ---------- painel de leitura (números grandes do mês em foco) ----------
function leitura(cfg, rot, series, i, ex = []) {
  const vis = series.filter(s => !s.oculta);
  if (!vis.length || i < 0) return '';
  const fmt = cfg.fmt || padrao, subir = cfg.altoEBom ? 'bom' : 'ruim';
  const delta = (v, p) => {
    if (i === 0 || !(p > 0)) return '';
    const pct = ((v - p) / p) * 100;
    if (Math.abs(pct) < 0.05) return '<em>= 0%</em>';
    const sobe = pct > 0, bom = sobe === (subir === 'bom');
    return `<em class="${bom ? 'bom' : 'ruim'}">${sobe ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</em>`;
  };
  const itens = vis.length > 6 ? vis.slice().sort((a, b) => b.vals[i] - a.vals[i]).slice(0, 4) : vis;   // muitas séries: mostra as 4 maiores
  const cel = s => `<div style="--c:${s.cor}"><span><i></i>${esc(s.nome)}</span><b>${esc(fmt(s.vals[i]))}</b>${delta(s.vals[i], s.vals[i - 1])}</div>`;
  const tot = cfg.total !== false && vis.length > 1 && vis.length <= 6 ? `<div class="tot"><span>TOTAL</span><b>${esc(fmt(vis.reduce((a, s) => a + s.vals[i], 0)))}</b>${delta(vis.reduce((a, s) => a + s.vals[i], 0), vis.reduce((a, s) => a + (s.vals[i - 1] ?? 0), 0))}</div>` : '';
  const extras = ex.map(e => `<div class="ex" style="--c:${e.cor || '#fbbf24'}"><span><i></i>${esc(e.nome)}</span><b>${esc((e.fmt || fmt)(e.vals[i]))}</b></div>`).join('');
  return `<div class="lh"><b>${esc(rot[i])}</b><small>${vis.length > 6 ? 'MAIORES CONSUMOS' : 'LEITURA'}</small></div>${itens.map(cel).join('')}${tot}${extras}`;
}

// ---------- mira + dica ----------
function mostrar(wrap, i, fixo) {
  const id = wrap.dataset.gid, r = registro.get(id);
  if (!r || i == null) return;
  const { cfg, rot, series, tipo, ex = [] } = r;
  H = altura(cfg);
  const { vis, n, gw, x, y } = escalas(rot, series, cfg, tipo), hov = wrap.querySelector('.nasa-hov'), tip = wrap.querySelector('.nasa-tip');
  i = Math.max(0, Math.min(n - 1, i));
  let g = tipo === 'barras' ? `<rect class="nasa-band" x="${x(i) - gw / 2}" y="${MT - 6}" width="${gw}" height="${H - MT - MB + 6}"/>` : `<line class="nasa-mira" x1="${x(i)}" x2="${x(i)}" y1="${MT - 6}" y2="${H - MB}"/>`;
  if (tipo !== 'barras') vis.forEach(s => { g += `<circle class="nasa-foco" cx="${x(i)}" cy="${y(Math.max(s.vals[i], 0))}" r="6" fill="${s.cor}" fill-opacity=".25" stroke="${s.cor}" stroke-width="2"/>`; });
  hov.innerHTML = g;
  const fmt = cfg.fmt || padrao, subir = cfg.altoEBom ? 'bom' : 'ruim';
  const delta = (v, p) => {
    if (i === 0 || !(p > 0)) return '';
    const pct = ((v - p) / p) * 100;
    if (Math.abs(pct) < 0.05) return '<em class="d">= 0%</em>';
    const sobe = pct > 0, bom = sobe === (subir === 'bom');
    return `<em class="d ${bom ? 'bom' : 'ruim'}">${sobe ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</em>`;
  };
  const linhas = vis.map(s => `<div class="tr"><i style="background:${s.cor};box-shadow:0 0 8px ${s.cor}"></i><span>${esc(s.nome)}</span><b>${esc(fmt(s.vals[i]))}</b>${delta(s.vals[i], s.vals[i - 1])}</div>`).join('');
  let total = '';
  if (cfg.total !== false && vis.length > 1) {
    const t = vis.reduce((a, s) => a + s.vals[i], 0), tp = vis.reduce((a, s) => a + (s.vals[i - 1] ?? 0), 0);
    total = `<div class="tr tot"><span>TOTAL</span><b>${esc(fmt(t))}</b>${delta(t, tp)}</div>`;
  }
  const extras = ex.map(e => `<div class="tr ex"><i style="background:${e.cor || '#fbbf24'}"></i><span>${esc(e.nome)}</span><b>${esc((e.fmt || fmt)(e.vals[i]))}</b><em class="d"></em></div>`).join('');
  tip.innerHTML = `<div class="th"><b>${esc(rot[i])}</b>${fixo ? '<small>● FIXADO</small>' : '<small>telemetria</small>'}</div>${linhas}${total}${extras}`;
  const lt = wrap.querySelector('.nasa-leitura');
  if (lt) lt.innerHTML = leitura(cfg, rot, series, i, ex);
  tip.hidden = false;
  tip.className = `nasa-tip ${fixo ? 'fixo' : ''} ${i > n * 0.62 ? 'esq' : 'dir'}`;
  tip.style.left = `${(x(i) / W) * 100}%`;
  wrap.dataset.idx = i;
}
function esconder(wrap) {
  wrap.querySelector('.nasa-hov').innerHTML = '';
  wrap.querySelector('.nasa-tip').hidden = true;
}
const indice = (ev, hit) => {
  const b = hit.getBoundingClientRect(), r = registro.get(hit.closest('.nasa').dataset.gid), n = r ? r.rot.length : 1;
  return Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - b.left) / b.width) * n)));
};

/** Liga os eventos (uma vez). `fn` é chamado quando algo pede para redesenhar (tipo, legenda, período). */
const FORM = { brl: v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), int: v => Math.round(v).toLocaleString('pt-BR') };
function contar(el) {
  const alvo = Number(el.dataset.cnt), f = FORM[el.dataset.f] || FORM.int;
  el.dataset.ok = '1';
  if (estado.fx === 'calmo' || !isFinite(alvo) || matchMedia('(prefers-reduced-motion: reduce)').matches) return (el.textContent = f(alvo));
  const t0 = performance.now(), dur = estado.fx === 'max' ? 1600 : 900;
  const passo = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - (1 - p) ** 4; el.textContent = f(alvo * e); if (p < 1 && el.isConnected) requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
}
export function nasaLigar(fn) {
  if (fn) redesenhar = fn;
  if (ligado) return;
  ligado = true;
  new MutationObserver(() => document.querySelectorAll('[data-cnt]:not([data-ok])').forEach(contar)).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('pointermove', ev => {
    const hit = ev.target.closest?.('.nasa-hit');
    if (!hit) return;
    const w = hit.closest('.nasa');
    if (w.dataset.pin == null || w.dataset.pin === '') mostrar(w, indice(ev, hit));
  });
  document.addEventListener('pointerout', ev => {
    const hit = ev.target.closest?.('.nasa-hit');
    if (!hit || ev.relatedTarget?.closest?.('.nasa-hit') === hit) return;
    const w = hit.closest('.nasa');
    if (w.dataset.pin == null || w.dataset.pin === '') esconder(w);
  });
  document.addEventListener('pointerover', ev => {
    const b = ev.target.closest?.('[data-nasa-leg]');
    if (!b) return;
    const w = b.closest('.nasa');
    w.querySelectorAll('[data-k]').forEach(e => e.classList.toggle('dim', e.dataset.k !== b.dataset.nasaLeg));
  });
  document.addEventListener('pointerout', ev => {
    const b = ev.target.closest?.('[data-nasa-leg]');
    if (b) b.closest('.nasa').querySelectorAll('.dim').forEach(e => e.classList.remove('dim'));
  });
  document.addEventListener('click', ev => {
    const t = ev.target;
    const hit = t.closest?.('.nasa-hit');
    if (hit) {   // clique fixa a leitura; outro clique no mesmo mês solta
      const w = hit.closest('.nasa'), i = indice(ev, hit);
      if (w.dataset.pin !== undefined && w.dataset.pin !== '' && +w.dataset.pin === i) { w.dataset.pin = ''; mostrar(w, i, false); }
      else { w.dataset.pin = i; mostrar(w, i, true); }
      return;
    }
    const tipo = t.closest?.('[data-nasa-tipo]');
    if (tipo) { estado.tipo[tipo.dataset.gid] = tipo.dataset.nasaTipo; return redesenhar(); }
    const leg = t.closest?.('[data-nasa-leg]');
    if (leg) { const k = `${leg.dataset.gid}|${leg.dataset.nasaLeg}`; estado.hid[k] = !estado.hid[k]; return redesenhar(); }
    const rg = t.closest?.('[data-nasa-range]');
    if (rg) { estado.range = rg.dataset.nasaRange; redesenhar(); }
    const fx = t.closest?.('[data-nasa-fx]'), tm = t.closest?.('[data-nasa-tam]');
    if (fx || tm) {
      if (fx) { estado.fx = fx.dataset.nasaFx; try { localStorage.setItem('nasa:fx', estado.fx); } catch {} }
      if (tm) { estado.tam = tm.dataset.nasaTam; try { localStorage.setItem('nasa:tam', estado.tam); } catch {} }
      aplicarPrefs(); redesenhar();
    }
  });
  document.addEventListener('keydown', ev => {
    const svg = ev.target.closest?.('.nasa-svg');
    if (!svg || !['ArrowLeft', 'ArrowRight', 'Escape', 'Home', 'End'].includes(ev.key)) return;
    const w = svg.closest('.nasa'), r = registro.get(w.dataset.gid), n = r.rot.length;
    ev.preventDefault();
    if (ev.key === 'Escape') { w.dataset.pin = ''; return esconder(w); }
    let i = w.dataset.idx === undefined ? n - 1 : +w.dataset.idx;
    i = ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : i + (ev.key === 'ArrowRight' ? 1 : -1);
    i = Math.max(0, Math.min(n - 1, i));
    w.dataset.pin = i; mostrar(w, i, true);
  });
}

// ---------- modo apresentação (slides em tela cheia) ----------
/** slides: [{ titulo, html: () => string }]. Setas, espaço (automático) e Esc funcionam. */
export function nasaApresentar(slides, missao = 'CENTRAL DE CONTROLE') {
  if (document.querySelector('.nasa-show')) return;
  let i = 0, auto = false, timer = null;
  const ov = document.createElement('div');
  ov.className = 'nasa-show';
  ov.innerHTML = `<div class="ns-estrelas"></div>
    <header><div><b>${esc(missao)}</b><small class="ns-rel"></small></div><div class="ns-ctl">
      <button data-ns="auto" title="Passar slides sozinho (espaço)">▶ AUTO</button><button data-ns="sair" title="Fechar (Esc)">✕ SAIR</button></div></header>
    <main class="ns-stage"></main>
    <footer><button data-ns="ant" aria-label="Slide anterior">◀</button><div class="ns-pontos"></div><button data-ns="prox" aria-label="Próximo slide">▶</button></footer>
    <div class="ns-prog"><i></i></div>`;
  document.body.append(ov);
  document.body.classList.add('nasa-aberto');
  const antes = redesenhar;
  const pintar = () => {
    ov.querySelector('.ns-stage').innerHTML = `<div class="ns-slide"><div class="ns-tit"><span>SLIDE ${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}</span><h2>${esc(slides[i].titulo)}</h2></div>${slides[i].html()}</div>`;
    ov.querySelector('.ns-pontos').innerHTML = slides.map((s, k) => `<button class="${k === i ? 'on' : ''}" data-ns-i="${k}" aria-label="Ir para ${esc(s.titulo)}"></button>`).join('');
    ov.querySelector('.ns-prog i').style.animation = 'none';
    if (auto) { void ov.offsetWidth; ov.querySelector('.ns-prog i').style.animation = 'nsprog 7s linear forwards'; }
  };
  const ir = n => { i = (n + slides.length) % slides.length; pintar(); };
  const sair = () => { clearInterval(timer); clearInterval(relogio); document.removeEventListener('keydown', tecla); ov.remove(); document.body.classList.remove('nasa-aberto'); redesenhar = antes; };
  const alternar = () => {
    auto = !auto; clearInterval(timer);
    if (auto) timer = setInterval(() => ir(i + 1), 7000);
    ov.querySelector('[data-ns=auto]').textContent = auto ? '❚❚ PAUSAR' : '▶ AUTO';
    pintar();
  };
  const tecla = ev => {
    if (ev.target.closest?.('.nasa-svg') && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ev.shiftKey === false && ev.altKey === false && ev.ctrlKey === false && document.activeElement?.closest?.('.nasa-svg')) return;
    if (ev.key === 'Escape') sair();
    else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') ir(i + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') ir(i - 1);
    else if (ev.key === ' ') { ev.preventDefault(); alternar(); }
  };
  ov.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ns],[data-ns-i]');
    if (!b) return;
    if (b.dataset.nsI !== undefined) return ir(+b.dataset.nsI);
    ({ ant: () => ir(i - 1), prox: () => ir(i + 1), auto: alternar, sair })[b.dataset.ns]?.();
  });
  document.addEventListener('keydown', tecla);
  redesenhar = pintar;
  const hora = () => { const e = ov.querySelector('.ns-rel'); if (e) e.textContent = ' · ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }); };
  hora(); const relogio = setInterval(hora, 1000);
  pintar();
}
