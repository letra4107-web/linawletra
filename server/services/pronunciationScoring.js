const stripDiacritics = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

const levenshtein = (a = '', b = '') => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

/**
 * Compute a similarity score (0-100) using edit distance with a non-linear falloff.
 * Applies a prefix-mismatch penalty multiplier (0.7) if the first 1-2 chars differ.
 */
export function computeTranscriptScore(expected = '', transcript = '') {
  const a = stripDiacritics(String(expected || '')).trim();
  const b = stripDiacritics(String(transcript || '')).trim();
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length, 1);
  const dist = levenshtein(a, b);
  const ratio = Math.max(0, 1 - dist / maxLen);
  // non-linear falloff
  const nonLinear = Math.pow(ratio, 1.6);
  let score = Math.round(Math.min(99, Math.max(0, 100 * nonLinear)));

  // prefix mismatch penalty for first 1-2 characters
  const prefixA = a.slice(0, 2);
  const prefixB = b.slice(0, 2);
  if (prefixA && prefixB && prefixA !== prefixB) {
    score = Math.round(score * 0.7);
  }

  return Math.max(0, Math.min(100, score));
}

export default { computeTranscriptScore };
