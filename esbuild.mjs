#!/usr/bin/env node

import esbuild from "esbuild";

/**
 * @type {import("esbuild").BuildOptions}
 */
const base = {
  bundle: true,
  minify: false,
  outbase: "src",
  outdir: "build",
  sourcemap: true,
  platform: "node",
  // Add external dependencies if needed
  // external: ["dependency1", "dependency2"],
};

/**
 * @type {import("esbuild").BuildOptions}
 */
const cjs = {
  ...base,
  format: "cjs",
  outExtension: {
    ".js": ".cjs",
  },
};

/**
 * @type {import("esbuild").BuildOptions}
 */
const esm = {
  ...base,
  format: "esm",
  outExtension: {
    ".js": ".mjs",
  },
};

await Promise.all(
  [esm, cjs].map((config) =>
    esbuild.build({
      ...config,
      entryPoints: ["./src/index.ts", "./src/cli.ts"],
      // If you have external dependencies, list them here
      // external: ["dependency1", "dependency2"],
    }),
  ),
);
