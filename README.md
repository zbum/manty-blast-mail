# MantyBlastMail

A high-performance bulk email sending system with a modern web UI. Built with Go and React.

**Online Demo**: [https://manty-blast-mail.manty.co.kr](https://manty-blast-mail.manty.co.kr)

**English** | [한국어](README.ko.md) | [사용자 가이드](docs/USER_GUIDE.md)

## Features

- **Campaign Management** — Create, edit, and manage email campaigns with draft/sending/paused/completed/cancelled lifecycle
- **Bulk Sending** — Multi-worker architecture with configurable rate limiting (up to 100 emails/sec)
- **Two Compose Modes** — HTML editor with template variables (`{{.Name}}`, `{{.Email}}`) or Raw MIME for full control
- **iCalendar Support** — Visual builder or raw input for calendar invitations, sent as inline + attachment (Gmail/Outlook compatible)
- **Recipient Import** — Upload via CSV/Excel or add manually, with custom variable support
- **Real-time Monitoring** — WebSocket-powered live progress, pause/resume/cancel controls
- **Preview & Test Send** — Preview rendered email and send test before launching
- **Reporting** — Send logs with SMTP responses, dashboard analytics, CSV export
- **SMTP Connection Pool** — Reusable connections with health checks, supports SMTPS (465) and STARTTLS (587)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.26, chi router, GORM, gorilla/websocket, zerolog |
| Frontend | React 19, TypeScript, Vite, TanStack Query, Tailwind CSS, Recharts |
| Database | MySQL, SQLite |
| Email | net/smtp with connection pooling, RFC 2047 MIME |

## Quick Start

### Option A: Download Binary (Easiest)

Download the latest binary from [Releases](https://github.com/zbum/manty-blast-mail/releases).

```bash
# Linux (amd64)
chmod +x manty-blast-mail-linux-amd64

# Create config
cp config.yaml.sqlite-sample config.yaml
# Edit config.yaml with your SMTP settings

# Run
./manty-blast-mail-linux-amd64 -config config.yaml
```

The server starts at `http://localhost:8080`. Default login: `admin` / `admin`

### Option B: Build from Source

#### Prerequisites

- Go 1.26+
- Node.js 18+
- MySQL 8.0+ (if using MySQL)

#### 1. Database Setup

**SQLite** (no setup required):

```bash
cp config.yaml.sqlite-sample config.yaml
```

**MySQL**:

```sql
CREATE DATABASE mail_sender CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
mysql -u root -p mail_sender < migrations/001_init.sql
cp config.yaml.sample config.yaml
```

Default login: `admin` / `admin`

#### 2. Configuration

Edit `config.yaml` with your SMTP settings.

All settings can be overridden with environment variables:

| Config | Environment Variable |
|--------|---------------------|
| `server.port` | `PORT` |
| `server.session_secret` | `SESSION_SECRET` |
| `database.driver` | `DB_DRIVER` (`mysql` or `sqlite`) |
| `database.host` | `DB_HOST` |
| `database.port` | `DB_PORT` |
| `database.user` | `DB_USER` |
| `database.password` | `DB_PASSWORD` |
| `database.name` | `DB_NAME` |
| `smtp.host` | `SMTP_HOST` |
| `smtp.port` | `SMTP_PORT` |
| `smtp.username` | `SMTP_USERNAME` |
| `smtp.password` | `SMTP_PASSWORD` |

> **Note**: Port 25 works without SMTP authentication. Leave `username` and `password` empty.

#### 3. Build & Run

```bash
make all    # Build frontend + backend
make run    # Build and start server
```

The server starts at `http://localhost:8080`.

#### Development

```bash
make dev-frontend   # Vite dev server (port 5173)
make dev-backend    # Go server with hot reload
```

## Project Structure

```
MantyBlastMail/
├── cmd/server/          # Entry point
├── internal/
│   ├── auth/            # Session-based authentication
│   ├── campaign/        # Campaign CRUD & handlers
│   ├── config/          # YAML + env config loader
│   ├── mailer/          # SMTP client pool, MIME builder, templates
│   ├── recipient/       # CSV/Excel parser, recipient management
│   ├── report/          # Analytics & export
│   ├── sender/          # Worker pool, rate limiter, progress tracker
│   ├── server/          # HTTP router & middleware
│   └── websocket/       # Real-time event hub
├── migrations/          # SQL schema
├── web/                 # React SPA
│   └── src/
│       ├── pages/       # Campaign list, compose, sending, report
│       ├── hooks/       # WebSocket hook
│       └── api/         # Axios API client
├── Makefile
├── config.yaml.sample
└── embed.go             # Static file embedding
```

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Current user |

### Campaigns
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/campaigns` | List campaigns |
| POST | `/api/v1/campaigns` | Create campaign |
| GET | `/api/v1/campaigns/{id}` | Get campaign |
| PUT | `/api/v1/campaigns/{id}` | Update campaign |
| DELETE | `/api/v1/campaigns/{id}` | Delete campaign |

### Recipients
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/campaigns/{id}/recipients/upload` | Upload CSV/Excel |
| POST | `/api/v1/campaigns/{id}/recipients/manual` | Add manually |
| GET | `/api/v1/campaigns/{id}/recipients` | List recipients |
| DELETE | `/api/v1/campaigns/{id}/recipients` | Delete all |

### Send Control
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/campaigns/{id}/send/start` | Start sending |
| POST | `/api/v1/campaigns/{id}/send/pause` | Pause |
| POST | `/api/v1/campaigns/{id}/send/resume` | Resume |
| POST | `/api/v1/campaigns/{id}/send/cancel` | Cancel |
| PUT | `/api/v1/campaigns/{id}/send/rate` | Set rate (emails/sec) |
| POST | `/api/v1/campaigns/{id}/reset` | Reset to draft |

### Preview & Reports
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/campaigns/{id}/preview` | Preview email |
| POST | `/api/v1/campaigns/{id}/preview/send` | Send test email |
| GET | `/api/v1/campaigns/{id}/logs` | Send logs |
| GET | `/api/v1/campaigns/{id}/report/export` | CSV export |
| GET | `/api/v1/dashboard` | Dashboard stats |

### WebSocket
| Path | Description |
|------|-------------|
| `/ws` | Real-time campaign progress updates |

## License

MIT
