from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Collect console errors
    errors = []
    page.on('console', lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type in ['error', 'warning'] else None)

    # Collect page errors
    page_errors = []
    page.on('pageerror', lambda err: page_errors.append(str(err)))

    page.goto('https://afterrain-2005.github.io/', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    # Take screenshot
    page.screenshot(path='/tmp/anispace_home.png', full_page=True)

    # Check page content
    content = page.content()
    root_html = page.locator('#root').inner_html() if page.locator('#root').count() > 0 else 'EMPTY'

    print(f"Page title: {page.title()}")
    print(f"#root content length: {len(root_html)}")
    print(f"#root first 500 chars: {root_html[:500]}")
    print(f"\nConsole errors ({len(errors)}):")
    for e in errors[:10]:
        print(f"  {e}")
    print(f"\nPage errors ({len(page_errors)}):")
    for e in page_errors[:5]:
        print(f"  {e}")

    browser.close()
