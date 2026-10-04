import { type SpikeResult, selfCommand, within } from "./support.ts";

const TIMEOUT_MS = 10_000;
const EXIT_GRACE_MS = 3000;

/** A one-tool stdio server built with the official SDK, loaded only by this command. */
export async function mcpServer(): Promise<void> {
  const { McpServer } = await import("@modelcontextprotocol/server");
  const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");
  const { z } = await import("zod");

  const server = new McpServer({ name: "ai-mem-spike", version: "0.0.0" });
  server.registerTool(
    "echo",
    { description: "Echo the text back", inputSchema: z.object({ text: z.string() }) },
    async ({ text }) => ({ content: [{ type: "text", text }] }),
  );
  await server.connect(new StdioServerTransport());
}

interface RpcMessage {
  id?: number;
  result?: Record<string, unknown>;
  error?: unknown;
}

/** Speaks raw JSON-RPC over pipes, so the check does not depend on a client SDK. */
export async function mcpSpike(): Promise<SpikeResult> {
  const proc = Bun.spawn(selfCommand("__spike", "mcp-server"), {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const nextMessage = async (): Promise<RpcMessage> => {
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line !== "") return JSON.parse(line) as RpcMessage;
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("server closed stdout before answering");
      buffer += decoder.decode(value, { stream: true });
    }
  };

  const send = (message: Record<string, unknown>) => {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    proc.stdin.flush();
  };

  const request = async (id: number, method: string, params: Record<string, unknown>) => {
    send({ id, method, params });
    for (;;) {
      const message = await nextMessage();
      if (message.id === id) return message;
    }
  };

  const checks = { initialize: false, toolsList: false, toolsCall: false };
  let protocolVersion: unknown;
  let failure: string | undefined;

  const conversation = (async () => {
    const init = await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "ai-mem-spike-client", version: "0.0.0" },
    });
    protocolVersion = init.result?.protocolVersion;
    checks.initialize =
      (init.result?.serverInfo as { name?: string } | undefined)?.name === "ai-mem-spike";
    send({ method: "notifications/initialized" });

    const list = await request(2, "tools/list", {});
    const tools = (list.result?.tools ?? []) as { name?: string }[];
    checks.toolsList = tools.some((tool) => tool.name === "echo");

    const call = await request(3, "tools/call", { name: "echo", arguments: { text: "olá" } });
    const content = (call.result?.content ?? []) as { type?: string; text?: string }[];
    checks.toolsCall = content[0]?.type === "text" && content[0]?.text === "olá";
  })();

  try {
    await within(TIMEOUT_MS, conversation);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  // A server must leave when its client does, or every closed session leaks a process.
  proc.stdin.end();
  const exited = await within(EXIT_GRACE_MS, proc.exited).then(
    () => true,
    () => false,
  );
  if (!exited) proc.kill();
  const stderr = (await new Response(proc.stderr).text()).trim();

  return {
    spike: "mcp",
    ok: Object.values(checks).every(Boolean) && exited && failure === undefined,
    ...checks,
    exitsOnStdinClose: exited,
    protocolVersion,
    ...(failure === undefined ? {} : { failure }),
    ...(stderr === "" ? {} : { serverStderr: stderr.slice(0, 300) }),
  };
}
