import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// UTF-8 bytes read as Windows-1252 often form these two-character sequences.
const mojibake = /[\u00C2\u00C3][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013-\u201A\u201C-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]|\u00E2\u20AC|\uFFFD/gu;

const interfaceText = {
  rules: {
    "no-mojibake": {
      create(context) {
        const source = context.sourceCode;
        return {
          Program() {
            for (const match of source.text.matchAll(mojibake)) {
              context.report({
                loc: {
                  start: source.getLocFromIndex(match.index),
                  end: source.getLocFromIndex(match.index + match[0].length),
                },
                message: "Possible text encoding corruption. Verify this sequence and save the file as UTF-8.",
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/**/*.{tsx,ts,jsx,js}"],
    plugins: { "interface-text": interfaceText },
    rules: { "interface-text/no-mojibake": "error" },
  },
  {
    files: ["tests/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "supabase/functions/**",
    ],
  },
];

export default eslintConfig;
