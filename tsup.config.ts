import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: { resolve: true },
  tsconfig: "tsconfig.dts.json",
  clean: true,
  sourcemap: true,
  target: "es2022",
});
