"""Replace the MatrixSansPrint4x6 base64 in styles.css with new font data."""
import base64, re

with open('fonts/MatrixSansPrint4x6-Regular.woff2', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()

with open('styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

pattern = r"(@font-face\s*\{\s*font-family:\s*'MatrixSansPrint4x6';\s*src:\s*url\(data:font/woff2;base64,)[A-Za-z0-9+/=]+(\))"
match = re.search(pattern, css)
if not match:
    print("ERROR: Could not find MatrixSansPrint4x6 @font-face in styles.css")
    exit(1)

new_css = css[:match.start()] + match.group(1) + b64 + match.group(2) + css[match.end():]

with open('styles.css', 'w', encoding='utf-8') as f:
    f.write(new_css)

print(f"Updated MatrixSansPrint4x6 in styles.css ({len(b64)} chars base64)")
