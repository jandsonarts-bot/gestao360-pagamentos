// Camada de dados: localStorage sempre; Firestore + Storage quando o Firebase está configurado.
import { firebaseConfig, usarStorage } from './firebase-config.js';
import { normalizar as normalizarImp } from './imp-calc.js';

const LS = 'gestao360:v1';
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const listeners = new Set();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// papel: 'dono' (vê tudo) | 'funcionario' (vê só a aba Impressoras, liberada pelo dono)
export const cloud = { ativo: !!firebaseConfig, pronto: !firebaseConfig, user: null, equipe: null, erro: null, papel: 'dono', impDono: null, carregando: false };
export let state = load();
export const souFuncionario = () => cloud.papel === 'funcionario';

let fb = null, unsub = null, timer = null, unsubImp = null, impRef = null, impPronto = false, timerImp = null;
const jsonImp = () => JSON.stringify({ ...state.imp, atualizado: 0 });
let impJson = jsonImp();
const temDadosImp = i => !!(i && (i.impressoras?.length || i.leituras?.length));

function seed() {
  // O app começa vazio: os cadastros ficam na conta de cada usuário, nunca no código.
  const d = new Date();
  return {
    v: 1, atualizado: 0,
    inicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    config: { diasAlerta: 3, zapMeu: '', zapFin: '' },
    empresas: [], pagamentos: {}, pedidos: [], docs: [], lembretes: [],
    imp: normalizarImp(),
  };
}

function normalizar(s) {
  s.config ??= { diasAlerta: 3 };
  s.pagamentos ??= {};
  s.pedidos ??= [];
  s.docs ??= [];
  s.empresas ??= [];
  s.lembretes ??= [];   // lembretes da agenda (sem valor, não entram nas contas)
  s.imp = normalizarImp(s.imp); // controle de impressoras locadas (aba Impressoras)
  return s;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    if (s && Array.isArray(s.empresas)) return normalizar(s);
  } catch {}
  return seed();
}

const persistLocal = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch {} };
const emit = () => listeners.forEach(f => f());
export const onChange = fn => listeners.add(fn);

export function save() {
  state.atualizado = Date.now();
  const j = jsonImp();
  if (j !== impJson) { impJson = j; state.imp.atualizado = Date.now(); clearTimeout(timerImp); timerImp = setTimeout(pushImp, 500); }
  persistLocal();
  emit();
  clearTimeout(timer);
  timer = setTimeout(pushCloud, 500);
}

// Dados das impressoras: ficam também num documento só deles (impressoras/{dono}/dados/principal),
// que o dono pode liberar para funcionários sem mostrar o resto do sistema.
async function pushImp() {
  if (!fb || !cloud.user || !impRef || !impPronto) return;
  try { await fb.F.setDoc(impRef, JSON.parse(JSON.stringify(state.imp))); cloud.erroImp = null; }
  catch (e) { cloud.erroImp = e.message; if (souFuncionario()) { cloud.erro = e.message; emit(); } else console.warn('Impressoras: não sincronizou o documento próprio:', e.message); }
}

function assinarImp(dono) {
  const { F, db } = fb;
  unsubImp?.();
  impRef = F.doc(db, 'impressoras', dono, 'dados', 'principal');
  impPronto = false;
  unsubImp = F.onSnapshot(impRef, snap => {
    if (snap.metadata.hasPendingWrites) return;
    const d = snap.exists() ? snap.data() : null, atual = state.imp.atualizado || 0;
    impPronto = true;
    if (d && (d.atualizado || 0) > atual) {
      state.imp = normalizarImp(d); impJson = jsonImp(); persistLocal(); emit();
      if (!souFuncionario()) pushCloud();            // mantém a cópia dentro do documento principal em dia
    } else if ((!d && temDadosImp(state.imp)) || (d && (d.atualizado || 0) < atual)) pushImp();
  }, e => {
    impPronto = false; cloud.erroImp = e.message;
    if (souFuncionario()) { cloud.erro = e.message; emit(); } else console.warn('Impressoras: leitura do documento próprio falhou:', e.message);
  });
}

async function acharFuncionario() {
  const { F, db } = fb;
  try {
    const qs = await F.getDocs(F.query(F.collection(db, 'impressoras'), F.where('funcionarios', 'array-contains', meuEmail()), F.limit(1)));
    if (!qs.empty) return { id: qs.docs[0].id, ...qs.docs[0].data() };
  } catch (e) { console.warn('Acesso de funcionário não consultado:', e.message); }
  return null;
}

function entrarComoFuncionario(f) {
  cloud.papel = 'funcionario'; cloud.impDono = f.id; cloud.donoEmail = f.donoEmail || '';
  // nunca mostra os dados de outra pessoa que usou este navegador antes
  const mesmo = localStorage.getItem('gestao360:imp-dono') === f.id;
  const imp = mesmo ? state.imp : null;
  state = seed(); if (imp) state.imp = normalizarImp(imp);
  impJson = jsonImp();
  localStorage.setItem('gestao360:imp-dono', f.id); localStorage.setItem(LS_ORIGEM, '');
  persistLocal();
  assinarImp(f.id);
}

