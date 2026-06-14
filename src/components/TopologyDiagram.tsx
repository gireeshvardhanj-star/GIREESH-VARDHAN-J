import React from 'react';
import { ServiceId, MicroserviceNode, NetworkConnection } from '../types';
import { Database, ShieldCheck, Server, Search, Activity, Cpu, Laptop, RefreshCw } from 'lucide-react';

interface TopologyDiagramProps {
  nodes: MicroserviceNode[];
  connections: NetworkConnection[];
  activeStep: number; // 0: Idle, 1: rate limit, 2: discovery, 3: route core/task, 4: trace record
  simulationPath: ServiceId[];
  rateLimitTokens: number;
}

export default function TopologyDiagram({
  nodes,
  connections,
  activeStep,
  simulationPath,
  rateLimitTokens
}: TopologyDiagramProps) {
  
  // Icon mapper by service ID
  const renderNodeIcon = (id: ServiceId, status: string) => {
    let colorClass = 'text-slate-400';
    if (status === 'rate-limited') colorClass = 'text-rose-400 animate-pulse';
    else if (status === 'healthy') {
      if (id === 'gateway') colorClass = 'text-cyan-400';
      else if (id === 'core') colorClass = 'text-indigo-400';
      else if (id === 'task') colorClass = 'text-emerald-400';
      else if (id === 'discovery') colorClass = 'text-sky-400';
      else if (id === 'database') colorClass = 'text-purple-400';
      else if (id === 'collector') colorClass = 'text-violet-400';
      else colorClass = 'text-slate-300';
    }

    switch (id) {
      case 'client':
        return <Laptop className={`w-6 h-6 ${colorClass}`} />;
      case 'gateway':
        return <ShieldCheck className={`w-6 h-6 ${colorClass}`} />;
      case 'discovery':
        return <Search className={`w-6 h-6 ${colorClass}`} />;
      case 'core':
        return <Server className={`w-6 h-6 ${colorClass}`} />;
      case 'task':
        return <Cpu className={`w-6 h-6 ${colorClass}`} />;
      case 'database':
        return <Database className={`w-6 h-6 ${colorClass}`} />;
      case 'collector':
        return <Activity className={`w-6 h-6 ${colorClass}`} />;
      default:
        return <Server className={`w-6 h-6 ${colorClass}`} />;
    }
  };

  // Check if a connection is currently active in the simulation flow
  const isConnectionActive = (from: ServiceId, to: ServiceId) => {
    if (activeStep === 0) return false;
    
    // Check if both nodes are consecutively adjacent in simulationPath based on activeStep
    for (let i = 0; i < simulationPath.length - 1; i++) {
      if (simulationPath[i] === from && simulationPath[i + 1] === to) {
        // Map activeStep to path index
        if (activeStep >= i + 1) return true;
      }
    }
    return false;
  };

  return (
    <div id="topology-container" className="bg-slate-900/50 border border-slate-700/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col gap-4">
      {/* Topology Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-950/70 p-4 rounded-xl border border-slate-800/90 gap-4">
        <div>
          <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Dynamic Enterprise Topology & Tracing Orchestrator
          </h3>
          <p className="text-slate-400 text-[11px] font-mono mt-0.5">
            Visualization of active REST communication, service discovery mapping, & log extraction channels.
          </p>
        </div>
        
        {/* Token capacity meter */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400 text-[11px] font-semibold tracking-wider uppercase">Gateway Tokens:</span>
          <div className="flex gap-0.5 bg-slate-900 p-1.5 rounded-lg border border-slate-800 w-24">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`h-3 flex-1 rounded transition-all duration-300 ${
                  i < rateLimitTokens 
                    ? rateLimitTokens <= 3 
                      ? 'bg-rose-500 animate-pulse' 
                      : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' 
                    : 'bg-slate-850'
                }`}
              />
            ))}
          </div>
          <span className={`font-semibold ${rateLimitTokens <= 3 ? 'text-rose-400 animate-pulse' : 'text-indigo-400 font-bold'}`}>
            {rateLimitTokens}/10
          </span>
        </div>
      </div>

      {/* SVG Canvas diagram wrapper */}
      <div className="relative border border-slate-950/60 rounded-xl bg-slate-950/80 p-1 min-h-[360px] overflow-x-auto select-none">
        <svg id="network-topology-canvas" className="w-[820px] h-[350px] mx-auto block">
          
          {/* DEFINITIONS FOR FILTERS AND LINE MARKERS */}
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
            </marker>
            <linearGradient id="active-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#06b6d4" floodOpacity="0.5"/>
            </filter>
            <filter id="glow-rose" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.6"/>
            </filter>
          </defs>

          {/* NETWORKING LINES & PIPES */}
          {connections.map((conn, idx) => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;

            const active = isConnectionActive(conn.from, conn.to);
            
            // Adjust coordinates based on arrow direction
            let x1 = fromNode.x;
            let y1 = fromNode.y;
            let x2 = toNode.x;
            let y2 = toNode.y;

            const isTelemetry = conn.type === 'telemetry';

            return (
              <g key={idx}>
                {/* Standard background backing line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={active ? '#06b6d4' : isTelemetry ? '#334155' : '#1e293b'}
                  strokeWidth={active ? 2.5 : isTelemetry ? 1.5 : 2}
                  strokeDasharray={isTelemetry ? '4 4' : undefined}
                  markerEnd={isTelemetry ? undefined : active ? 'url(#arrow-active)' : 'url(#arrow)'}
                  className="transition-all duration-300"
                />

                {/* Animated signal dots traveling along active rest paths */}
                {active && (
                  <circle r="4" fill="#22d3ee" filter="url(#glow)">
                    <animateMotion
                      dur="1.2s"
                      repeatCount="indefinite"
                      path={`M ${x1} ${y1} L ${x2} ${y2}`}
                    />
                  </circle>
                )}

                {/* Simple textual communication labels */}
                {conn.label && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    textAnchor="middle"
                    fill={active ? '#22d3ee' : '#475569'}
                    className="text-[9px] font-mono font-medium transition-all duration-200"
                  >
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* HARDWARE / CONTAINER NODES */}
          {nodes.map((node) => {
            // Check if node is part of the active path simulation
            const indexInPath = simulationPath.indexOf(node.id);
            const isActive = indexInPath !== -1 && activeStep >= indexInPath;
            
            // Highlight styling border color
            let ringColor = 'stroke-slate-800';
            let filterGlow = undefined;
            
            if (node.status === 'rate-limited') {
              ringColor = 'stroke-rose-500';
              filterGlow = 'url(#glow-rose)';
            } else if (isActive) {
              if (node.id === 'gateway') {
                ringColor = 'stroke-cyan-400';
                filterGlow = 'url(#glow)';
              } else if (node.id === 'core') {
                ringColor = 'stroke-indigo-400';
              } else if (node.id === 'task') {
                ringColor = 'stroke-emerald-400';
              } else if (node.id === 'discovery') {
                ringColor = 'stroke-sky-400';
              } else if (node.id === 'database') {
                ringColor = 'stroke-purple-100';
              } else {
                ringColor = 'stroke-cyan-400';
              }
            }

            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer">
                {/* Node outer pulse animation if active */}
                {isActive && node.status !== 'rate-limited' && (
                  <circle
                    r="34"
                    fill="none"
                    stroke={node.id === 'gateway' ? '#22d3ee' : node.id === 'core' ? '#818cf8' : '#34d399'}
                    strokeWidth="1.5"
                    className="animate-ping opacity-25"
                  />
                )}
                
                {/* Base circle background representing microservice Docker container */}
                <circle
                  r="24"
                  fill="#030712"
                  className={`${ringColor} transition-all duration-300`}
                  strokeWidth={isActive ? '2.5' : '1.5'}
                  filter={filterGlow}
                />

                {/* Center visual icon mapping */}
                <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                  <div className="flex items-center justify-center">
                    {renderNodeIcon(node.id, node.status)}
                  </div>
                </foreignObject>

                {/* Bottom text metadata and label indicators */}
                <text
                  y="38"
                  textAnchor="middle"
                  fill="#f1f5f9"
                  className="text-[11px] font-semibold tracking-wide font-sans"
                >
                  {node.name}
                </text>

                <text
                  y="48"
                  textAnchor="middle"
                  fill="#64748b"
                  className="text-[8.5px] font-mono tracking-wider uppercase"
                >
                  {node.technology}
                </text>

                {/* Mini tag for IP/Port info */}
                <text
                  y="-32"
                  textAnchor="middle"
                  fill="#475569"
                  className="text-[8px] font-mono bg-black"
                >
                  {node.ip}:{node.port}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating details overlay for the simulation steps */}
        <div className="absolute top-2 left-2 bg-slate-950/90 border border-slate-800/80 p-3 rounded-lg text-slate-300 w-52 text-xs font-sans pointer-events-none z-10">
          <div className="font-semibold text-slate-100 flex items-center gap-1.5 mb-1.5 pb-1 border-b border-slate-900">
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            Active Transaction Path
          </div>
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className={`flex items-center gap-1.5 ${activeStep >= 1 ? 'text-cyan-400 font-semibold' : 'text-slate-500'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>1. Python Gateway auth</span>
            </div>
            <div className={`flex items-center gap-1.5 ${activeStep >= 2 ? 'text-sky-400 font-semibold' : 'text-slate-500'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>2. Consul Service Discovery</span>
            </div>
            <div className={`flex items-center gap-1.5 ${activeStep >= 3 ? 'text-indigo-400 font-semibold' : 'text-slate-500'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>3. Target Microservice</span>
            </div>
            <div className={`flex items-center gap-1.5 ${activeStep >= 4 ? 'text-purple-400 font-semibold' : 'text-slate-500'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>4. DB & Telemetry push</span>
            </div>
          </div>
        </div>

        {/* Telemetry log tags on bottom right to show we have Prometheus metric pipelines */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-slate-950/90 border border-slate-800/80 rounded-lg p-2 text-[10px] font-mono z-10">
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Jaeger: UP
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Loki: UP
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">Trace Sample: 100%</span>
        </div>
      </div>
    </div>
  );
}
