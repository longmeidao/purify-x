import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(root, "purify-x.user.js");
const metadataPath = path.join(root, "src", "userscript.meta.js");
const sections = [
  "src/runtime/00-foundation.js",
  "src/core/10-matching.js",
  "src/runtime/20-state-and-ai.js",
  "src/settings/30-lists-and-panel.js",
  "src/sources/40-remote.js",
  "src/core/50-scoring.js",
  "src/runtime/60-x-state.js",
  "src/ui/70-presentation.js",
  "src/runtime/80-scanning.js",
  "src/ui/90-styles.js",
  "src/runtime/99-bootstrap.js",
];

async function render() {
  const inputs = [
    metadataPath,
    ...sections.map((relativePath) => path.join(root, relativePath)),
  ];
  const chunks = await Promise.all(
    inputs.map((input) => readFile(input, "utf8")),
  );
  return chunks.join("");
}

const output = await render();
if (process.argv.includes("--check")) {
  const current = await readFile(artifactPath, "utf8");
  if (current !== output) {
    process.stderr.write(
      "purify-x.user.js 不是由当前模块源码生成，请运行 npm run build。\n",
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(artifactPath, output, "utf8");
  process.stdout.write("已生成 purify-x.user.js。\n");
}
