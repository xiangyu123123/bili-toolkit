# 带 CORS 头的本地静态服务：让 https 页面能 fetch 本地脚本做注入测试。仅开发用，不进发布产物。
import functools
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4174
ROOT = sys.argv[2] if len(sys.argv) > 2 else "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


with socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
    print("cors server on http://127.0.0.1:%d/%s" % (PORT, ROOT))
    httpd.serve_forever()
