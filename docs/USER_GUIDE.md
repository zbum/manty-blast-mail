# MantyBlastMail 사용자 가이드

MantyBlastMail은 Go와 React로 구축된 고성능 대량 이메일 발송 시스템입니다. 캠페인 기반의 이메일 관리, 실시간 발송 모니터링, iCalendar 초대 첨부, 그리고 상세 리포트 기능을 제공합니다.

---

## 목차

1. [시작하기](#1-시작하기)
2. [캠페인 관리](#2-캠페인-관리)
3. [이메일 작성](#3-이메일-작성)
4. [iCalendar 초대](#4-icalendar-초대)
5. [수신자 관리](#5-수신자-관리)
6. [미리보기 및 테스트 발송](#6-미리보기-및-테스트-발송)
7. [대량 발송](#7-대량-발송)
8. [실시간 모니터링](#8-실시간-모니터링)
9. [리포트](#9-리포트)
10. [캠페인 초기화](#10-캠페인-초기화)
11. [설정 가이드](#11-설정-가이드)
12. [SMTP 설정](#12-smtp-설정)

---

## 1. 시작하기

### 1.1 사전 요구사항

MantyBlastMail을 설치하고 실행하려면 다음 소프트웨어가 필요합니다.

| 소프트웨어 | 최소 버전 |
|-----------|----------|
| Go | 1.26 이상 |
| Node.js | 18 이상 |
| MySQL | 8.0 이상 |

### 1.2 데이터베이스 설정

MySQL에서 데이터베이스를 생성합니다.

```sql
CREATE DATABASE mail_sender CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

마이그레이션 스크립트를 실행하여 테이블을 생성합니다.

```bash
mysql -u root -p mail_sender < migrations/001_init.sql
```

마이그레이션이 완료되면 다음 테이블이 생성됩니다.

| 테이블 | 설명 |
|-------|------|
| `users` | 사용자 계정 (인증용) |
| `campaigns` | 캠페인 정보 (제목, 본문, 상태 등) |
| `recipients` | 수신자 목록 (이메일, 이름, 커스텀 변수) |
| `send_logs` | 발송 기록 (SMTP 응답, 소요 시간 등) |

기본 관리자 계정이 자동으로 생성됩니다.

- **사용자명**: `admin`
- **비밀번호**: `admin`

> 주의: 프로덕션 환경에서는 반드시 기본 비밀번호를 변경하십시오.

### 1.3 설정 파일 생성

샘플 설정 파일을 복사하여 실제 설정 파일을 생성합니다.

```bash
cp config.yaml.sample config.yaml
```

`config.yaml` 파일을 열어 데이터베이스와 SMTP 설정을 환경에 맞게 수정합니다. 각 항목의 상세 설명은 [11. 설정 가이드](#11-설정-가이드)를 참고하십시오.

### 1.4 빌드 및 실행

프론트엔드와 백엔드를 함께 빌드하고 실행합니다.

```bash
# 전체 빌드 (프론트엔드 + 백엔드)
make all

# 빌드 후 서버 시작
make run
```

서버가 시작되면 브라우저에서 `http://localhost:8080`으로 접속합니다.

### 1.5 개발 모드

개발 시에는 프론트엔드와 백엔드를 별도로 실행할 수 있습니다.

```bash
# 프론트엔드 개발 서버 (포트 5173)
make dev-frontend

# 백엔드 개발 서버 (핫 리로드)
make dev-backend
```

### 1.6 로그인

브라우저에서 서버에 접속하면 로그인 화면이 표시됩니다. 기본 계정 정보(`admin` / `admin`)를 입력하여 로그인합니다.

---

## 2. 캠페인 관리

캠페인은 MantyBlastMail의 핵심 단위입니다. 하나의 캠페인은 이메일 내용, 수신자 목록, 발송 상태를 포함합니다.

### 2.1 캠페인 생명주기

캠페인은 다음과 같은 상태(status)를 가집니다.

| 상태 | 설명 |
|------|------|
| `draft` | 초안 상태. 이메일 내용과 수신자를 편집할 수 있습니다. |
| `sending` | 발송 중. 이메일이 순차적으로 발송되고 있습니다. |
| `paused` | 일시정지. 발송이 중단된 상태로, 재개할 수 있습니다. |
| `completed` | 완료. 모든 수신자에게 발송이 완료되었습니다. |
| `cancelled` | 취소됨. 사용자가 발송을 취소한 상태입니다. |

### 2.2 캠페인 생성

1. 캠페인 목록 화면에서 **"+ New Campaign"** 버튼을 클릭합니다.
2. 다음 정보를 입력합니다.

| 필드 | 설명 | 예시 |
|------|------|------|
| Campaign Name | 캠페인의 내부 관리 이름 | `2026년 3월 뉴스레터` |
| Subject | 이메일 제목 | `[공지] 3월 소식을 전합니다` |
| From Name | 발신자 이름 | `MantyBlastMail 팀` |
| From Email | 발신자 이메일 주소 | `newsletter@example.com` |

3. **"Create Campaign"** 버튼을 클릭하면 캠페인이 생성되고 상세 페이지로 이동합니다.

### 2.3 캠페인 편집

캠페인 상세 페이지의 **"Campaign Info"** 탭에서 캠페인 이름, 제목, 발신자 정보를 수정할 수 있습니다. 수정 후 **"Save Changes"** 버튼을 클릭하여 저장합니다.

> 참고: 발송 중(`sending`) 상태에서는 캠페인 정보를 변경할 수 없습니다.

### 2.4 캠페인 삭제

캠페인 상세 페이지의 **"Campaign Info"** 탭에서 **"Delete Campaign"** 버튼을 클릭합니다. 확인 대화상자에서 승인하면 캠페인과 관련된 모든 데이터(수신자, 발송 로그)가 삭제됩니다.

> 주의: 삭제된 캠페인은 복구할 수 없습니다.

### 2.5 캠페인 목록

캠페인 목록 화면에서는 다음 정보를 한눈에 확인할 수 있습니다.

- 캠페인 ID, 이름, 제목
- 현재 상태 (draft, sending, paused, completed, cancelled)
- 발송 성공/실패 건수
- 전체 수신자 수
- 생성일

목록은 페이지네이션을 지원하며, 캠페인을 클릭하면 상세 페이지로 이동합니다.

---

## 3. 이메일 작성

캠페인 상세 페이지에서 **"Compose"** 버튼을 클릭하면 이메일 작성 화면으로 이동합니다.

### 3.1 작성 모드

MantyBlastMail은 두 가지 이메일 작성 모드를 제공합니다.

#### HTML 모드

HTML 코드를 직접 입력하여 이메일 본문을 작성합니다. 템플릿 변수를 사용하여 수신자별로 개인화된 내용을 생성할 수 있습니다.

```html
<html>
<body>
  <h1>안녕하세요, {{.Name}}님!</h1>
  <p>{{.Email}}로 보내드리는 특별 소식입니다.</p>
  <p>{{.Company}} 소속으로 등록된 정보를 확인해 주세요.</p>
</body>
</html>
```

HTML 모드에서는 iCalendar(.ics) 첨부 기능도 함께 사용할 수 있습니다.

#### Raw MIME 모드

MIME 형식의 이메일 원문을 직접 작성합니다. 멀티파트 메시지, 커스텀 헤더, 첨부 파일 등을 세밀하게 제어해야 할 때 사용합니다.

```
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="boundary123"

--boundary123
Content-Type: text/plain; charset="utf-8"

안녕하세요, {{.Name}}님.

--boundary123
Content-Type: text/html; charset="utf-8"

<html><body><h1>안녕하세요, {{.Name}}님!</h1></body></html>
--boundary123--
```

> 참고: Raw MIME 모드에서는 iCalendar 첨부 기능을 사용할 수 없습니다. iCalendar가 필요한 경우 MIME 본문에 직접 포함해야 합니다.

### 3.2 템플릿 변수

이메일 본문에서 Go 템플릿 문법을 사용하여 수신자별 개인화가 가능합니다.

#### 기본 제공 변수

| 변수 | 설명 | 예시 값 |
|------|------|---------|
| `{{.Name}}` | 수신자 이름 | `홍길동` |
| `{{.Email}}` | 수신자 이메일 주소 | `hong@example.com` |

#### 커스텀 변수

CSV/Excel 파일에 추가 열을 포함하면 해당 열 이름이 커스텀 변수로 사용됩니다.

예를 들어, CSV 파일에 `company`라는 열이 있으면 이메일 본문에서 `{{.Company}}`로 사용할 수 있습니다.

CSV 파일 예시:

```csv
email,name,company,position
hong@example.com,홍길동,ABC주식회사,매니저
kim@example.com,김철수,XYZ테크,이사
```

이메일 본문 예시:

```html
<p>{{.Name}}님 ({{.Company}} / {{.Position}})</p>
<p>귀하의 이메일 주소 {{.Email}}로 발송되었습니다.</p>
```

> 참고: 커스텀 변수명은 CSV 열 이름의 첫 글자가 대문자로 변환됩니다. 예를 들어, 열 이름이 `company`이면 변수는 `{{.Company}}`가 됩니다.

### 3.3 내용 저장

이메일 본문을 작성한 후 사이드바의 **"Save Content"** 버튼을 클릭하여 저장합니다. 저장하지 않고 페이지를 벗어나면 변경 사항이 사라집니다.

---

## 4. iCalendar 초대

이메일에 캘린더 초대(.ics 파일)를 첨부하여 수신자에게 일정 초대를 보낼 수 있습니다. Gmail과 Outlook에서 호환되는 형식으로 인라인과 첨부 파일 두 가지 방식으로 동시에 포함됩니다.

> 참고: iCalendar 기능은 HTML 모드에서만 사용할 수 있습니다.

### 4.1 iCalendar 활성화

이메일 작성 화면에서 **"Include iCalendar (.ics) attachment"** 토글을 켭니다.

### 4.2 Builder 모드

Builder 모드는 폼 UI를 통해 캘린더 초대를 간편하게 작성할 수 있는 모드입니다.

#### 필드 설명

| 필드 | ICS 속성 | 설명 | 예시 |
|------|----------|------|------|
| Event Title | `SUMMARY` | 일정 제목 | `팀 정기 회의` |
| Start Date/Time | `DTSTART` | 일정 시작 날짜와 시간 | `2026-03-15 14:00` |
| End Date/Time | `DTEND` | 일정 종료 날짜와 시간 | `2026-03-15 15:00` |
| Location | `LOCATION` | 일정 장소 | `회의실 A동 301호` |
| Description | `DESCRIPTION` | 일정 상세 설명 | `분기 실적 보고 회의` |
| Organizer Name | `ORGANIZER;CN=` | 주최자 이름 | `홍길동` |
| Organizer Email | `ORGANIZER:mailto:` | 주최자 이메일 | `hong@example.com` |

Builder 모드에서는 수신자의 이메일 주소(`{{.Email}}`)가 참석자(ATTENDEE) 필드에 자동으로 포함됩니다. 다른 필드에서도 `{{.Name}}` 등의 템플릿 변수를 사용할 수 있습니다.

작성 내용의 ICS 원문을 확인하려면 **"Generated ICS Preview"** 링크를 클릭하여 생성된 ICS 코드를 미리 볼 수 있습니다.

#### Builder 모드에서 생성되는 ICS 구조

Builder 모드는 다음과 같은 ICS 파일을 자동 생성합니다.

```
BEGIN:VCALENDAR
PRODID:-//Mail Sender//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VTIMEZONE
TZID:Asia/Seoul
...
END:VTIMEZONE
BEGIN:VEVENT
DTSTAMP:20260308T120000Z
DTSTART;TZID=Asia/Seoul:20260315T140000
DTEND;TZID=Asia/Seoul:20260315T150000
SUMMARY:팀 정기 회의
UID:1741420800000@mail-sender
SEQUENCE:0
DESCRIPTION:분기 실적 보고 회의
ORGANIZER;CN="홍길동":mailto:hong@example.com
ATTENDEE;CN=;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;RSVP=TRUE;CUTYPE=INDIVIDUAL:mailto:{{.Email}}
END:VEVENT
END:VCALENDAR
```

기본 시간대는 `Asia/Seoul`(KST, UTC+9)로 설정됩니다.

### 4.3 Raw 모드

Raw 모드에서는 ICS 원문을 직접 입력합니다. iCalendar 규격(RFC 5545)에 익숙한 사용자에게 적합합니다.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//My Company//EN
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:20260315T050000Z
DTEND:20260315T060000Z
SUMMARY:글로벌 웨비나
DESCRIPTION:온라인 세미나에 참석해 주세요.
ORGANIZER;CN="Admin":mailto:admin@example.com
ATTENDEE;RSVP=TRUE:mailto:{{.Email}}
END:VEVENT
END:VCALENDAR
```

> 참고: Raw 모드에서도 `{{.Email}}`, `{{.Name}}` 등의 템플릿 변수를 사용할 수 있습니다.

### 4.4 Builder 모드와 Raw 모드 전환

두 모드 간 전환이 가능합니다. 기존에 Builder 모드로 작성한 내용은 Raw 모드로 전환 시 ICS 원문으로 표시됩니다. 반대로, Raw 모드에서 작성한 유효한 ICS 내용은 Builder 모드로 전환 시 필드에 자동 파싱됩니다.

---

## 5. 수신자 관리

캠페인 상세 페이지에서 **"Recipients"** 탭을 클릭하면 수신자 관리 화면으로 이동합니다.

### 5.1 CSV/Excel 파일 업로드

**"Upload CSV"** 영역을 클릭하여 파일을 선택하거나, 파일을 드래그 앤 드롭합니다.

#### CSV 파일 형식

첫 번째 행은 반드시 헤더(열 이름)여야 합니다. `email` 열은 필수이며, `name` 열은 선택입니다. 그 외의 열은 커스텀 변수로 자동 인식됩니다.

```csv
email,name,company,department
hong@example.com,홍길동,ABC주식회사,개발팀
kim@example.com,김철수,XYZ테크,마케팅팀
lee@example.com,이영희,DEF솔루션,기획팀
```

#### Excel 파일 형식

Excel(.xlsx) 파일도 CSV와 동일한 형식으로 사용할 수 있습니다. 첫 번째 시트의 첫 번째 행을 헤더로 인식합니다.

### 5.2 수동 입력

**"Add Manually"** 패널에서 수신자를 한 명씩 추가할 수 있습니다.

1. **Email** 필드에 수신자 이메일 주소를 입력합니다.
2. **Name** 필드에 수신자 이름을 입력합니다 (선택사항).
3. **"Add Recipient"** 버튼을 클릭합니다.

### 5.3 수신자 목록 확인

추가된 수신자는 하단의 테이블에서 확인할 수 있습니다. 테이블에는 다음 정보가 표시됩니다.

| 열 | 설명 |
|----|------|
| Email | 수신자 이메일 주소 |
| Name | 수신자 이름 |
| Variables | JSON 형태의 커스텀 변수 값 |

수신자가 많은 경우 페이지네이션을 통해 탐색할 수 있습니다.

### 5.4 수신자 전체 삭제

수신자 테이블 상단의 **"Clear All"** 링크를 클릭하면 해당 캠페인의 모든 수신자가 삭제됩니다. 확인 대화상자에서 승인해야 합니다.

### 5.5 커스텀 변수 활용

CSV 파일에 `email`과 `name` 외에 추가 열을 포함하면 해당 열의 값이 수신자별 커스텀 변수로 저장됩니다. 이 변수들은 이메일 본문과 iCalendar 내용에서 `{{.변수명}}` 형태로 사용할 수 있습니다.

예시: CSV에 `department` 열이 있으면 `{{.Department}}`로 참조합니다.

---

## 6. 미리보기 및 테스트 발송

이메일을 대량 발송하기 전에 미리보기와 테스트 발송을 통해 내용을 검증할 수 있습니다.

### 6.1 미리보기

이메일 작성 화면의 사이드바에서 **"Preview"** 버튼을 클릭합니다.

- 현재 작성 중인 내용이 자동으로 저장됩니다.
- 템플릿 변수가 첫 번째 수신자의 데이터로 치환된 결과가 모달 창에 표시됩니다.
- 미리보기는 iframe 내에서 렌더링되므로 실제 이메일 클라이언트에서의 표시와 유사하게 확인할 수 있습니다.

### 6.2 테스트 발송

이메일 작성 화면의 사이드바에 있는 **"Test Send"** 패널을 사용합니다.

1. 테스트 수신 이메일 주소를 입력합니다.
2. **"Send Test Email"** 버튼을 클릭합니다.
3. 실제 SMTP 서버를 통해 테스트 이메일이 발송됩니다.

테스트 발송 시 템플릿 변수는 기본값 또는 첫 번째 수신자의 데이터로 치환됩니다. iCalendar 첨부가 활성화되어 있으면 테스트 이메일에도 포함됩니다.

> 권장: 대량 발송 전에 반드시 테스트 발송을 수행하여 이메일이 올바르게 표시되는지, SMTP 설정이 정상적인지 확인하십시오.

---

## 7. 대량 발송

캠페인 상세 페이지에서 **"Send"** 버튼을 클릭하면 발송 제어 화면으로 이동합니다.

### 7.1 발송 시작

**"Start Sending"** 버튼을 클릭하면 대량 발송이 시작됩니다. 캠페인 상태가 `draft`에서 `sending`으로 변경됩니다.

발송은 멀티 워커 아키텍처로 동작하며, 설정된 속도 제한(rate limit)에 따라 초당 발송 수가 조절됩니다.

### 7.2 일시정지

발송 중에 **"Pause"** 버튼을 클릭하면 발송이 일시정지됩니다. 현재 처리 중인 이메일의 발송이 완료된 후 일시정지 상태로 전환됩니다. 캠페인 상태가 `paused`로 변경됩니다.

### 7.3 재개

일시정지 상태에서 **"Resume"** 버튼을 클릭하면 남은 수신자에 대한 발송이 재개됩니다. 이미 발송 완료(`sent`) 또는 실패(`failed`)로 처리된 수신자는 건너뜁니다.

### 7.4 취소

발송 중 또는 일시정지 상태에서 **"Cancel"** 버튼을 클릭하면 발송이 취소됩니다. 확인 대화상자에서 승인해야 하며, 취소된 캠페인은 `cancelled` 상태가 됩니다.

> 주의: 취소 시점까지 이미 발송된 이메일은 회수할 수 없습니다.

### 7.5 속도 조절

발송 화면의 **"Send Rate"** 패널에서 초당 발송 속도를 실시간으로 조절할 수 있습니다.

- 슬라이더를 사용하여 1 ~ 100 emails/sec 범위에서 조절합니다.
- **"Apply Rate"** 버튼을 클릭하면 변경된 속도가 즉시 적용됩니다.
- 발송 중에도 속도를 변경할 수 있습니다.

속도 조절 시 참고 사항:

| 항목 | 설명 |
|------|------|
| 기본 속도 | `config.yaml`의 `sender.default_rate_limit` 값 (기본 10/sec) |
| 최대 속도 | `config.yaml`의 `sender.max_rate_limit` 값 (기본 100/sec) |
| 워커 수 | `config.yaml`의 `sender.worker_count` 값 (기본 5) |
| 배치 크기 | `config.yaml`의 `sender.batch_size` 값 (기본 100) |

> 권장: SMTP 서버의 제한을 초과하지 않도록 적절한 속도를 설정하십시오. 너무 높은 속도는 SMTP 서버에서 일시적으로 차단될 수 있습니다.

---

## 8. 실시간 모니터링

발송이 시작되면 WebSocket을 통해 실시간으로 진행 상황을 모니터링할 수 있습니다.

### 8.1 연결 상태

발송 화면 상단에 WebSocket 연결 상태가 표시됩니다.

| 표시 | 의미 |
|------|------|
| Live (초록색 점) | WebSocket 연결 활성. 실시간 데이터 수신 중 |
| Offline (회색 점) | WebSocket 연결 끊김. 페이지를 새로고침하십시오 |

### 8.2 진행률 표시

발송 화면에서 다음 정보를 실시간으로 확인할 수 있습니다.

- **프로그레스 바**: 전체 발송 진행률 (퍼센트)
- **Sent**: 성공적으로 발송된 수
- **Failed**: 발송 실패한 수
- **Remaining**: 남은 수신자 수
- **Rate**: 현재 초당 발송 속도

### 8.3 실시간 발송 결과

화면 하단의 **"Live Results"** 테이블에서 각 이메일의 발송 결과를 실시간으로 확인할 수 있습니다.

| 열 | 설명 |
|----|------|
| Email | 수신자 이메일 주소 |
| Status | 발송 결과 (Sent 또는 Failed) |
| Error | 실패 시 오류 메시지 |
| Time | 발송 시각 |

실시간 결과는 최근 200건까지 표시되며, 새로운 결과가 추가되면 자동으로 스크롤됩니다.

### 8.4 WebSocket 이벤트 유형

시스템은 다음 세 가지 유형의 실시간 이벤트를 전송합니다.

| 이벤트 | 설명 |
|--------|------|
| `progress` | 발송 카운터 업데이트 (sent_count, failed_count, total_count) |
| `status_change` | 캠페인 상태 변경 (sending, paused, completed, cancelled) |
| `send_results` | 개별 이메일 발송 결과 (이메일 주소, 성공/실패, 오류 메시지) |

---

## 9. 리포트

캠페인 상세 페이지에서 **"Report"** 버튼을 클릭하면 발송 리포트 화면으로 이동합니다.

### 9.1 요약 통계

리포트 화면 상단에 다음 통계가 카드 형태로 표시됩니다.

| 항목 | 설명 |
|------|------|
| Sent | 성공 발송 건수 |
| Failed | 실패 건수 |
| Total Recipients | 전체 수신자 수 |
| Success Rate | 성공률 (%) |

### 9.2 분포 차트

발송 성공과 실패의 비율을 파이 차트(도넛 차트)로 시각화합니다. 각 항목에 마우스를 올리면 상세 수치가 툴팁으로 표시됩니다.

### 9.3 발송 로그

리포트 화면 하단의 **"Send Logs"** 테이블에서 개별 이메일의 발송 기록을 확인할 수 있습니다.

| 열 | 설명 |
|----|------|
| Email | 수신자 이메일 주소 |
| Status | 발송 결과 (sent / failed) |
| Error | 실패 시 오류 메시지 또는 SMTP 응답 |
| Sent At | 발송 시각 |

발송 로그는 페이지네이션을 지원합니다 (페이지당 20건).

### 9.4 CSV 내보내기

리포트 화면 상단의 **"Export CSV"** 버튼을 클릭하면 발송 로그를 CSV 파일로 다운로드합니다. 파일명은 `campaign-{id}-report.csv` 형식입니다.

내보내기된 CSV 파일은 스프레드시트 프로그램(Excel, Google Sheets 등)에서 열어 추가 분석에 활용할 수 있습니다.

### 9.5 대시보드

메인 화면의 **Dashboard**에서는 전체 시스템의 요약 통계를 확인할 수 있습니다.

| 항목 | 설명 |
|------|------|
| Total Campaigns | 전체 캠페인 수 |
| Total Sent | 전체 발송 성공 수 (모든 캠페인 합산) |
| Total Failed | 전체 발송 실패 수 (모든 캠페인 합산) |

대시보드에는 최근 캠페인들의 발송 성공/실패 건수를 비교하는 막대 차트(Bar Chart)와 최근 캠페인 목록 테이블도 포함됩니다.

---

## 10. 캠페인 초기화

완료(`completed`) 또는 취소(`cancelled`) 상태의 캠페인을 초안(`draft`) 상태로 되돌릴 수 있습니다.

### 10.1 Reset to Draft

캠페인 상세 페이지에서 **"Reset to Draft"** 버튼을 클릭합니다.

> 이 버튼은 캠페인 상태가 `completed` 또는 `cancelled`일 때만 표시됩니다.

### 10.2 초기화 시 변경 사항

초기화를 수행하면 다음 작업이 실행됩니다.

- 캠페인 상태가 `draft`로 변경됩니다.
- 모든 발송 로그(send_logs)가 삭제됩니다.
- 수신자의 상태가 모두 `pending`으로 초기화됩니다.
- 발송 카운터(sent_count, failed_count)가 0으로 초기화됩니다.

이후 이메일 내용이나 수신자를 수정하고 다시 발송할 수 있습니다.

> 주의: 초기화 시 기존 발송 로그가 모두 삭제됩니다. 필요한 경우 초기화 전에 CSV 내보내기를 통해 로그를 백업하십시오.

---

## 11. 설정 가이드

### 11.1 config.yaml 구조

`config.yaml` 파일은 크게 네 개의 섹션으로 구성됩니다.

```yaml
server:
  port: 8080
  session_secret: "change-me-in-production-32-bytes!"

database:
  host: "127.0.0.1"
  port: 3306
  user: "root"
  password: "your-db-password"
  name: "mail_sender"

smtp:
  host: "smtp.example.com"
  port: 465
  username: "user@example.com"
  password: "your-smtp-password"
  pool_size: 10

sender:
  default_rate_limit: 10
  max_rate_limit: 100
  worker_count: 5
  batch_size: 100
```

### 11.2 server 섹션

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `port` | HTTP 서버 리스닝 포트 | `8080` |
| `session_secret` | 세션 암호화에 사용되는 비밀 키. 32바이트 이상의 랜덤 문자열을 사용하십시오. | `change-me-in-production-32-bytes!` |

> 주의: `session_secret`은 반드시 프로덕션 환경에서 고유한 값으로 변경하십시오. 동일한 비밀 키를 사용하면 세션 위조 공격에 취약해질 수 있습니다.

### 11.3 database 섹션

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `host` | MySQL 서버 호스트 주소 | `127.0.0.1` |
| `port` | MySQL 서버 포트 | `3306` |
| `user` | 데이터베이스 접속 사용자명 | `root` |
| `password` | 데이터베이스 접속 비밀번호 | - |
| `name` | 사용할 데이터베이스 이름 | `mail_sender` |

### 11.4 smtp 섹션

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `host` | SMTP 서버 호스트 주소 | - |
| `port` | SMTP 서버 포트 (465 또는 587) | `465` |
| `username` | SMTP 인증 사용자명 (보통 이메일 주소) | - |
| `password` | SMTP 인증 비밀번호 또는 앱 비밀번호 | - |
| `pool_size` | SMTP 연결 풀 크기. 동시에 유지할 SMTP 연결 수 | `10` |

SMTP 포트에 따른 동작 차이는 [12. SMTP 설정](#12-smtp-설정)을 참고하십시오.

### 11.5 sender 섹션

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `default_rate_limit` | 캠페인 생성 시 기본 초당 발송 속도 (emails/sec) | `10` |
| `max_rate_limit` | 사용자가 설정할 수 있는 최대 초당 발송 속도 | `100` |
| `worker_count` | 동시에 이메일을 발송하는 워커(고루틴) 수 | `5` |
| `batch_size` | 데이터베이스에서 한 번에 가져오는 수신자 수 | `100` |

#### 성능 튜닝 참고

- `worker_count`는 SMTP 연결 풀 크기(`pool_size`)와 균형을 맞추는 것이 좋습니다. 워커 수가 풀 크기를 크게 초과하면 연결 대기가 발생합니다.
- `default_rate_limit`를 높이면 발송 속도가 증가하지만, SMTP 서버의 초당 허용량을 초과하지 않도록 주의하십시오.
- `batch_size`를 높이면 데이터베이스 쿼리 횟수가 줄어들지만, 메모리 사용량이 증가합니다.

### 11.6 환경변수 오버라이드

`config.yaml`의 모든 주요 설정은 환경변수로 오버라이드할 수 있습니다. Docker, Kubernetes 등의 컨테이너 환경에서 유용합니다.

| config.yaml 경로 | 환경변수 |
|-------------------|----------|
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

환경변수가 설정되어 있으면 `config.yaml`의 값보다 우선 적용됩니다.

사용 예시:

```bash
# 환경변수로 설정 오버라이드
export DB_HOST=mysql-server.internal
export DB_PASSWORD=production-password
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=465
export SMTP_USERNAME=myapp@gmail.com
export SMTP_PASSWORD=abcd-efgh-ijkl-mnop

# 서버 실행
make run
```

---

## 12. SMTP 설정

MantyBlastMail은 SMTP 연결 풀을 사용하여 이메일을 발송합니다. 연결 풀은 SMTP 연결을 재사용하여 성능을 최적화하며, 연결 상태를 주기적으로 확인합니다.

### 12.1 포트 465 (SMTPS) vs 포트 587 (STARTTLS)

SMTP 보안 연결에는 두 가지 방식이 있습니다.

| 항목 | 포트 465 (SMTPS) | 포트 587 (STARTTLS) |
|------|------------------|---------------------|
| 연결 방식 | 연결 시작부터 TLS 암호화 (Implicit TLS) | 평문으로 연결 후 STARTTLS 명령으로 TLS 전환 |
| 보안 수준 | 높음 (전체 통신 암호화) | 높음 (STARTTLS 전환 후 암호화) |
| 표준 | RFC 8314 권장 | RFC 6409 표준 |
| 호환성 | 대부분의 최신 메일 서비스 지원 | 거의 모든 메일 서비스 지원 |
| 설정 | `smtp.port: 465` | `smtp.port: 587` |

MantyBlastMail은 포트 번호에 따라 자동으로 연결 방식을 감지합니다.

- **포트 465**: TLS 연결을 즉시 수립합니다.
- **포트 587 또는 25**: 평문으로 연결한 후 STARTTLS로 전환합니다.

> 권장: 가능하면 포트 465 (SMTPS)를 사용하십시오. 연결 초기부터 암호화되므로 더 안전합니다.

### 12.2 주요 메일 서비스별 SMTP 설정

#### Gmail

```yaml
smtp:
  host: "smtp.gmail.com"
  port: 465
  username: "your-account@gmail.com"
  password: "앱_비밀번호"
```

Gmail SMTP를 사용하려면 다음 설정이 필요합니다.

1. Google 계정의 2단계 인증을 활성화합니다.
2. [Google 계정 설정](https://myaccount.google.com/) > 보안 > 앱 비밀번호에서 앱 비밀번호를 생성합니다.
3. 생성된 16자리 앱 비밀번호를 `smtp.password`에 입력합니다.

> 주의: Gmail은 일일 발송 한도가 있습니다 (일반 계정 500건, Google Workspace 2,000건). 대량 발송에는 적합하지 않을 수 있습니다.

#### Microsoft 365 / Outlook

```yaml
smtp:
  host: "smtp.office365.com"
  port: 587
  username: "your-account@outlook.com"
  password: "계정_비밀번호_또는_앱_비밀번호"
```

Microsoft 365 환경에서는 관리자가 SMTP AUTH를 활성화해야 할 수 있습니다.

#### Naver

```yaml
smtp:
  host: "smtp.naver.com"
  port: 465
  username: "your-id@naver.com"
  password: "네이버_비밀번호"
```

네이버 메일에서 SMTP를 사용하려면 다음 설정이 필요합니다.

1. 네이버 메일 접속 > 환경설정 > POP3/IMAP 설정
2. IMAP/SMTP 사용을 "사용함"으로 변경합니다.

#### Daum / Kakao

```yaml
smtp:
  host: "smtp.daum.net"
  port: 465
  username: "your-id@daum.net"
  password: "다음_비밀번호"
```

#### AWS SES (Simple Email Service)

```yaml
smtp:
  host: "email-smtp.ap-northeast-2.amazonaws.com"
  port: 465
  username: "AKIAIOSFODNN7EXAMPLE"
  password: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
```

AWS SES 사용 시 참고 사항:

1. `username`과 `password`는 IAM SMTP 자격 증명을 사용합니다 (AWS 액세스 키가 아닙니다).
2. SES 콘솔에서 발신 이메일 주소 또는 도메인을 인증(Verify)해야 합니다.
3. 샌드박스 모드에서는 인증된 주소로만 발송 가능합니다. 프로덕션 액세스를 요청하여 제한을 해제하십시오.
4. 리전 코드(`ap-northeast-2`)는 사용 중인 AWS 리전에 맞게 변경하십시오.

#### SendGrid

```yaml
smtp:
  host: "smtp.sendgrid.net"
  port: 465
  username: "apikey"
  password: "SG.xxxxxxxxxxxxxxxxxxxx"
```

SendGrid 사용 시 `username`은 항상 `apikey`(문자 그대로)이며, `password`에는 SendGrid API Key를 입력합니다.

### 12.3 SMTP 연결 풀

MantyBlastMail은 SMTP 연결 풀을 사용하여 성능을 최적화합니다.

| 설정 | 설명 |
|------|------|
| `smtp.pool_size` | 동시에 유지할 SMTP 연결 수 |

연결 풀의 동작 방식:

- 서버 시작 시 `pool_size`만큼의 SMTP 연결을 미리 생성합니다.
- 이메일 발송 시 풀에서 연결을 가져와 사용합니다.
- 사용이 끝난 연결은 풀에 반환되어 재사용됩니다.
- 연결이 끊어진 경우 자동으로 새 연결을 생성합니다.

> 권장: `pool_size`는 `sender.worker_count`와 같거나 약간 크게 설정하십시오. 풀 크기가 워커 수보다 작으면 일부 워커가 연결을 기다리게 됩니다.

### 12.4 문제 해결

#### 연결 타임아웃 발생 시

- SMTP 서버 호스트와 포트가 정확한지 확인합니다.
- 방화벽에서 해당 포트(465 또는 587)의 아웃바운드 트래픽이 허용되어 있는지 확인합니다.
- 서버의 DNS 설정이 올바른지 확인합니다.

#### 인증 실패 시

- 사용자명과 비밀번호가 정확한지 확인합니다.
- Gmail의 경우 앱 비밀번호를 사용하고 있는지 확인합니다 (일반 비밀번호는 동작하지 않습니다).
- 2단계 인증이 활성화되어 있는지 확인합니다.

#### 발송 속도가 느린 경우

- `smtp.pool_size`를 늘려 동시 연결 수를 증가시킵니다.
- `sender.worker_count`를 늘려 동시 발송 워커 수를 증가시킵니다.
- `sender.default_rate_limit`를 높여 초당 발송 속도를 증가시킵니다.
- SMTP 서버의 초당/시간당 발송 제한을 확인합니다.

#### 대량 발송 시 차단되는 경우

- SMTP 서비스의 발송 한도를 확인합니다.
- 발송 속도를 낮추어 SMTP 서버의 제한에 걸리지 않도록 합니다.
- AWS SES나 SendGrid 같은 대량 발송 전문 서비스를 사용하는 것을 고려하십시오.
