/**
 * @chamber-19/stylelint-config
 *
 * Chamber 19 shared stylelint config. Enforces the rules documented in
 * `chamber-19/.github → docs/skills/CSS_DISCIPLINE.md`. Every error message
 * references that skill file so authors and AI agents always have a clear
 * path back to the canonical rule.
 *
 * Consumer apps adopt this config by adding a `.stylelintrc.json`:
 *
 *   { "extends": ["@chamber-19/stylelint-config"] }
 *
 * Or in `package.json`:
 *
 *   "stylelint": { "extends": ["@chamber-19/stylelint-config"] }
 *
 * Run with `--max-warnings 0` to make warnings fail the build.
 */

const SKILL_REF = "chamber-19/.github → docs/skills/CSS_DISCIPLINE.md";

const message = (rule, body) =>
  `Chamber 19 toolkit rule ${rule}: ${body} See ${SKILL_REF}.`;

export default {
  extends: ["stylelint-config-standard"],

  rules: {
    // ── Token contract ────────────────────────────────────────────────
    "color-no-hex": [
      true,
      {
        message: message(
          "color-no-hex",
          "direct hex color disallowed. Reference a --ch-* token from desktop-toolkit/src/theme, or extend via _theme.override.css.",
        ),
      },
    ],

    // ── Cascade discipline ────────────────────────────────────────────
    "declaration-no-important": [
      true,
      {
        message: message(
          "declaration-no-important",
          "!important disallowed. The cascade is fighting this rule — find the source selector outranking it and scope that, instead of band-aiding.",
        ),
      },
    ],

    // ── Selector hygiene ──────────────────────────────────────────────
    "selector-max-type": [
      0,
      {
        message: message(
          "selector-max-type",
          "naked element selector (h1, p, button, etc.) disallowed in component CSS. Component styles use classes only — naked element selectors belong in _reset.css.",
        ),
      },
    ],

    "selector-class-pattern": [
      "^[a-z][a-z0-9-]*(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?$",
      {
        message: message(
          "selector-class-pattern",
          "class names must be kebab-case (BEM-style modifiers allowed: .block, .block__element, .block--modifier). No camelCase, snake_case, or PascalCase.",
        ),
      },
    ],

    "custom-property-pattern": [
      "^(ch-[a-z0-9-]+|_[a-z][a-z0-9-]*|[a-z][a-z0-9-]*)$",
      {
        message: message(
          "custom-property-pattern",
          "custom properties use --ch-* (toolkit token contract), --component-name (scoped to a component), or --_internal (Houdini @property / private).",
        ),
      },
    ],

    // ── Hygiene ───────────────────────────────────────────────────────
    "length-zero-no-unit": true,
    "color-function-notation": "modern",
    "alpha-value-notation": "number",
    "selector-not-notation": "complex",

    // CSS nesting and modern functions (color-mix, etc.) are allowed —
    // stylelint-config-standard already permits these. No need to disable.

    // Allow comment-empty-line-before exceptions for file-header comments
    "comment-empty-line-before": [
      "always",
      {
        except: ["first-nested"],
        ignore: ["after-comment", "stylelint-commands"],
      },
    ],
  },

  overrides: [
    // ── Canonical token files — hex is required here ──────────────────
    {
      files: ["**/_tokens.css", "**/tokens/**/*.css", "**/_tokens.scss"],
      rules: {
        "color-no-hex": null,
        "custom-property-pattern": null,
      },
    },

    // ── Override extension slot — also allows hex ─────────────────────
    {
      files: ["**/_theme.override.css", "**/_theme.override.scss"],
      rules: {
        "color-no-hex": null,
        "custom-property-pattern": null,
      },
    },

    // ── Reset files — naked element selectors are legitimate ──────────
    {
      files: ["**/_reset.css", "**/reset.css"],
      rules: {
        "selector-max-type": null,
      },
    },

    // ── Toolkit-owned splash CSS ──────────────────────────────────────
    // The splash uses hardcoded forge-brand colors that don't yet map to
    // --ch-* tokens. Grandfathered until the token sweep extracts them.
    // Tracked: chamber-19/desktop-toolkit#TODO (splash token extraction).
    {
      files: ["**/splash/splash.css"],
      rules: {
        "color-no-hex": null,
      },
    },

    // ── Toolkit-owned ReleaseNotes CSS ────────────────────────────────
    // Markdown-rendering styles use hex for now. Grandfathered until token
    // sweep. Tracked: chamber-19/desktop-toolkit#TODO.
    {
      files: ["**/components/ReleaseNotes/ReleaseNotes.css"],
      rules: {
        "color-no-hex": null,
      },
    },

    // ── Toolkit-owned UpdateModal CSS ─────────────────────────────────
    // Mid-conversion to --ch-* tokens; some hex remains. Grandfathered
    // until the conversion completes. Tracked: theme system v2 PR.
    {
      files: ["**/components/UpdateModal/UpdateModal.css"],
      rules: {
        "color-no-hex": null,
      },
    },

    // ── Toolkit-owned activation CSS ──────────────────────────────────
    // Same mid-conversion grandfather. Tracked: theme system v2 PR.
    {
      files: ["**/activation/activation.css", "**/updater/updater.css"],
      rules: {
        "color-no-hex": null,
      },
    },
  ],
};
