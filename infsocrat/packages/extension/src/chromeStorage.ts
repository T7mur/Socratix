/**
 * chrome.storage.local-backed implementation of the brain's Storage
 * interface (packages/brain/src/storage.ts). Used for the ELM config
 * (a secret, so local — never sync) and, later, companion state.
 */
import type { Storage } from "@infsocrat/brain";

export class ChromeStorage implements Storage {
  async get<T>(key: string): Promise<T | null> {
    const result = await chrome.storage.local.get(key);
    return key in result ? (result[key] as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async delete(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}
