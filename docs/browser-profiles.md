# Browser Profiles and CDP Sidecar

How-to for choosing where the managed browser keeps its state. The CDP sidecar is the default way to use Debug Bridge, and it needs no changes in your app. `debug-bridge browser open` starts it for you; with `connect` it is enabled with `--cdp`:

```bash
debug-bridge connect --cdp --profile agent-bridge-default
```

## Profile Modes

### Dedicated persistent profile

The default recommended mode is a named Agent Bridge profile, stored at `~/.agent-bridge/profiles/<name>`:

```bash
debug-bridge connect --cdp --profile agent-bridge-default
```

The sidecar launches Chrome (or Chromium as fallback) with a persistent user data directory. Cookies, localStorage, IndexedDB, service workers, and cache can survive restarts. This is the safest local mode because it does not mutate the user's everyday Chrome profile.

### Absolute profile path

For explicit control, pass an absolute profile directory:

```bash
debug-bridge connect --cdp --profile /tmp/agent-bridge-profile
```

Use this for isolated demos, tests, or disposable debugging sessions.

### Storage state file

For deterministic test setup, use a Playwright storage state file:

```bash
debug-bridge connect --cdp --profile agent-bridge-ci --storage-state ./storage-state.json
```

The sidecar imports the file when the browser starts and writes it back when the sidecar shuts down.

### Existing Chrome profile

To use a Chrome you already run, start it with a remote debugging endpoint and a dedicated `--user-data-dir`, then attach:

```bash
# macOS example: start Chrome with a debugging port and its own data directory
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/agent-bridge-chrome

# then attach the bridge to it
debug-bridge connect --cdp --browser connect --cdp-endpoint http://localhost:9222
```

A Chrome extension relay for an unmodified everyday browser does not exist yet.

Avoid pointing the sidecar directly at the everyday Chrome profile while Chrome is running. Chrome profile locking and mixed ownership can corrupt state or produce confusing behavior.

## Privacy Defaults

- Cookie values are redacted by default in `browser_get_cookies`.
- `cookie`, `set-cookie`, and `authorization` headers are redacted from CDP network telemetry.
- Raw CDP is available through `cdp_send`, but higher-level browser commands should be preferred.
- The in-page `eval` capability belongs to the optional embedded SDK, is controlled by its `enableEval` option, and is not enabled by the sidecar.

