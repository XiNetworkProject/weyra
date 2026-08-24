// Lance le serveur de développement Next.js en appelant le CLI directement
// avec node (évite les shims .cmd qui peuvent se bloquer sous Windows) et en
// filtrant un éventuel "--" littéral forwardé par pnpm (`pnpm run dev -- --port`).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const forwarded = process.argv.slice(2).filter((arg) => arg !== "--");

const child = spawn(process.execPath, [nextBin, "dev", "--turbopack", ...forwarded], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
