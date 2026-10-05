import { startUi } from "../../ui/server.ts";
import { defaultDataDir } from "../../util/paths.ts";
import { EXIT_USAGE } from "../exit.ts";

const USAGE = "Usage: shibaox-mem ui [--port <n>] [--no-open]\n";

/**
 * `shibaox-mem ui`: opens the viewer in the browser. Loopback only, token in the URL,
 * stops by itself after half an hour without requests.
 */
export async function run(argv: string[]): Promise<number> {
  const at = argv.indexOf("--port");
  const port = at === -1 ? 0 : Number(argv[at + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`shibaox-mem ui: --port takes a port number\n${USAGE}`);
    return EXIT_USAGE;
  }
  const server = await startUi({
    dataDir: defaultDataDir(),
    port,
    open: !argv.includes("--no-open"),
    onIdle: () => {
      process.stdout.write("shibaox-mem ui: no requests for a while, stopping.\n");
      process.exit(0);
    },
  });
  process.stdout.write(`shibaox-mem ui: ${server.url}\n`);
  await new Promise<void>((resolve) => {
    const bye = () => void server.stop().then(resolve);
    process.once("SIGINT", bye);
    process.once("SIGTERM", bye);
  });
  return 0;
}
