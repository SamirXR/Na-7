import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  Database,
  Search,
  Upload,
  Plus,
} from 'lucide-react';

import { useEngine } from './hooks/useEngine';
import { useChat } from './hooks/useChat';
import { MODEL_REGISTRY } from './lib/modelRegistry';
import {
  clearAllCaches,
  clearAllConversations,
  clearPendingPrompts,
  conversationTitleFromMessages,
  deleteConversation,
  dequeuePendingPrompts,
  downloadBundle,
  enqueuePendingPrompt,
  exportOfflineBundle,
  getConversation,
  getLastSyncedAt,
  getPendingPrompts,
  getPinnedModelIds,
  getStorageEstimate,
  importOfflineBundle,
  listConversations,
  saveConversation,
  searchConversations,
  setLastSyncedAt,
  setPinnedModelIds,
  type ConversationSummary,
} from './lib/offlineStore';

import ModelSelector from './components/ModelSelector';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import LoadingProgress from './components/LoadingProgress';
import StatusBadge from './components/StatusBadge';
import InteractiveDotBackground from './components/InteractiveDotBackground';

function fmtBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const mb = value / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fmtTime(value: number | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function createConversationId(): string {
  return crypto.randomUUID();
}

export default function App() {
  const engine = useEngine();
  const chat = useChat();

  const [selectedModelId, setSelectedModelId] = useState<string>(
    () => localStorage.getItem('lastModel') ?? MODEL_REGISTRY[0].id,
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileModelsOpen, setMobileModelsOpen] = useState(false);
  const [mobileChatsOpen, setMobileChatsOpen] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showAboutNa7, setShowAboutNa7] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [pwaInstalled, setPwaInstalled] = useState<boolean>(() =>
    window.matchMedia('(display-mode: standalone)').matches,
  );

  const [offlinePanelOpen, setOfflinePanelOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyRows, setHistoryRows] = useState<ConversationSummary[]>([]);

  const [pinnedModelIds, setPinnedModelIdsState] = useState<string[]>(() => getPinnedModelIds());
  const [pendingCount, setPendingCount] = useState(() => getPendingPrompts().length);
  const [lastSyncedAt, setLastSyncedAtState] = useState<number | null>(() => getLastSyncedAt());
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageQuotaBytes, setStorageQuotaBytes] = useState(0);

  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [replayingQueue, setReplayingQueue] = useState(false);

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const existing = localStorage.getItem('activeConversationId');
    return existing ?? createConversationId();
  });

  const importRef = useRef<HTMLInputElement>(null);

  const selectedModel =
    MODEL_REGISTRY.find((m) => m.id === selectedModelId) ?? MODEL_REGISTRY[0];

  const selectedModelPinned = pinnedModelIds.includes(selectedModel.id);

  const inputDisabled = isOnline && engine.status !== 'ready';

  const inputPlaceholder = useMemo(() => {
    if (!isOnline && engine.status !== 'ready') {
      return 'Offline queue mode: prompt will sync when connection/model is ready…';
    }
    if (engine.status === 'idle' || engine.status === 'error') {
      return 'Load a model to start chatting…';
    }
    if (engine.status === 'loading') {
      return 'Waiting for model to load…';
    }
    return 'Type a message…';
  }, [engine.status, isOnline]);

  const refreshStorage = useCallback(async () => {
    const stats = await getStorageEstimate();
    setStorageUsedBytes(stats.usedBytes);
    setStorageQuotaBytes(stats.quotaBytes);
  }, []);

  const refreshHistory = useCallback(async () => {
    const rows = historyQuery.trim()
      ? await searchConversations(historyQuery)
      : await listConversations();
    setHistoryRows(rows);
  }, [historyQuery]);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingPrompts().length);
  }, []);

  useEffect(() => {
    document.title = 'Na7 Chat';
  }, []);

  useEffect(() => {
    localStorage.setItem('activeConversationId', activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const onInstalled = () => {
      setPwaInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  useEffect(() => {
    if (engine.status === 'ready') setSidebarOpen(false);
  }, [engine.status]);

  useEffect(() => {
    if (engine.status === 'ready') setMobileModelsOpen(false);
  }, [engine.status]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, chat.messages.length]);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage, offlinePanelOpen]);

  useEffect(() => {
    if (!offlinePanelOpen) return;
    const timer = window.setInterval(() => {
      void refreshStorage();
      refreshPendingCount();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [offlinePanelOpen, refreshStorage, refreshPendingCount]);

  useEffect(() => {
    if (engine.status === 'ready' && downloadingModelId) {
      if (!pinnedModelIds.includes(downloadingModelId)) {
        const next = [...pinnedModelIds, downloadingModelId];
        setPinnedModelIds(next);
        setPinnedModelIdsState(next);
      }
      setDownloadingModelId(null);
    }
    if (engine.status === 'error') {
      setDownloadingModelId(null);
    }
  }, [downloadingModelId, engine.status, pinnedModelIds]);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      const run = async () => {
        if (chat.messages.length === 0) {
          await deleteConversation(activeConversationId);
          return;
        }

        const existing = await getConversation(activeConversationId);
        await saveConversation({
          id: activeConversationId,
          title: conversationTitleFromMessages(chat.messages),
          modelId: selectedModelId,
          systemPrompt: chat.systemPrompt,
          messages: chat.messages,
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        });
      };

      void run();
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [activeConversationId, chat.messages, chat.systemPrompt, selectedModelId]);

  useEffect(() => {
    if (!isOnline) return;

    const refresh = async () => {
      const warmUrls = ['/manifest.webmanifest', '/logo-icon-192.png'];
      await Promise.all(
        warmUrls.map((url) => fetch(url, { cache: 'no-cache' }).catch(() => null)),
      );
      const ts = Date.now();
      setLastSyncedAt(ts);
      setLastSyncedAtState(ts);
    };

    const startupTimer = window.setTimeout(() => {
      void refresh();
    }, 4000);

    const interval = window.setInterval(() => {
      void refresh();
    }, 10 * 60 * 1000);

    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [isOnline]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const handleDownloadPwaManifest = async () => {
    try {
      const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to download manifest');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'na7-chat.webmanifest';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      chat.addAssistantNote('Downloaded PWA manifest. Install from browser menu if prompt is unavailable.');
    } catch {
      chat.addAssistantNote('Could not download manifest. Check your connection and try again.');
    }
  };

  const handleLoadModel = () => {
    if (engine.status === 'loading') return;

    let model = selectedModel;

    if (!isOnline) {
      const pinnedFallback = MODEL_REGISTRY.find(
        (m) => pinnedModelIds.includes(m.id) && !m.requiresWebGPU,
      );
      if (!selectedModelPinned && pinnedFallback) {
        model = pinnedFallback;
        setSelectedModelId(pinnedFallback.id);
      }

      if (model.requiresWebGPU && !engine.webGPUAvailable) {
        const cpuFallback = MODEL_REGISTRY.find((m) => !m.requiresWebGPU);
        if (cpuFallback) {
          model = cpuFallback;
          setSelectedModelId(cpuFallback.id);
        }
      }
    }

    localStorage.setItem('lastModel', model.id);
    engine.loadModel(model);
  };

  const handleDownloadOffline = (modelId: string) => {
    const model = MODEL_REGISTRY.find((m) => m.id === modelId);
    if (!model) return;
    setSelectedModelId(model.id);
    setSidebarOpen(true);
    setDownloadingModelId(model.id);
    localStorage.setItem('lastModel', model.id);
    engine.loadModel(model);
  };

  const handleTogglePinned = (id: string, pinned: boolean) => {
    const next = pinned
      ? Array.from(new Set([...pinnedModelIds, id]))
      : pinnedModelIds.filter((modelId) => modelId !== id);
    setPinnedModelIds(next);
    setPinnedModelIdsState(next);
  };

  const handleClearChat = async () => {
    chat.clearMessages();
    await deleteConversation(activeConversationId);
    setActiveConversationId(createConversationId());
    void refreshHistory();
  };

  const handleNewChat = () => {
    setActiveConversationId(createConversationId());
    chat.replaceMessages([]);
    setMobileChatsOpen(false);
  };

  const handleDeleteSavedConversation = async (id: string) => {
    await deleteConversation(id);
    if (id === activeConversationId) {
      setActiveConversationId(createConversationId());
      chat.replaceMessages([]);
    }
    void refreshHistory();
  };

  const handleSend = (content: string) => {
    if (engine.status === 'ready') {
      void chat.sendMessage(content, engine.sendChat, engine.abortChat);
      return;
    }

    if (!isOnline) {
      enqueuePendingPrompt(content, selectedModelId);
      refreshPendingCount();
      chat.addAssistantNote('Queued offline. This prompt will run automatically when online and model is ready.');
      return;
    }

    chat.addAssistantNote('Model is not ready yet. Load a model first.');
  };

  const handleReplayQueuedPrompts = async () => {
    if (replayingQueue || !isOnline || engine.status !== 'ready') return;

    const dequeued = dequeuePendingPrompts(50);
    if (dequeued.length === 0) return;

    setReplayingQueue(true);

    try {
      for (const item of dequeued) {
        await chat.sendMessage(item.content, engine.sendChat, engine.abortChat);
      }
      chat.addAssistantNote(`Replayed ${dequeued.length} queued prompt(s).`);
    } catch {
      for (const item of dequeued) {
        enqueuePendingPrompt(item.content, item.preferredModelId);
      }
      chat.addAssistantNote('Replay failed. Queued prompts were restored.');
    } finally {
      setReplayingQueue(false);
      refreshPendingCount();
    }
  };

  const handleLoadConversation = async (id: string) => {
    const conv = await getConversation(id);
    if (!conv) return;
    setActiveConversationId(conv.id);
    chat.replaceMessages(conv.messages);
    chat.setSystemPrompt(conv.systemPrompt);
    if (conv.modelId) {
      setSelectedModelId(conv.modelId);
    }
    setOfflinePanelOpen(false);
    setMobileChatsOpen(false);
  };

  const handleExportOffline = async () => {
    const bundle = await exportOfflineBundle();
    downloadBundle(bundle);
  };

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    await importOfflineBundle(parsed);

    const nextPinned = getPinnedModelIds();
    setPinnedModelIdsState(nextPinned);
    setLastSyncedAtState(getLastSyncedAt());
    refreshPendingCount();
    void refreshHistory();
    void refreshStorage();
    e.target.value = '';
  };

  const onboardingChecks = [
    { label: 'Install app', done: pwaInstalled },
    { label: 'Download one model', done: pinnedModelIds.length > 0 },
    { label: 'Run offline queue test', done: pendingCount === 0 },
  ];

  return (
    <div className="flex flex-col h-full text-slate-100 overflow-hidden relative">
      <InteractiveDotBackground />
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-700/80 panel-glass z-20 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo.png"
            alt="Na7 Chat logo"
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-md object-contain flex-shrink-0"
            loading="eager"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs sm:text-sm text-slate-100 flex-shrink-0 tracking-[0.18em] uppercase">
              Personal AI Terminal
            </span>
            <span className="text-[10px] text-slate-500 tracking-[0.18em] uppercase">v1.0.0</span>
          </div>
          <StatusBadge
            backend={engine.backend}
            webGPUAvailable={engine.webGPUAvailable}
            gpuAdapterName={engine.gpuAdapterName}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pwaInstalled ? (
            <span className="terminal-chip rounded-lg px-2.5 py-1.5">[ installed ]</span>
          ) : installPrompt ? (
            <button
              onClick={handleInstall}
              title="Install app"
              className="terminal-btn-primary flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
            >
              <Download size={12} />
              <span className="hidden sm:inline">[ install app ]</span>
            </button>
          ) : null}

          <button
            onClick={() => {
              void handleDownloadPwaManifest();
            }}
            title="Download PWA manifest"
            className="terminal-btn text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Download size={12} />
            <span className="hidden sm:inline">[ download pwa ]</span>
          </button>

          <button
            onClick={() => setOfflinePanelOpen((v) => !v)}
            title="Offline center"
            className="terminal-btn text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <Database size={12} />
            <span className="hidden sm:inline">[ offline ]</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-black text-[10px]">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowSystemPrompt((s) => !s)}
            title="System prompt"
            className="terminal-btn text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <span className="hidden sm:inline">[ system prompt ]</span>
            {showSystemPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <button
            onClick={() => setShowAboutNa7((s) => !s)}
            title="About Na7"
            className="terminal-btn text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <span>[ about ]</span>
            {showAboutNa7 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {chat.messages.length > 0 && (
            <button
              onClick={() => {
                void handleClearChat();
              }}
              title="Clear conversation"
              className="terminal-btn text-xs p-1.5 rounded-lg text-slate-300 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </header>

      {!isOnline && (
        <div className="bg-slate-900/70 border-b border-slate-600/60 px-4 py-2 text-slate-300 text-xs flex-shrink-0">
          [Offline mode] Cached models and saved chats remain available. Prompts can be queued for replay.
        </div>
      )}

      {!engine.webGPUAvailable && (
        <div className="bg-slate-900/70 border-b border-slate-600/60 px-4 py-2 text-slate-300 text-xs flex-shrink-0">
          [Notice] WebGPU is unavailable in this browser. Use a CPU/WASM model for offline fallback.
        </div>
      )}

      {offlinePanelOpen && (
        <section className="border-b border-slate-700 px-3 sm:px-4 py-3 panel-glass flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className={isOnline ? 'text-emerald-400' : 'text-amber-300'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span>Queued: {pendingCount}</span>
            <span>Last sync: {fmtTime(lastSyncedAt)}</span>
            <span>Models pinned: {pinnedModelIds.length}</span>
          </div>

          <div className="mt-2 text-xs text-slate-400">
            Storage: {fmtBytes(storageUsedBytes)} / {fmtBytes(storageQuotaBytes)}
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 mt-1.5 overflow-hidden">
            <div
              className="h-full bg-slate-300"
              style={{
                width:
                  storageQuotaBytes > 0
                    ? `${Math.min(100, Math.round((storageUsedBytes / storageQuotaBytes) * 100))}%`
                    : '0%',
              }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => {
                void handleReplayQueuedPrompts();
              }}
              disabled={!isOnline || engine.status !== 'ready' || pendingCount === 0 || replayingQueue}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-black disabled:bg-slate-700 disabled:text-slate-400"
            >
              {replayingQueue ? 'Replaying...' : 'Replay Queue'}
            </button>

            <button
              onClick={() => {
                void handleExportOffline();
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              Export Offline Bundle
            </button>

            <button
              onClick={() => importRef.current?.click()}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center gap-1"
            >
              <Upload size={12} /> Import Bundle
            </button>

            <button
              onClick={() => {
                void clearAllCaches();
                void refreshStorage();
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              Clear Caches
            </button>

            <button
              onClick={() => {
                void clearAllConversations();
                setActiveConversationId(createConversationId());
                chat.replaceMessages([]);
                void refreshHistory();
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              Clear Saved Chats
            </button>

            <button
              onClick={() => {
                clearPendingPrompts();
                refreshPendingCount();
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              Clear Queue
            </button>

            <button
              onClick={() => {
                setActiveConversationId(createConversationId());
                chat.replaceMessages([]);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center gap-1"
            >
              <Plus size={12} /> New Chat
            </button>
          </div>

          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              void handleImportFile(e);
            }}
          />

          <div className="mt-3">
            <div className="text-[11px] font-semibold text-slate-200 tracking-[0.08em] mb-1.5">
              Offline Readiness
            </div>
            <div className="grid sm:grid-cols-3 gap-2 text-xs">
              {onboardingChecks.map((check) => (
                <div
                  key={check.label}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300"
                >
                  <span className={check.done ? 'text-emerald-400' : 'text-amber-300'}>
                    {check.done ? 'DONE' : 'TODO'}
                  </span>{' '}
                  {check.label}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <label className="text-[11px] text-slate-300 tracking-[0.08em] flex items-center gap-1">
              <Search size={12} /> Offline history search
            </label>
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="Search saved conversations..."
              className="mt-1 w-full sm:max-w-md bg-slate-900/70 border border-slate-600/70 text-slate-100 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-2 max-h-44 overflow-y-auto space-y-1.5">
              {historyRows.length === 0 && (
                <p className="text-xs text-slate-500">No saved conversations yet.</p>
              )}
              {historyRows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => {
                    void handleLoadConversation(row.id);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800/70"
                >
                  <div className="text-xs text-slate-200 truncate">{row.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {row.messageCount} msgs · {new Date(row.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {showSystemPrompt && (
        <div className="border-b border-slate-700 px-3 sm:px-4 py-3 panel-glass flex-shrink-0">
          <label className="text-[11px] font-medium text-slate-100 block mb-1.5 tracking-[0.08em]">
            03 // System prompt
            <span className="text-slate-600 ml-1">(persisted to localStorage)</span>
          </label>
          <textarea
            value={chat.systemPrompt}
            onChange={(e) => chat.setSystemPrompt(e.target.value)}
            rows={3}
            className="w-full bg-slate-900/70 border border-slate-600/70 text-slate-100 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
      )}

      {showAboutNa7 && (
        <div className="border-b border-slate-700 px-3 sm:px-4 py-3 panel-glass flex-shrink-0">
          <div className="max-w-4xl space-y-2">
            <p className="text-[11px] font-semibold text-slate-100 tracking-[0.08em]">04 // About Na7</p>
            <p className="text-sm text-slate-300">
              Na7 Chat is your local-first AI workspace. Models run in the browser, chats stay on-device,
              and offline workflows are built in so you can keep building anywhere.
            </p>
            <p className="text-sm text-slate-400">
              If this project helps you, please star the repository to support it.
            </p>
            <a
              href="https://github.com/SamirXR/Local-AI"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-black transition-colors"
            >
              Star Na7 Chat on GitHub
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative max-w-[1700px] w-full mx-auto">
        <aside className="hidden md:flex w-72 flex-shrink-0 border-r border-slate-700/70 flex-col overflow-hidden panel-glass">
          <div className="p-3 border-b border-slate-700/70 space-y-2">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-black font-medium"
            >
              <Plus size={14} /> New Chat
            </button>
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium"
            >
              <Settings size={14} /> {sidebarOpen ? 'Hide Model Bank' : 'Open Model Bank'}
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Search history"
                className="w-full bg-slate-900/70 border border-slate-700/70 text-slate-100 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300/80"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {historyRows.length === 0 && (
              <p className="text-xs text-slate-500 px-2 py-2">No saved chats yet.</p>
            )}
            {historyRows.map((row) => {
              const isActive = row.id === activeConversationId;
              return (
                <div key={row.id} className="relative group">
                  <button
                    onClick={() => {
                      void handleLoadConversation(row.id);
                    }}
                    className={[
                      'w-full text-left px-3 py-2 rounded-xl border transition-colors',
                      isActive
                        ? 'border-slate-300/80 bg-slate-800 text-slate-100'
                        : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800/70 text-slate-200',
                    ].join(' ')}
                  >
                    <div className="truncate text-xs font-medium pr-7">{row.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(row.updatedAt).toLocaleDateString()} · {row.messageCount} msgs
                    </div>
                  </button>
                  <button
                    aria-label="Delete conversation"
                    onClick={() => {
                      void handleDeleteSavedConversation(row.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity absolute -mt-9 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {sidebarOpen && (
          <aside className="hidden sm:flex w-80 lg:w-96 flex-shrink-0 border-r border-slate-700/70 flex-col overflow-hidden panel-glass">
            <div className="flex-1 overflow-y-auto">
              <ModelSelector
                models={MODEL_REGISTRY}
                selectedId={selectedModelId}
                onSelect={setSelectedModelId}
                webGPUAvailable={engine.webGPUAvailable}
                pinnedModelIds={pinnedModelIds}
                onTogglePinned={handleTogglePinned}
                onDownloadOffline={handleDownloadOffline}
              />
            </div>

            <div className="flex-shrink-0 border-t border-slate-700/70 p-4 space-y-3">
              {engine.status === 'loading' && (
                <LoadingProgress
                  progress={engine.progress}
                  message={engine.progressMsg}
                  modelName={selectedModel.displayName}
                />
              )}

              {engine.status === 'error' && (
                <div className="p-3 bg-slate-900/70 border border-slate-600/70 rounded-xl text-xs">
                  <p className="font-semibold text-slate-100 mb-1">Failed to load model</p>
                  <p className="text-slate-300 break-words">{engine.error}</p>
                </div>
              )}

              <button
                onClick={handleLoadModel}
                disabled={engine.status === 'loading'}
                className={[
                  'w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all tracking-wide',
                  engine.status === 'loading'
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-100 hover:bg-slate-200 text-black active:scale-[0.98]',
                ].join(' ')}
              >
                {engine.status === 'loading'
                  ? `Loading... ${engine.progress}%`
                  : engine.status === 'ready'
                  ? 'Reload / Switch Model'
                  : 'Load Model'}
              </button>

              {downloadingModelId && (
                <p className="text-center text-xs text-slate-300">Downloading model pack for offline use...</p>
              )}

              {engine.status === 'ready' && (
                <p className="text-center text-xs text-slate-300">
                  Ready · {selectedModelPinned ? 'Pinned for offline mode' : 'Available in cache'}
                </p>
              )}
            </div>
          </aside>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          {!sidebarOpen && engine.status === 'loading' && (
            <LoadingProgress
              progress={engine.progress}
              message={engine.progressMsg}
              modelName={selectedModel.displayName}
            />
          )}

          {!sidebarOpen && engine.status === 'error' && (
            <div className="m-4 p-4 bg-slate-900/70 border border-slate-600/70 rounded-2xl">
              <p className="font-semibold text-slate-100 mb-1">Error loading model</p>
              <p className="text-slate-300 text-sm">{engine.error}</p>
              <button
                onClick={() => setMobileModelsOpen(true)}
                className="mt-3 text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Open model drawer
              </button>
            </div>
          )}

          <ChatWindow
            messages={chat.messages}
            isGenerating={chat.isGenerating}
            assistantLogoSrc={selectedModel.logoSrc}
            assistantLabel={selectedModel.displayName}
          />

          <InputBar
            draftKey={activeConversationId}
            onSend={handleSend}
            onStop={chat.stopGenerating}
            isGenerating={chat.isGenerating}
            disabled={inputDisabled}
            placeholder={inputPlaceholder}
          />
        </div>

        <>
          {mobileChatsOpen && (
            <button
              type="button"
              aria-label="Close chat drawer"
              onClick={() => setMobileChatsOpen(false)}
              className="md:hidden absolute inset-0 bg-slate-950/70 z-30"
            />
          )}

          <div
            className={[
              'md:hidden absolute left-0 top-0 bottom-0 z-40 w-[88%] max-w-[360px] panel-glass border-r border-slate-500/60',
              'transition-transform duration-300 ease-out',
              mobileChatsOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
            ].join(' ')}
          >
            <div className="p-3 border-b border-slate-700/70 space-y-2">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-black font-medium"
              >
                <Plus size={14} /> New Chat
              </button>
              <button
                onClick={() => setMobileModelsOpen((s) => !s)}
                className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium"
              >
                <Settings size={14} /> Open Model Bank
              </button>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Search history"
                  className="w-full bg-slate-900/70 border border-slate-700/70 text-slate-100 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300/80"
                />
              </div>
            </div>

            <div className="overflow-y-auto p-2 space-y-1.5 h-[calc(100%-86px)]">
              {historyRows.length === 0 && (
                <p className="text-xs text-slate-500 px-2 py-2">No saved chats yet.</p>
              )}
              {historyRows.map((row) => {
                const isActive = row.id === activeConversationId;
                return (
                  <div key={row.id} className="relative group">
                    <button
                      onClick={() => {
                        void handleLoadConversation(row.id);
                      }}
                      className={[
                        'w-full text-left px-3 py-2 rounded-xl border transition-colors',
                        isActive
                          ? 'border-slate-300/80 bg-slate-800 text-slate-100'
                          : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800/70 text-slate-200',
                      ].join(' ')}
                    >
                      <div className="truncate text-xs font-medium pr-7">{row.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(row.updatedAt).toLocaleDateString()} · {row.messageCount} msgs
                      </div>
                    </button>
                    <button
                      aria-label="Delete conversation"
                      onClick={() => {
                        void handleDeleteSavedConversation(row.id);
                      }}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {mobileModelsOpen && (
            <button
              type="button"
              aria-label="Close model drawer"
              onClick={() => setMobileModelsOpen(false)}
              className="sm:hidden absolute inset-0 bg-slate-950/70 z-30"
            />
          )}

          <div
            className={[
              'sm:hidden absolute inset-x-0 bottom-0 z-40 max-h-[80vh] rounded-t-3xl panel-glass border-t border-slate-500/60',
              'transition-transform duration-300 ease-out',
              mobileModelsOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none',
            ].join(' ')}
          >
            <div className="py-2 flex justify-center">
              <div className="w-12 h-1 rounded-full bg-slate-500" />
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[calc(80vh-20px)]">
              <ModelSelector
                models={MODEL_REGISTRY}
                selectedId={selectedModelId}
                onSelect={setSelectedModelId}
                webGPUAvailable={engine.webGPUAvailable}
                pinnedModelIds={pinnedModelIds}
                onTogglePinned={handleTogglePinned}
                onDownloadOffline={handleDownloadOffline}
              />

              <div className="space-y-3 pt-2">
                {engine.status === 'loading' && (
                  <LoadingProgress
                    progress={engine.progress}
                    message={engine.progressMsg}
                    modelName={selectedModel.displayName}
                  />
                )}

                <button
                  onClick={handleLoadModel}
                  disabled={engine.status === 'loading'}
                  className={[
                    'w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all tracking-wide',
                    engine.status === 'loading'
                      ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-100 hover:bg-slate-200 text-black active:scale-[0.98]',
                  ].join(' ')}
                >
                  {engine.status === 'loading'
                    ? `Loading... ${engine.progress}%`
                    : engine.status === 'ready'
                    ? 'Reload / Switch Model'
                    : 'Load Model'}
                </button>
              </div>
            </div>
          </div>
        </>
      </div>
    </div>
  );
}
