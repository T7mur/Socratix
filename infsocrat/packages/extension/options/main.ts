import { testElmConnection, type ElmConfig } from "@infsocrat/brain";
import { ChromeStorage } from "../src/chromeStorage.js";
import { ELM_CONFIG_KEY } from "../src/storageKeys.js";

const storage = new ChromeStorage();

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const els = {
  baseUrl: el<HTMLInputElement>("base-url"),
  model: el<HTMLInputElement>("model"),
  apiKey: el<HTMLInputElement>("api-key"),
  saveButton: el<HTMLButtonElement>("save-button"),
  testButton: el<HTMLButtonElement>("test-button"),
  status: el<HTMLDivElement>("status"),
};

function readForm(): ElmConfig {
  return { baseUrl: els.baseUrl.value.trim(), model: els.model.value.trim(), apiKey: els.apiKey.value.trim() };
}

async function load(): Promise<void> {
  const config = await storage.get<ElmConfig>(ELM_CONFIG_KEY);
  if (config) {
    els.baseUrl.value = config.baseUrl;
    els.model.value = config.model;
    els.apiKey.value = config.apiKey;
  }
}

async function save(): Promise<void> {
  await storage.set(ELM_CONFIG_KEY, readForm());
  els.status.textContent = "Saved.";
}

async function test(): Promise<void> {
  els.testButton.disabled = true;
  els.status.textContent = "Testing…";
  const result = await testElmConnection(readForm());
  els.status.textContent = result.ok ? "✅ Connected." : `❌ ${result.message}`;
  els.testButton.disabled = false;
}

els.saveButton.addEventListener("click", () => void save());
els.testButton.addEventListener("click", () => void test());

void load();
