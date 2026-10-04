// Opens (and therefore migrates) the database in the given directory, then exits.
import { openDb } from "../../src/store/db.ts";

const dir = process.argv[2];
if (dir === undefined) throw new Error("usage: open-db-worker <data-dir>");
openDb({ dataDir: dir, busyTimeoutMs: 5000 }).close();
