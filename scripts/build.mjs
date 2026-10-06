import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const files = {
  "index.html": "text/html; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "collection-client.js": "text/javascript; charset=utf-8",
  "offer-planner.js": "text/javascript; charset=utf-8",
  "recipes.js": "text/javascript; charset=utf-8",
  "engine.js": "text/javascript; charset=utf-8",
  "model.js": "text/javascript; charset=utf-8",
  "offers.js": "text/javascript; charset=utf-8",
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
    readFileSync("worker/index.js", "utf8")
      .replace("./offers.js", "./offers-worker.js")
      .replace("../dist/model.js", "./model.js"),
);
for (const file of ["model.js", "recipes.js", "offers.js"])
  writeFileSync("dist/server/" + file, readFileSync("dist/" + file));
writeFileSync(
  "dist/server/offers-worker.js",
  readFileSync("worker/offers.js", "utf8").replace(
    "../dist/offers.js",
    "./offers.js",
  ),
);
writeFileSync(
  "dist/server/collection.js",
  readFileSync("worker/collection.js", "utf8")
    .replace("../dist/offers.js", "./offers.js")
    .replace("../dist/model.js", "./model.js")
    .replace(
      'import { buildHistory } from "./offers.js";',
      'import { buildHistory } from "./offers-worker.js";',
    ),
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
