/**
 * Storage is a pluggable interface so the brain never touches a concrete
 * persistence mechanism. The harness and tests use MemoryStorage; the
 * extension provides a chrome.storage-backed implementation of the same
 * interface without the brain package changing at all.
 */

export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStorage implements Storage {
  private data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.has(key) ? (this.data.get(key) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
