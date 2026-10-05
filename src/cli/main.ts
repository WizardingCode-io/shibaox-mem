#!/usr/bin/env bun
import pkg from "../../package.json" with { type: "json" };
import { EXIT_USAGE } from "./exit.ts";

export interface CommandModule {
  run(argv: string[]): Promise<number> | number;
}

// Each command is loaded on demand so that hooks never pay for code they do not run.
const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  hook: () => import("./commands/hook.ts"),
  distill: () => import("./commands/distill.ts"),
  mcp: () => import("./commands/mcp.ts"),
  install: () => import("./commands/install.ts"),
  uninstall: () => import("./commands/uninstall.ts"),
  status: () => import("./commands/status.ts"),
  doctor: () => import("./commands/doctor.ts"),
  __spike: () => import("./commands/spike.ts"),
};

const USAGE = `ai-mem ${pkg.version} — persistent memory for coding agents

Usage: ai-mem <command> [options]

Options:
  -v, --version   Print the version
  -h, --help      Print this help
`;

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "--help" || name === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (name === "--version" || name === "-v") {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  const load = COMMANDS[name];
  if (load === undefined) {
    process.stderr.write(`ai-mem: unknown command "${name}"\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  const command = await load();
  return await command.run(rest);
}

// No top-level await: bytecode builds are emitted as CommonJS.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`ai-mem: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
