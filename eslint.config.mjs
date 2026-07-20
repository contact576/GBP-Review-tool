import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });

const config = [
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "drizzle/**"] },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
