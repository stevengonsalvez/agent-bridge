#!/usr/bin/env python3
"""
Verification script for Jev Instant Quick Render in Agent Bridge Design Mode.
Interacts with the sample app at http://localhost:5173 via Playwright.
"""
import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright

RUNTIME_PATH = "/Users/stevengonsalvez/orca/workspaces/agent-bridge/agent-bridge-improve/packages/browser/dist/design-mode-runtime.global.js"
SCREENSHOT_PATH = "/tmp/quick-render-verified.png"
PROMPT = "Change the logout button background color to teal and border-radius to 24px"

async def main():
    if not os.path.exists(RUNTIME_PATH):
        print(f"Error: Runtime file not found at {RUNTIME_PATH}", file=sys.stderr)
        sys.exit(1)

    with open(RUNTIME_PATH, "r", encoding="utf-8") as f:
        runtime_code = f.read()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 850},
            permissions=["clipboard-read", "clipboard-write"],
        )
        
        # Pre-seed login state in localStorage so the logout button is rendered immediately
        await context.add_init_script("""
            window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
                auth: { isLoggedIn: true, email: 'stevie@example.com' },
                cart: { items: [] }
            }));
        """)

        page = await context.new_page()

        print("1. Navigating to http://localhost:5173 ...")
        await page.goto("http://localhost:5173", wait_until="networkidle")

        # Verify logout button exists in DOM
        logout_btn = page.locator('button[data-testid="logout-btn"]')
        await logout_btn.wait_for(state="visible", timeout=5000)
        print("   ✓ Logout button is visible on page")

        # Record initial computed styles of button[data-testid="logout-btn"]
        initial_styles = await page.evaluate("""() => {
            const btn = document.querySelector('button[data-testid="logout-btn"]');
            const cs = window.getComputedStyle(btn);
            return {
                backgroundColor: cs.backgroundColor,
                borderRadius: cs.borderRadius,
                color: cs.color,
                padding: cs.padding
            };
        }""")
        print(f"2. Recorded initial computed styles: {initial_styles}")

        # Inject runtime script
        print("3. Injecting design mode runtime script via page.evaluate(code) ...")
        await page.evaluate(runtime_code)
        
        # Mount unified floating pill overlay
        print("4. Calling window.__agentBridgeDesignMode.enable() ...")
        snap = await page.evaluate("window.__agentBridgeDesignMode.enable()")
        assert snap.get("enabled") is True, "Design Mode should be enabled"
        print("   ✓ Unified floating pill overlay mounted and enabled")

        # Select the logout button by clicking it
        print("5. Selecting logout button: clicking button[data-testid='logout-btn'] ...")
        await logout_btn.click()

        # Check selection in snapshot
        snap = await page.evaluate("window.__agentBridgeDesignMode.getSnapshot()")
        selections = snap.get("selections", [])
        assert len(selections) > 0, "Expected at least one selection"
        selected_selector = selections[0]["selector"]
        print(f"   ✓ Selection registered in Design Mode. Selector: {selected_selector}")

        # Locate prompt input in shadow root
        overlay_host = page.locator("[data-agent-bridge-design-overlay]")
        await overlay_host.wait_for(state="attached", timeout=5000)
        
        prompt_input = overlay_host.locator("[data-agent-prompt]")
        await prompt_input.wait_for(state="visible", timeout=5000)
        print(f"6. Typing prompt into [data-agent-prompt]: '{PROMPT}' ...")
        await prompt_input.fill(PROMPT)

        # Locate and click '⚡ Quick Render' button
        quick_render_btn = overlay_host.locator('[data-action="quick-render"]')
        await quick_render_btn.wait_for(state="visible", timeout=5000)
        print("7. Clicking '⚡ Quick Render' button [data-action='quick-render'] ...")
        await quick_render_btn.click()

        # Wait for #__agent_bridge_live_preview__ to appear in document.head
        print("8. Waiting for <style id='__agent_bridge_live_preview__'> in document.head ...")
        style_el = page.locator("#__agent_bridge_live_preview__")
        await style_el.wait_for(state="attached", timeout=5000)
        
        injected_css = await page.eval_on_selector(
            "#__agent_bridge_live_preview__",
            "el => el.textContent"
        )
        print(f"   ✓ Injected CSS rules:\n{injected_css.strip()}")

        # Check new computed styles of button[data-testid="logout-btn"]
        new_styles = await page.evaluate("""() => {
            const btn = document.querySelector('button[data-testid="logout-btn"]');
            const cs = window.getComputedStyle(btn);
            return {
                backgroundColor: cs.backgroundColor,
                borderRadius: cs.borderRadius,
                color: cs.color,
                padding: cs.padding
            };
        }""")
        print(f"9. Recorded new computed styles: {new_styles}")

        # Assertions
        # Verify background-color is teal / rgb(0, 128, 128)
        assert new_styles["backgroundColor"] == "rgb(0, 128, 128)", (
            f"Expected backgroundColor to be 'rgb(0, 128, 128)', got '{new_styles['backgroundColor']}'"
        )
        # Verify border-radius is 24px
        assert new_styles["borderRadius"] == "24px", (
            f"Expected borderRadius to be '24px', got '{new_styles['borderRadius']}'"
        )
        print("   ✓ Computed styles verification passed (teal background + 24px border radius)")

        # Take screenshot saving to /tmp/quick-render-verified.png
        print(f"10. Taking screenshot and saving to {SCREENSHOT_PATH} ...")
        await page.screenshot(path=SCREENSHOT_PATH, full_page=False)
        assert os.path.exists(SCREENSHOT_PATH), f"Screenshot was not created at {SCREENSHOT_PATH}"
        print(f"   ✓ Screenshot successfully saved to {SCREENSHOT_PATH} ({os.path.getsize(SCREENSHOT_PATH)} bytes)")

        await browser.close()

        # Output final structured JSON summary for easy parsing
        result_summary = {
            "prompt": PROMPT,
            "selected_selector": selected_selector,
            "injected_css": injected_css.strip(),
            "styles_before": initial_styles,
            "styles_after": new_styles,
            "screenshot_path": SCREENSHOT_PATH,
            "screenshot_size_bytes": os.path.getsize(SCREENSHOT_PATH),
        }
        print("\n=== FINAL VERIFICATION RESULT JSON ===")
        print(json.dumps(result_summary, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
