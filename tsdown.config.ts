import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // publint runs on release; attw runs from its own script (it needs explicit rule exceptions).
  publint: "ci-only",
});
