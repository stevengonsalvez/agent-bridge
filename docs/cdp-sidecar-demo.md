# Validate the CDP sidecar end to end

How-to for contributors who want to check that the sidecar, sample app, and profile persistence still work together. The sample app uses the optional embedded SDK, so these checks cover both paths.

Run the normal build gates first:

```bash
pnpm run build
pnpm run type-check
```

Or run the full repeatable test path:

```bash
pnpm test
```

Start the sample React app in a tmux session (see [apps/sample-react-app/README.md](../apps/sample-react-app/README.md)):

```bash
PORT=9090 pnpm --filter sample-react-app dev --host 127.0.0.1 --port 9090
```

Then run:

```bash
DEBUG_BRIDGE_APP_PORT=9090 DEBUG_BRIDGE_PORT=7925 pnpm exec node scripts/validate-cdp-sidecar-demo.mjs
```

The validation script starts an in-process bridge server and a managed CDP sidecar with a disposable persistent profile. It verifies:

- CDP provider connection and capability announcement.
- Browser navigation into the sample app.
- Composed routing: app commands still drive login through the in-page bridge.
- Browser commands for targets, storage, cookies, screenshots, and CDP network body retrieval.
- Cookie value redaction by default.
- Login/session persistence after stopping and restarting the sidecar with the same profile.

For a CLI smoke test of the sidecar path itself:

```bash
debug-bridge connect --cdp --profile agent-bridge-default --json
```

`connect` holds its terminal, so run this second command in another terminal:

```bash
debug-bridge browser open "http://localhost:9090" --port 4000
```
