"""Tiny stand-in for the GitHub REST API, used by guard-fixtures.sh so tests never touch the network.

GET /repos/octocat/hello-world  -> 200 (a public repository)
GET /repos/octocat/server-error -> 500 (GitHub having a bad day)
anything else                   -> 404 (private or missing)

Usage: python mock-github.py <port-file>
Listens on 127.0.0.1 on a free port, writes the port number to <port-file>, and exits on its own
after 20 minutes in case the caller forgets to stop it.
"""
import http.server
import os
import sys
import threading


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?', 1)[0].rstrip('/').lower()
        if path == '/repos/octocat/hello-world':
            code = 200
        elif path == '/repos/octocat/server-error':
            code = 500
        else:
            code = 404
        body = b'{}'
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    port_file = sys.argv[1]
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    tmp = port_file + '.tmp'
    with open(tmp, 'w') as f:
        f.write(str(server.server_address[1]))
    os.replace(tmp, port_file)
    threading.Timer(1200, lambda: os._exit(0)).start()
    server.serve_forever()


if __name__ == '__main__':
    main()
