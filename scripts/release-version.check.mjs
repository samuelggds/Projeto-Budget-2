import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, nextReleaseVersion, parseVersion } from "./release-version.mjs";

test("parses strict numeric versions", () => {
  assert.deepEqual(parseVersion("0.4.10"), [0, 4, 10]);
  for (const value of ["v0.4.10", "0.4", "01.4.10", "1.2.3-beta", "1.2.3.4", "1.2.-1"]) {
    assert.throws(() => parseVersion(value));
  }
});

test("compares numeric semver rather than strings", () => {
  assert.equal(compareVersions([0, 4, 10], [0, 4, 9]), 1);
  assert.equal(compareVersions([1, 0, 0], [0, 99, 99]), 1);
  assert.equal(compareVersions([0, 4, 10], [0, 4, 10]), 0);
});

test("increments latest release patch for automatic updates", () => {
  assert.equal(nextReleaseVersion("0.4.10", ["v0.4.9", "v0.4.10"]), "0.4.11");
  assert.equal(nextReleaseVersion("0.4.10", ["v0.4.11", "v0.4.9"]), "0.4.12");
});

test("respects an intentional major or minor version bump", () => {
  assert.equal(nextReleaseVersion("0.5.0", ["v0.4.10"]), "0.5.0");
  assert.equal(nextReleaseVersion("1.0.0", ["v0.4.10"]), "1.0.0");
});

test("ignores prerelease tags and handles empty tag list", () => {
  assert.equal(nextReleaseVersion("0.4.10", ["v0.4.10-beta", "build-99"]), "0.4.10");
  assert.equal(nextReleaseVersion("0.4.10", []), "0.4.10");
});
