from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Collect all console messages and network errors
    errors = []
    page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
    page.on("requestfailed", lambda req: print(f"FAILED: {req.url} - {req.failure}"))
    
    page.goto('http://localhost:5175/forum', wait_until='networkidle', timeout=15000)
    page.wait_for_timeout(2000)
    
    # Force light theme
    page.evaluate("document.documentElement.removeAttribute('data-theme')")
    page.wait_for_timeout(500)
    
    # Check all CSS files loaded
    styles = page.evaluate("""() => {
        const sheets = document.querySelectorAll('link[rel=stylesheet]');
        return Array.from(sheets).map(s => s.href);
    }""")
    print(f"CSS files: {styles}")
    
    # Check inline styles
    inline_styles = page.evaluate("""() => {
        const styles = document.querySelectorAll('style');
        return Array.from(styles).map(s => s.textContent.substring(0, 100));
    }""")
    print(f"Inline styles count: {len(inline_styles)}")
    
    browser.close()
