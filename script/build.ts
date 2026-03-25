import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// Dependencies to bundle (reduces cold start)
const allowlist = [
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "hono",
  "@hono/node-server",
  "@upstash/redis",
  "postgres",
  "zod",
  "zod-validation-error",
  "dotenv",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server (node)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  // Node.js server build (for local dev / non-Workers deploy)
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.mjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
    banner: {
      js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
    },
  });

  // Cloudflare Workers build
  // Uses platform: "node" because Workers with nodejs_compat supports Node builtins
  // (postgres driver needs net, tls, crypto, stream, etc.)
  console.log("building worker...");
  await esbuild({
    entryPoints: ["server/worker.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/worker.mjs",
    conditions: ["worker", "workerd", "node"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    logLevel: "info",
    // Don't externalize anything — bundle everything into the worker
    external: [],
    // No banner — Workers doesn't have import.meta.url for createRequire
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
