// Gap 14: QStash Scheduler for Automated Benchmarks
// Monitor/Agency tiers get scheduled benchmark runs.
// QStash sends HTTP callbacks to our /api/scheduler/trigger endpoint.
// This module handles scheduling CRUD + trigger validation.

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

export interface ScheduleConfig {
  scheduleId: string;
  orgId?: string;
  email: string;
  brandName: string;
  brandUrl: string;
  category: string;
  tier: "monitor" | "agency";
  // Cron expression for QStash (e.g., "0 8 * * 1" = Monday 8 AM UTC)
  cronExpression: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastRunScore?: number;
  qstashScheduleId?: string; // The QStash-assigned schedule ID
}

/**
 * Create a QStash schedule via their REST API.
 * QStash will POST to our /api/scheduler/trigger endpoint on the cron schedule.
 */
export async function createQStashSchedule(
  config: ScheduleConfig,
  callbackUrl: string,
): Promise<{ qstashScheduleId?: string; error?: string }> {
  const qstashUrl = process.env.QSTASH_URL;
  const qstashToken = process.env.QSTASH_TOKEN;
  
  if (!qstashUrl || !qstashToken) {
    console.warn("[Scheduler] QStash not configured — schedule stored locally only");
    return { error: "QStash not configured" };
  }
  
  try {
    const response = await fetch(`${qstashUrl}/v2/schedules`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${qstashToken}`,
        "Content-Type": "application/json",
        "Upstash-Cron": config.cronExpression,
      },
      body: JSON.stringify({
        destination: callbackUrl,
        body: JSON.stringify({
          scheduleId: config.scheduleId,
          brandName: config.brandName,
          brandUrl: config.brandUrl,
          category: config.category,
          tier: config.tier,
          email: config.email,
          mode: "benchmark", // Scheduled runs are always benchmarks
        }),
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { error: `QStash error: ${err.slice(0, 200)}` };
    }
    
    const data = await response.json() as any;
    return { qstashScheduleId: data.scheduleId };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Save a schedule config to Redis.
 */
export async function saveSchedule(config: ScheduleConfig): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  await redis.set(`asov:schedule:${config.scheduleId}`, JSON.stringify(config));
  // Index by email for listing user's schedules
  const emailKey = `asov:schedules:${config.email.toLowerCase()}`;
  const existing = (await redis.get<string[]>(emailKey)) || [];
  if (!existing.includes(config.scheduleId)) {
    existing.push(config.scheduleId);
    await redis.set(emailKey, JSON.stringify(existing));
  }
}

/**
 * Get a schedule by ID.
 */
export async function getSchedule(scheduleId: string): Promise<ScheduleConfig | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const raw = await redis.get<string>(`asov:schedule:${scheduleId}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * List all schedules for an email.
 */
export async function getSchedulesForEmail(email: string): Promise<ScheduleConfig[]> {
  const redis = getRedis();
  if (!redis) return [];
  
  try {
    const emailKey = `asov:schedules:${email.toLowerCase()}`;
    const ids = (await redis.get<string[]>(emailKey)) || [];
    const schedules: ScheduleConfig[] = [];
    
    for (const id of ids) {
      const schedule = await getSchedule(id);
      if (schedule) schedules.push(schedule);
    }
    
    return schedules;
  } catch {
    return [];
  }
}

/**
 * Delete a QStash schedule.
 */
export async function deleteQStashSchedule(qstashScheduleId: string): Promise<boolean> {
  const qstashUrl = process.env.QSTASH_URL;
  const qstashToken = process.env.QSTASH_TOKEN;
  
  if (!qstashUrl || !qstashToken) return false;
  
  try {
    const response = await fetch(`${qstashUrl}/v2/schedules/${qstashScheduleId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${qstashToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate that a QStash trigger request is authentic.
 * In production, verify the Upstash-Signature header.
 * For now, basic validation.
 */
export function validateTriggerRequest(
  headers: Record<string, string>,
): boolean {
  // QStash sends an Upstash-Signature header
  // For full verification, use @upstash/qstash receiver.verify()
  // For now, accept all (we'll add proper verification when QStash is configured)
  return true;
}

/**
 * Update the lastRun info for a schedule after it completes.
 */
export async function recordScheduleRun(
  scheduleId: string,
  score: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const schedule = await getSchedule(scheduleId);
  if (!schedule) return;
  
  schedule.lastRunAt = new Date().toISOString();
  schedule.lastRunScore = score;
  
  await redis.set(`asov:schedule:${scheduleId}`, JSON.stringify(schedule));
}
