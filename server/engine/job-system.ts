// Gap 5: Async Job System
// Return a job ID immediately, client polls /api/job/:id for results.
// Workers-safe: uses Redis for job state (no in-memory state across isolates).
// Flow: POST /api/audit → 202 { jobId } → GET /api/job/:jobId → { status, result }

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _redisUrl: string | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (_redis && _redisUrl === url) return _redis;
  _redis = new Redis({ url, token });
  _redisUrl = url;
  return _redis;
}

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobRecord {
  id: string;
  status: JobStatus;
  tier: string;
  brandName?: string;
  url: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  auditId?: number;      // DB audit ID when completed
  error?: string;         // Error message if failed
  progress?: number;      // 0-100 progress percentage
  progressMessage?: string;
}

const JOB_TTL = 24 * 60 * 60; // 24 hours retention

/**
 * Generate a unique job ID (Workers-safe, no crypto.randomUUID needed)
 */
export function generateJobId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `job_${ts}_${rand}`;
}

/**
 * Create a new job record in Redis.
 */
export async function createJob(
  jobId: string,
  url: string,
  tier: string,
  brandName?: string,
): Promise<JobRecord> {
  const redis = getRedis();
  const job: JobRecord = {
    id: jobId,
    status: "queued",
    tier,
    brandName,
    url,
    createdAt: new Date().toISOString(),
    progress: 0,
    progressMessage: "Queued",
  };
  
  if (redis) {
    await redis.set(`asov:job:${jobId}`, JSON.stringify(job), { ex: JOB_TTL });
  }
  return job;
}

/**
 * Get a job's current state.
 */
export async function getJob(jobId: string): Promise<JobRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const raw = await redis.get<string>(`asov:job:${jobId}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * Update job status/progress.
 */
export async function updateJob(
  jobId: string,
  updates: Partial<Pick<JobRecord, "status" | "progress" | "progressMessage" | "auditId" | "error" | "startedAt" | "completedAt">>,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const current = await getJob(jobId);
    if (!current) return;
    
    const updated = { ...current, ...updates };
    await redis.set(`asov:job:${jobId}`, JSON.stringify(updated), { ex: JOB_TTL });
  } catch {
    // Best effort
  }
}

/**
 * Mark a job as running with progress.
 */
export async function markJobRunning(jobId: string, progressMessage: string = "Running audit"): Promise<void> {
  await updateJob(jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
    progress: 10,
    progressMessage,
  });
}

/**
 * Mark a job as completed with the audit ID.
 */
export async function markJobCompleted(jobId: string, auditId: number): Promise<void> {
  await updateJob(jobId, {
    status: "completed",
    completedAt: new Date().toISOString(),
    auditId,
    progress: 100,
    progressMessage: "Complete",
  });
}

/**
 * Mark a job as failed.
 */
export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await updateJob(jobId, {
    status: "failed",
    completedAt: new Date().toISOString(),
    error,
    progressMessage: "Failed",
  });
}

/**
 * Update job progress (for long-running audits).
 */
export async function updateJobProgress(
  jobId: string,
  progress: number,
  message: string,
): Promise<void> {
  await updateJob(jobId, { progress, progressMessage: message });
}