export async function lerFuncionarios() {
  if (!fb || !cloud.user) return [];
  const s = await fb.F.getDoc(fb.F.doc(fb.db, 'impressoras', cloud.user.uid));
  return s.exists() ? (s.data().funcionarios || []) : [];
}

// Só o dono (quem usa sozinho ou quem criou o compartilhamento) libera funcionários.
export async function salvarFuncionarios(emails) {
  if (!fb || !cloud.user) throw new Error('Entre na sua conta primeiro.');
  const eu = cloud.user;
  if (souFuncionario() || (cloud.equipe && cloud.equipe.id !== eu.uid)) throw new Error('Só o dono do sistema libera funcionários.');
  const lista = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
  const invalido = lista.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (invalido) throw new Error(`E-mail inválido: ${invalido}`);
  if (lista.includes(meuEmail())) throw new Error('Seu próprio e-mail não precisa ser incluído.');
  await fb.F.setDoc(fb.F.doc(fb.db, 'impressoras', eu.uid), { dono: eu.uid, donoEmail: meuEmail(), funcionarios: lista });
  return lista;
}

// ---------- Firebase ----------
// Os dados ficam em um destes lugares:
//   users/{uid}/dados/principal      -> uso individual
//   equipes/{dono}/dados/principal   -> compartilhado com os e-mails em equipes/{dono}.membros
const LS_ORIGEM = 'gestao360:origem'; // de qual documento veio a cópia local
let ref = null;

async function pushCloud() {
  if (!fb || !cloud.user || !ref) return;
  try {
    await fb.F.setDoc(ref, JSON.parse(JSON.stringify(state)));
    cloud.erro = null;
  } catch (e) { cloud.erro = e.message; emit(); }
}

const meuEmail = () => (cloud.user?.email || '').toLowerCase();

async function acharEquipe() {
  const { F, db } = fb;
  try {
    const qs = await F.getDocs(F.query(F.collection(db, 'equipes'), F.where('membros', 'array-contains', meuEmail()), F.limit(1)));
    if (!qs.empty) return { id: qs.docs[0].id, ...qs.docs[0].data() };
  } catch (e) { console.warn('Equipe não consultada:', e.message); }
  return null;
}

function assinar(novoRef) {
  const { F } = fb;
  unsub?.();
  ref = novoRef;
  unsub = F.onSnapshot(ref, snap => {
    if (snap.metadata.hasPendingWrites) return;
    const d = snap.exists() ? snap.data() : null;
    // A cópia local só pode ser enviada para o mesmo documento de onde veio.
    const mesmaOrigem = localStorage.getItem(LS_ORIGEM) === ref.path;
    if (d && (!mesmaOrigem || (d.atualizado || 0) > (state.atualizado || 0))) {
      const impAtual = state.imp;                      // a cópia das impressoras mais nova vence
      state = normalizar(d);
      if ((impAtual.atualizado || 0) > (state.imp.atualizado || 0) && (mesmaOrigem || !temDadosImp(state.imp))) state.imp = impAtual;
      impJson = jsonImp(); persistLocal(); localStorage.setItem(LS_ORIGEM, ref.path); emit();
    } else if (d && (d.atualizado || 0) < (state.atualizado || 0)) {
      pushCloud();
    } else if (!d && ref.path.startsWith('users/')) {
      // primeiro acesso desta conta: começa do zero, a menos que a cópia local já seja dela
      if (!mesmaOrigem && localStorage.getItem(LS_ORIGEM)) state = seed();
      state.atualizado = Date.now(); persistLocal(); localStorage.setItem(LS_ORIGEM, ref.path); emit();
      pushCloud();
    }
  }, e => { cloud.erro = e.message; emit(); });
}

export async function initCloud() {
  if (!firebaseConfig) return;
  try {
    const [{ initializeApp }, A, F, S] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'),
      import(FB + 'firebase-firestore.js'), import(FB + 'firebase-storage.js'),
    ]);
    const app = initializeApp(firebaseConfig);
    fb = { app, A, F, S, auth: A.getAuth(app), db: F.getFirestore(app), st: S.getStorage(app) };
    fb.st.maxUploadRetryTime = 8000; fb.st.maxOperationRetryTime = 8000;
    A.onAuthStateChanged(fb.auth, async user => {
      cloud.user = user; cloud.pronto = true; cloud.equipe = null; cloud.carregando = !!user;
      cloud.papel = 'dono'; cloud.impDono = null; cloud.erroImp = null;
      unsub?.(); unsub = null; ref = null; unsubImp?.(); unsubImp = null; impRef = null; impPronto = false;
      emit();
      if (!user) return;
      cloud.equipe = await acharEquipe();
      if (cloud.user !== user) return; // saiu ou trocou de conta enquanto consultava
      if (!cloud.equipe) {
        const f = await acharFuncionario();
        if (cloud.user !== user) return;
        if (f && f.id !== user.uid) { entrarComoFuncionario(f); cloud.carregando = false; emit(); return; }
      }
      cloud.impDono = cloud.equipe ? cloud.equipe.id : user.uid;
      assinar(cloud.equipe
        ? F.doc(fb.db, 'equipes', cloud.equipe.id, 'dados', 'principal')
        : F.doc(fb.db, 'users', user.uid, 'dados', 'principal'));
      assinarImp(cloud.impDono);
      cloud.carregando = false;
      emit();
    });
  } catch (e) {
    cloud.pronto = true; cloud.erro = e.message; emit();
  }
}

