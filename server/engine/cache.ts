// In-memory LRU cache for AI engine responses
// Key = hash of (engine + query + systemPrompt)
// Caches responses for 1 hour to avoid duplicate API calls

interface CacheEntry {
  response: string;
  timestamp: number;
}

const MAX_ENTRIES = 500;
const TTL_MS = 60 * 60 * 1000; // 1 hour

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];

  private hash(engine: string, query: string): string {
    // Simple hash — engine + normalized query
    return `${engine}:${query.toLowerCase().trim()}`;
  }

  get(engine: string, query: string): string | null {
    const key = this.hash(engine, query);
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    
    // Move to end of access order (most recently used)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    
    return entry.response;
  }

  set(engine: string, query: string, response: string): void {
    const key = this.hash(engine, query);
    
    // Evict if at capacity
    while (this.cache.size >= MAX_ENTRIES && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.cache.delete(oldest);
    }
    
    this.cache.set(key, { response, timestamp: Date.now() });
    this.accessOrder.push(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
}

export const responseCache = new ResponseCache();
