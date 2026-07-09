/**
 * Native-protocol proxying.
 *
 * A gateway (e.g. CLIProxyAPI) fronts several model families behind one host,
 * serving each over its own native protocol: OpenAI /v1/chat/completions,
 * Anthropic /v1/messages, Gemini /v1beta/models/{model}:generateContent.
 *
 * getModel must therefore build a concrete AI SDK client per provider whenever
 * that provider has a base URL configured, rather than falling through to
 * Mastra's router (whose "provider/model" string form carries no URL and would
 * reach the vendor's public API instead of the gateway).
 *
 * Without a base URL the provider must keep using the router, so direct-to-vendor
 * deployments are unaffected.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "k-openai",
  OPENAI_BASE_URL: undefined as string | undefined,
  OPENAI_API_MODE: "chat_completions" as string | undefined,
  ANTHROPIC_API_KEY: "k-anthropic",
  ANTHROPIC_BASE_URL: undefined as string | undefined,
  GOOGLE_GENERATIVE_AI_API_KEY: "k-google",
  GEMINI_BASE_URL: undefined as string | undefined,
  OLLAMA_URL: undefined as string | undefined,
  AZURE_API_KEY: undefined as string | undefined,
  AZURE_BASE_URL: undefined as string | undefined,
  CHAT_PROVIDER: "openai",
  MODEL: "gpt-5.4",
}));

const sdk = vi.hoisted(() => ({
  createAnthropic: vi.fn(),
  createGoogleGenerativeAI: vi.fn(),
  createOpenAI: vi.fn(),
  routerCtor: vi.fn(),
}));

vi.mock("~/env.server", () => ({ env: envMock }));

// db.server pulls in @core/database, which has no build output under vitest.
// Nothing on the getModel path touches prisma — getProviderConfig reads env only.
vi.mock("~/db.server", () => ({ prisma: {} }));

// Each factory returns a tagged callable so we can assert which one produced
// the model, and record the modelId it was invoked with.
const tagged = (tag: string) => (opts: unknown) => {
  const client = (modelId: string) => ({ __tag: tag, modelId, opts });
  (client as any).chat = (modelId: string) => ({
    __tag: `${tag}.chat`,
    modelId,
    opts,
  });
  (client as any).responses = (modelId: string) => ({
    __tag: `${tag}.responses`,
    modelId,
    opts,
  });
  return client;
};

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (o: unknown) => (
    sdk.createAnthropic(o), tagged("anthropic")(o)
  ),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: (o: unknown) => (
    sdk.createGoogleGenerativeAI(o), tagged("google")(o)
  ),
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (o: unknown) => (sdk.createOpenAI(o), tagged("openai")(o)),
}));
vi.mock("@ai-sdk/azure", () => ({ createAzure: () => tagged("azure")({}) }));
vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: () => tagged("ollama")({}),
}));

vi.mock("@mastra/core/llm", () => ({
  ModelRouterLanguageModel: class {
    __tag = "router";
    constructor(public arg: unknown) {
      sdk.routerCtor(arg);
    }
  },
  ModelRouterEmbeddingModel: class {
    constructor(public arg: unknown) {}
  },
}));

vi.mock("@mastra/core/agent", () => ({ Agent: class {} }));
vi.mock("ai", () => ({ embed: vi.fn() }));
vi.mock("~/services/logger.service", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/services/tokenUsage.server", () => ({ recordTokenUsage: vi.fn() }));

import { getModel } from "~/lib/model.server";

const GATEWAY = "http://gateway:8317";

beforeEach(() => {
  vi.clearAllMocks();
  envMock.OPENAI_BASE_URL = undefined;
  envMock.ANTHROPIC_BASE_URL = undefined;
  envMock.GEMINI_BASE_URL = undefined;
  envMock.CHAT_PROVIDER = "openai";
});

describe("getModel with a gateway base URL", () => {
  it("routes claude models through the Anthropic SDK at its base URL", () => {
    envMock.ANTHROPIC_BASE_URL = `${GATEWAY}/v1`;

    const model = getModel("claude-opus-4-8") as any;

    expect(model.__tag).toBe("anthropic");
    expect(model.modelId).toBe("claude-opus-4-8");
    expect(sdk.createAnthropic).toHaveBeenCalledWith({
      baseURL: `${GATEWAY}/v1`,
      apiKey: "k-anthropic",
    });
    expect(sdk.routerCtor).not.toHaveBeenCalled();
  });

  it("routes gemini models through the Google SDK at its base URL", () => {
    envMock.GEMINI_BASE_URL = `${GATEWAY}/v1beta`;

    const model = getModel("gemini-3-flash") as any;

    expect(model.__tag).toBe("google");
    expect(model.modelId).toBe("gemini-3-flash");
    expect(sdk.createGoogleGenerativeAI).toHaveBeenCalledWith({
      baseURL: `${GATEWAY}/v1beta`,
      apiKey: "k-google",
    });
    expect(sdk.routerCtor).not.toHaveBeenCalled();
  });

  it("routes gpt models through the OpenAI SDK at its base URL", () => {
    envMock.OPENAI_BASE_URL = `${GATEWAY}/v1`;

    const model = getModel("gpt-5.4") as any;

    expect(model.__tag).toBe("openai.chat");
    expect(sdk.createOpenAI).toHaveBeenCalledWith({
      baseURL: `${GATEWAY}/v1`,
      apiKey: "k-openai",
    });
  });

  it("keeps each family on its own base URL when all three are set", () => {
    envMock.OPENAI_BASE_URL = `${GATEWAY}/v1`;
    envMock.ANTHROPIC_BASE_URL = `${GATEWAY}/v1`;
    envMock.GEMINI_BASE_URL = `${GATEWAY}/v1beta`;

    expect((getModel("claude-sonnet-5") as any).__tag).toBe("anthropic");
    expect((getModel("gemini-3.1-pro-low") as any).__tag).toBe("google");
    expect((getModel("gpt-5.5") as any).__tag).toBe("openai.chat");
    expect(sdk.routerCtor).not.toHaveBeenCalled();
  });

  // ENV_KEY_MAP in llm-provider.server snapshots env at module load, so the
  // missing-key path needs a fresh module graph rather than a mutated envMock.
  it("throws a named error when the proxy has no API key", async () => {
    vi.resetModules();
    envMock.ANTHROPIC_BASE_URL = `${GATEWAY}/v1`;
    envMock.ANTHROPIC_API_KEY = undefined as any;

    const { getModel: freshGetModel } = await import("~/lib/model.server");

    expect(() => freshGetModel("claude-opus-4-8")).toThrow(
      /ANTHROPIC_API_KEY is missing/,
    );

    envMock.ANTHROPIC_API_KEY = "k-anthropic";
    vi.resetModules();
  });
});

describe("getModel without a base URL", () => {
  it("sends anthropic through Mastra's router, not the Anthropic SDK", () => {
    const model = getModel("claude-opus-4-8") as any;

    expect(model.__tag).toBe("router");
    expect(sdk.routerCtor).toHaveBeenCalledWith("anthropic/claude-opus-4-8");
    expect(sdk.createAnthropic).not.toHaveBeenCalled();
  });

  it("sends gemini through Mastra's router, not the Google SDK", () => {
    const model = getModel("gemini-3-flash") as any;

    expect(model.__tag).toBe("router");
    expect(sdk.routerCtor).toHaveBeenCalledWith("google/gemini-3-flash");
    expect(sdk.createGoogleGenerativeAI).not.toHaveBeenCalled();
  });

  it("leaves a configured anthropic proxy untouched by an openai base URL", () => {
    envMock.OPENAI_BASE_URL = `${GATEWAY}/v1`;

    const model = getModel("claude-opus-4-8") as any;

    expect(model.__tag).toBe("router");
    expect(sdk.createAnthropic).not.toHaveBeenCalled();
  });
});
