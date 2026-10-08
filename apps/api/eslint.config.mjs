import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**"]),
  {
    files: ["src/**/*.ts", "test/**/*.ts", "drizzle.config.ts", "auth.cli.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
]);
