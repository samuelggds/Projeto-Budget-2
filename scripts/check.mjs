import { execSync } from "child_process";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

let output = "";
let errorCount = 0;
const errors = [];

try {
  execSync("tsc --noEmit", { stdio: "pipe" });
} catch (e) {
  output = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  const lines = output.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (match) {
      errorCount++;
      errors.push({
        file: match[1],
        line: match[2],
        col: match[3],
        code: match[4],
        msg: match[5],
      });
    }
  }
}

const passed = errorCount === 0;

// ── Header ────────────────────────────────────────────────────────────────────
console.log();
console.log(
  `${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗${RESET}`,
);
console.log(
  `${BOLD}${CYAN}║         TypeScript Check — mg-orcamentos                 ║${RESET}`,
);
console.log(
  `${BOLD}${CYAN}╠══════════════════════════════════════════════════════════╣${RESET}`,
);

// ── Status row ────────────────────────────────────────────────────────────────
const status = passed
  ? `${GREEN}${BOLD}  ✔  PASSOU — Nenhum erro encontrado${RESET}`
  : `${RED}${BOLD}  ✖  FALHOU — ${errorCount} erro(s) encontrado(s)${RESET}`;
console.log(
  `${BOLD}${CYAN}║${RESET} ${status.padEnd(75)}${BOLD}${CYAN}║${RESET}`,
);
console.log(
  `${BOLD}${CYAN}╚══════════════════════════════════════════════════════════╝${RESET}`,
);

// ── Error table ───────────────────────────────────────────────────────────────
if (errors.length > 0) {
  const W = { file: 38, ln: 5, code: 8, msg: 40 };
  const divider = `${DIM}${"─".repeat(W.file + 2)}┬${"─".repeat(W.ln + 2)}┬${"─".repeat(W.code + 2)}┬${"─".repeat(W.msg + 2)}${RESET}`;
  const cell = (v, w) => String(v).slice(0, w).padEnd(w);

  console.log();
  console.log(
    `${BOLD} ${"Arquivo".padEnd(W.file)}  ${"Linha".padEnd(W.ln)}  ${"Código".padEnd(W.code)}  ${"Mensagem".padEnd(W.msg)}${RESET}`,
  );
  console.log(divider);
  for (const e of errors) {
    const fileDisplay = e.file
      .replace(/\\/g, "/")
      .split("/")
      .slice(-3)
      .join("/");
    console.log(
      `${RED} ${cell(fileDisplay, W.file)}${RESET}  ` +
        `${YELLOW}${cell(e.line + ":" + e.col, W.ln)}${RESET}  ` +
        `${CYAN}${cell(e.code, W.code)}${RESET}  ` +
        `${cell(e.msg, W.msg)}`,
    );
  }
  console.log(divider);
  console.log();
}

console.log();
process.exit(passed ? 0 : 1);
