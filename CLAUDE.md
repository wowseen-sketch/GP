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

## ⚠️ 교훈 (꼭 지킬 것)

- **작업 시작 전 항상 `git pull`로 origin/main 최신 받기.** 한 번 로컬이 origin/main보다 **93커밋 뒤처진** 채로 작업해서, 배포된 함수(freetext 기대)와 내 로컬(옛 PDCA 입력)이 어긋나 analyze-experience가 계속 빈 결과를 주는 걸로 한참 헤맸다. 팀원이 자주 머지하므로 매번 최신부터 받고 시작한다.

---

## v1 전체 계획 (총 1.5~2주)

- **0단계**: ✅ 완료 — 매칭 기준 = `experience_blocks.competency_keywords` (확정). `keywords` 칸은 죽은 칸, 안 씀.
- **1단계**: ✅ 완료 — 테이블 2개 생성 (company_keywords, match_results) + RLS/정책/GRANT
- **2단계**: ✅ 완료 — JD 텍스트 → 키워드 추출
  - ✅ ① extract-jd-keywords Edge Function 배포 + CORS 수정
  - ✅ ② Match 화면(page-matchstore)에 JD 입력 UI + 추출 미리보기
  - ✅ ③ 추출 키워드를 company_keywords 테이블에 저장 (upsert, 회사+직무 덮어쓰기)
- **3단계**: ✅ 로컬 검증 통과 — competency_keywords vs company_keywords 매칭 + 점수
  - match-keywords Edge Function(`classifyKeywords` 독립 함수) + Analyze Fit 버튼
  - 점수 = (matched×1 + partial×0.5) ÷ 기업키워드수 × 100
  - ⬜ 아직 안 함: match_results 테이블 저장 (company_keyword_id 연결 필요)
- **4단계**: ⬜ 결과를 Match 화면 본문(목업 자리)에 실데이터로 표시

※ IR 분석은 v1에서 제외. JD만으로 시작한다.

### 🔀 origin/main 병합 (2026-06 기준)
- origin/main(93커밋 앞섬)을 우리 브랜치로 **merge 완료** (충돌 0개, 로컬 검증 통과).
- 병합 직전 상태는 `backup-before-merge` 브랜치에 보존.
- **입력 방식이 바뀜: PDCA 칸(Plan/Do/Check/Action) → freetext(Scribble) + STAR 프레임워크.**
  - 경험 저장은 이제 자유 서술 한 덩어리(`freetext`)를 받아 analyze-experience가 STAR로 구조화 + 키워드 추출.
  - analyze-experience 입력 = `{ freetext }` (옛 `{ goal, strategy, ... }` 아님). 응답에 `star_structured` 포함.

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

## ▶ 지금 할 일: PR 올리기 전 점검

2~3단계 + origin/main 병합까지 로컬 검증 통과. **아직 push 안 함.** PR 전에 사용자와 한 번 더 점검하기로 함.
그다음 후보 작업:
- 4단계: 매칭 결과를 Match 화면 본문에 실데이터로 표시
- 3단계 마무리: match_results 테이블에 매칭 이력 저장 (UNIQUE 없음 → 매번 새 줄로 쌓기. 저장하려면 `company_keyword_id` 필요)
