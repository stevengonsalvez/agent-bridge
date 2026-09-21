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
        
        # --- TEST 1: Question mark (?) Info Popover for AI Quick Render ---
        print("6. Testing '?' info question mark for Quick Render (AI)...")
        ai_info_btn = overlay_host.locator('[data-action="toggle-info-ai"]')
        await ai_info_btn.wait_for(state="visible", timeout=5000)
        await ai_info_btn.click()

        info_popover = overlay_host.locator('.info-popover')
        await info_popover.wait_for(state="visible", timeout=5000)
        ai_title = await overlay_host.locator('.info-title').text_content()
        ai_badge = await overlay_host.locator('.info-badge').text_content()
        print(f"   ✓ AI info popover open: '{ai_title}' [{ai_badge}]")
        await page.screenshot(path="/tmp/quick-render-ai-info.png")

        # Close AI info
        await overlay_host.locator('[data-action="close-info"]').click()
        await info_popover.wait_for(state="detached", timeout=5000)
        print("   ✓ AI info popover closed cleanly")

        # --- TEST 2: Question mark (?) Info Popover for Manual Quick Render ---
        print("7. Testing '?' info question mark for Quick Render (Manual)...")
        manual_info_btn = overlay_host.locator('[data-action="toggle-info-manual"]').first
        await manual_info_btn.wait_for(state="visible", timeout=5000)
        await manual_info_btn.click()

        await info_popover.wait_for(state="visible", timeout=5000)
        manual_title = await overlay_host.locator('.info-title').text_content()
        manual_badge = await overlay_host.locator('.info-badge').text_content()
        print(f"   ✓ Manual info popover open: '{manual_title}' [{manual_badge}]")
        await page.screenshot(path="/tmp/quick-render-manual-info.png")

        # Close Manual info
        await overlay_host.locator('[data-action="close-info"]').click()
        await info_popover.wait_for(state="detached", timeout=5000)
        print("   ✓ Manual info popover closed cleanly")

        # --- TEST 3: AI Quick Render via Jev ---
        prompt_input = overlay_host.locator("[data-agent-prompt]")
        await prompt_input.wait_for(state="visible", timeout=5000)
        print(f"8. Typing prompt into [data-agent-prompt]: '{PROMPT}' ...")
        await prompt_input.fill(PROMPT)

        quick_render_btn = overlay_host.locator('[data-action="quick-render"], [data-action-ai="quick-render-ai"]').first
        await quick_render_btn.wait_for(state="visible", timeout=5000)
        print("9. Clicking '⚡ AI Render' button ...")
        await quick_render_btn.click()

        # Wait for #__agent_bridge_live_preview__ to appear in document.head
        print("10. Waiting for <style id='__agent_bridge_live_preview__'> in document.head ...")
        style_el = page.locator("#__agent_bridge_live_preview__")
        await style_el.wait_for(state="attached", timeout=5000)
        
        injected_css = await page.eval_on_selector(
            "#__agent_bridge_live_preview__",
            "el => el.textContent"
        )
        print(f"   ✓ Injected AI CSS rules:\n{injected_css.strip()}")

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
        print(f"11. Recorded styles after AI Quick Render: {new_styles}")

        assert new_styles["backgroundColor"] == "rgb(0, 128, 128)", (
            f"Expected backgroundColor to be 'rgb(0, 128, 128)', got '{new_styles['backgroundColor']}'"
        )
        assert new_styles["borderRadius"] == "24px", (
            f"Expected borderRadius to be '24px', got '{new_styles['borderRadius']}'"
        )
        print("   ✓ AI Quick Render styles verification passed (teal background + 24px border radius)")
        await page.screenshot(path=SCREENSHOT_PATH, full_page=False)

        # --- TEST 4: Manual Quick Render via Inspector Tweaks ---
        print("12. Testing Quick Render (Manual) with Inspector tweaks...")
        tweaker_btn = overlay_host.locator('[data-action="toggle-tweaker"]')
        await tweaker_btn.click()

        pad_input = overlay_host.locator('[data-edit-prop="padding"]')
        await pad_input.wait_for(state="visible", timeout=5000)
        await pad_input.fill("18px 36px")

        manual_render_btn = overlay_host.locator('[data-action="quick-render-manual"]').first
        await manual_render_btn.click()

        manual_styles = await page.evaluate("""() => {
            const btn = document.querySelector('button[data-testid="logout-btn"]');
            const cs = window.getComputedStyle(btn);
            return {
                backgroundColor: cs.backgroundColor,
                borderRadius: cs.borderRadius,
                padding: cs.padding
            };
        }""")
        print(f"13. Recorded styles after Manual Quick Render: {manual_styles}")
        assert "18px" in manual_styles["padding"], f"Expected padding to have 18px, got {manual_styles['padding']}"
        print("   ✓ Manual Quick Render styles verification passed (18px padding applied live)")

        await page.screenshot(path="/tmp/quick-render-manual-applied.png", full_page=False)

        await browser.close()

        # Output final structured JSON summary
        result_summary = {
            "ai_prompt": PROMPT,
            "selected_selector": selected_selector,
            "ai_injected_css": injected_css.strip(),
            "styles_before": initial_styles,
            "styles_after_ai": new_styles,
            "styles_after_manual": manual_styles,
            "screenshots": [
                "/tmp/quick-render-ai-info.png",
                "/tmp/quick-render-manual-info.png",
                SCREENSHOT_PATH,
                "/tmp/quick-render-manual-applied.png",
            ],
        }
        print("\n=== FINAL VERIFICATION RESULT JSON ===")
        print(json.dumps(result_summary, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
