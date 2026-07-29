import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const compatibility = new FlatCompat({ baseDirectory: currentDirectory });

export default [
  {
    ignores: [
      ".next/**",
      "apps/mobile/**",
      "node_modules/**",
    ],
  },
  ...compatibility.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The existing Supabase data layer is intentionally ungenerated and
      // uses dynamic rows throughout. Keep lint useful without turning this
      // mobile feature into a repository-wide typing migration.
      "@typescript-eslint/no-explicit-any": "off",
      // These React 19 compiler diagnostics were not enforced by the legacy
      // Next.js lint command and require broad component refactors.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
];
