# Release and publish

How-to for maintainers cutting a release. Debug Bridge ships through three channels, and they do not move together.

| Channel | Source | Today |
|---------|--------|-------|
| Skill via `skills` CLI | `skills/debug-bridge/SKILL.md` on `master` | Works, updates on push to `master` |
| Claude Code plugin marketplace | `.claude-plugin/` on GitHub | Works, users reinstall to update |
| npm packages | `pnpm run publish:all` (`pnpm -r publish --access public`) | `debug-bridge-cli` on npm is 0.1.2 while the repo is 0.2.0; `debug-bridge-skill` is not published (`npm view` returns 404) |

Check npm state before announcing anything:

```bash
npm view debug-bridge-cli version
npm view debug-bridge-skill version
```

## Skill

Merge to `master`. Users install or update with:

```bash
npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -g -y
```

## Claude Code plugin

The repo is the marketplace: `.claude-plugin/plugin.json` (plugin metadata) and `.claude-plugin/marketplace.json` (catalog), with the skill under `skills/`. There is no review step.

```bash
/plugin marketplace add stevengonsalvez/agent-bridge
/plugin install debug-bridge@agent-bridge-marketplace
```

The two files carry separate versions today (`plugin.json` 0.3.2, `marketplace.json` 0.2.0). To release, bump both to the same new version, merge to `master`, then tag that version:

```bash
git tag v<version>
git push origin v<version>
```

For local testing use `claude --plugin-dir ./path`. For private sharing, host a private marketplace repo with the same layout.

## npm

```bash
pnpm run build
pnpm run publish:all
```

`pnpm -r publish` publishes every workspace package, because none is marked private. `debug-bridge-cli` 0.2.0 depends on `debug-bridge-skill`, `debug-bridge-browser-sidecar`, and `debug-bridge-types`, so those must be published together with it, at versions the CLI can resolve. Bump each package's `version` first.

After publishing, re-check `npm view <name> version` for each package, then update the install sections in the README, `packages/cli/README.md`, and `packages/skill/README.md`, which currently say the skill package and CLI 0.2.0 are not on npm.
