import importlib.util
from pathlib import Path
import tempfile
import unittest
import sqlite3
import datetime as dt
from http.client import HTTPConnection
from threading import Thread
import json

spec = importlib.util.spec_from_file_location('statistics_server', Path(__file__).with_name('server.py'))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class StatisticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        server.DB = str(Path(self.temp.name) / 'test.sqlite3')

    def tearDown(self):
        self.temp.cleanup()

    def test_counts_and_environment_separation(self):
        event = dict(event='png_ready', source='pilot', environment='production')
        server.record(event)
        server.record(event)
        server.record(dict(event, environment='preview'))
        report = server.report()
        self.assertIn('production,pilot,png_ready,2', report)
        self.assertIn('preview,pilot,png_ready,1', report)

    def test_private_and_arbitrary_fields_rejected(self):
        valid = dict(event='app_open', source='unknown', environment='production')
        for bad in [dict(valid, email='private@example.org'), dict(valid, source='secret dream'), dict(valid, event=[]), {}, []]:
            with self.assertRaises(ValueError):
                server.record(bad)

    def test_retention_and_backup_restore(self):
        with server.connect() as db:
            db.execute("INSERT INTO counts VALUES ('2020-01-01','production','unknown','app_open',5)")
        server.record(dict(event='app_open', source='unknown', environment='production'))
        self.assertNotIn('2020-01-01', server.report())
        backup = str(Path(self.temp.name) / 'backup.sqlite3')
        with server.connect() as source, sqlite3.connect(backup) as target:
            source.backup(target)
        target.close()
        original = server.report()
        server.DB = backup
        self.assertEqual(original, server.report())

    def test_http_rejects_invalid_requests_and_has_no_public_report(self):
        http = server.HTTPServer(('127.0.0.1', 0), server.Handler)
        thread = Thread(target=http.serve_forever, daemon=True)
        thread.start()
        try:
            valid = json.dumps(dict(event='app_open', source='pilot', environment='preview'))
            cases = [('POST', '/events', valid, server.ORIGIN, 204),
                     ('POST', '/events', valid, 'https://attacker.example', 403),
                     ('POST', '/events', 'x' * 257, server.ORIGIN, 413),
                     ('POST', '/events', '{"dream":"private"}', server.ORIGIN, 400),
                     ('POST', '/events', '{', server.ORIGIN, 400),
                     ('GET', '/report', '', server.ORIGIN, 404)]
            for method, path, body, origin, expected in cases:
                conn = HTTPConnection(*http.server_address, timeout=3)
                conn.request(method, path, body=body, headers={'Origin': origin})
                response = conn.getresponse()
                self.assertEqual(response.status, expected)
                response.read()
                conn.close()
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
