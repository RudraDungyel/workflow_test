# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install browsers (one-time / after Playwright version bumps): `npx playwright install --with-deps`
- Run all tests headless across all configured browsers: `npx playwright test`
- Run a single test file: `npx playwright test tests/example.spec.ts`
- Run a single test by title: `npx playwright test -g "has title"`
- Run only one browser project: `npx playwright test --project=chromium`
- Run with UI / debug mode: `npx playwright test --ui` or `npx playwright test --debug`
- View the last HTML report: `npx playwright show-report`

There is no lint or build step; `package.json` has no `scripts` defined. CI uses `npm ci` to install dependencies (see `.github/workflows/playwright.yml`).

## Architecture

This repo is a Playwright end-to-end test suite scaffolded from `npm init playwright`. There is no application source — only tests and config.

- `playwright.config.ts` defines the test runner: `testDir: ./tests`, fullyParallel, three browser projects (`chromium`, `firefox`, `webkit`), HTML reporter, and `trace: 'on-first-retry'`. CI behavior diverges from local: on CI (`process.env.CI`), `forbidOnly` is on, tests retry twice, and workers are pinned to 1.
- `tests/` holds `*.spec.ts` files using `@playwright/test`'s `test` / `expect` fixtures. The current example targets `https://playwright.dev/`; there is no `baseURL` or `webServer` configured, so tests must use absolute URLs unless those config blocks are uncommented.
- `.github/workflows/playwright.yml` runs the suite on push/PR to `main`/`master`, installs browsers with `--with-deps`, and uploads `playwright-report/` as an artifact.
