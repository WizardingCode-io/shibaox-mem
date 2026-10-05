-- The full-text index gains the project id as a searchable column, so that a search
-- can be confined to one project inside the index itself. Before this, a query first
-- matched every project's memories and only then kept the right project's: with tens of
-- thousands of memories from other projects, the prompt hook took over 100 ms.

DROP TRIGGER memories_ai;
DROP TRIGGER memories_ad;
DROP TRIGGER memories_au;
DROP TABLE memories_fts;

CREATE VIRTUAL TABLE memories_fts USING fts5(
  title, body, terms, project_id,
  content='memories', content_rowid='id',
  tokenize = "unicode61 remove_diacritics 2"
);
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, body, terms, project_id)
    VALUES (new.id, new.title, new.body, new.terms, new.project_id);
END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms, project_id)
    VALUES ('delete', old.id, old.title, old.body, old.terms, old.project_id);
END;
CREATE TRIGGER memories_au AFTER UPDATE OF title, body, terms, project_id ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms, project_id)
    VALUES ('delete', old.id, old.title, old.body, old.terms, old.project_id);
  INSERT INTO memories_fts(rowid, title, body, terms, project_id)
    VALUES (new.id, new.title, new.body, new.terms, new.project_id);
END;

INSERT INTO memories_fts(memories_fts) VALUES ('rebuild');
