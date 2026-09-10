"""Small aggregate-only collector. Reports are available through SSH, not HTTP."""
import csv
import datetime as dt
import io
import json
import os
import sqlite3
import sys
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer

EVENTS = frozenset('landing_view app_open_click app_open install_help_open appinstalled standalone_open png_ready png_download_click'.split())
SOURCES = frozenset(('unknown', 'telegram', 'personal', 'pilot'))
DB = os.environ.get('STATISTICS_DB', '/var/lib/dreamboard-statistics/counts.sqlite3')
ORIGIN = 'https://kseles-content.github.io'


@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=3)
    try:
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS counts (day TEXT, environment TEXT, source TEXT, event TEXT, count INTEGER NOT NULL, PRIMARY KEY(day, environment, source, event))')
            yield db
    finally:
        db.close()


def record(data):
    if not isinstance(data, dict) or set(data) != {'event', 'source', 'environment'}:
        raise ValueError('invalid event')
    if any(not isinstance(v, str) for v in data.values()):
        raise ValueError('invalid value')
    if data['event'] not in EVENTS or data['source'] not in SOURCES or data['environment'] not in ('production', 'preview'):
        raise ValueError('invalid value')
    today = dt.datetime.now(dt.timezone.utc).date()
    with connect() as db:
        db.execute('DELETE FROM counts WHERE day <= ?', ((today - dt.timedelta(days=365)).isoformat(),))
        db.execute('INSERT INTO counts VALUES (?, ?, ?, ?, 1) ON CONFLICT(day, environment, source, event) DO UPDATE SET count=count+1',
                   (today.isoformat(), data['environment'], data['source'], data['event']))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never retain IP, request paths, or bodies.

    def setup(self):
        super().setup()
        self.connection.settimeout(4)

    def respond(self, status):
        self.send_response(status)
        if self.headers.get('Origin') == ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_POST(self):
        if self.path != '/events':
            return self.respond(404)
        if self.headers.get('Origin') != ORIGIN:
            return self.respond(403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 256 or self.headers.get('Transfer-Encoding'):
                return self.respond(413)
            record(json.loads(self.rfile.read(length)))
        except (ValueError, TypeError, UnicodeError):
            return self.respond(400)
        except (sqlite3.Error, OSError):
            return self.respond(503)
        self.respond(204)

    def do_GET(self):
        self.respond(404)


def report():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(('day_utc', 'environment', 'source', 'event', 'count'))
    with connect() as db:
        cutoff = (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=365)).isoformat()
        db.execute('DELETE FROM counts WHERE day <= ?', (cutoff,))
        writer.writerows(db.execute('SELECT * FROM counts ORDER BY day DESC, environment, source, event'))
    return output.getvalue()


if __name__ == '__main__':
    if '--report' in sys.argv:
        print(report(), end='')
    elif '--backup' in sys.argv:
        with connect() as source, sqlite3.connect(sys.argv[-1]) as target:
            source.backup(target)
        target.close()
    else:
        with connect():
            pass
        HTTPServer(('127.0.0.1', 8788), Handler).serve_forever()
