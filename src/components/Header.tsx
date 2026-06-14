import React from 'react';
import { Activity, ShieldCheck, Heart, AlertTriangle, CloudRain } from 'lucide-react';

interface HeaderProps {
  systemHealth: 'perfect' | 'degraded' | 'error';
}

export default function Header({ systemHealth }: HeaderProps) {
  return (
    <header className="bg-slate-950 border-b border-slate-800 h-20 px-6 mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
          <div className="w-4.5 h-4.5 border-2 border-white rounded-sm rotate-45"></div>
        </div>
        
        <div>
          <h1 className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-2">
            Microservice Enterprise Nexus Studio <span className="text-indigo-400 text-[10px] bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/20 rounded font-mono">v4.2.0</span>
          </h1>
          <p className="text-slate-400 text-[11px] font-mono hidden md:block">
            Interactive Multi-Service Simulator • Token-Bucket Rate Limiter • Distributed Telemetry Engine
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-2.5">
          <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800/85 text-[11px] font-mono flex items-center gap-2">
            <span className="text-slate-500">Gateway:</span>
            <span className="text-cyan-400 font-semibold uppercase">FastAPI Python</span>
          </div>
          <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800/85 text-[11px] font-mono flex items-center gap-2">
            <span className="text-slate-500">Core:</span>
            <span className="text-indigo-400 font-semibold uppercase">Spring Boot</span>
          </div>
        </div>

        <div className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all ${
          systemHealth === 'perfect' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
        }`}>
          <div className={`w-2 h-2 rounded-full ${systemHealth === 'perfect' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="tracking-wide uppercase">{systemHealth === 'perfect' ? 'SYSTEM HEALTHY' : 'SYSTEM DEGRADED'}</span>
        </div>
      </div>
    </header>
  );
}
