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
			'obsidianmd/prefer-window-timers': 'off',
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
