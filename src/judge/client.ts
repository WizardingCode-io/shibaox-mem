// The TypeSafe System One endpoint, called directly: one POST, typed answers back.
// No SDK: a hook needs a hard deadline, no hidden retries and one place where the key
// is used. Contract: https://docs.typesafe.ai/api.md

export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const MODEL = "jev-latest";

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: "score";
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    };

export interface SystemOneRequest {
  state: unknown;
  questions: Record<string, Question>;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export type ErrorKind =
  | "auth" // the key was rejected: no point retrying until it changes
  | "invalid" // the request was malformed: our bug, not the service's
  | "rate" // 429
  | "overloaded" // 529
  | "server" // any other 5xx
  | "network"
  | "timeout";

export class TypeSafeError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TypeSafeError";
  }
}

export interface ClientOptions {
  apiKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  /** Where to send the request; the public endpoint unless told otherwise. */
  endpoint?: string;
}

function kindOf(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 422 || status === 400) return "invalid";
  if (status === 429) return "rate";
  if (status === 529) return "overloaded";
  return "server";
}

/** One request, one deadline. The error message never contains the key or the body. */
export async function systemOne(
  request: SystemOneRequest,
  options: ClientOptions,
): Promise<SystemOneResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(options.endpoint ?? ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, ...request }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new TypeSafeError("timeout", `no answer within ${options.timeoutMs} ms`);
      }
      throw new TypeSafeError("network", "request failed");
    }
    if (!response.ok) {
      throw new TypeSafeError(kindOf(response.status), `HTTP ${response.status}`, response.status);
    }
    const body = (await response.json()) as Partial<SystemOneResponse>;
    if (body.answers === null || typeof body.answers !== "object") {
      throw new TypeSafeError("server", "response without answers", response.status);
    }
    return {
      model: typeof body.model === "string" ? body.model : "",
      answers: body.answers,
      usage: {
        input_tokens: body.usage?.input_tokens ?? 0,
        output_tokens: body.usage?.output_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
