const JIRA_KEY_RE = /^[A-Z]+-\d+$/;
const JIRA_URL_RE = /\/browse\/([A-Z]+-\d+)/i;

export function parseStoryKeys(raw) {
  return raw
    .split(',')
    .map((s) => {
      const trimmed = s.trim().toUpperCase();
      const urlMatch = trimmed.match(JIRA_URL_RE);
      return urlMatch ? urlMatch[1] : trimmed;
    })
    .filter((k) => k && JIRA_KEY_RE.test(k))
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, 10);
}

export function getInvalidKeys(raw) {
  return raw
    .split(',')
    .map((s) => {
      const trimmed = s.trim().toUpperCase();
      const urlMatch = trimmed.match(JIRA_URL_RE);
      return urlMatch ? urlMatch[1] : trimmed;
    })
    .filter((k) => k && !JIRA_KEY_RE.test(k));
}
