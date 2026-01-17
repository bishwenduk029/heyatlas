import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  sourcemap: false,
  outDir: "dist",
  format: "esm",
  noExternal: [/.*/],  // Bundle all dependencies
  skipNodeModulesBundle: false,
  splitting: false,  // Single file output
});
