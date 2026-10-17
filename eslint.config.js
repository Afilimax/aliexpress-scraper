const prettier = require("eslint-plugin-prettier")
const unusedImports = require("eslint-plugin-unused-imports")
const prettierConfig = require("eslint-config-prettier")
const tsParser = require("@typescript-eslint/parser")
const tsPlugin = require("@typescript-eslint/eslint-plugin")

module.exports = [
    {
        ignores: ["dist/**", "node_modules/**"],
    },
    {
        files: ["src/**/*.ts", "__tests__/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
            },
        },
        plugins: {
            prettier: prettier,
            "unused-imports": unusedImports,
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            ...prettierConfig.rules,
            "prettier/prettier": "error",
            "no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    varsIgnorePattern: "^_",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                },
            ],
        },
    },
]
