import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // async setState inside .catch/.finally is safe; rule has false positives on promise chains
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: { globals: globals.node },
  },
);
