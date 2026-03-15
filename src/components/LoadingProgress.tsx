interface Props {
  progress: number;
  message: string;
  modelName: string;
}

export default function LoadingProgress({ progress, message, modelName }: Props) {
  const clampedPct = Math.max(0, Math.min(100, progress));

  return (
    <div className="m-4 p-5 bg-black/85 border border-white/20 rounded-2xl shadow-xl panel-glass">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-100 tracking-[0.08em] uppercase">Loading {modelName}</p>
          <p className="text-xs text-slate-500 mt-0.5 tracking-[0.08em] uppercase">
            Weights are cached after the first download
          </p>
        </div>
        <span className="text-lg font-mono font-bold text-slate-100">
          {clampedPct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-black rounded-full h-2.5 overflow-hidden border border-white/10">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${Math.max(2, clampedPct)}%`,
            background: 'linear-gradient(90deg, #9ca3af, #f8fafc)',
          }}
        />
      </div>

      {/* Status message */}
      <p className="text-xs text-slate-500 mt-2.5 truncate">{message}</p>
    </div>
  );
}
