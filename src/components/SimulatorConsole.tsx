import React, { useState } from 'react';
import { SimulationRequest, ArchitectureSettings } from '../types';
import { Play, Flame, Key, Settings, RefreshCw, AlertTriangle, CheckCircle2, Sliders } from 'lucide-react';

interface SimulatorConsoleProps {
  settings: ArchitectureSettings;
  setSettings: React.Dispatch<React.SetStateAction<ArchitectureSettings>>;
  onTriggerSimulation: (request: SimulationRequest) => void;
  simulationRunning: boolean;
  lastResponse: {
    status: number;
    statusText: string;
    payload: any;
    headers: Record<string, string>;
  } | null;
}

export default function SimulatorConsole({
  settings,
  setSettings,
  onTriggerSimulation,
  simulationRunning,
  lastResponse
}: SimulatorConsoleProps) {
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [path, setPath] = useState<string>('/tasks');
  const [jwtState, setJwtState] = useState<'valid' | 'missing' | 'expired' | 'invalid'>('valid');
  const [burstCount, setBurstCount] = useState<number>(1);

  const handleFire = (overrideBurst?: number) => {
    // Determine target service based on path
    const service = path.includes('/tasks') ? 'task' : 'core';
    onTriggerSimulation({
      id: Math.random().toString(36).substr(2, 9),
      method,
      path,
      service,
      jwtState,
      burstCount: overrideBurst || burstCount
    });
  };

  return (
    <div id="simulator-console" className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* 1. CONFIGURATION COCKPIT */}
      <div className="bg-slate-900/50 border border-slate-700/30 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wider">
              Simulation Request Parameters
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">HTTP METHOD</label>
              <select
                id="select-method"
                value={method}
                onChange={(e) => {
                  const m = e.target.value as 'GET' | 'POST';
                  setMethod(m);
                  if (m === 'POST') setPath('/tasks');
                }}
                disabled={simulationRunning}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-[10px] text-slate-400 font-bold block mb-1">TARGET PATH</label>
              <select
                id="select-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                disabled={simulationRunning}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              >
                {method === 'GET' ? (
                  <>
                    <option value="/tasks">/gateway/task/tasks (Tasks list REST)</option>
                    <option value="/users/profile">/gateway/core/api/users/profile (Spring User REST)</option>
                  </>
                ) : (
                  <option value="/tasks">/gateway/task/tasks (Create new task REST)</option>
                )}
              </select>
            </div>
          </div>

          {/* JWT Authorization injection */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1.5 flex items-center gap-1">
              <Key className="w-3 h-3 text-indigo-400" />
              INBOUND AUTHENTICATION HEADER (JWT)
            </label>
            <div className="grid grid-cols-2 gap-1.5 font-sans">
              {(['valid', 'missing', 'expired', 'invalid'] as const).map((state) => (
                <button
                  key={state}
                  id={`jwt-state-btn-${state}`}
                  onClick={() => setJwtState(state)}
                  disabled={simulationRunning}
                  className={`text-[10px] p-2.5 border rounded-lg capitalize transition flex items-center justify-between ${
                    jwtState === state
                      ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="truncate">{state === 'valid' ? 'Bearer Valid Token' : state === 'missing' ? 'No Auth Header' : state === 'expired' ? 'Expired Signature' : 'Invalid format'}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    state === 'valid' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`} />
                </button>
              ))}
            </div>
          </div>

          {/* Rate limiting controls */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-slate-400 font-semibold block">GATEWAY RATE DYN-LIMITER (REDIS)</label>
              <span className="text-[10px] text-indigo-400 font-mono font-semibold">{settings.rateLimitLimit} requests / {settings.rateLimitWindow}s</span>
            </div>
            <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 min-w-16 font-semibold uppercase tracking-wider">Max limit:</span>
                <input
                  id="slider-rate-limit"
                  type="range"
                  min="2"
                  max="15"
                  value={settings.rateLimitLimit}
                  onChange={(e) => setSettings(prev => ({ ...prev, rateLimitLimit: Number(e.target.value) }))}
                  className="flex-1 accent-indigo-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 min-w-16 font-semibold uppercase tracking-wider">Window:</span>
                <input
                  id="slider-rate-window"
                  type="range"
                  min="2"
                  max="20"
                  value={settings.rateLimitWindow}
                  onChange={(e) => setSettings(prev => ({ ...prev, rateLimitWindow: Number(e.target.value) }))}
                  className="flex-1 accent-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Trigger Buttons */}
        <div className="flex gap-2.5 mt-5">
          <button
            id="btn-fire-single"
            onClick={() => handleFire(1)}
            disabled={simulationRunning}
            className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition active:scale-[0.98]"
          >
            {simulationRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Play className="w-4 h-4 fill-current text-white" />
            )}
            <span>{simulationRunning ? 'Routing Transit...' : 'Fire HTTP Request'}</span>
          </button>

          <button
            id="btn-fire-burst"
            onClick={() => handleFire(5)}
            disabled={simulationRunning}
            className="py-2.5 px-3.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:bg-slate-700 text-slate-200 disabled:opacity-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            title="Fire a heavy burst of 5 concurrent requests instantly to test Rate Limiting (429)"
          >
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Test Burst (x5)</span>
          </button>
        </div>
      </div>

      {/* 2. REAL-TIME RESPONSE PANEL */}
      <div className="bg-slate-900/50 border border-slate-700/30 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
        <div className="space-y-3.5 flex-1 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wider">
              Client Response (HTTP API Output)
            </h3>
            {lastResponse && (
              <span className={`text-[11px] px-3 py-0.5 rounded-full font-mono font-semibold flex items-center gap-1.5 ${
                lastResponse.status >= 200 && lastResponse.status < 300 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                  : lastResponse.status === 429 
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 animate-pulse' 
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
              }`}>
                {lastResponse.status >= 200 && lastResponse.status < 300 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                )}
                {lastResponse.status} {lastResponse.statusText}
              </span>
            )}
          </div>

          {lastResponse ? (
            <div className="flex-1 flex flex-col justify-between gap-3 font-mono text-[11px]">
              {/* Response headers */}
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/50 space-y-1.5">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider mb-1">Response Headers</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400">
                  <div className="flex justify-between border-b border-slate-900 pb-0.5">
                    <span>Content-Type:</span>
                    <span className="text-slate-300">application/json</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-0.5">
                    <span>Server:</span>
                    <span className="text-cyan-400">FastAPI/Fast-Proxy</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-0.5">
                    <span>X-RateLimit-Limit:</span>
                    <span className="text-slate-300 font-semibold">{lastResponse.headers['X-RateLimit-Limit']}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-0.5">
                    <span>X-RateLimit-Remaining:</span>
                    <span className={`font-semibold ${Number(lastResponse.headers['X-RateLimit-Remaining']) === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {lastResponse.headers['X-RateLimit-Remaining']}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-between pt-0.5">
                    <span className="truncate">X-Trace-Context:</span>
                    <span className="text-violet-400 select-all truncate max-w-[200px]" title={lastResponse.headers['X-Trace-Context']}>
                      {lastResponse.headers['X-Trace-Context']}
                    </span>
                  </div>
                </div>
              </div>

              {/* JSON Payload body */}
              <div className="flex-1 flex flex-col bg-slate-950/90 p-3 rounded-lg border border-slate-800/50 min-h-[140px] max-h-[180px] overflow-auto">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider mb-1.5">Response JSON Payload</span>
                <pre className="text-slate-300 text-[10.5px] leading-relaxed select-all font-mono whitespace-pre overflow-auto flex-1">
                  {JSON.stringify(lastResponse.payload, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 font-mono py-10 border border-dashed border-slate-800 rounded-lg">
              <RefreshCw className="w-6 h-6 text-slate-600 mb-2 animate-pulse" />
              <span className="text-xs">Pending simulator execution</span>
              <span className="text-[10px] text-slate-600 mt-1">Select parameters on the left to fire a route transaction</span>
            </div>
          )}
        </div>

        {/* Global info footer */}
        <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-850/60 mt-4 text-[10px] text-slate-400 font-mono flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Core Service Discovery resolved
          </span>
          <span className="text-slate-500">Node REST communication active</span>
        </div>
      </div>
    </div>
  );
}
