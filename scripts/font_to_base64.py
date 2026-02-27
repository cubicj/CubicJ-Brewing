import base64, sys

path = sys.argv[1] if len(sys.argv) > 1 else 'fonts/MatrixSansPrint4x6-Regular.woff2'
with open(path, 'rb') as f:
    data = f.read()
b64 = base64.b64encode(data).decode()
print(f'Size: {len(data)} bytes, base64: {len(b64)} chars')
print(b64)
