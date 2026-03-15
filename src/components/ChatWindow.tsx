import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '../hooks/useChat';

interface Props {
  messages: Message[];
  isGenerating: boolean;
  assistantLogoSrc?: string;
  assistantLabel?: string;
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative my-3 rounded-xl border border-white/20 bg-black/80">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 terminal-btn px-2 py-1 text-[10px] rounded-md tracking-[0.08em] uppercase"
        aria-label="Copy code"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto px-3 py-3 pr-16 text-[13px] leading-6 text-slate-100">
        <code className={className}>{text}</code>
      </pre>
    </div>
  );
}

export default function ChatWindow({ messages, isGenerating, assistantLogoSrc, assistantLabel = 'AI' }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMsg = [...messages].reverse().find((m): m is Message => m.role === 'assistant');
  const lastAssistantId = lastAssistantMsg?.id;

  // Auto-scroll to bottom as tokens stream in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 blueprint-grid">
        <div className="text-center max-w-sm panel-glass rounded-2xl p-6">
          <img
            src="/logo.png"
            alt="Na7 Chat logo"
            className="w-14 h-14 mx-auto mb-4 rounded-xl object-contain"
            loading="lazy"
          />
          <h2 className="text-lg font-semibold text-slate-100 mb-2 tracking-[0.16em] uppercase">Na7 Chat Terminal</h2>
          <p className="text-xs text-slate-400 tracking-[0.08em] uppercase">
            All inference runs in your browser. No data ever leaves your device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 blueprint-grid scanline">
      {messages.map(msg => {
        const isStreaming = isGenerating && msg.id === lastAssistantId;

        return (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* Avatar */}
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-black border border-white/30 flex items-center justify-center text-[10px] font-bold mt-0.5 overflow-hidden">
                {assistantLogoSrc ? (
                  <img
                    src={assistantLogoSrc}
                    alt={`${assistantLabel} logo`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  assistantLabel
                )}
              </div>
            )}

            <div
              className={[
                'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-slate-100 text-black rounded-tr-sm border border-white/60'
                  : 'panel-glass text-slate-100 rounded-tl-sm border-white/20',
              ].join(' ')}
            >
              {msg.role === 'assistant' ? (
                <>
                  <div
                    className={[
                      'prose prose-invert prose-sm max-w-none',
                      'prose-p:my-1',
                      'prose-code:text-slate-200 prose-code:bg-black prose-code:px-1 prose-code:rounded',
                      isStreaming && !msg.content ? 'cursor-blink' : '',
                    ].join(' ')}
                  >
                    <ReactMarkdown
                      components={{
                        code(props) {
                          const { inline, className, children, ...rest } = props as {
                            inline?: boolean;
                            className?: string;
                            children?: React.ReactNode;
                          };

                          if (inline) {
                            return (
                              <code className={className} {...rest}>
                                {children}
                              </code>
                            );
                          }

                          return (
                            <CodeBlock className={className}>{children}</CodeBlock>
                          );
                        },
                      }}
                    >
                      {msg.content || (isStreaming ? '' : '…')}
                    </ReactMarkdown>
                    {isStreaming && msg.content && (
                      <span className="inline-block w-0.5 h-4 bg-slate-100 animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                  {/* Tokens-per-second counter */}
                  {msg.tokensPerSec !== undefined && (
                    <p className="text-[10px] text-slate-600 mt-1.5 text-right">
                      {isStreaming
                        ? `${msg.tokensPerSec} tok/s`
                        : `${msg.tokensPerSec} tok/s avg`}
                    </p>
                  )}
                </>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>

            {/* User avatar */}
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-black border border-white/30 flex items-center justify-center text-[10px] font-bold mt-0.5 tracking-[0.08em] uppercase">
                You
              </div>
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
