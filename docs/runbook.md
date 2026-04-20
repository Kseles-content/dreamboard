# RUNBOOK — DreamBoard v1.0

## 1) Deployment

### Option A: Docker Compose
```bash
cp .env.example .env
# fill secrets and URLs in .env
docker-compose up -d
```

Services:
- API: `http://localhost:3000`
- Web: `http://localhost:3100`
- Postgres: `localhost:${DB_PORT:-5433}`

### Option B: Node processes + compose DB
```bash
cp .env.example .env
bash scripts/quick-start.sh
```

---

## 2) Restart services

### Docker Compose
```bash
docker-compose restart
# or specific service
docker-compose restart api
docker-compose restart web
docker-compose restart db
```

### Local processes (quick-start mode)
```bash
fuser -k 3000/tcp || true
fuser -k 3100/tcp || true
# then start again
bash scripts/quick-start.sh
```

---

## 3) Logs

### Docker Compose logs
```bash
docker-compose logs -f
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f db
```

### Local quick-start logs
- API: `/tmp/dreamboard-api.log`
- Web: `/tmp/dreamboard-web.log`

---

## 4) Database migrations and seed

```bash
npm run migrate:prod
npm run seed
```

If using compose DB on non-default port, ensure `DATABASE_URL` matches that port.

---

## 5) Backup and restore (PostgreSQL)

### Backup
```bash
# from host
PGPASSWORD=dreamboard123 pg_dump \
  -h 127.0.0.1 -p 5433 -U dreamboard -d dreamboard \
  -Fc -f backup-dreamboard.dump
```

### Restore
```bash
# optional: recreate target DB first
PGPASSWORD=dreamboard123 dropdb  -h 127.0.0.1 -p 5433 -U dreamboard dreamboard || true
PGPASSWORD=dreamboard123 createdb -h 127.0.0.1 -p 5433 -U dreamboard dreamboard

# restore
PGPASSWORD=dreamboard123 pg_restore \
  -h 127.0.0.1 -p 5433 -U dreamboard -d dreamboard \
  --clean --if-exists backup-dreamboard.dump
```

### Backup from docker container
```bash
docker-compose exec -T db pg_dump -U dreamboard -d dreamboard -Fc > backup-dreamboard.dump
```

### Restore into docker container
```bash
cat backup-dreamboard.dump | docker-compose exec -T db pg_restore -U dreamboard -d dreamboard --clean --if-exists
```

---

## 6) Health checks

```bash
curl -s http://localhost:3000/health
bash scripts/demo-check.sh
bash scripts/smoke-test.sh
```
