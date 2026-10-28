const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(value) {
  const match = typeof value === "string" ? VERSION_PATTERN.exec(value) : null;
  if (!match) throw new Error("Invalid release version: " + String(value));
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("Version component exceeds safe integer range");
  return parts;
}

export function compareVersions(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

export function nextReleaseVersion(configuredVersion, gitTags) {
  const configured = parseVersion(configuredVersion);
  if (!Array.isArray(gitTags)) throw new Error("gitTags must be an array");
  const releaseTags = gitTags
    .filter((tag) => typeof tag === "string" && /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => parseVersion(tag.slice(1)));
  if (releaseTags.length === 0) return configuredVersion;
  const latest = releaseTags.reduce((highest, next) =>
    compareVersions(next, highest) > 0 ? next : highest,
  );
  if (compareVersions(configured, latest) > 0) return configuredVersion;
  if (!Number.isSafeInteger(latest[2] + 1)) throw new Error("Patch version exhausted");
  return latest[0] + "." + latest[1] + "." + (latest[2] + 1);
}
