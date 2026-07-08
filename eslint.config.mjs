import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
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
		files: ['build/**/*.mjs'],
		languageOptions: {
			globals: {
				console: 'readonly',
				process: 'readonly',
			},
		},
	},
	{
		ignores: ['main.js', 'node_modules/', 'Temp/', 'scripts/', 'esbuild.config.mjs'],
	},
);
