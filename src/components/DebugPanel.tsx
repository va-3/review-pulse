"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Bug, ChevronDown, ChevronUp, Clock, FileText, Database } from "lucide-react";

interface DebugStats {
  retrieval_ms: number;
  llm_ms: number;
  chunks_count: number;
  top_score: number;
}

interface DebugPanelProps {
  requestId?: string;
  stats?: DebugStats;
  latency?: number;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function DebugPanel({ requestId, stats, latency, isOpen, onToggle }: DebugPanelProps) {
  if (!requestId) return null; // Hide if no request active/finished

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-black/90 border border-white/10 rounded-lg shadow-2xl backdrop-blur-md overflow-hidden transition-all w-[300px]">
        {/* Header */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Bug className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-mono font-medium text-white/80">Debug Mode</span>
          </div>
          {isOpen ? <ChevronDown className="w-3 h-3 text-white/50" /> : <ChevronUp className="w-3 h-3 text-white/50" />}
        </button>

        {/* Content */}
        {isOpen && (
          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <div className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Request ID</div>
              <div className="text-[10px] font-mono text-white/60 truncate" title={requestId}>
                {requestId}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-white/5 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-white/50 font-mono uppercase">Total</span>
                </div>
                <div className="text-sm font-mono text-white/90">{latency}ms</div>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Database className="w-3 h-3 text-blue-400" />
                  <span className="text-[9px] text-white/50 font-mono uppercase">Retrieval</span>
                </div>
                <div className="text-sm font-mono text-white/90">{stats?.retrieval_ms ?? 0}ms</div>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="w-3 h-3 text-amber-400" />
                  <span className="text-[9px] text-white/50 font-mono uppercase">Context</span>
                </div>
                <div className="text-sm font-mono text-white/90">{stats?.chunks_count ?? 0} chunks</div>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">🎯</span>
                  <span className="text-[9px] text-white/50 font-mono uppercase">Top Score</span>
                </div>
                <div className="text-sm font-mono text-white/90">{stats?.top_score?.toFixed(3) ?? "0.000"}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
