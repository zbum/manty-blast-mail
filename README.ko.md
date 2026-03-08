# MantyBlastMail

Go와 React로 구축된 고성능 대량 이메일 발송 시스템입니다.

[English](README.md) | **한국어**

## 주요 기능

- **캠페인 관리** -- 이메일 캠페인 생성, 편집, 삭제. draft/sending/paused/completed/cancelled 생명주기 지원
- **대량 발송** -- 멀티 워커 아키텍처, 초당 최대 100건까지 속도 조절 가능
- **두 가지 작성 모드** -- 템플릿 변수(`{{.Name}}`, `{{.Email}}`) 지원 HTML 모드 또는 Raw MIME 모드
- **iCalendar 지원** -- 빌더 UI 또는 직접 입력으로 캘린더 초대 생성, Gmail/Outlook 호환 (인라인 + 첨부)
- **수신자 가져오기** -- CSV/Excel 파일 업로드 또는 수동 입력, 커스텀 변수 지원
- **실시간 모니터링** -- WebSocket 기반 발송 진행률 표시, 일시정지/재개/취소 제어
- **미리보기 및 테스트 발송** -- 렌더링된 이메일 미리보기, 실제 테스트 발송
- **리포트** -- SMTP 응답 포함 발송 로그, 대시보드 분석, CSV 내보내기
- **SMTP 연결 풀** -- 연결 재사용 및 상태 확인, SMTPS (465) 및 STARTTLS (587) 지원

## 기술 스택

| 계층 | 기술 |
|------|------|
| 백엔드 | Go 1.26, chi 라우터, GORM, gorilla/websocket, zerolog |
| 프론트엔드 | React 19, TypeScript, Vite, TanStack Query, Tailwind CSS, Recharts |
| 데이터베이스 | MySQL |
| 이메일 | net/smtp 연결 풀링, RFC 2047 MIME |

## 빠른 시작

### 사전 요구사항

- Go 1.26+
- Node.js 18+
- MySQL 8.0+

### 1. 데이터베이스 설정

```sql
CREATE DATABASE mail_sender CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

마이그레이션 실행:

```bash
mysql -u root -p mail_sender < migrations/001_init.sql
```

기본 로그인: `admin` / `admin`

### 2. 설정

```bash
cp config.yaml.sample config.yaml
# config.yaml을 열어 데이터베이스 및 SMTP 설정 수정
```

모든 설정은 환경변수로 오버라이드 가능합니다:

| 설정 | 환경변수 |
|------|----------|
| `server.port` | `PORT` |
| `server.session_secret` | `SESSION_SECRET` |
| `database.host` | `DB_HOST` |
| `database.port` | `DB_PORT` |
| `database.user` | `DB_USER` |
| `database.password` | `DB_PASSWORD` |
| `database.name` | `DB_NAME` |
| `smtp.host` | `SMTP_HOST` |
| `smtp.port` | `SMTP_PORT` |
| `smtp.username` | `SMTP_USERNAME` |
| `smtp.password` | `SMTP_PASSWORD` |

### 3. 빌드 및 실행

```bash
make all    # 프론트엔드 + 백엔드 빌드
make run    # 빌드 후 서버 시작
```

서버가 `http://localhost:8080`에서 시작됩니다.

### 개발 모드

```bash
make dev-frontend   # Vite 개발 서버 (포트 5173)
make dev-backend    # Go 서버
```

## 프로젝트 구조

```
MantyBlastMail/
├── cmd/server/          # 진입점
├── internal/
│   ├── auth/            # 세션 기반 인증
│   ├── campaign/        # 캠페인 CRUD 및 핸들러
│   ├── config/          # YAML + 환경변수 설정 로더
│   ├── mailer/          # SMTP 연결 풀, MIME 빌더, 템플릿
│   ├── recipient/       # CSV/Excel 파서, 수신자 관리
│   ├── report/          # 분석 및 내보내기
│   ├── sender/          # 워커 풀, 속도 제한, 진행률 추적
│   ├── server/          # HTTP 라우터 및 미들웨어
│   └── websocket/       # 실시간 이벤트 허브
├── migrations/          # SQL 스키마
├── web/                 # React SPA
│   └── src/
│       ├── pages/       # 캠페인 목록, 작성, 발송, 리포트
│       ├── hooks/       # WebSocket 훅
│       └── api/         # Axios API 클라이언트
├── docs/                # 사용자 가이드
├── Makefile
├── config.yaml.sample
└── embed.go             # 정적 파일 임베딩
```

## API 엔드포인트

### 인증
| 메소드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/auth/login` | 로그인 |
| POST | `/api/v1/auth/logout` | 로그아웃 |
| GET | `/api/v1/auth/me` | 현재 사용자 조회 |

### 캠페인
| 메소드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/campaigns` | 캠페인 목록 |
| POST | `/api/v1/campaigns` | 캠페인 생성 |
| GET | `/api/v1/campaigns/{id}` | 캠페인 조회 |
| PUT | `/api/v1/campaigns/{id}` | 캠페인 수정 |
| DELETE | `/api/v1/campaigns/{id}` | 캠페인 삭제 |

### 수신자
| 메소드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/campaigns/{id}/recipients/upload` | CSV/Excel 업로드 |
| POST | `/api/v1/campaigns/{id}/recipients/manual` | 수동 추가 |
| GET | `/api/v1/campaigns/{id}/recipients` | 수신자 목록 |
| DELETE | `/api/v1/campaigns/{id}/recipients` | 전체 삭제 |

### 발송 제어
| 메소드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/campaigns/{id}/send/start` | 발송 시작 |
| POST | `/api/v1/campaigns/{id}/send/pause` | 일시정지 |
| POST | `/api/v1/campaigns/{id}/send/resume` | 재개 |
| POST | `/api/v1/campaigns/{id}/send/cancel` | 취소 |
| PUT | `/api/v1/campaigns/{id}/send/rate` | 속도 설정 (emails/sec) |
| POST | `/api/v1/campaigns/{id}/reset` | 초안으로 초기화 |

### 미리보기 및 리포트
| 메소드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/campaigns/{id}/preview` | 이메일 미리보기 |
| POST | `/api/v1/campaigns/{id}/preview/send` | 테스트 발송 |
| GET | `/api/v1/campaigns/{id}/logs` | 발송 로그 |
| GET | `/api/v1/campaigns/{id}/report/export` | CSV 내보내기 |
| GET | `/api/v1/dashboard` | 대시보드 통계 |

### WebSocket
| 경로 | 설명 |
|------|------|
| `/ws` | 실시간 캠페인 진행률 업데이트 |

## 문서

- [사용자 가이드 (한국어)](docs/USER_GUIDE.md)

## 라이선스

MIT
