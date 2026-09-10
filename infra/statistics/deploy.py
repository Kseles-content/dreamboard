"""Run on the server after copying this directory to /opt/dreamboard-statistics."""
from pathlib import Path
import datetime as dt
import shutil
import subprocess

stage = Path('/opt/dreamboard-statistics')
site = Path('/etc/nginx/sites-enabled/kseles.ru')
limit = Path('/etc/nginx/conf.d/dreamboard-statistics.conf')
unit = Path('/etc/systemd/system/dreamboard-statistics.service')
original = site.read_bytes()
text = original.decode()
marker = '    include /opt/dreamboard-photo-search/nginx-location.conf;'
include = '    include /opt/dreamboard-statistics/nginx-location.conf;'
if marker not in text or 'listen 127.0.0.1:8444 ssl http2;' not in text:
    raise SystemExit('Unexpected nginx configuration; deployment stopped.')
if limit.exists() or unit.exists() or include in text:
    raise SystemExit('Existing installation found; review before updating.')
backup = stage / 'backups' / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup.mkdir(parents=True)
(backup / 'kseles.ru').write_bytes(original)
shutil.copy2(stage / unit.name, unit)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
try:
    subprocess.run(['systemctl', 'start', 'dreamboard-statistics'], check=True)
    subprocess.run(['systemctl', 'is-active', '--quiet', 'dreamboard-statistics'], check=True)
    shutil.copy2(stage / 'nginx-limit.conf', limit)
    site.write_text(text.replace(marker, marker + '\n' + include, 1))
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except Exception:
    site.write_bytes(original)
    limit.unlink(missing_ok=True)
    subprocess.run(['systemctl', 'stop', 'dreamboard-statistics'])
    unit.unlink(missing_ok=True)
    subprocess.run(['systemctl', 'daemon-reload'])
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
subprocess.run(['systemctl', 'enable', 'dreamboard-statistics'], check=True)
Path('/etc/cron.d/dreamboard-statistics').write_text('17 3 * * * root umask 077; /usr/bin/python3 /opt/dreamboard-statistics/server.py --report >/dev/null && /usr/bin/python3 /opt/dreamboard-statistics/server.py --backup /var/lib/dreamboard-statistics/latest-backup.sqlite3\n')
print('Installed statistics; nginx backup:', backup)
