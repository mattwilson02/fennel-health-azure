# Fennel Health, as it runs today

A thin stand-in for the fictional company in [business-case.md](../../docs/business-case.md). It is the starting point to migrate, not the destination. All data is synthetic. It is deliberately weak in the ways the case describes.

## Run it

```bash
docker compose up -d --build
```

| What | Where | Sign in |
|---|---|---|
| Consumer web app | http://localhost:8080/ | `user1@example.test` / `demo-password` (users 1 to 200) |
| Coach dashboard | http://localhost:8080/coach | `coach` / `coach-demo` |
| Health check | http://localhost:8080/health | none |

All credentials are demo values for this local stand-in. Stop it with `docker compose down`, or `docker compose down -v` to also delete the data.

## The two machines

The compose file mirrors the case's two VMs. Container names start `vm1` and `vm2` on purpose.

| Machine | Container | What runs on it |
|---|---|---|
| **vm1** | `vm1-app` | API, consumer web app, coach dashboard, weekly report job, nightly import job, uploads and reports on local disk |
| **vm2** | `vm2-db` | PostgreSQL, 200 synthetic users with 14 days of readings |
| **vm2** | `vm2-backup` | Writes a database dump to a volume on the same machine |

## Workloads from the case

| Case item | Try it |
|---|---|
| API | Sign in on the web app, log a reading, and see it appear |
| Wearable webhook | `scripts/send-webhook.sh 1 6.4` |
| Nightly bulk file | `scripts/drop-bulk-file.sh` |
| Weekly reports | `docker compose exec vm1-app node jobs/report.js`, then use the download link on the web app |
| User uploads | `POST /api/uploads?name=meal.jpg` with a signed-in bearer token |
| Coach dashboard | Open `/coach` and load the flagged users |
| Backup | `docker compose exec vm2-backup ls /backups` |

## What is wrong with it, on purpose

Each row is a problem the Azure design has to fix, mapped to the requirement it breaks.

| Weakness | Where to see it | Breaks |
|---|---|---|
| One app machine, one database machine, no standby | `docker-compose.yml` | BR1, BR2 |
| Backup lands on the same machine as the database, restore never tested | `vm2-backup` service | BR2 |
| A webhook that arrives while the database is down is lost (the app answers 500) | stop `vm2-db`, run `scripts/send-webhook.sh` | BR9 |
| A late bulk file is noticed by nothing | `app/jobs/ingest.js` | BR9, monitoring |
| Reports are built in one process, one user at a time, onto local disk | `app/jobs/report.js` | BR8 at 150,000 users |
| Uploads and reports live on the app machine's disk, so the app cannot scale out | `appdata` volume | BR1, performance |
| Coach dashboard served from the same process as the public app, login only | `app/server.js` | BR6 |
| No record of who read a user's data | no audit logging in `app/server.js` | BR4 |
| Sessions held in process memory, so a restart signs everyone out | `sessions` in `app/server.js` | BR1 |
| Secrets in environment variables in a file | `docker-compose.yml` | security |
| Erasing a user is not implemented, and the dumps hold every user forever | no delete route, `/backups` | BR7 |
| Deployed by hand | rebuild the container yourself | BR12 |
| Scheduler timers live in the app process and reset on restart | `app/jobs/scheduler.js` | reliability |

## What it is not

It is not a real health app and has no clinical logic. The numbers in `docker-compose.yml` are tiny compared with the case. The point is to have something real to move, containerise, deploy and break, not to model 150,000 users.
