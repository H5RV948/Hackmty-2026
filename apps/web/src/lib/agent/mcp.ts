/**
 * Cliente MCP del frontend.
 *
 * El servidor MCP (apps/mcp) es la unica fuente de datos y de acciones del
 * banco. El LLM decide QUE mostrar; estas tools deciden CUANTO CUESTA.
 *
 * Regla dura (AGENTS.md #5): las tools `write` no se ejecutan sin
 * confirmacion explicita del usuario. Aqui no se filtra nada: el servidor ya
 * rechaza `apply_restructure_plan` si `confirmadoPorUsuario` es false, y esa
 * validacion tiene que vivir del lado del servidor, no del prompt.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_SERVER_URL ?? "http://mcp:8787/mcp";

/** Declaracion de funcion en el formato que espera Gemini. */
export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

export type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
};

export type ToolResult = {
  name: string;
  args: Record<string, unknown>;
  text: string;
  isError: boolean;
};

/**
 * Gemini acepta un subconjunto de JSON Schema (estilo OpenAPI). Zod genera
 * claves que rechaza (`$schema`, `additionalProperties`, `anyOf`...), asi que
 * copiamos solo lo que entiende. Si un dia una tool usa un schema mas raro,
 * esto es lo primero que hay que ampliar.
 */
function toGeminiSchema(input: unknown): JsonSchema {
  if (typeof input !== "object" || input === null) return { type: "object" };
  const schema = input as Record<string, unknown>;

  const out: JsonSchema = {};
  if (typeof schema.type === "string") out.type = schema.type;
  if (typeof schema.description === "string") out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (Array.isArray(schema.required)) {
    out.required = schema.required.filter((r): r is string => typeof r === "string");
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);

  if (schema.properties && typeof schema.properties === "object") {
    const props: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = toGeminiSchema(value);
    }
    out.properties = props;
  }

  // Gemini rechaza un OBJECT sin properties.
  if (out.type === "object" && !out.properties) out.properties = {};
  if (!out.type) out.type = "object";

  return out;
}

export type McpSession = {
  declarations: ToolDeclaration[];
  call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  close: () => Promise<void>;
};

/**
 * Abre una sesion MCP por request. El servidor crea un transport nuevo en cada
 * llamada a /mcp (ver la deuda tecnica anotada en docs/STATUS.md), asi que no
 * conviene cachear el cliente entre requests todavia.
 */
export async function openMcpSession(): Promise<McpSession> {
  const client = new Client({ name: "banorte-web", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));

  const { tools } = await client.listTools();

  const declarations: ToolDeclaration[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    parameters: toGeminiSchema(tool.inputSchema),
  }));

  const call = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> => {
    try {
      const result = await client.callTool({ name, arguments: args });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((part) =>
          typeof part === "object" && part !== null && "text" in part
            ? String((part as { text: unknown }).text)
            : "",
        )
        .filter(Boolean)
        .join("\n");
      return { name, args, text, isError: result.isError === true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name, args, text: `La tool fallo: ${message}`, isError: true };
    }
  };

  return {
    declarations,
    call,
    close: async () => {
      await client.close();
    },
  };
}
