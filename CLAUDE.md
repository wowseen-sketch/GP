# CLAUDE.md — Exppi 직무 적합도 매칭 기능 (v1)

## 이 작업이 뭔지
사용자의 경험 키워드와 기업(JD) 키워드를 대조해서
① 적합도 점수 ② 매치/부분매치/부족 키워드 ③ 개선 방향
을 보여주는 기능을 만든다.

서비스 이름은 **Exppi** 다. (Goalign은 이전 버전 이름, 더 이상 안 씀)

## 중요한 전제
- 나(사용자)는 개발 용어에 익숙하지 않다. 전문 용어보다 쉬운 설명과 비유를 써라.
- 코드를 바로 짜지 말고, **"계획만 먼저 알려줘"** 하면 단계별로 확인받고 진행한다.
- 한 단계 끝나면 멈추고 확인받은 뒤 다음으로 넘어간다.
- 답변은 짧고 단정하게. ~합니다 말고 ~다 스타일.

## 기술 환경
- 코드베이스: 단일 `index.html` 파일
- 백엔드: Supabase (프로젝트 ID: ovrcmolacpcjsghqgxlb)
- 배포: Vercel (무료 플랜, 하루 배포 횟수 제한 있음)
- AI 분석: Supabase Edge Functions 사용 중 (팀원이 머지함)

## Supabase 새 테이블 만들 때 체크리스트 (4개 다 필수)
1. CREATE TABLE
2. ENABLE RLS
3. CREATE POLICY
4. GRANT  ← 이거 빠지면 403 에러 난다

---

## v1 전체 계획 (총 1.5~2주)

- **0단계**: ✅ 완료 — 매칭 기준 = `experience_blocks.competency_keywords` (확정). `keywords` 칸은 죽은 칸, 안 씀.
- **1단계**: ✅ 완료 — 테이블 2개 생성 (company_keywords, match_results) + RLS/정책/GRANT
- **2단계**: 🔄 진행 중 — JD 텍스트 → 키워드 추출 (사용자가 JD 직접 붙여넣기)
  - ✅ ① extract-jd-keywords Edge Function 배포 + CORS 수정 완료
  - ✅ ② Match 화면(page-matchstore)에 JD 입력 UI + 추출 미리보기 작동
  - ⬜ ③ 추출 키워드를 company_keywords 테이블에 저장 ← 지금 여기
- **3단계**: ⬜ competency_keywords vs company_keywords 매칭 + 점수
- **4단계**: ⬜ 결과를 Keyword Match 화면(page-matchstore)에 실데이터로 표시

※ IR 분석은 v1에서 제외. JD만으로 시작한다.

---

## 지금까지 확정된 사실 (까먹지 말 것)

- **매칭 기준 "내 키워드" = `experience_blocks.competency_keywords`** (문자열 배열).
  - 같은 테이블의 `keywords` 칸은 어떤 코드도 안 쓰는 죽은 칸. 무시.
  - 경험 저장 시 AI 결과는 `competency_keywords` / `work_activities` / `software_skills` / `transferable_skills` 4개 배열 칸에 들어감 (insert: index.html `saveExperienceBlock`).
- **JD 키워드 추출** = Edge Function `extract-jd-keywords` (배포 완료).
  - 입력: `{ company, role, jd_text }` → 출력: `{ company_keywords: [...] }`
  - 형식을 `competency_keywords`와 똑같은 "미국 채용시장 역량 명사구"로 맞춤 (3단계 매칭 어긋남 방지).
  - 호출: index.html `extractJdKeywords()` → `supa.functions.invoke('extract-jd-keywords', ...)`
  - 입력 UI 위치: `page-matchstore`(Match Archiving 화면) 헤더 바로 아래.
- 두 Edge Function 모두 Groq(`llama-3.3-70b-versatile`), 환경변수 `GROQ_API_KEY` 공유.

## ▶ 지금 할 일: 2단계 ③ — company_keywords 저장 연결

추출한 키워드를 `company_keywords` 테이블에 저장한다.
**먼저 테이블 컬럼 이름을 대시보드(Table Editor)에서 확인해야 한다** — 회사명/직무명/키워드배열/user_id 칸 이름. 추측으로 짜면 칸 이름 틀려서 에러난다.
