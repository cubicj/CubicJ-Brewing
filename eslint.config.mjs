import js from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

const obsidianmdRecommendedRules = Object.fromEntries(
	obsidianmd.configs.recommended
		.flatMap((config) => Object.entries(config.rules ?? {}))
		.filter(([rule]) => rule.startsWith('obsidianmd/')),
);

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				project: false,
			},
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-require-imports': 'off',
			'no-empty': ['error', { allowEmptyCatch: true }],
		},
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
			},
		},
		plugins: {
			obsidianmd,
		},
		rules: {
			...obsidianmdRecommendedRules,
			'@typescript-eslint/no-floating-promises': 'warn',
			'@typescript-eslint/no-misused-promises': 'warn',
			'@typescript-eslint/no-unnecessary-type-assertion': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
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
		plugins: {
			obsidianmd,
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
		ignores: ['build/', 'node_modules/', 'Temp/', 'scripts/', 'esbuild.config.mjs'],
	},
);
