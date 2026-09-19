import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/next-env.d.ts', '.data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
  { files: ['**/*.tsx'], ...reactHooks.configs.flat.recommended },
  { files: ['**/*.tsx'], ...jsxA11y.flatConfigs.recommended },
  { files: ['**/*.mjs'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
