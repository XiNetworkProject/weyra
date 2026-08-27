import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import prettier from "prettier";

const root = path.resolve(import.meta.dirname, "..");
const write = process.argv.includes("--write");
const supportedExtensions = new Set([".css", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml"]);
const ignoredFiles = new Set(["pnpm-lock.yaml"]);

function gitLines(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf-8" })
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const configuredBase = process.env.FORMAT_BASE_SHA?.trim();
const changed = configuredBase
  ? gitLines(["diff", "--name-only", "--diff-filter=ACMR", `${configuredBase}..HEAD`, "--"])
  : gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"]);
const untracked = process.env.CI ? [] : gitLines(["ls-files", "--others", "--exclude-standard"]);
const files = [...new Set([...changed, ...untracked])].filter(
  (file) => supportedExtensions.has(path.extname(file)) && !ignoredFiles.has(file),
);

if (files.length === 0) {
  console.log("No changed files require formatting checks.");
  process.exit(0);
}

const invalid = [];
for (const file of files) {
  const filePath = path.join(root, file);
  const source = await readFile(filePath, "utf-8");
  const options = await prettier.resolveConfig(filePath);
  const formatted = await prettier.format(source, { ...options, filepath: filePath });
  if (formatted === source) continue;

  if (write) {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(filePath, formatted, "utf-8"));
  } else {
    invalid.push(file);
  }
}

if (invalid.length > 0) {
  console.error(`Formatting required:\n${invalid.map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}

console.log(`${write ? "Formatted" : "Checked"} ${files.length} changed file(s).`);
