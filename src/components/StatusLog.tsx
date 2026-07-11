"use client";

import React from "react";

interface StatusLogProps {
  messages: string[];
  isRunning: boolean;
}

export default function StatusLog({ messages, isRunning }: StatusLogProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0 && !isRunning) return null;

  return (
    <div className="mt-6 rounded-lg border border-navy-border bg-[#0d1520] overflow-hidden">
      {/* Terminal header bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0a1118] border-b border-navy-border">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs font-mono text-slate-400 tracking-widest uppercase">
          shapecast · log
        </span>
      </div>

      {/* Log lines */}
      <div className="log-scroll max-h-52 overflow-y-auto px-4 py-3 space-y-1">
        {messages.map((msg, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="font-mono text-cyan-accent text-xs shrink-0 mt-0.5">
              {">"}
            </span>
            <span className="font-mono text-xs text-slate-300 leading-5">{msg}</span>
          </div>
        ))}

        {isRunning && (
          <div className="flex items-start gap-2">
            <span className="font-mono text-cyan-accent text-xs shrink-0 mt-0.5">
              {">"}
            </span>
            <span className="font-mono text-xs text-slate-400 leading-5">
              <span className="cursor-blink">█</span>
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
