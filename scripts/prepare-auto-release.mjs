import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { nextReleaseVersion } from "./release-version.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function result(values) {
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT not set");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([key, value]) => key + "=" + value).join("\n") + "\n",
  );
}

const expected = process.env.CI_HEAD_SHA;
if (!/^[a-f0-9]{40}$/.test(expected ?? "")) throw new Error("Invalid CI commit SHA");
if (git("rev-parse", "HEAD") !== expected) throw new Error("Checked out SHA does not match successful CI run");
const currentMain = git("ls-remote", "origin", "refs/heads/main").split(/\s+/)[0];
if (currentMain !== expected) {
  console.log("Skipping old CI result: main has moved to a newer commit");
  result({ release: "false" });
  process.exit(0);
}

// Never publish twice for the same source commit.
const existing = git("tag", "--points-at", "HEAD").split(/\r?\n/).filter(Boolean);
if (existing.some((tag) => /^v\d+\.\d+\.\d+$/.test(tag))) {
  console.log("Skipping: this commit already has a release version tag");
  result({ release: "false" });
  process.exit(0);
}

const current = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const allTags = git("tag", "--list", "v*").split(/\r?\n/).filter(Boolean);
const version = nextReleaseVersion(current, allTags);
console.log("Validated main commit " + expected.slice(0, 12) + "; preparing v" + version);
result({ release: "true", version, tag: "v" + version });
