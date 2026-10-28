"""Serve the standalone H5 game; run from any working directory."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser
import subprocess
import ipaddress

root = Path(__file__).resolve().parents[1] / 'dist'
if not (root / 'index.html').exists():
    raise SystemExit('缺少试玩文件，请先执行 npm install 和 npm run build。')
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
try:
    server = ThreadingHTTPServer(('0.0.0.0', 4188), partial(Handler, directory=str(root)))
except OSError:
    server = ThreadingHTTPServer(('0.0.0.0', 0), partial(Handler, directory=str(root)))
url = f'http://127.0.0.1:{server.server_port}/'
print(f'炉火远征已启动：{url}\n关闭此终端或按 Control+C 停止服务。', flush=True)
print('手机试玩：手机与电脑连接同一 Wi-Fi，使用以下局域网地址：', flush=True)
addresses = set()
for interface in ('en0', 'en1', 'en2'):
    result = subprocess.run(['/usr/sbin/ipconfig', 'getifaddr', interface], capture_output=True, text=True)
    candidate = result.stdout.strip()
    try:
        if ipaddress.ip_address(candidate).is_private:
            addresses.add(candidate)
    except ValueError:
        pass
for address in sorted(addresses):
    print(f'  http://{address}:{server.server_port}/', flush=True)
if not addresses:
    print('未找到 Wi-Fi 地址，请先连接 Wi-Fi 后重新启动。', flush=True)
print('请勿在手机输入 127.0.0.1；若系统询问是否允许局域网连接，请允许。', flush=True)
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
