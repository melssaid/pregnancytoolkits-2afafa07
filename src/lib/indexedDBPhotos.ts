/**
 * IndexedDB-based photo storage for bump photos.
 * Supports hundreds of MB vs localStorage's ~5-10MB limit.
 * Falls back gracefully if IndexedDB is unavailable.
 */

const DB_NAME = 'pregnancy_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'bump_photos';

export interface IndexedDBPhoto {
  id: string;
  user_id: string;
  week: number;
  image_blob: Blob;
  caption: string | null;
  ai_analysis: string | null;
  created_at: string;
  updated_at: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
        store.createIndex('week', 'week', { unique: false });
        store.createIndex('user_week', ['user_id', 'week'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Save a photo blob to IndexedDB */
export async function savePhotoToDB(photo: IndexedDBPhoto): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all photos for a user */
export async function getPhotosFromDB(userId: string): Promise<IndexedDBPhoto[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('user_id');
    const request = index.getAll(userId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/** Get photos for a specific week */
export async function getPhotosByWeekFromDB(userId: string, week: number): Promise<IndexedDBPhoto[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('user_week');
    const request = index.getAll([userId, week]);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/** Delete a photo by ID */
export async function deletePhotoFromDB(id: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Update a photo field */
export async function updatePhotoInDB(id: string, updates: Partial<IndexedDBPhoto>): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        store.put({ ...getReq.result, ...updates, updated_at: new Date().toISOString() });
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Convert a File to Blob (compressed) */
export async function fileToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 1200, maxH = 1600;
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Compression failed'));
          }
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/** Create an object URL from a stored photo blob */
export function createPhotoURL(photo: IndexedDBPhoto): string {
  return URL.createObjectURL(photo.image_blob);
}

/** Get estimated storage usage */
export async function getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { used: est.usage || 0, quota: est.quota || 0 };
  }
  return null;
}
