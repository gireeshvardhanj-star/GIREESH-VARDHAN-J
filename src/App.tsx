import React, { useState, useEffect, useRef } from 'react';
import {
  MicroserviceNode,
  NetworkConnection,
  SimulationRequest,
  LogEntry,
  TraceData,
  TraceSpan,
  ArchitectureSettings,
  ServiceId
} from './types';
import Header from './components/Header';
import TopologyDiagram from './components/TopologyDiagram';
import SimulatorConsole from './components/SimulatorConsole';
import TelemetryDashboard from './components/TelemetryDashboard';
import ConfigurationGenerator from './components/ConfigurationGenerator';
import { Activity, Code, Server, CheckCircle, Smartphone, Compass } from 'lucide-react';

// Static nodes configuration
const INITIAL_NODES: MicroserviceNode[] = [
  { id: 'client', name: 'Web Client App', technology: 'React SPA', description: 'Application UI requesting resources.', status: 'healthy', ip: '192.168.1.45', port: 80, x: 80, y: 175 },
  { id: 'gateway', name: 'API Gateway', technology: 'FastAPI Python', description: 'Checks API keys, JWT tokens, and rate limits.', status: 'healthy', ip: '10.0.0.2', port: 3000, x: 260, y: 175 },
  { id: 'discovery', name: 'Service Registry', technology: 'HashiCorp Consul', description: 'Service coordinates and heartbeat monitoring.', status: 'healthy', ip: '10.0.0.3', port: 8500, x: 260, y: 55 },
  { id: 'core', name: 'Core Service', technology: 'Spring Boot Java', description: 'Validates accounts, profiles, and permissions.', status: 'healthy', ip: '10.0.0.12', port: 8080, x: 480, y: 100 },
  { id: 'task', name: 'Task Service', technology: 'Node.js Express', description: 'Manages user tasks, backlogs, and items.', status: 'healthy', ip: '10.0.0.14', port: 5000, x: 480, y: 250 },
  { id: 'database', name: 'Production Database', technology: 'PostgreSQL RDS', description: 'Durable relational service state storage.', status: 'healthy', ip: '10.0.0.100', port: 5432, x: 720, y: 175 },
  { id: 'collector', name: 'Telemetry (Jaeger)', technology: 'OpenTelemetry', description: 'Centralized trace and span processor collector.', status: 'healthy', ip: '10.0.0.200', port: 4317, x: 380, y: 295 }
];

// Initial connection routing paths
const INITIAL_CONNECTIONS: NetworkConnection[] = [
  { from: 'client', to: 'gateway', label: 'REST API', type: 'rest' },
  { from: 'gateway', to: 'discovery', label: 'gRPC Query', type: 'grpc' },
  { from: 'gateway', to: 'core', label: 'HTTP Forward', type: 'rest' },
  { from: 'gateway', to: 'task', label: 'HTTP Forward', type: 'rest' },
  { from: 'core', to: 'database', label: 'SQL Connection', type: 'internal' },
  { from: 'task', to: 'database', label: 'JSON Store', type: 'internal' },
  { from: 'gateway', to: 'collector', label: 'Export OTLP', type: 'telemetry' },
  { from: 'core', to: 'collector', label: 'Export OTLP', type: 'telemetry' },
  { from: 'task', to: 'collector', label: 'Export OTLP', type: 'telemetry' }
];

