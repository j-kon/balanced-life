const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
module.exports = tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "eslint.config.js", "frontend/public/sw.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["frontend/public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
