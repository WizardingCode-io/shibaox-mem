// Links to WizardingCode's site, tagged so the site can tell visits from the viewer apart.
// They open in a new tab without a referrer; the viewer itself never calls out.
export const SITE = "https://wizardingcode.io";
export const REPO = "https://github.com/WizardingCode-io/wizardingcode-mem";
export const siteLink = (content: string, path = "/"): string =>
  `${SITE}${path}?utm_source=wizardingcode-mem&utm_medium=app&utm_content=${encodeURIComponent(content)}`;
