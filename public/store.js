// Camada de dados: localStorage sempre; Firestore + Storage quando o Firebase está configurado.
import { firebaseConfig, usarStorage } from './firebase-config.js';

const LS = 'gestao360:v1';
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const listeners = new Set();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const cloud = { ativo: !!firebaseConfig, pronto: !firebaseConfig, user: null, erro: null };
export let state = load();

let fb = null, unsub = null, timer = null;

function seed() {
  // O app começa vazio: os cadastros ficam na conta de cada usuário, nunca no código.
  const d = new Date();
  return {
    v: 1, atualizado: 0,
    inicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    config: { diasAlerta: 3, zapMeu: '', zapFin: '' },
    empresas: [], pagamentos: {}, pedidos: [], docs: [],
  };
}

function normalizar(s) {
  s.config ??= { diasAlerta: 3 };
  s.pagamentos ??= {};
  s.pedidos ??= [];
  s.docs ??= [];
  s.empresas ??= [];
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
  persistLocal();
  emit();
  clearTimeout(timer);
  timer = setTimeout(pushCloud, 500);
}

// ---------- Firebase ----------
const docRef = () => fb.F.doc(fb.db, 'users', cloud.user.uid, 'dados', 'principal');

async function pushCloud() {
  if (!fb || !cloud.user) return;
  try {
    await fb.F.setDoc(docRef(), JSON.parse(JSON.stringify(state)));
    cloud.erro = null;
  } catch (e) { cloud.erro = e.message; emit(); }
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
    A.onAuthStateChanged(fb.auth, user => {
      cloud.user = user; cloud.pronto = true;
      unsub?.(); unsub = null;
      if (user) {
        unsub = F.onSnapshot(docRef(), snap => {
          if (snap.metadata.hasPendingWrites) return;
          const d = snap.exists() ? snap.data() : null;
          if (d && (d.atualizado || 0) > (state.atualizado || 0)) {
            state = normalizar(d); persistLocal(); emit();
          } else if (!d || (d.atualizado || 0) < (state.atualizado || 0)) {
            if (!state.atualizado) state.atualizado = Date.now();
            pushCloud();
          }
        }, e => { cloud.erro = e.message; emit(); });
      }
      emit();
    });
  } catch (e) {
    cloud.pronto = true; cloud.erro = e.message; emit();
  }
}

export const login = () => fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
export const logout = () => fb.A.signOut(fb.auth);

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
