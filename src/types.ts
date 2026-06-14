export type ServiceId = 'client' | 'gateway' | 'discovery' | 'core' | 'task' | 'database' | 'collector';

export interface MicroserviceNode {
  id: ServiceId;
  name: string;
  technology: string;
  description: string;
  status: 'healthy' | 'unhealthy' | 'rate-limited';
  ip: string;
  port: number;
  x: number;
  y: number;
}

export interface NetworkConnection {
  from: ServiceId;
  to: ServiceId;
  label: string;
  type: 'rest' | 'grpc' | 'internal' | 'telemetry';
}

export interface SimulationRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  service: 'core' | 'task';
  jwtState: 'valid' | 'missing' | 'expired' | 'invalid';
  burstCount: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  service: ServiceId;
  level: 'info' | 'warn' | 'error';
  traceId: string;
  spanId: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface TraceSpan {
  id: string;
  name: string;
  service: ServiceId;
  startTime: number; // relative ms
  duration: number; // ms
  parentId?: string;
  status: 'ok' | 'error';
  tags: { [key: string]: string };
}

export interface TraceData {
  traceId: string;
  rootSpanName: string;
  timestamp: string;
  duration: number;
  status: 'ok' | 'error' | 'rate_limited';
  spans: TraceSpan[];
}

export interface ArchitectureSettings {
  rateLimitLimit: number;
  rateLimitWindow: number; // in seconds
  jwtAlgorithm: 'HS256' | 'RS256';
  jwtExpiration: number; // in minutes
  discoveryService: 'Consul' | 'Eureka' | 'Kubernetes DNS';
  databaseType: 'PostgreSQL' | 'MySQL' | 'MongoDB';
  tracingSampleRate: number; // 0.0 to 1.0
}
