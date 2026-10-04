import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const files = {
  "index.html": "text/html; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "recipes.js": "text/javascript; charset=utf-8",
  "engine.js": "text/javascript; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
  "latest-data.json": "application/json",
  "assets/ukesmat.webp": "image/webp",
};
const assets = {};
for (const [name, type] of Object.entries(files)) {
  const base64 = type.startsWith("image/");
  assets["/" + name] = {
    type,
    base64,
    body: readFileSync("dist/" + name, base64 ? "base64" : "utf8"),
  };
}
mkdirSync("dist/server", { recursive: true });
mkdirSync("dist/.openai", { recursive: true });
writeFileSync(
  "dist/server/index.js",
  "const ASSETS=" +
    JSON.stringify(assets) +
    ";\n" +
    readFileSync("worker/index.js", "utf8"),
);
writeFileSync(
  "dist/.openai/hosting.json",
  readFileSync(".openai/hosting.json"),
);
console.log(
  "Built worker, durable profiles and " +
    Object.keys(assets).length +
    " assets",
);
