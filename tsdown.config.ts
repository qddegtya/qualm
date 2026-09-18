import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  // Dual output: an ESM consumer gets ESM, a CJS consumer gets a real require-able build.
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // publint runs on release; attw runs from its own script.
  publint: "ci-only",
});
