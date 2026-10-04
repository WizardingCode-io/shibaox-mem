import { Database } from "bun:sqlite";
import { join } from "node:path";
import { type SpikeResult, withTempDir } from "./support.ts";

const SCHEMA = `
CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body, content='notes', content_rowid='id',
  tokenize = "unicode61 remove_diacritics 2");
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body); END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body); END;
CREATE TRIGGER notes_au AFTER UPDATE OF title, body ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body); END;
`;

interface Hit {
  id: number;
  rank: number;
  snip: string;
}

/** Proves the exact FTS5 features the store relies on, against a database file on disk. */
export function fts5Spike(): Promise<SpikeResult> {
  return withTempDir((dir) => {
    const db = new Database(join(dir, "fts.db"), { create: true });
    try {
      db.run("PRAGMA journal_mode = WAL");
      db.run(SCHEMA);

      const insert = db.prepare("INSERT INTO notes (id, title, body) VALUES (?, ?, ?)");
      insert.run(1, "Migração da base de dados", "Usámos uma transação imediata.");
      insert.run(2, "Notas soltas", "A migração falhou uma vez; a migração foi repetida.");
      insert.run(3, "Outro assunto", "Nada a ver com o resto.");

      const search = db.query<Hit, [string]>(
        `SELECT rowid AS id, bm25(notes_fts, 10.0, 1.0) AS rank,
                snippet(notes_fts, 1, '[', ']', '…', 8) AS snip
           FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank`,
      );

      // The query has no diacritics; the stored text does.
      const hits = search.all("migracao");
      const diacriticFolding = hits.length === 2;
      const titleOutranksBody = hits[0]?.id === 1;
      const snippet = hits.some((hit) => hit.id === 2 && hit.snip.includes("[migração]"));

      db.run("UPDATE notes SET body = 'Sem a palavra.' WHERE id = 2");
      const staleAfterUpdate = search.all("migracao").filter((hit) => hit.id === 2).length;
      db.run("DELETE FROM notes WHERE id = 1");
      const staleAfterDelete = search.all("migracao").length;

      const options = db
        .query<{ compile_options: string }, []>("PRAGMA compile_options")
        .all()
        .map((row) => row.compile_options);
      const version = db.query<{ v: string }, []>("SELECT sqlite_version() AS v").get();

      return {
        spike: "fts5",
        ok:
          diacriticFolding &&
          titleOutranksBody &&
          snippet &&
          staleAfterUpdate === 0 &&
          staleAfterDelete === 0,
        diacriticFolding,
        titleOutranksBody,
        snippet,
        staleAfterUpdate,
        staleAfterDelete,
        sqliteVersion: version?.v ?? "unknown",
        fts5CompileOption: options.includes("ENABLE_FTS5"),
      };
    } finally {
      db.close();
    }
  });
}
