import js from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

const scannerRulesDisabledForTests = Object.fromEntries(
	obsidianmd.configs.recommended.flatMap((config) => Object.keys(config.rules ?? {})).map((rule) => [rule, 'off']),
);

const recommendedTestRules = Object.assign(
	{},
	js.configs.recommended.rules,
	...tseslint.configs.recommended.map((config) => config.rules ?? {}),
);

export default tseslint.config(
	{
		ignores: ['build/', 'node_modules/', 'Temp/', 'scripts/', 'esbuild.config.mjs'],
	},
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.{ts,cts,mts,tsx}'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			'obsidianmd/ui/sentence-case': [
				'warn',
				{
					brands: ['Acaia', 'Pearl S', 'Bluetooth', 'BLE', 'Obsidian', 'GitHub', 'CubicJ Brewing', '°C'],
					acronyms: ['RPM', 'MB', 'UI', '°C'],
					enforceCamelCaseLower: true,
				},
			],
		},
	},
	{
		files: ['src/i18n/locales/en.json'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				extraFileExtensions: ['.json'],
				project: false,
			},
		},
		rules: {
			'no-unused-expressions': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'obsidianmd/ui/sentence-case-json': [
				'warn',
				{
					brands: ['Acaia', 'Pearl S', 'Bluetooth', 'BLE', 'Obsidian', 'GitHub', 'CubicJ Brewing', '°C'],
					acronyms: ['RPM', 'MB', 'UI', '°C'],
					enforceCamelCaseLower: true,
				},
			],
		},
	},
	{
		files: ['tests/**/*.ts'],
		...tseslint.configs.disableTypeChecked,
		rules: {
			...tseslint.configs.disableTypeChecked.rules,
			...scannerRulesDisabledForTests,
			...recommendedTestRules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-require-imports': 'off',
			'no-empty': 'error',
		},
	},
);
