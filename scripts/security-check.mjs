import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);
const prohibited = [
  /(^|\/)\.env($|\.(?!example$)[^/]+$)/i,
  /(^|\/)(?:id_rsa|id_ed25519|myapp\.key|service-account\.json)$/i,
  /\.(?:pem|p12|pfx|sqlite3?)$/i,
];
const findings = [];
for (const path of tracked) {
  if (prohibited.some((pattern) => pattern.test(path))) {
    findings.push(`Arquivo sensível versionado: ${path}`);
    continue;
  }
  if (!/\.(?:ts|tsx|js|mjs|json|yml|yaml|toml|sql|md|example)$/.test(path) ||
      /(?:package-lock\.json|Cargo\.lock|coverage\/)/.test(path)) continue;
  const body = readFileSync(path, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(body)) {
    findings.push(`Chave privada encontrada: ${path}`);
  }
  if (/\b(?:sb_secret_[a-zA-Z0-9_-]{16,}|sk_(?:live|test)_[a-zA-Z0-9]{16,})\b/.test(body)) {
    findings.push(`Possível credencial de servidor: ${path}`);
  }
}
if (findings.length) {
  for (const finding of findings) console.error(finding);
  process.exit(1);
}
console.log("Verificação de segredos e arquivos sensíveis: OK");
