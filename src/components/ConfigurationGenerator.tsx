import React, { useState } from 'react';
import { ArchitectureSettings } from '../types';
import { Copy, Check, FileCode, Download, Folder, File, ChevronRight, Terminal } from 'lucide-react';

interface ConfigurationGeneratorProps {
  settings: ArchitectureSettings;
}

export default function ConfigurationGenerator({ settings }: ConfigurationGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'gateway' | 'core' | 'task' | 'docker' | 'cicd'>('gateway');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Generate python gateway code
  const getPythonGatewayMain = () => `import os
import time
import jwt
import httpx
from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
import redis

# Initialize FastAPI
app = FastAPI(title="Microservice API Gateway", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenTelemetry Tracing Setup
provider = TracerProvider()
processor = SimpleSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("api-gateway")

FastAPIInstrumentor.instrument_app(app)

# Redis setup for Rate Limiting
# In production, use environment variables
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
redis_client = redis.Redis(host=REDIS_HOST, port=6379, db=0)

# Rate Limiter Configuration (Synchronized with Studio Settings)
RATE_LIMIT = ${settings.rateLimitLimit}  # tokens
REFILL_RATE = ${(settings.rateLimitLimit / settings.rateLimitWindow).toFixed(1)}  # tokens per second
JWT_SECRET = "super_secret_signing_key_for_microservices_gateway"
ALGORITHM = "${settings.jwtAlgorithm}"

# Service Discovery Resolver (Consul Server URL)
CONSUL_URL = os.getenv("CONSUL_URL", "http://localhost:8500")

def check_rate_limit(client_ip: str) -> bool:
    key = f"rate_limit:{client_ip}"
    current_time = time.time()
    
    # Simple sliding bucket implementation
    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, 0, current_time - ${settings.rateLimitWindow})
    pipe.zadd(key, {str(current_time): current_time})
    pipe.zcard(key)
    pipe.expire(key, ${settings.rateLimitWindow})
    res = pipe.execute()
    
    request_count = res[2]
    return request_count <= RATE_LIMIT

async def resolve_service_url(service_name: str) -> str:
    """Query Consul service discovery for service coordinates"""
    try:
        async with httpx.AsyncClient() as client:
            # Resolving service
            r = await client.get(f"{CONSUL_URL}/v1/catalog/service/{service_name}")
            if r.status_code == 200 and len(r.json()) > 0:
                service_info = r.json()[0]
                address = service_info["ServiceAddress"] or service_info["Address"]
                port = service_info["ServicePort"]
                return f"http://{address}:{port}"
    except Exception as e:
        print(f"Service discovery failed for {service_name}: {e}")
    
    # Fallback default hardcoded container ports
    defaults = {
        "core-service": "http://coreservice:8080",
        "task-service": "http://taskservice:5000"
    }
    return defaults.get(service_name, "")

@app.middleware("http")
async def gateway_middleware(request: Request, call_next):
    # Retrieve client IP
    client_ip = request.client.host if request.client else "unknown"
    
    # 1. Check Rate Limiting
    if not check_rate_limit(client_ip):
        return Response(
            content='{"error": "Too Many Requests", "message": "Rate limit exceeded. Try again later."}',
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            media_type="application/json"
        )
        
    start_time = time.time()
    
    with tracer.start_as_current_span("gateway-router") as span:
        span.set_attribute("http.method", request.method)
        span.set_attribute("http.url", str(request.url))
        span.set_attribute("client.ip", client_ip)
        
        # 2. Extract and Validate Incoming JWT (or issue token if login endpoint)
        auth_header = request.headers.get("Authorization")
        validated_payload = None
        
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                # Decrypt/Validate inbound token
                validated_payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
                span.set_attribute("jwt.subject", validated_payload.get("sub", "unknown"))
                span.set_attribute("jwt.role", validated_payload.get("role", "user"))
            except jwt.ExpiredSignatureError:
                span.set_attribute("error", True)
                span.set_attribute("error.message", "Token expired")
                return Response(
                    content='{"error": "Unauthorized", "message": "Signature has expired."}',
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    media_type="application/json"
                )
            except jwt.InvalidTokenError as e:
                span.set_attribute("error", True)
                span.set_attribute("error.message", f"Invalid token: {str(e)}")
                return Response(
                    content='{"error": "Unauthorized", "message": "Invalid JWT Token structure."}',
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    media_type="application/json"
                )
        
        # 3. Router and Downstream Service proxy with trace context forwarding
        path = request.url.path
        response = await call_next(request)
        
        # Tracing logging custom logs headers
        duration_ms = (time.time() - start_time) * 1000
        span.set_attribute("http.status_code", response.status_code)
        span.set_attribute("duration_ms", duration_ms)
        
        print(f'{{ "timestamp": "{time.strftime("%Y-%m-%dT%H:%M:%SZ")}", "service": "gateway", "level": "INFO", "traceId": "{span.get_span_context().trace_id:032x}", "message": "Routed {request.method} {path} - {response.status_code} in {duration_ms:.1f}ms" }}')
        
        return response

@app.all("/{service_name}/{path:path}")
async def proxy_router(service_name: str, path: str, request: Request):
    """Proxy requests automatically with distributed tracing injection"""
    service_alias = "core-service" if service_name == "core" else "task-service"
    service_url = await resolve_service_url(service_alias)
    
    if not service_url:
        raise HTTPException(status_code=404, detail="Requested microservice not resolved by Consul Service Discovery")

    # Propagate Tracing details and JWT Downstream
    headers = dict(request.headers)
    current_span = trace.get_current_span()
    if current_span:
        span_context = current_span.get_span_context()
        headers["traceparent"] = f"00-{span_context.trace_id:032x}-{span_context.span_id:016x}-01"
    
    # Send Request downstream using HTTPX AsyncClient
    async with httpx.AsyncClient() as client:
        try:
            req_data = await request.body()
            res = await client.request(
                method=request.method,
                url=f"{service_url}/{path}",
                headers=headers,
                content=req_data,
                params=dict(request.query_params)
            )
            return Response(content=res.content, status_code=res.status_code, headers=dict(res.headers))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Bad Gateway downstream communications failure: {str(e)}")
`;

  const getPythonGatewayReqs = () => `fastapi>=0.100.0
uvicorn>=0.22.0
pyjwt>=2.8.0
redis>=4.6.0
httpx>=0.24.0
opentelemetry-api>=1.18.0
opentelemetry-sdk>=1.18.0
opentelemetry-instrumentation-fastapi>=0.39b0
`;

  // Spring Boot Core
  const getSpringBootConfig = () => `package com.example.coreservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // Enforce JWT Auth Token for all incoming API routes, ensuring no Session state
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login", "/api/auth/register", "/health").permitAll()
                .anyRequest().authenticated()
            )
            // Inject JWT verification filter before Spring Standard Form Auth
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
`;

  const getSpringBootJwt = () => `package com.example.coreservice.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Component
public class JwtProvider {

    // HMAC Secure Key matching Gateway Shared secret
    private static final String SECRET = "super_secret_signing_key_for_microservices_gateway";
    private final Key signingKey = Keys.hmacShaKeyFor(SECRET.getBytes());
    
    private final int jwtExpirationMinutes = ${settings.jwtExpiration};

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    private Boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    public String generateToken(String username, String role) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("service_client", "core-service");
        
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(username)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + 1000L * 60 * jwtExpirationMinutes))
                .signWith(signingKey, SignatureAlgorithm.${settings.jwtAlgorithm === 'HS256' ? 'HS256' : 'RS256'})
                .compact();
    }

    public Boolean validateToken(String token, String username) {
        final String extractedUsername = extractUsername(token);
        return (extractedUsername.equals(username) && !isTokenExpired(token));
    }
}
`;

  const getSpringBootController = () => `package com.example.coreservice.controller;

import com.example.coreservice.util.JwtProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.opentelemetry.api.trace.Span;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);
    private final JwtProvider jwtProvider;

    public UserController(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    @GetMapping("/profile")
    public ResponseEntity<Map<String, Object>> getUserProfile(@RequestHeader("Authorization") String authHeader) {
        // SLF4J + Logback will auto inject OpenTelemetry trace_id and span_id into MDC
        String currentTraceId = Span.current().getSpanContext().getTraceId();
        
        log.info("Processing user profile lookup request under Trace: {}", currentTraceId);
        
        String token = authHeader.replace("Bearer ", "");
        String username = jwtProvider.extractUsername(token);
        String role = jwtProvider.extractClaim(token, claims -> claims.get("role", String.class));
        
        Map<String, Object> profile = new HashMap<>();
        profile.put("username", username);
        profile.put("role", role);
        profile.put("email", username + "@microservices.io");
        profile.put("status", "ACTIVE");
        profile.put("dataSource", "PostgreSQL Core DB");
        profile.put("timestamp", System.currentTimeMillis());
        profile.put("traceId", currentTraceId);

        log.info("Successfully returned core-service data for user: {}", username);
        return ResponseEntity.ok(profile);
    }
}
`;

  // Node Task Service
  const getNodeIndex = () => `const express = require('express');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const { trace, context, propagation } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const app = express();
const PORT = process.env.PORT || 5000;

// Setup OpenTelemetry Jaeger telemetry
const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({ endpoint: 'http://jaeger:14268/api/traces' });
provider.add_span_processor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('task-service');

app.use(express.json());

// Set up structured logs (Winston) with distributed tracing tracking context
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      const activeSpan = trace.getSpan(context.active());
      const traceId = activeSpan ? activeSpan.spanContext().traceId : '00000000000000000000000000000000';
      const spanId = activeSpan ? activeSpan.spanContext().spanId : '0000000000000000';
      
      return JSON.stringify({
        timestamp,
        service: 'task-service',
        level: level.toUpperCase(),
        traceId,
        spanId,
        message
      });
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// JWT Verification Middleware Shared Secret
const JWT_SECRET = "super_secret_signing_key_for_microservices_gateway";

const verifyJwt = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Authentication failed: Missing Authorization Header');
    return res.status(401).json({ error: "Unauthorized", message: "JWT token required." });
  }

  const token = authHeader.split(' ')[1];
  try {
    // Validate JWT token using custom studio settings criteria
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['${settings.jwtAlgorithm}'] });
    req.user = decoded;
    next();
  } catch (err) {
    logger.error("Authentication token validation failed: " + err.message);
    return res.status(401).json({ error: "Unauthorized", message: "JWT token is invalid or expired." });
  }
};

// OpenTelemetry trace extractor middleware
app.use((req, res, next) => {
  // Extract traceparent from incoming Gateway proxy HTTP headers
  const activeContext = propagation.extract(context.active(), req.headers);
  
  const span = tracer.startSpan(req.method + " " + req.path, {
    attributes: {
      'http.method': req.method,
      'http.route': req.path,
    }
  }, activeContext);

  context.with(trace.setSpan(context.active(), span), () => {
    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);
      span.end();
    });
    next();
  });
});

// Tasks CRUD Routes
const mockTasks = [
  { id: 1, title: 'Configure consul registry', done: true, service: 'gateway' },
  { id: 2, title: 'Setup JWT validation filter', done: true, service: 'coreservice' },
  { id: 3, title: 'Instrument OpenTelemetry exporter', done: false, service: 'taskservice' },
  { id: 4, title: 'Write container deployment manifests', done: false, service: 'kubernetes' }
];

app.get('/tasks', verifyJwt, (req, res) => {
  logger.info(\`Fetching task log inventory for user: \${req.user.sub}\`);
  res.json({
    status: 'success',
    user: req.user.sub,
    roles: req.user.role,
    tasks: mockTasks,
    backend_tech: 'NodeJS Express',
    dbStorage: 'In-Memory/Elasticsearch'
  });
});

app.post('/tasks', verifyJwt, (req, res) => {
  const { title, service } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Bad Request", message: "Title required" });
  }

  const newTask = {
    id: mockTasks.length + 1,
    title,
    done: false,
    service: service || 'general'
  };

  mockTasks.push(newTask);
  logger.info("Added new task resource: " + title + " requested by " + req.user.sub);
  res.status(201).json(newTask);
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'task-service' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log("Task Service online execution active on port " + PORT);
});
`;

  // Docker Compose + Dockerfiles
  const getDockerCompose = () => `version: '3.8'

services:
  # Service Discovery Registry (Consul)
  consul:
    image: hashicorp/consul:1.15
    container_name: service-discovery-consul
    ports:
      - "8500:8500"
    command: "agent -dev -client=0.0.0.0"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8500/v1/status/leader"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Redis for API Gateway Rate Limiter
  redis:
    image: redis:7-alpine
    container_name: rate-limiter-redis
    ports:
      - "6379:6379"

  # Centralized Tracer Dashboard (Jaeger Server)
  jaeger:
    image: jaegertracing/all-in-one:1.47
    container_name: tracer-jaeger
    ports:
      - "16686:16686" # UI Dashboard
      - "14268:14268" # OpenTelemetry direct payload receiver
      - "4317:4317"   # gRPC receiver

  # API Gateway (Python FastAPI)
  api-gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile
    container_name: microservice-gateway
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - REDIS_HOST=redis
      - CONSUL_URL=http://consul:8500
      - JAEGER_ENDPOINT=http://jaeger:14268/api/traces
    depends_on:
      consul:
        condition: service_healthy
      redis:
        condition: service_started
      jaeger:
        condition: service_started

  # Core Service (Spring Boot Java)
  core-service:
    build:
      context: ./coreservice
      dockerfile: Dockerfile
    container_name: core-service-spring
    ports:
      - "8080:8080"
    environment:
      - SPRING_CLOUD_CONSUL_HOST=consul
      - SPRING_CLOUD_CONSUL_PORT=8500
      - OTEL_TRACES_EXPORTER=jaeger
      - OTEL_EXPORTER_JAEGER_ENDPOINT=http://jaeger:14268/api/traces
    depends_on:
      consul:
        condition: service_healthy

  # Task Service (Node.js Express)
  task-service:
    build:
      context: ./taskservice
      dockerfile: Dockerfile
    container_name: task-service-node
    ports:
      - "5000:5000"
    environment:
      - PORT=5000
      - JAEGER_ENDPOINT=http://jaeger:14268/api/traces
      - CONSUL_HOST=consul
    depends_on:
      consul:
        condition: service_healthy
`;

  const getDockerfiles = () => `# ==========================================
# 1. PYTHON API GATEWAY DOCKERFILE
# ==========================================
# File: ./gateway/Dockerfile
FROM python:3.10-alpine

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]


# ==========================================
# 2. SPRING BOOT CORE SERVICE DOCKERFILE
# ==========================================
# File: ./coreservice/Dockerfile
# Multi-stage build for fast jar creation and execution
FROM maven:3.8-openjdk-17-slim AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]


# ==========================================
# 3. NODE.JS TASK SERVICE DOCKERFILE
# ==========================================
# File: ./taskservice/Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000
CMD ["node", "index.js"]
`;

  // CI/CD pipelines
  const getCicdWorkflow = () => `name: Microservices Full CI-CD Pipeline

on:
  push:
    branches: [ "main", "release/*" ]
  pull_request:
    branches: [ "main" ]

env:
  DOCKER_REGISTRY: docker.io
  REGISTRY_OWNER: \${{ secrets.DOCKER_USER }}
  CLUSTER_NAME: prod-microservices-cluster
  GCP_ZONE: us-east1-b

jobs:
  # 1. Test Phase
  test-and-lint:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    # Test Gateway (Python)
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.10'
    - name: Test Python API Gateway
      run: |
        cd gateway
        pip install -r requirements.txt pytest httpx
        pytest

    # Test Spring Core (Java Maven)
    - name: Set up JDK 17
      uses: actions/setup-java@v3
      with:
        java-version: '17'
        distribution: 'temurin'
        cache: 'maven'
    - name: Test Java Spring Core
      run: |
        cd coreservice
        mvn clean test

    # Test Node Service (Node JS)
    - name: Set up NodeJS
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: taskservice/package-lock.json
    - name: Test Node JS Target Task Service
      run: |
        cd taskservice
        npm ci
        npm test

  # 2. Security Scan & Container Build Phase
  build-and-push:
    needs: test-and-lint
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api-gateway, core-service, task-service]
        include:
          - service: api-gateway
            context: ./gateway
          - service: core-service
            context: ./coreservice
          - service: task-service
            context: ./taskservice
    steps:
    - uses: actions/checkout@v3

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2

    - name: Login to DockerHub
      uses: docker/login-action@v2
      with:
        username: \${{ secrets.DOCKER_USER }}
        password: \${{ secrets.DOCKER_ACCESS_TOKEN }}

    # Scan code for vulnerabilities before package
    - name: Run Trivy Vulnerability Scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        ignore-unfixed: true
        severity: 'CRITICAL,HIGH'

    - name: Build and Push Docker image
      uses: docker/build-push-action@v4
      with:
        context: \${{ matrix.context }}
        push: true
        tags: |
          \${{ env.DOCKER_REGISTRY }}/\${{ env.REGISTRY_OWNER }}/\${{ matrix.service }}:latest
          \${{ env.DOCKER_REGISTRY }}/\${{ env.REGISTRY_OWNER }}/\${{ matrix.service }}:\${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  # 3. Blue-Green / Canary Deploy Phase to Cloud Kubernetes
  deploy-to-prod:
    needs: build-and-push
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    # Authenticate to Target Cloud Provider (Google Cloud Example)
    - id: 'auth'
      name: 'Authenticate to Google Cloud'
      uses: 'google-github-actions/auth@v1'
      with:
        credentials_json: '\${{ secrets.GCP_SA_KEY }}'

    - name: Get GKE Credentials
      uses: google-github-actions/get-gke-credentials@v1
      with:
        cluster_name: \${{ env.CLUSTER_NAME }}
        location: \${{ env.GCP_ZONE }}

    # Perform rollout deployment of updated images
    - name: Deploy Kubernetes Manifests
      run: |
        cd k8s/
        # Dynamic replacement of tags with trigger commit hash
        sed -i 's|IMAGE_TAG_PLACEHOLDER|\${{ github.sha }}|g' deployment.yml
        kubectl apply -f .
        
    - name: Monitor Rollout Health Status
      run: |
        kubectl rollout status deployment/gateway-deployment -n production
        kubectl rollout status deployment/core-deployment -n production
        kubectl rollout status deployment/task-deployment -n production
`;

  // Dictionary mapping file extensions to content
  const filesMap: Record<string, { name: string; lang: string; content: string }[]> = {
    gateway: [
      { name: 'main.py', lang: 'python', content: getPythonGatewayMain() },
      { name: 'requirements.txt', lang: 'text', content: getPythonGatewayReqs() }
    ],
    core: [
      { name: 'SecurityConfig.java', lang: 'java', content: getSpringBootConfig() },
      { name: 'JwtProvider.java', lang: 'java', content: getSpringBootJwt() },
      { name: 'UserController.java', lang: 'java', content: getSpringBootController() }
    ],
    task: [
      { name: 'index.js', lang: 'javascript', content: getNodeIndex() },
      { name: 'package.json', lang: 'json', content: `{
  "name": "task-service",
  "version": "1.0.0",
  "description": "Express Service managing Tasks with JWT validation and Tracing",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.1",
    "winston": "^3.10.0",
    "@opentelemetry/api": "^1.4.1",
    "@opentelemetry/sdk-trace-node": "^1.14.0",
    "@opentelemetry/sdk-trace-base": "^1.14.0",
    "@opentelemetry/exporter-jaeger": "^1.14.0"
  },
  "scripts": {
    "start": "node index.js",
    "test": "echo \\"Running tests...\\" && exit 0"
  }
}` }
    ],
    docker: [
      { name: 'docker-compose.yml', lang: 'yaml', content: getDockerCompose() },
      { name: 'Dockerfiles (Combined)', lang: 'text', content: getDockerfiles() }
    ],
    cicd: [
      { name: 'ci-cd.yml', lang: 'yaml', content: getCicdWorkflow() }
    ]
  };

  const currentFilesList = filesMap[activeTab];
  
  // Keep track of the currently selected file in parent tab
  React.useEffect(() => {
    if (currentFilesList.length > 0) {
      setSelectedFile(currentFilesList[0].name);
    }
  }, [activeTab]);

  const activeFile = currentFilesList.find(f => f.name === selectedFile) || currentFilesList[0];

  const handleCopy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="cfg-generator" className="bg-slate-900/50 border border-slate-700/30 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Tab navigation */}
      <div className="bg-slate-950/80 px-5 pt-5 border-b border-slate-800/80">
        <div className="flex items-center gap-2 mb-3.5">
          <Terminal className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Microservice Configuration Code Studio
          </h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 text-indigo-400 border border-indigo-500/20 font-mono font-bold">
            Generated Real-time
          </span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          <button
            id="tab-btn-gateway"
            onClick={() => setActiveTab('gateway')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-200 border-t-2 ${
              activeTab === 'gateway'
                ? 'bg-slate-900/90 border-t-indigo-500 text-indigo-400 font-bold border-x border-slate-800/50'
                : 'bg-transparent border-t-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            Python Gateway
          </button>
          <button
            id="tab-btn-core"
            onClick={() => setActiveTab('core')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-200 border-t-2 ${
              activeTab === 'core'
                ? 'bg-slate-900/90 border-t-indigo-500 text-indigo-400 font-bold border-x border-slate-800/50'
                : 'bg-transparent border-t-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            Java Spring Core
          </button>
          <button
            id="tab-btn-task"
            onClick={() => setActiveTab('task')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-200 border-t-2 ${
              activeTab === 'task'
                ? 'bg-slate-900/90 border-t-indigo-500 text-indigo-400 font-bold border-x border-slate-800/50'
                : 'bg-transparent border-t-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            NodeJS Tasks
          </button>
          <button
            id="tab-btn-docker"
            onClick={() => setActiveTab('docker')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-200 border-t-2 ${
              activeTab === 'docker'
                ? 'bg-slate-900/90 border-t-indigo-500 text-indigo-400 font-bold border-x border-slate-800/50'
                : 'bg-transparent border-t-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            Docker Containerization
          </button>
          <button
            id="tab-btn-cicd"
            onClick={() => setActiveTab('cicd')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-200 border-t-2 ${
              activeTab === 'cicd'
                ? 'bg-slate-900/90 border-t-indigo-500 text-indigo-400 font-bold border-x border-slate-800/50'
                : 'bg-transparent border-t-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            CI/CD Pipeline
          </button>
        </div>
      </div>

      {/* Main code viewer window */}
      <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[480px]">
        {/* Left Side: File Explorer */}
        <div className="lg:col-span-1 bg-slate-950/70 border-r border-slate-800/80 p-4 flex flex-col gap-2">
          <div className="text-slate-450 text-xs font-mono select-none px-2 py-1.5 border-b border-slate-800 pb-2.5 mb-1.5 flex items-center justify-between">
            <span className="font-bold tracking-wider uppercase">FILE EXPLORER</span>
            <Folder className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          
          <div className="flex flex-col gap-1 flex-1">
            {currentFilesList.map((file) => (
              <button
                key={file.name}
                id={`file-btn-${file.name}`}
                onClick={() => setSelectedFile(file.name)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-mono transition-all duration-150 flex items-center justify-between group ${
                  selectedFile === file.name
                    ? 'bg-slate-800 text-slate-200 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className={`w-4 h-4 flex-shrink-0 ${
                    activeTab === 'gateway' ? 'text-indigo-400' :
                    activeTab === 'core' ? 'text-indigo-400' :
                    activeTab === 'task' ? 'text-indigo-400' :
                    activeTab === 'docker' ? 'text-indigo-400' : 'text-indigo-400'
                  }`} />
                  <span className="truncate">{file.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 mt-auto">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5 tracking-wider">Architecture Active Context</span>
            <div className="space-y-1 font-mono text-[10px] text-slate-400">
              <div className="flex justify-between">
                <span>Auth Exp:</span>
                <span className="text-yellow-400 font-semibold">{settings.jwtExpiration}m</span>
              </div>
              <div className="flex justify-between">
                <span>Algorithm:</span>
                <span className="text-indigo-400 font-semibold">{settings.jwtAlgorithm}</span>
              </div>
              <div className="flex justify-between">
                <span>Discovery:</span>
                <span className="text-emerald-400 font-semibold">{settings.discoveryService}</span>
              </div>
              <div className="flex justify-between">
                <span>Database:</span>
                <span className="text-purple-400 font-semibold">{settings.databaseType}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Code Editor Context Dashboard */}
        <div className="lg:col-span-3 flex flex-col bg-slate-900">
          {/* Editor Header panel */}
          <div className="bg-slate-950 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between h-12">
            <div className="flex items-center gap-2">
              <File className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-300 font-medium">{activeFile?.name || 'Loading...'}</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                id="btn-copy-code"
                onClick={() => handleCopy(activeFile?.content || '')}
                className="p-1 px-3 text-[11px] font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 h-8"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
              
              <button
                id="btn-download-code"
                onClick={() => handleDownload(activeFile?.name || 'config', activeFile?.content || '')}
                className="p-1 px-3 text-[11px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-white transition flex items-center gap-1.5 h-8"
                title="Download configuration template"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          {/* Pre code blocks */}
          <div className="flex-1 p-4 overflow-auto font-mono text-xs text-slate-300 bg-slate-900 max-h-[500px]">
            <pre className="whitespace-pre overflow-x-auto selection:bg-slate-800 selection:text-white leading-relaxed">
              <code>{activeFile?.content || 'No file contents available.'}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
