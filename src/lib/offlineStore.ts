import type { Message } from '../hooks/useChat';

const DB_NAME = 'na7-offline-db';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';

const PINNED_MODELS_KEY = 'offline.pinnedModels';
const PENDING_PROMPTS_KEY = 'offline.pendingPrompts';
const LAST_SYNC_KEY = 'offline.lastSyncedAt';

export interface StoredConversation {
  id: string;
  title: string;
  modelId: string | null;
  systemPrompt: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  modelId: string | null;
  updatedAt: number;
  messageCount: number;
}

export interface PendingPrompt {
  id: string;
  content: string;
  createdAt: number;
  preferredModelId: string | null;
}

export interface OfflineExportBundle {
  version: 1;
  exportedAt: number;
  conversations: StoredConversation[];
  pinnedModelIds: string[];
  pendingPrompts: PendingPrompt[];
  lastSyncedAt: number | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const store = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open offline database'));
  });
}

function withStore(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => void,
): Promise<void> {
  return openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CONVERSATIONS_STORE, mode);
        const store = tx.objectStore(CONVERSATIONS_STORE);

        op(store);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function safeJsonParse<T>(input: string | null, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export async function saveConversation(conv: StoredConversation): Promise<void> {
  await withStore('readwrite', (store) => {
    store.put(conv);
  });
}

export async function getConversation(id: string): Promise<StoredConversation | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const req = tx.objectStore(CONVERSATIONS_STORE).get(id);
    const result = await requestToPromise(req);
    return (result as StoredConversation | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const req = tx.objectStore(CONVERSATIONS_STORE).getAll();
    const rows = (await requestToPromise(req)) as StoredConversation[];

    return rows
      .map((conv) => ({
        id: conv.id,
        title: conv.title,
        modelId: conv.modelId,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function searchConversations(query: string): Promise<ConversationSummary[]> {
  const normalized = query.trim().toLowerCase();
  const all = await listConversations();
  if (!normalized) return all;

  const db = await openDb();
  try {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const req = tx.objectStore(CONVERSATIONS_STORE).getAll();
    const rows = (await requestToPromise(req)) as StoredConversation[];

    const matchedIds = new Set(
      rows
        .filter((conv) => {
          if (conv.title.toLowerCase().includes(normalized)) return true;
          return conv.messages.some((msg) => msg.content.toLowerCase().includes(normalized));
        })
        .map((conv) => conv.id),
    );

    return all.filter((summary) => matchedIds.has(summary.id));
  } finally {
    db.close();
  }
}

export async function deleteConversation(id: string): Promise<void> {
  await withStore('readwrite', (store) => {
    store.delete(id);
  });
}

export async function clearAllConversations(): Promise<void> {
  await withStore('readwrite', (store) => {
    store.clear();
  });
}

export function getPinnedModelIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(PINNED_MODELS_KEY), []);
}

export function setPinnedModelIds(ids: string[]): void {
  const unique = Array.from(new Set(ids));
  localStorage.setItem(PINNED_MODELS_KEY, JSON.stringify(unique));
}

export function isModelPinned(id: string): boolean {
  return getPinnedModelIds().includes(id);
}

export function getPendingPrompts(): PendingPrompt[] {
  return safeJsonParse<PendingPrompt[]>(localStorage.getItem(PENDING_PROMPTS_KEY), []);
}

export function enqueuePendingPrompt(content: string, preferredModelId: string | null): PendingPrompt {
  const item: PendingPrompt = {
    id: crypto.randomUUID(),
    content,
    createdAt: Date.now(),
    preferredModelId,
  };
  const queue = getPendingPrompts();
  queue.push(item);
  localStorage.setItem(PENDING_PROMPTS_KEY, JSON.stringify(queue));
  return item;
}

export function dequeuePendingPrompts(limit: number): PendingPrompt[] {
  const queue = getPendingPrompts();
  const selected = queue.slice(0, limit);
  const rest = queue.slice(limit);
  localStorage.setItem(PENDING_PROMPTS_KEY, JSON.stringify(rest));
  return selected;
}

export function clearPendingPrompts(): void {
  localStorage.setItem(PENDING_PROMPTS_KEY, JSON.stringify([]));
}

export function setLastSyncedAt(ts: number): void {
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
}

export function getLastSyncedAt(): number | null {
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number }> {
  if (!navigator.storage?.estimate) {
    return { usedBytes: 0, quotaBytes: 0 };
  }

  const estimate = await navigator.storage.estimate();
  return {
    usedBytes: estimate.usage ?? 0,
    quotaBytes: estimate.quota ?? 0,
  };
}

export async function clearAllCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

export async function exportOfflineBundle(): Promise<OfflineExportBundle> {
  const db = await openDb();
  try {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const req = tx.objectStore(CONVERSATIONS_STORE).getAll();
    const conversations = (await requestToPromise(req)) as StoredConversation[];

    return {
      version: 1,
      exportedAt: Date.now(),
      conversations,
      pinnedModelIds: getPinnedModelIds(),
      pendingPrompts: getPendingPrompts(),
      lastSyncedAt: getLastSyncedAt(),
    };
  } finally {
    db.close();
  }
}

export async function importOfflineBundle(bundle: OfflineExportBundle): Promise<void> {
  if (bundle.version !== 1) {
    throw new Error('Unsupported offline bundle version');
  }

  const db = await openDb();
  try {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite');
    const store = tx.objectStore(CONVERSATIONS_STORE);
    for (const conv of bundle.conversations) {
      store.put(conv);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to import conversations'));
      tx.onabort = () => reject(tx.error ?? new Error('Conversation import aborted'));
    });
  } finally {
    db.close();
  }

  setPinnedModelIds(bundle.pinnedModelIds);
  localStorage.setItem(PENDING_PROMPTS_KEY, JSON.stringify(bundle.pendingPrompts));
  if (bundle.lastSyncedAt !== null) {
    setLastSyncedAt(bundle.lastSyncedAt);
  }
}

export function downloadBundle(bundle: OfflineExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `na7-offline-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function conversationTitleFromMessages(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Untitled conversation';
  const trimmed = firstUser.content.trim();
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
}