export default function App() {
  const [nodes, setNodes] = useState<MicroserviceNode[]>(INITIAL_NODES);
  const [connections] = useState<NetworkConnection[]>(INITIAL_CONNECTIONS);
  const [settings, setSettings] = useState<ArchitectureSettings>({
    rateLimitLimit: 10,
    rateLimitWindow: 10,
    jwtAlgorithm: 'HS256',
    jwtExpiration: 60,
    discoveryService: 'Consul',
    databaseType: 'PostgreSQL',
    tracingSampleRate: 1.0
  });

  const [rateLimitTokens, setRateLimitTokens] = useState<number>(10);
  const [lastRefillTime, setLastRefillTime] = useState<number>(Date.now());

  // Simulation Status
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [simulationPath, setSimulationPath] = useState<ServiceId[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Response Panel State
  const [lastResponse, setLastResponse] = useState<{
    status: number;
    statusText: string;
    payload: any;
    headers: Record<string, string>;
  } | null>(null);

  // Logs & Traces list arrays
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [traces, setTraces] = useState<TraceData[]>([]);

  // Token Buckets ref filler logic
  useEffect(() => {
    const refillInterval = setInterval(() => {
      setRateLimitTokens((prev) => {
        // Simple token bucket refill
        if (prev < 10) {
          return Math.min(prev + 1, 10);
        }
        return prev;
      });
    }, (settings.rateLimitWindow * 1000) / settings.rateLimitLimit); // Calculate refill interval in millisecond ticks

    return () => clearInterval(refillInterval);
  }, [settings.rateLimitLimit, settings.rateLimitWindow]);

  // Seed default logging on startup
  useEffect(() => {
    const seedTraceId = 'tr-8a9d1c' + Math.random().toString(16).substr(2, 6);
    const startTimestamp = new Date(Date.now() - 3600000).toISOString().replace('T', ' ').substring(0, 19);

    const initialLogs: LogEntry[] = [
      { id: 'l1', timestamp: startTimestamp, service: 'gateway', level: 'info', traceId: seedTraceId, spanId: 'sp-1', message: 'FastAPI gateway started running port 3000 context filters initialized' },
      { id: 'l2', timestamp: startTimestamp, service: 'discovery', level: 'info', traceId: seedTraceId, spanId: 'sp-2', message: 'Consul core agent discovery established leader address local:8500' },
      { id: 'l3', timestamp: startTimestamp, service: 'core', level: 'info', traceId: seedTraceId, spanId: 'sp-3', message: 'Spring boot user context database connection initialized and active: PostgreSQL RDS' },
      { id: 'l4', timestamp: startTimestamp, service: 'task', level: 'info', traceId: seedTraceId, spanId: 'sp-4', message: 'TaskExpress Server online monitoring events with Winston structured JSON formatters' }
    ];

    setLogs(initialLogs);
  }, []);

  const clearSimulationVisuals = () => {
    setActiveStep(0);
    setSimulationPath([]);
    // Restore nodes health status
    setNodes(prev => prev.map(n => ({ ...n, status: 'healthy' })));
  };

  // Process a simulation request triggered by the user
  const handleTriggerSimulation = async (request: SimulationRequest) => {
    if (simulationRunning) return;
    setSimulationRunning(true);
    clearSimulationVisuals();

    const timestamp = new Date().toLocaleTimeString();
    const traceId = 'tr-' + Math.random().toString(36).substr(2, 9);
    const reqMethod = request.method;
    const reqPath = request.path;
    const isCore = request.service === 'core';
    const destinationId = isCore ? 'core' : 'task';

    // 1. TOKEN BUCKET RATE LIMITER CHECK
    if (rateLimitTokens <= 0) {
      // RATE LIMITED - Immediately exit flow
      setLastResponse({
        status: 429,
        statusText: 'Too Many Requests',
        payload: {
          error: 'Too Many Requests',
          message: `API Gateway rate limit exceeded. Selected config: ${settings.rateLimitLimit} requests per ${settings.rateLimitWindow} seconds.`,
          clientIp: '192.168.1.45',
          remedy: 'Increase Rate limiting slider ceiling or wait for automatic tick refill.'
        },
        headers: {
          'X-RateLimit-Limit': String(settings.rateLimitLimit),
          'X-RateLimit-Remaining': '0',
          'X-Trace-Context': `00-${traceId}-00000000-01`
        }
      });

      setNodes((prev) =>
        prev.map((n) => (n.id === 'gateway' ? { ...n, status: 'rate-limited' } : n))
      );
      
      // Append immediate localized log
      const logTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          timestamp: logTime,
          service: 'gateway',
          level: 'warn',
          traceId,
          spanId: 'sp-rt-limit',
          message: `Blocked request from client (IP: 192.168.1.45). HTTP 429 Rate limited. 0/${settings.rateLimitLimit} tokens available.`,
          metadata: { limit: settings.rateLimitLimit, remaining: 0 }
        }
      ]);

      // Add a failed Trace
      const rateLimitTrace: TraceData = {
        traceId,
        rootSpanName: `${reqMethod} ${reqPath}`,
        timestamp,
        duration: 3,
        status: 'rate_limited',
        spans: [
          {
            id: 'sp-rt-limit',
            name: `${reqMethod} ${reqPath}`,
            service: 'gateway',
            startTime: 0,
            duration: 3,
            status: 'error',
            tags: {
              'http.method': reqMethod,
              'http.status_code': '429',
              'error': 'true',
              'error.message': 'Rate limit exceeded',
              'client.ip': '192.168.1.45'
            }
          }
        ]
      };

      setTraces((prev) => [...prev, rateLimitTrace]);
      setSelectedTraceId(traceId);
      
      setSimulationRunning(false);
      return;
    }

    // Spend token
    setRateLimitTokens(prev => Math.max(prev - 1, 0));

    // Dynamic steps animation helper function
    setSimulationPath(['client', 'gateway', 'discovery', destinationId, 'database', 'collector']);

    // Step 1: Client sends to API Gateway
    setActiveStep(1);
    await new Promise(r => setTimeout(r, 650));

    // Evaluate JWT Authentication status
    if (request.jwtState !== 'valid') {
      const isMissing = request.jwtState === 'missing';
      const isExpired = request.jwtState === 'expired';
      
      const payloadError = isMissing 
        ? 'JWT token is missing.' 
        : isExpired 
          ? 'Signature has expired (HS256).' 
          : 'Invalid token signature structure.';
          
      setLastResponse({
        status: 401,
        statusText: 'Unauthorized',
        payload: {
          error: 'Unauthorized',
          message: payloadError,
          assertion: `Enforced using JWT decrypt filters with signature verification algorithm: ${settings.jwtAlgorithm}`
        },
        headers: {
          'X-RateLimit-Limit': String(settings.rateLimitLimit),
          'X-RateLimit-Remaining': String(rateLimitTokens - 1),
          'X-Trace-Context': `00-${traceId}-01`
        }
      });

      const logTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          timestamp: logTime,
          service: 'gateway',
          level: 'error',
          traceId,
          spanId: 'sp-gate-auth',
          message: `Inbound JWT auth failure: ${payloadError}. IP: 192.168.1.45.`
        }
      ]);

      setTraces((prev) => [
        ...prev,
        {
          traceId,
          rootSpanName: `${reqMethod} ${reqPath}`,
          timestamp,
          duration: 15,
          status: 'error',
          spans: [
            {
              id: 'sp-gate-payload',
              name: 'gateway-auth-validator',
              service: 'gateway',
              startTime: 0,
              duration: 15,
              status: 'error',
              tags: {
                'error': 'true',
                'error.kind': 'jwt_auth_failure',
                'jwt_state': request.jwtState,
                'http.status_code': '401'
              }
            }
          ]
        }
      ]);

      setSelectedTraceId(traceId);
      setSimulationRunning(false);
      setActiveStep(0);
      return;
    }

    // Step 2: Gateway resolve down-stream URL through Consul
    setActiveStep(2);
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        service: 'gateway',
        level: 'info',
        traceId,
        spanId: 'sp-disc',
        message: `Querying HashiCorp Consul Service Registry coordinates for context: ${destinationId}-service`
      },
      {
        id: Math.random().toString(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        service: 'discovery',
        level: 'info',
        traceId,
        spanId: 'sp-disc-resolv',
        message: `Resolved lookup request: IP 10.0.0.${isCore ? '12' : '14'} port ${isCore ? '8080' : '5000'} is healthy`
      }
    ]);
    await new Promise(r => setTimeout(r, 650));

    // Step 3: Gateway routes payload downstream, target processes JWT
    setActiveStep(3);
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        service: destinationId,
        level: 'info',
        traceId,
        spanId: 'sp-dest-auth',
        message: `Validated downstream request for [sub: gireesh_user, role: developer] using local filters.`
      }
    ]);
    await new Promise(r => setTimeout(r, 650));

    // Step 4: Access Database and save telemetry OTLP spans
    setActiveStep(4);
    
    // Core payload vs Task payload definitions
    const successPayload = isCore ? {
      username: 'gireesh_user',
      role: 'developer',
      email: 'gireeshvardhan.j@gmail.com',
      status: 'ACTIVE',
      organization: 'Enterprise Architecture Studio',
      dataSource: `Relational ${settings.databaseType} DB`,
      meta: {
        springboot_version: '3.1.2',
        jvm_heap: '240MB',
        tracing: 'Enabled (OpenTelemetry)'
      },
      retrievedAt: Date.now()
    } : {
      taskCount: 4,
      service: 'NodeJS Express Tasks API',
      database: `IndexedDB / Persistent JSON (${settings.databaseType})`,
      inventory: [
        { id: 1, title: 'Configure Python rate-limiter Redis middleware', checked: true, assignedService: 'Gateway' },
        { id: 2, title: 'Decrypt JWT Auth claims in Spring context', checked: true, assignedService: 'Core Service' },
        { id: 3, title: 'Map container environments to GKE/Docker Compose', checked: false, assignedService: 'DevOps Containerization' },
        { id: 4, title: 'Verify Github enterprise pipeline lint', checked: false, assignedService: 'CI/CD Workflow' }
      ]
    };

    setLastResponse({
      status: isCore ? 200 : 200,
      statusText: 'OK',
      payload: successPayload,
      headers: {
        'X-RateLimit-Limit': String(settings.rateLimitLimit),
        'X-RateLimit-Remaining': String(rateLimitTokens - 1),
        'X-Trace-Context': `00-${traceId}-0dff-01`
      }
    });

    const finishTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        timestamp: finishTime,
        service: destinationId,
        level: 'info',
        traceId,
        spanId: 'sp-db-query',
        message: `Executed payload search statement securely in ${settings.databaseType} database cluster`
      },
      {
        id: Math.random().toString(),
        timestamp: finishTime,
        service: 'gateway',
        level: 'info',
        traceId,
        spanId: 'sp-routed-success',
        message: `Response 200 OK forwarded back to source client in 85ms.`
      }
    ]);

    // Construct full distributed Jaeger spans Gantt tree data
    const gatewayDuration = 85;
    const destDuration = 45;
    const dbDuration = 18;

    const successTrace: TraceData = {
      traceId,
      rootSpanName: `${reqMethod} ${reqPath}`,
      timestamp,
      duration: gatewayDuration,
      status: 'ok',
      spans: [
        {
          id: 'sp-root-g',
          name: `API-GATEWAY: Router Proxy`,
          service: 'gateway',
          startTime: 0,
          duration: gatewayDuration,
          status: 'ok',
          tags: {
            'http.method': reqMethod,
            'http.url': `https://gateway.prod.com${reqPath}`,
            'http.status_code': '200',
            'client.ip': '192.168.1.45',
            'api.gateway': 'FastAPI Python'
          }
        },
        {
          id: 'sp-auth-check',
          name: `gateway:JWT verify token`,
          service: 'gateway',
          startTime: 2,
          duration: 10,
          parentId: 'sp-root-g',
          status: 'ok',
          tags: {
            'jwt.algorithm': settings.jwtAlgorithm,
            'jwt.valid': 'true',
            'jwt.roles': 'developer'
          }
        },
        {
          id: 'sp-consul-query',
          name: `consul:Service Discovery lookup`,
          service: 'discovery',
          startTime: 14,
          duration: 8,
          parentId: 'sp-root-g',
          status: 'ok',
          tags: {
            'discovery.provider': settings.discoveryService,
            'service.target': `${destinationId}-service`,
            'service.health': 'healthy'
          }
        },
        {
          id: 'sp-downstream-api',
          name: `${destinationId.toUpperCase()}-SERVICE: Process Handler`,
          service: destinationId,
          startTime: 24,
          duration: destDuration,
          parentId: 'sp-root-g',
          status: 'ok',
          tags: {
            'service.node': isCore ? 'Spring Boot 17' : 'Node Express V18',
            'service.port': isCore ? '8080' : '5000',
            'security.verified': 'true'
          }
        },
        {
          id: 'sp-db-fetch',
          name: `${settings.databaseType.toLowerCase()}:fetch query`,
          service: 'database',
          startTime: 34,
          duration: dbDuration,
          parentId: 'sp-downstream-api',
          status: 'ok',
          tags: {
            'db.type': settings.databaseType,
            'db.statement': isCore ? 'SELECT * FROM users_profile WHERE sub = ?' : 'FETCH ALL inventory_tasks',
            'db.conntime_ms': '2'
          }
        }
      ]
    };

    setTraces((prev) => [...prev, successTrace]);
    setSelectedTraceId(traceId);

    await new Promise(r => setTimeout(r, 450));
    setSimulationRunning(false);
    setActiveStep(0);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Visual Header context */}
      <Header systemHealth={rateLimitTokens === 0 ? 'degraded' : 'perfect'} />

      {/* Main app panel layout container */}
      <main className="max-w-7xl w-full mx-auto px-6 py-2 flex flex-col gap-6 flex-1">
        
        {/* TOPOLOGY ORCHESTRATOR VISUALS */}
        <section id="system-topology-wrapper">
          <TopologyDiagram
            nodes={nodes}
            connections={connections}
            activeStep={activeStep}
            simulationPath={simulationPath}
            rateLimitTokens={rateLimitTokens}
          />
        </section>

        {/* SIMULATOR & COCKPIT CONSOLE SECTION */}
        <section id="system-simulator-wrapper" className="mt-2">
          <SimulatorConsole
            settings={settings}
            setSettings={setSettings}
            onTriggerSimulation={handleTriggerSimulation}
            simulationRunning={simulationRunning}
            lastResponse={lastResponse}
          />
        </section>

        {/* TELEMETRY DATA PANEL (LOKI + JAEGER) */}
        <section id="system-telemetry-wrapper">
          <TelemetryDashboard
            logs={logs}
            traces={traces}
            selectedTraceId={selectedTraceId}
            setSelectedTraceId={setSelectedTraceId}
          />
        </section>

        {/* DOCKER & SPRING/EXPRESS CODE GENERATOR PANEL */}
        <section id="system-config-wrapper" className="mb-8">
          <ConfigurationGenerator settings={settings} />
        </section>

      </main>

      {/* Modern Developer footer bar */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-[11px] text-slate-500 font-mono flex flex-col sm:flex-row justify-between items-center max-w-7xl w-full mx-auto">
        <div>
          <span>Enterprise Microservices Architecture visual sandbox.</span>
        </div>
        <div className="flex items-center gap-1 mt-1 sm:mt-0">
          <span>Configured & Generated for </span>
          <span className="text-slate-400 font-semibold">{settings.discoveryService}</span>
          <span>& </span>
          <span className="text-slate-400 font-semibold">{settings.databaseType}</span>
        </div>
      </footer>
    </div>
  );
}
