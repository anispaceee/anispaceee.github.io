from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Collect all console messages with stack traces
    errors = []
    page.on('console', lambda msg: errors.append({
        'type': msg.type,
        'text': msg.text,
        'location': msg.location
    }) if msg.type in ['error', 'warning'] else None)

    page_errors = []
    page.on('pageerror', lambda err: page_errors.append({
        'message': str(err),
        'stack': getattr(err, 'stack', 'no stack')
    }))

    page.goto('https://afterrain-2005.github.io/', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    print("Page errors with stacks:")
    for e in page_errors:
        print(f"  Message: {e['message']}")
        print(f"  Stack: {e['stack'][:1000]}")
        print()

    print("Console errors:")
    for e in errors:
        print(f"  [{e['type']}] {e['text']}")
        if e.get('location'):
            print(f"    at {e['location']}")

    browser.close()