export const login = () => fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
export const logout = () => {
  if (souFuncionario()) { // não deixa dados no navegador de quem saiu
    for (const k of [LS, LS_ORIGEM, 'gestao360:imp-dono']) try { localStorage.removeItem(k); } catch {}
    state = seed(); impJson = jsonImp();
  }
  return fb.A.signOut(fb.auth);
};

// Dono define quem enxerga e edita os dados. Na primeira vez, os dados atuais viram os da equipe.
export async function salvarEquipe(emails) {
  if (!fb || !cloud.user) throw new Error('Entre na sua conta primeiro.');
  const { F, db } = fb, eu = cloud.user;
  if (cloud.equipe && cloud.equipe.id !== eu.uid) throw new Error(`Só ${cloud.equipe.donoEmail} pode mudar quem participa.`);
  const membros = [...new Set([meuEmail(), ...emails.map(e => e.trim().toLowerCase()).filter(Boolean)])];
  const invalido = membros.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (invalido) throw new Error(`E-mail inválido: ${invalido}`);
  const jaExistia = cloud.equipe?.id === eu.uid;
  const equipe = { dono: eu.uid, donoEmail: meuEmail(), membros };
  await F.setDoc(F.doc(db, 'equipes', eu.uid), equipe);
  const dados = F.doc(db, 'equipes', eu.uid, 'dados', 'principal');
  if (!jaExistia) {
    const atual = await F.getDoc(dados);
    if (!atual.exists()) {
      state.atualizado = Date.now(); persistLocal();
      await F.setDoc(dados, JSON.parse(JSON.stringify(state)));
    }
    await F.setDoc(F.doc(db, 'users', eu.uid, 'dados', 'principal'), { movidoParaEquipe: eu.uid }, { merge: true });
    localStorage.setItem(LS_ORIGEM, atual.exists() ? '' : dados.path);
    assinar(dados);
  }
  cloud.equipe = { id: eu.uid, ...equipe };
  emit();
}

// ---------- Anexos ----------
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open('gestao360', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('anexos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function idbOp(modo, fn) {
  const db = await idb();
  return new Promise((ok, no) => {
    const req = fn(db.transaction('anexos', modo).objectStore('anexos'));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
  });
}

export async function addAnexo(file) {
  const meta = { id: uid(), nome: file.name, tipo: file.type || '', tam: file.size };
  if (usarStorage && fb && cloud.user) {
    try {
      const r = fb.S.ref(fb.st, `users/${cloud.user.uid}/anexos/${meta.id}-${file.name}`);
      await fb.S.uploadBytes(r, file);
      meta.url = await fb.S.getDownloadURL(r);
      meta.path = r.fullPath;
      return meta;
    } catch (e) { console.warn('Storage indisponível, guardando anexo neste aparelho:', e.message); }
  }
  await idbOp('readwrite', s => s.put(file, meta.id));
  return meta;
}

export async function urlAnexo(meta) {
  if (meta.url) return meta.url;
  const blob = await idbOp('readonly', s => s.get(meta.id));
  return blob ? URL.createObjectURL(blob) : null;
}

export async function delAnexo(meta) {
  try {
    if (meta.path && fb) await fb.S.deleteObject(fb.S.ref(fb.st, meta.path));
    else await idbOp('readwrite', s => s.delete(meta.id));
  } catch (e) { console.warn(e); }
}

// Devolve o anexo como File (para compartilhar pelo celular).
export async function arquivoAnexo(meta) {
  try {
    const blob = meta.url ? await (await fetch(meta.url)).blob() : await idbOp('readonly', s => s.get(meta.id));
    return blob ? new File([blob], meta.nome, { type: meta.tipo || blob.type }) : null;
  } catch { return null; }
}

// Pede ao servidor o envio imediato do resumo de alertas pelo WhatsApp (API oficial).
export async function avisoZapAgora() {
  if (!fb || !cloud.user) throw new Error('Disponível depois de conectar ao Firebase.');
  const Fn = await import(FB + 'firebase-functions.js');
  const chamar = Fn.httpsCallable(Fn.getFunctions(fb.app, 'southamerica-east1'), 'enviarAlertasAgora');
  return (await chamar()).data;
}

// Backup: troca todos os dados pelos de um arquivo exportado antes.
export function restaurar(dados) {
  if (!dados || !Array.isArray(dados.empresas)) throw new Error('Arquivo de backup inválido.');
  state = normalizar(dados);
  save();
}
