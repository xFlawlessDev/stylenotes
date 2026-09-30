import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
const select = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn(async () => ({ execute, select })) },
}));

vi.mock("$lib/windows", () => ({ isTauri: true }));

import { aiRepo } from "$lib/db/ai";
import type { AiSettings } from "$lib/content/ai-types";

beforeEach(() => {
  execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
  select.mockReset().mockResolvedValue([]);
});

describe("aiRepo.loadSettings", () => {
  it("returns defaults when no row exists", async () => {
    const settings = await aiRepo.loadSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.provider).toBe("openai-compatible");
    expect(settings.hasKey).toBe(false);
  });

  it("maps a row and exposes only key presence", async () => {
    select.mockResolvedValueOnce([
      {
        id: 1,
        enabled: 1,
        provider: "anthropic-native",
        base_url: "https://api.anthropic.com",
        model: "claude-3-5-haiku-latest",
        temperature: 0.4,
        max_tokens: 2048,
        api_key: "enc:v1:abc",
        updated_at: "2026-01-01",
      },
    ]);

    const settings = await aiRepo.loadSettings();

    expect(settings.enabled).toBe(true);
    expect(settings.provider).toBe("anthropic-native");
    expect(settings.hasKey).toBe(true);
    // The ciphertext never reaches the UI.
    expect(JSON.stringify(settings)).not.toContain("enc:v1:");
  });

  it("normalises an unknown provider to openai-compatible", async () => {
    select.mockResolvedValueOnce([
      {
        id: 1,
        enabled: 0,
        provider: "mystery",
        base_url: "",
        model: "",
        temperature: 0.7,
        max_tokens: 1024,
        api_key: "",
        updated_at: "",
      },
    ]);
    const settings = await aiRepo.loadSettings();
    expect(settings.provider).toBe("openai-compatible");
  });

  it("keeps every granted scope across a reload, workspace included", async () => {
    select.mockResolvedValueOnce([
      {
        id: 1,
        enabled: 1,
        provider: "openai-compatible",
        base_url: "",
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 1024,
        api_key: "",
        access: "write",
        scopes: JSON.stringify(["notes", "tasks", "dependency", "workspace"]),
        updated_at: "",
      },
    ]);
    const settings = await aiRepo.loadSettings();
    // A dropped scope here reads as "the grant reset on reload".
    expect(settings.access).toBe("write");
    expect(settings.scopes).toEqual([
      "notes",
      "tasks",
      "dependency",
      "workspace",
    ]);
  });

  it("rejects a scope the bridge does not know", async () => {
    select.mockResolvedValueOnce([
      {
        id: 1,
        enabled: 1,
        provider: "openai-compatible",
        base_url: "",
        model: "",
        temperature: 0.7,
        max_tokens: 1024,
        api_key: "",
        access: "write",
        scopes: JSON.stringify(["notes", "telepathy"]),
        updated_at: "",
      },
    ]);
    const settings = await aiRepo.loadSettings();
    expect(settings.scopes).toEqual(["notes"]);
  });
});

describe("aiRepo.saveSettings", () => {
  /** A complete settings row; individual tests override what they exercise. */
  const settings = (patch: Partial<AiSettings> = {}): AiSettings => ({
    enabled: true,
    provider: "openai-compatible",
    baseUrl: "",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1024,
    hasKey: true,
    access: "read",
    scopes: [],
    searchProvider: "",
    hasSearchKey: false,
    searchFallbacks: [],
    updatedAt: "",
    ...patch,
  });

  it("writes the key column only when a key is supplied", async () => {
    await aiRepo.saveSettings(settings(), {
      value: "enc:v1:cipher",
      hasKey: true,
    });

    const statements = execute.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes("api_key"))).toBe(true);
  });

  it("omits the key column when no key is supplied", async () => {
    await aiRepo.saveSettings(settings());

    const update = execute.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE ai_settings"),
    );
    expect(String(update?.[0])).not.toContain("api_key");
  });

  it("writes the search key independently of the model key", async () => {
    await aiRepo.saveSettings(
      settings({ searchProvider: "tavily" }),
      undefined,
      {
        value: "enc:v1:search",
        hasKey: true,
      },
    );

    const update = execute.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE ai_settings"),
    );
    const sql = String(update?.[0]);
    expect(sql).toContain("search_api_key");
    // The model key must survive a search-only save.
    expect(sql).not.toMatch(/\bapi_key = \$\d+/);
  });

  it("persists the search provider and fallbacks", async () => {
    await aiRepo.saveSettings(
      settings({
        searchProvider: "combo",
        searchFallbacks: ["tavily", "brave"],
      }),
    );

    const update = execute.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE ai_settings"),
    );
    expect(String(update?.[0])).toContain("search_provider");
    expect(update?.[1]).toContain(JSON.stringify(["tavily", "brave"]));
  });

  it("returns false when the database write fails", async () => {
    execute.mockRejectedValue(new Error("disk full"));
    const ok = await aiRepo.saveSettings(
      settings({ model: "", hasKey: false }),
    );
    expect(ok).toBe(false);
  });
});

describe("aiRepo threads and messages", () => {
  it("maps thread rows", async () => {
    select.mockResolvedValueOnce([
      {
        id: "t1",
        title: "Chat: Roadmap",
        note_id: "n1",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ]);
    const threads = await aiRepo.listThreads();
    expect(threads[0]).toEqual({
      id: "t1",
      title: "Chat: Roadmap",
      noteId: "n1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    });
  });

  it("maps a message row to its role", async () => {
    select.mockResolvedValueOnce([
      {
        id: 5,
        thread_id: "t1",
        role: "assistant",
        content: "Hi",
        created_at: "now",
      },
    ]);
    const messages = await aiRepo.listMessages("t1");
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("Hi");
  });

  it("re-reads the row when the driver omits lastInsertId", async () => {
    execute.mockResolvedValueOnce({ rowsAffected: 1 });
    select.mockResolvedValueOnce([
      {
        id: 9,
        thread_id: "t1",
        role: "user",
        content: "Yo",
        created_at: "now",
      },
    ]);
    const record = await aiRepo.addMessage("t1", "user", "Yo");
    expect(record?.id).toBe(9);
  });

  it("uses lastInsertId when the driver reports it", async () => {
    execute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 42 });
    const record = await aiRepo.addMessage("t1", "user", "Yo");
    expect(record?.id).toBe(42);
  });

  it("removes messages before the thread", async () => {
    await aiRepo.deleteThread("t1");
    const statements = execute.mock.calls.map((call) => String(call[0]));
    expect(statements[0]).toContain("DELETE FROM ai_messages");
    expect(statements[1]).toContain("DELETE FROM ai_threads");
  });
});
