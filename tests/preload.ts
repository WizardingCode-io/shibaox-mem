// Loaded before every test file (bunfig.toml). Hooks run from tests must never start a
// viewer or open a browser on the developer's machine: the switches are off unless a test
// turns them on for itself. Child processes inherit them through process.env.
process.env.SHIBAOX_MEM_UI_AUTO_OPEN ??= "off";
process.env.SHIBAOX_MEM_UI_BROWSER ??= "none";
