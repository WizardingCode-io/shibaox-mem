import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isCompiled, type SpikeResult, selfCommand, withTempDir } from "./support.ts";

const NAME = "SHIBAOX_MEM_SPIKE_DOTENV";

export function envProbe(name: string): "present" | "absent" {
  return process.env[name] === undefined ? "absent" : "present";
}

/**
 * A hook runs with the user's project as its working directory. This checks that the
 * binary does not pull that project's .env or bunfig.toml into its own environment.
 */
export function dotenvSpike(): Promise<SpikeResult> {
  return withTempDir((dir) => {
    writeFileSync(join(dir, ".env"), `${NAME}=leaked\n`);
    writeFileSync(join(dir, "bunfig.toml"), `[run]\nbun = true\n`);
    const env = { ...process.env };
    delete env[NAME];
    const proc = Bun.spawnSync(selfCommand("__spike", "env-probe", NAME), {
      cwd: dir,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const leaked = proc.stdout.toString().trim() !== "absent";
    const compiled = isCompiled();
    return {
      spike: "dotenv",
      // Running from source autoloads .env by design, so only a compiled binary is judged.
      ok: proc.exitCode === 0 && (!compiled || !leaked),
      compiled,
      leaked,
    };
  });
}
