import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**"]),
  {
    files: ["src/**/*.ts", "drizzle.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
]);
