/* ── SwingDB.js ───────────────────────────────────────────────────────────
   IndexedDB wrapper for SwingVaultDB v1.
   Stores: swings (one per analysis), sessions (grouped).
─────────────────────────────────────────────────────────────────────────── */

const DB_NAME    = 'SwingVaultDB';
const DB_VERSION = 1;

let db = null;

// ── Open / create database ────────────────────────────────────────────────
export function openDB() {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const _db = e.target.result;

      if (!_db.objectStoreNames.contains('swings')) {
        const store = _db.createObjectStore('swings', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date',      'date',      { unique: false });
        store.createIndex('golferTag', 'golferTag', { unique: false });
      }

      if (!_db.objectStoreNames.contains('sessions')) {
        const sess = _db.createObjectStore('sessions', { keyPath: 'sessionId', autoIncrement: true });
        sess.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Transaction helper ────────────────────────────────────────────────────
async function tx(storeName, mode, fn) {
  const _db = await openDB();
  return new Promise((resolve, reject) => {
    const t = _db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── CRUD — swings ─────────────────────────────────────────────────────────
export async function saveSwing(record) {
  const full = {
    date:       new Date().toISOString(),
    golferTag:  'player_1',
    ...record,
  };
  // Don't store full frames array (too large) unless explicitly included
  const toSave = { ...full };
  if (!record.includeFrames) delete toSave.frames;
  return tx('swings', 'readwrite', s => s.add(toSave));
}

export async function getSwing(id) {
  return tx('swings', 'readonly', s => s.get(id));
}

export async function listSwings(filter = {}) {
  const _db = await openDB();
  return new Promise((resolve, reject) => {
    const t = _db.transaction('swings', 'readonly');
    const store = t.objectStore('swings');
    const req = store.getAll();
    req.onsuccess = (e) => {
      let results = e.target.result || [];
      if (filter.golferTag) results = results.filter(r => r.golferTag === filter.golferTag);
      if (filter.limit)     results = results.slice(-filter.limit);
      resolve(results.reverse()); // most recent first
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteSwing(id) {
  return tx('swings', 'readwrite', s => s.delete(id));
}

export async function clearAll() {
  const _db = await openDB();
  return new Promise((resolve, reject) => {
    const t = _db.transaction(['swings', 'sessions'], 'readwrite');
    t.objectStore('swings').clear();
    t.objectStore('sessions').clear();
    t.oncomplete = resolve;
    t.onerror = (e) => reject(e.target.error);
  });
}

// ── Session helpers ───────────────────────────────────────────────────────
export async function createSession(meta = {}) {
  return tx('sessions', 'readwrite', s => s.add({
    date: new Date().toISOString(),
    ...meta,
  }));
}

// ── Settings via localStorage (fast, small data) ──────────────────────────
export const Settings = {
  get(key, defaultVal) {
    try {
      const raw = localStorage.getItem(`kpai_golf_${key}`);
      return raw != null ? JSON.parse(raw) : defaultVal;
    } catch { return defaultVal; }
  },
  set(key, value) {
    try { localStorage.setItem(`kpai_golf_${key}`, JSON.stringify(value)); } catch {}
  },
  getAll() {
    return {
      golferTag:   this.get('golferTag',   'My Swing'),
      handedness:  this.get('handedness',  'right'),
      poseModel:   this.get('poseModel',   'blazepose'),
      targetFps:   this.get('targetFps',   15),
      cameraView:  this.get('cameraView',  'face-on'),
    };
  },
};
