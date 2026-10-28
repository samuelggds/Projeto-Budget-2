import { readFileSync, writeFileSync } from "node:fs";
import { parseVersion } from "./release-version.mjs";

const version = process.env.RELEASE_VERSION;
parseVersion(version);
const filename = "src-tauri/tauri.conf.json";
const config = JSON.parse(readFileSync(filename, "utf8"));
if (typeof config.version !== "string") throw new Error("Tauri config.version is missing");
config.version = version;
writeFileSync(filename, JSON.stringify(config, null, 2) + "\n");
console.log("Tauri release version set to " + version + " for this build only");
