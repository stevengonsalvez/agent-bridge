# Browser Profiles and CDP Sidecar

Agent Bridge can compose the in-page app bridge with a CDP browser sidecar. The sidecar is optional and is enabled from the CLI:

```bash
debug-bridge connect --cdp --profile agent-bridge-default
```

## Profile Modes

### Dedicated persistent profile

The default recommended mode is a named Agent Bridge profile:

```bash
debug-bridge connect --cdp --profile agent-bridge-default
```

The sidecar launches Chromium with a persistent user data directory. Cookies, localStorage, IndexedDB, service workers, and cache can survive restarts. This is the safest local mode because it does not mutate the user's everyday Chrome profile.

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

Attaching to an already-open normal Chrome tab is not part of the first sidecar slice. A Node sidecar needs either:

- Chrome launched with a remote debugging endpoint and a selected `--user-data-dir`, or
- a future Chrome extension relay installed in the user's normal browser.

Avoid pointing the sidecar directly at the everyday Chrome profile while Chrome is running. Chrome profile locking and mixed ownership can corrupt state or produce confusing behavior.

## Privacy Defaults

- Cookie values are redacted by default in `browser_get_cookies`.
- `cookie`, `set-cookie`, and `authorization` headers are redacted from CDP network telemetry.
- Raw CDP is available through `cdp_send`, but higher-level browser commands should be preferred.
- The in-page `eval` capability remains controlled by the app bridge config and is not enabled by the sidecar.

