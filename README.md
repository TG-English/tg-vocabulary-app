# TG Vocabulary Test

TG영어전문학원용 무료 독립형 단어 시험 웹앱입니다. 현재 공개된 로컬 저장형 시험 기능을 유지하면서 Supabase 기반 학생·선생님·관리자 시스템으로 확장 중입니다.

## 기능

- Excel/CSV 단어 업로드
- 영어→뜻, 뜻→영어, 음성 스펠링 시험
- 즉시 자동채점과 오답 재시험
- 학생·반별 성적 저장 및 CSV 다운로드
- 모바일, 태블릿, PC 반응형 화면
- 설치형 PWA 지원

## 엑셀 형식

첫 번째 열에는 영어 표제어, 두 번째 열에는 뜻을 입력합니다. 첫 행에 제목이 있어도 자동으로 건너뜁니다.

## 데이터 저장

단어장과 성적은 사용 중인 브라우저의 로컬 저장소에 보관됩니다. 성적 화면에서 CSV 백업을 받을 수 있습니다.

## Production expansion

- 데이터 구조와 화면 목록: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 개인정보 및 환경변수 원칙: [`docs/SECURITY.md`](docs/SECURITY.md)
- Supabase 데이터베이스/RLS: [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
- 환경변수 예시: [`.env.example`](.env.example)

실제 학생 데이터, 비밀번호, `.env` 파일은 저장소에 올리지 않습니다. Supabase service-role key는 브라우저 코드에서 절대 사용하지 않습니다.
