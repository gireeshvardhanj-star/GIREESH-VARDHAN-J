import React, { useState } from 'react';
import { LogEntry, TraceData, TraceSpan, ServiceId } from '../types';
import { Activity, ShieldCheck, Terminal, Search, Info, AlertOctagon, HelpCircle, FileJson, Clock } from 'lucide-react';

interface TelemetryDashboardProps {
  logs: LogEntry[];
  traces: TraceData[];
  selectedTraceId: string | null;
  setSelectedTraceId: (id: string | null) => void;
}

export default function TelemetryDashboard({
  logs,
  traces,
  selectedTraceId,
  setSelectedTraceId
}: TelemetryDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<'traces' | 'logs'>('traces');
  const [logServiceFilter, setLogServiceFilter] = useState<'all' | ServiceId>('all');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);

  // Active Trace
  const activeTrace = traces.find(t => t.traceId === selectedTraceId) || traces[0] || null;

  // Filtered Logs
  const filteredLogs = logs.filter(log => {
    const serviceMatch = logServiceFilter === 'all' || log.service === logServiceFilter;
    const levelMatch = logLevelFilter === 'all' || log.level === logLevelFilter;
    const searchMatch = logSearchQuery === '' || log.message.toLowerCase().includes(logSearchQuery.toLowerCase()) || JSON.stringify(log.metadata || {}).toLowerCase().includes(logSearchQuery.toLowerCase());
    return serviceMatch && levelMatch && searchMatch;
  });

  return (
    <div id="telemetry-dashboard" className="bg-slate-900/50 border border-slate-700/30 rounded-2xl overflow-hidden shadow-2xl">
      {/* Tab select header */}
      <div className="bg-slate-950/80 px-5 py-4 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="text-indigo-400 w-4.5 h-4.5 animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Enterprise Observability & Trace Dashboard
          </h2>
        </div>

        <div className="flex gap-1 bg-slate-905 p-1 rounded-xl border border-slate-800">
          <button
            id="subtab-btn-traces"
            onClick={() => setActiveSubTab('traces')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeSubTab === 'traces'
                ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Jaeger Traces
          </button>
          <button
            id="subtab-btn-logs"
            onClick={() => setActiveSubTab('logs')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeSubTab === 'logs'
                ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Loki Live Logs
          </button>
        </div>
      </div>

      {/* RENDER TRACES SUB-TAB */}
      {activeSubTab === 'traces' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[380px]">
          {/* Left panel: Trace List history */}
          <div className="lg:col-span-1 bg-slate-950/40 border-r border-slate-800/80 p-4 flex flex-col gap-3">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Simulation Traces
            </span>
            <div className="space-y-2 flex-1 overflow-y-auto max-h-[320px]">
              {traces.length > 0 ? (
                traces.slice().reverse().map((trace) => (
                  <button
                    key={trace.traceId}
                    id={`trace-item-btn-${trace.traceId}`}
                    onClick={() => {
                      setSelectedTraceId(trace.traceId);
                      setSelectedSpan(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex flex-col gap-1.5 ${
                      selectedTraceId === trace.traceId
                        ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200'
                        : 'bg-slate-950/60 border-slate-850 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[9px] font-semibold text-slate-500">ID: {trace.traceId.slice(0, 8)}...</span>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full font-mono ${
                        trace.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400' :
                        trace.status === 'rate_limited' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {trace.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-bold text-slate-200 truncate pr-1">{trace.rootSpanName}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                      <span>{trace.timestamp}</span>
                      <span className="font-bold text-indigo-400">{trace.duration} ms</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center text-slate-500 font-mono text-xs py-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
                  No traces captured. Fire a request!
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Traces details visualization */}
          <div className="lg:col-span-3 p-4 bg-slate-900 overflow-x-auto">
            {activeTrace ? (
              <div className="space-y-4 min-w-[500px]">
                {/* Visual statistics */}
                <div className="flex justify-between items-center bg-slate-950/70 p-4 rounded-xl border border-slate-800/90 font-mono text-xs text-slate-400">
                  <div>
                    <span>TRACE ID:</span>
                    <span className="text-slate-200 font-bold ml-1.5 select-all">{activeTrace.traceId}</span>
                  </div>
                  <div>
                    <span>TOTAL DELAY:</span>
                    <span className="text-indigo-400 font-bold ml-1.5">{activeTrace.duration}ms</span>
                  </div>
                  <div>
                    <span>TOTAL SPANS:</span>
                    <span className="text-slate-300 font-semibold ml-1.5">{activeTrace.spans.length}</span>
                  </div>
                </div>

                {/* GANTT CHART OF SPANS */}
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider mb-2">SPAN GANTT GRAPH</span>
                  <div className="bg-slate-950/60 rounded-2xl p-4.5 border border-slate-800/80 space-y-3.5">
                    {activeTrace.spans.map((span) => {
                      // Calculate percentage weights for visual Gantt layout
                      const leftPercent = (span.startTime / activeTrace.duration) * 100;
                      const widthPercent = Math.max((span.duration / activeTrace.duration) * 100, 2);

                      // Determine Service color for the trace bars
                      let barColor = 'bg-slate-400';
                      if (span.service === 'gateway') barColor = 'bg-cyan-500';
                      else if (span.service === 'core') barColor = 'bg-indigo-500';
                      else if (span.service === 'task') barColor = 'bg-emerald-500';
                      else if (span.service === 'discovery') barColor = 'bg-sky-500';
                      else if (span.service === 'database') barColor = 'bg-purple-500';

                      const isSelected = selectedSpan?.id === span.id;

                      return (
                        <div
                          key={span.id}
                          id={`span-gantt-row-${span.id}`}
                          onClick={() => setSelectedSpan(span)}
                          className={`group cursor-pointer rounded-lg p-1.5 transition-all ${
                            isSelected ? 'bg-slate-900 border border-slate-800/80 shadow' : 'hover:bg-slate-900/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            {/* Indents indicating nesting depth */}
                            {span.parentId && <div className="w-4 border-l border-b border-slate-800 h-3 ml-2 self-start" />}
                            
                            <span className="text-xs font-mono text-slate-300 font-bold group-hover:text-indigo-400 transition truncate max-w-xs">
                              {span.name}
                            </span>
                            
                            <span className="text-[9px] font-mono font-bold px-2 py-0.2 rounded-md bg-slate-900 border border-slate-800 uppercase tracking-wider text-slate-500">
                              {span.service}
                            </span>

                            <span className="text-[10px] text-slate-400 font-bold font-mono ml-auto">
                              {span.duration}ms
                            </span>
                          </div>

                          {/* Gantt Bar layout percentage background container */}
                          <div className="relative h-2 bg-slate-950 border border-slate-900 rounded-full overflow-hidden">
                            <div
                              className={`absolute h-full rounded-full ${barColor} opacity-90`}
                              style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* INDIVIDUAL SPAN METADATA DETAILS (OPENTELEMETRY TAGS) */}
                <div className="bg-slate-950/70 p-5 border border-slate-800/80 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      Detailed Tags: {selectedSpan ? selectedSpan.name : activeTrace.spans[0]?.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      Span ID: {selectedSpan ? selectedSpan.id : activeTrace.spans[0]?.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-mono text-slate-400">
                    {/* Render active span tags */}
                    {Object.entries(selectedSpan ? selectedSpan.tags : activeTrace.spans[0]?.tags || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between pb-1 border-b border-slate-900 overflow-x-auto whitespace-nowrap scrollbar-none">
                        <span className="text-slate-500 text-[11px] font-semibold">{key}:</span>
                        <span className="text-indigo-400 font-semibold ml-2 select-all">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs py-14 border border-dashed border-slate-800 rounded-2xl bg-slate-950/30">
                <HelpCircle className="w-8 h-8 text-slate-600 mb-2 animate-bounce" />
                <span>Select a trace on the left to inspect detailed OpenTelemetry span durations</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* RENDER CENTRALIZED LOGS SUB-TAB */
        <div className="p-4 flex flex-col gap-4 min-h-[400px]">
          {/* Controls: Search and Filters */}
          <div className="flex flex-col md:flex-row gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                id="search-logs"
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Search structured JSON stream..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              />
            </div>

            {/* Service select filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono uppercase font-semibold">Service:</span>
              <select
                id="filter-log-service"
                value={logServiceFilter}
                onChange={(e) => setLogServiceFilter(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:border-violet-500 focus:outline-none"
              >
                <option value="all">ALL SERVICES</option>
                <option value="gateway">Python Gateway</option>
                <option value="discovery">Consul Discovery</option>
                <option value="core">Java Spring Core</option>
                <option value="task">Node Express Task</option>
              </select>
            </div>

            {/* Level select filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono uppercase font-semibold">Level:</span>
              <select
                id="filter-log-level"
                value={logLevelFilter}
                onChange={(e) => setLogLevelFilter(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:border-violet-500 focus:outline-none"
              >
                <option value="all">ALL LEVELS</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
              </select>
            </div>
          </div>

          {/* Structured Logs Stream area */}
          <div className="bg-slate-950 rounded-xl border border-slate-850 p-3 h-80 overflow-y-auto font-mono text-[10.5px]">
            {filteredLogs.length > 0 ? (
              <div className="space-y-2">
                {filteredLogs.slice().reverse().map((log) => {
                  let badgeColor = 'bg-slate-900 text-slate-400 border-slate-800';
                  if (log.level === 'warn') badgeColor = 'bg-amber-950/80 text-amber-300 border-amber-900';
                  else if (log.level === 'error') badgeColor = 'bg-rose-950/80 text-rose-300 border-rose-900';
                  else if (log.level === 'info') badgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-900';

                  let serviceBadgeColor = 'text-slate-400';
                  if (log.service === 'gateway') serviceBadgeColor = 'text-cyan-400 font-semibold';
                  else if (log.service === 'core') serviceBadgeColor = 'text-indigo-400 font-semibold';
                  else if (log.service === 'task') serviceBadgeColor = 'text-emerald-400 font-semibold';
                  else if (log.service === 'discovery') serviceBadgeColor = 'text-sky-400 font-semibold';

                  return (
                    <div
                      key={log.id}
                      className="border-b border-slate-900/60 pb-2 last:border-none flex flex-col md:flex-row md:items-start gap-2.5 pb-2 hover:bg-slate-900/10 p-1.5 rounded transition"
                    >
                      {/* Timestamp & Level */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9.5px] text-slate-500">{log.timestamp}</span>
                        <span className={`text-[8.5px] px-1.5 py-0.2 rounded border uppercase tracking-wider font-semibold ${badgeColor}`}>
                          {log.level}
                        </span>
                      </div>

                      {/* Service name */}
                      <span className={`text-[10px] w-20 flex-shrink-0 truncate ${serviceBadgeColor}`}>
                        [{log.service}]
                      </span>

                      {/* Trace Context keys */}
                      <span className="text-slate-600 font-semibold flex-shrink-0 text-[9px]" title={`Trace UID context`}>
                        T_ID: {log.traceId.slice(0, 8)}...
                      </span>

                      {/* Main Message */}
                      <span className="text-slate-200 flex-1 break-all">
                        {log.message}
                      </span>

                      {/* Mini Metadata JSON string inspector if it exists */}
                      {log.metadata && (
                        <div className="text-[9.5px] bg-slate-900 p-1 rounded text-slate-400 border border-slate-800/60 max-w-[200px] truncate select-all" title={JSON.stringify(log.metadata)}>
                          {JSON.stringify(log.metadata)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs gap-1 py-14">
                <Terminal className="w-5 h-5 text-slate-700 animate-pulse" />
                <span>No Loki streams match the current dashboard filters</span>
                <span className="text-[9.5px] text-slate-700">Change criteria queries or execute a new HTTP simulation transaction</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
