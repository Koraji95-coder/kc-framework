# @chamber-19/stylelint-config

Shared [stylelint](https://stylelint.io) configuration for Chamber 19. Enforces the rules documented in [`chamber-19/.github → docs/skills/CSS_DISCIPLINE.md`](https://github.com/chamber-19/.github/blob/main/docs/skills/CSS_DISCIPLINE.md).

Every error message includes a reference back to that skill file so contributors and AI agents always have a clear path to the canonical rule.

## Install

```bash
npm install --save-dev stylelint @chamber-19/stylelint-config
```

## Use

Add a `.stylelintrc.json` to the repo root:

```json
{ "extends": ["@chamber-19/stylelint-config"] }
```

Or inline it in `package.json`:

```json
{
  "stylelint": {
    "extends": ["@chamber-19/stylelint-config"]
  }
}
```

Add a script:

```json
{
  "scripts": {
    "lint:css": "stylelint \"**/*.{css,scss}\" --max-warnings 0",
    "lint:css:fix": "stylelint \"**/*.{css,scss}\" --fix"
  }
}
```

Run with `--max-warnings 0` to fail the build on any violation — there is no acceptable tier between "violation" and "fine."

## What it enforces

| Rule | What it blocks |
| --- | --- |
| `color-no-hex` | Direct hex colors (`#1C1B19`). Use `--ch-*` tokens. |
| `declaration-no-important` | `!important`. Fix the cascade at the source. |
| `selector-max-type: 0` | Naked element selectors (`h1 { ... }`) in component CSS. Use classes. |
| `selector-class-pattern` | Non-kebab-case class names. BEM modifiers allowed. |
| `custom-property-pattern` | CSS variables outside `--ch-*` / `--component-name` / `--_internal`. |
| Plus all `stylelint-config-standard` rules | Standard hygiene. |

## Exempted files

These file patterns are explicitly exempted from `color-no-hex` because hex is legitimate there:

- `_tokens.css`, `tokens/**/*.css`, `_tokens.scss` — canonical token definitions
- `_theme.override.css`, `_theme.override.scss` — the extension slot pattern

Naked element selectors are exempted from `selector-max-type` in:

- `_reset.css`, `reset.css` — the single per-repo reset file

The toolkit's own `splash.css`, `ReleaseNotes.css`, `UpdateModal.css`, `activation.css`, and `updater.css` are grandfathered as they finish their token-extraction sweep. Those exemptions will be removed once the sweep lands.

## Error message format

```text
src/components/Foo.css:42:5
✖ Chamber 19 toolkit rule color-no-hex: direct hex color disallowed.
  Reference a --ch-* token from desktop-toolkit/src/theme, or extend via
  _theme.override.css. See chamber-19/.github → docs/skills/CSS_DISCIPLINE.md.
```

## CI integration

Run stylelint in the same job that runs Biome and your tests. Example GitHub Actions step:

```yaml
- name: Lint CSS
  run: npm run lint:css
```

Add a pre-commit hook (husky / lefthook) running the same script so violations are caught before push.

## Adding new rules

Rule additions land in this package, not in consumer-app overrides. The flow:

1. Propose the rule in a PR to `chamber-19/desktop-toolkit`
2. Bump the version (semver: patch for additive non-breaking, minor for additive that creates new failures, major for incompatible changes)
3. Update `CSS_DISCIPLINE.md` in `chamber-19/.github` to document the new rule
4. Consumer apps bump the toolkit pin and fix the new violations

Consumer apps should not override rules from this config in their own `.stylelintrc.json` — that defeats the discipline. If a rule is wrong, fix the rule here.
