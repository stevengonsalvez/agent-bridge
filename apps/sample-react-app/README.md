# sample-react-app

Test application for Debug Bridge: a small shop with login, cart, and product gallery. It is used by the validation scripts and for manual checks of the Design Mode dock. It uses the optional embedded SDK (`debug-bridge-browser`); the default sidecar workflow does not need that.

## Run it

```bash
pnpm install
pnpm --filter sample-react-app dev        # Vite on http://localhost:3000
```

In another terminal, open it in the managed browser (from the repo root, after `pnpm run build`):

```bash
node packages/cli/dist/bin/cli.js browser open "http://localhost:3000" --port 4000
```

Start the listener, then press **Send** in the dock. If you press Send first, the bridge keeps that request and hands it to `wait` when it starts:

```bash
node packages/cli/dist/bin/cli.js browser wait --port 4000
```

## SDK query parameters

`src/debug-bridge.ts` reads optional `?session=<id>` and `?port=<n>` from the page URL (defaults `default` and `4000`). This is a quirk of the sample app; the SDK itself and the sidecar need no query parameters.

## Related

- Validation walkthrough: [docs/cdp-sidecar-demo.md](../../docs/cdp-sidecar-demo.md)
- Scripts: `pnpm test` from the repo root
