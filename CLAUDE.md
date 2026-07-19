# Working agreement

## Golden rules

1. Obsidian owns initial identity. Only a local note with the configured opt-in property set to `true` may create a Notion page; never add Notion-first discovery implicitly.
2. Preserve `notion_page_id` as the durable link. Retry partial writes against that page and never create a duplicate merely because content upload failed.
3. Keep mapping opinionated and explicit. Adding a supported Markdown, callout, property, or Notion block type requires forward and reverse tests plus a documented lossiness boundary.
4. Prefer predictable synchronization. Validate outgoing blocks before mutation, use one page-level clear instead of visible per-block deletion, retain the local note and pending marker for retry, and stop on unsupported remote blocks.
5. Keep the Notion API version deliberate. A version change requires reviewing data-source, block-positioning, and trash semantics and updating API-contract tests.
6. mise owns tool versions and task entrypoints; pnpm owns Node dependencies. Add dependencies with `pnpm add`, never by editing `pnpm-lock.yaml` manually.

## Layout

- `src/main.ts`: Obsidian lifecycle, commands, save/rename triggers, and polling.
- `src/sync-engine.ts`: identity, change detection, conflict routing, and safe orchestration.
- `src/notion-api.ts`: versioned Notion REST boundary.
- `src/*-mapper.ts`: deliberately limited Markdown/block/property conversion.
- `tests/`: direct behavior and API request-order tests.
- `manifest.json`, `styles.css`, `main.js`: Obsidian release artifacts; `main.js` is generated and ignored.

## Workflow

- `mise run setup`: cold start from a fresh clone.
- `mise run check`: complete local/CI gate.
- `mise run lint`, `fmt`, `typecheck`, `test`, `build`: focused tasks.
- `mise run hooks`: run commit-stage hooks across the repository.
- `mise run secrets`, `audit`: supply-chain checks.

## Definition of done

`mise run check` is green, new sync logic has a direct regression test, the production bundle builds, documentation states any new mapping limitation, and dependency changes were made through `pnpm add` with the lockfile committed.
