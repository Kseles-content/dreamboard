# Week 11 Performance Baseline

Environment:
- Local machine (single-node), NestJS + SQLite
- Requests per endpoint: 40

Dataset used:
- Boards: 12
- Cards: 180 (15 per board)
- Versions: 48 (4 per board)
- Share links: 1 active token

Latency (ms):

| Endpoint | p50 | p95 |
|---|---:|---:|
| GET /v1/boards | 4.90 | 7.08 |
| GET /v1/boards/{boardId} | 3.76 | 5.62 |
| GET /v1/boards/{boardId}/versions | 4.97 | 7.19 |
| GET /v1/share/{token} | 4.46 | 6.17 |

Method:
- Sequential curl sampling against local API
- p50/p95 computed from sorted sample arrays
