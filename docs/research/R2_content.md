# R2 — 콘텐츠 제작·입력

조사 방법: biz 보고서(01 시장 §6, 02 고객 결론 2, 03 학습과학 §2.1·3.2, 09 §5, 11 §4)를 먼저 인용하고, 가져오기 형식·AI 생성·미디어·내보내기는 경쟁 제품 문서와 라이브러리 문서를 웹으로 확인했다(2026-11-02). 현재 코드(`src/core/outline.ts`)를 읽고 이미 되는 범위(들여쓰기·글머리·번호 개요 붙여넣기)는 후보에서 뺐다. LLM 비용은 Anthropic 공식 가격표 기준이고, 환율은 1,400원/$로 가정했다 [가정].

**전제 두 가지.** ① 사용자는 트리를 처음부터 만드는 수고를 대체로 감수하지 않는다. 미국 의대생 Anki 사용자의 97.6%가 남이 만든 카드를 쓴다 [02 결론 2]. 그래서 입력 비용을 줄이는 기능이 이 분야의 핵심이다. ② 결정 9의 "LLM 없음"은 **채점**에 관한 결정이다. 생성에도 적용되는지는 [미확인: 창업자 결정 필요]이다. 그래서 LLM 항목은 서버 없이 쓰는 대안과 함께 평가했다.

| # | 기능 | 가치 | 근거(출처) | 난이도 | 제약 | 우선순위 |
|---|---|---|---|---|---|---|
| 1 | AI 프롬프트 복사 → 개요 붙여넣기 (외부 AI 브리지) | 서버·API 비용 0원으로 "AI 초안 → 편집 → 인출" 흐름을 바로 열 수 있다 | AI 생성은 필수 기능이지만 AI가 만든 맵은 정확도가 낮다(6/10). 그래서 "AI 초안 → 사용자 편집" 흐름이 기회다 [01 §6, https://dev.to/paras_builds/how-i-use-google-notebooklm-to-create-flashcards-quizzes-mind-maps-and-ai-podcasts-bff]. 개요 파서는 이미 있다(`src/core/outline.ts`) | S | 로컬 OK | P0 |
| 2 | PDF 북마크(목차) → 트리 가져오기 | 수험서·강의 PDF의 목차를 몇 초 만에 뼈대 트리로 만든다 | pdf.js `getOutline()`이 북마크 트리를 중첩 `items`로 돌려준다 [https://www.nutrient.io/blog/pdfjs-document-outline-bookmarks-metadata/]. RemNote·Flica도 PDF를 입력 경로로 내세운다 [01 표 S10·S11] | M | 로컬 OK | P0 |
| 3 | 개선: 정답 별칭(허용 표현) 자동 제안 — 규칙 기반 | 백지 퀴즈의 자기채점 비율을 낮춰 채점 신뢰도를 올린다 | 자기채점 비율이 30%를 넘으면 별칭 사전 보강이 1차 대응이다 [11 §4.3]. 채점 엔진이 이미 `aliases`를 읽는다(`src/core/types.ts`) | S | 로컬 OK | P0 |
| 4 | 시드 트리 갤러리 (정적 번들 템플릿) | 빈 캔버스 대신 검수된 트리로 시작해 첫 인출까지 걸리는 시간을 줄인다 | 시드 트리 40개 계획 [09 §5, decisions 3]. XMind Study 템플릿 3,758개 [https://templates.xmind.com/category/study]. 빈 캔버스 대 템플릿 시작 비교가 검증 과제다 [01 A5] | S | 로컬 OK | P0 |
| 5 | 개선: Markdown 제목·OPML·Notion 내보내기 가져오기/내보내기 | 다른 아웃라이너·노트앱에 있는 기존 노트를 그대로 옮긴다 | OPML은 Workflowy·Dynalist의 공용 교환 형식이다 [https://blog.workflowy.com/workflowy-now-supports-opml-import-and-export/, https://help.dynalist.io/article/78-import-data]. Notion은 토글을 `<details>/<summary>`로 내보낸다 [https://developers.notion.com/guides/data-apis/enhanced-markdown, https://unmarkdown.com/blog/notion-export-broken] | S | 로컬 OK | P1 |
| 6 | XMind(.xmind) 가져오기 | XMind로 정리해 둔 구조도를 그대로 퀴즈로 쓴다 | .xmind는 ZIP 안에 `content.json`(Zen 형식)을 담고 있다 [https://github.com/tobyqin/xmindparser/]. 단축키 UX가 같아 이주 대상이다 [01 표 S12] | M | 로컬 OK | P1 |
| 7 | Anki .apkg 가져오기 (덱 계층 → 트리) | Anki와 같이 쓰는 사용자가 기존 덱을 옮겨 오고, 공유 덱 생태계와 연결된다 | Traverse는 apkg를 미디어·태그·서브덱·스케줄링까지 포함해 가져온다 [https://traverse.helpscoutdocs.com/article/26-importing-anki-decks-into-traverse]. apkg는 ZIP + SQLite이고, 최신 `anki21b`는 zstd 압축이라 브라우저 파서가 대부분 지원하지 않는다 [https://eikowagenknecht.com/posts/understanding-the-anki-apkg-format/, https://github.com/74Genesis/anki-apkg-parser]. 병행 도구로 쓸 때 필수다 [01 Q1] | L | 로컬 OK | P1 |
| 8 | 인쇄용 학습지 PDF (원본 / 빈칸 / 백지) | 종이 백지복습 습관을 그대로 지원하고, 트리를 디지털과 종이 양쪽에서 쓰게 한다 | 서술형 수험생은 이미 종이에 목차 백지복습을 한다 [02 §2, https://wikidocs.net/365051]. 마인드맵 도구는 큰 맵의 A4 분할 인쇄 요청이 많다 [https://community.meister.co/discussion/1380/how-can-i-print-mindmaps-so-theyre-on-multiple-pages, https://mindmup.com/help/guides/printing] | S | 로컬 OK | P1 |
| 9 | 트리 이미지(PNG/SVG) 내보내기 | 카페·스터디 단톡방에 구조도를 공유해서 유입 경로를 만든다 | `modern-screenshot`(html-to-image 포크)이 DOM → PNG를 지원한다. 단, 외부 리소스는 CORS 제약이 있다 [https://github.com/BugCreators/modern-screenshot]. NotebookLM 마인드맵은 PNG 내보내기만 된다 [https://mapify.so/blog/mapify-vs-google-notebooklm] | S | 로컬 OK | P1 |
| 10 | 노드 이미지 첨부 | 해부도·도표처럼 글로 쓰기 어려운 리프 지식을 담는다 | 아이디어 브리프 ① "노드별 이미지/음성 첨부"[brief/idea.md]. 리프의 세부(설명·이미지)는 별도 카드로 둔다 [03 §3.2] | M | 로컬 OK | P1 |
| 11 | AI 교재 텍스트 → 트리 초안 생성 (앱 내장) | 붙여넣은 교재 한 장(章)으로 수십 초 안에 편집 가능한 트리를 만든다 | NotebookLM은 무료로 마인드맵을 생성하고, Mapify는 월 $5.99~9.99다 [https://mapify.so/pricing]. 국내 '백지복습' 앱은 업로드 자료만으로 인출 과제를 만든다 [01 S25]. Claude Haiku 5.5는 입력 $0.10, 출력 $0.50 /MTok이다 [https://platform.claude.com/docs/en/about-claude/pricing] | M | LLM 필요, 서버 필요 | P1 |
| 12 | AI 하위 노드 제안 + AI 별칭 제안 | 선택한 노드에 빠진 자식이나 동의어를 후보로 보여주고, 사용자가 골라 넣는다 | Mapify는 편집 가능한 AI 맵을 유료로 판다 [https://mapify.so/blog/mapify-vs-google-notebooklm]. Chrome 148의 Prompt API(Gemini Nano)는 데스크톱 전용이고 약 4GB 모델을 내려받는다 [https://developer.chrome.com/blog/gemini-nano-cpu-support, https://dejanmarketing.com/chrome-gemini-nano-offline-private-ai/] | M | LLM 필요 (서버 또는 온디바이스) | P2 |
| 13 | 이미지 가림(image occlusion) → 자식 노드 | 그림 위 라벨을 가리고 맞히게 해서, 의대·약대처럼 그림이 중심인 과목을 지원한다 | Anki 23.10에 기본 탑재됐다 [https://github.com/ankitects/anki/releases/tag/23.10]. RemNote에도 기본 기능이 있다 [https://help.remnote.com/en/articles/8664083-switching-from-anki-to-remnote]. 브라우저 구현체도 있다 [https://github.com/krmanik/image-occlusion-in-browser] | L | 로컬 OK | P2 |
| 14 | 수식(LaTeX) 렌더링 — 노드 내용 한정 | 회계·공학·통계 과목에서 공식을 노드 내용에 넣는다 | KaTeX는 gzip 약 100KB이고 수식당 약 1ms에 렌더링한다. MathJax보다 가볍다(2차 출처) [https://gauravtiwari.org/course/latex-for-students/math-on-the-web/katex-mathjax] | S | 로컬 OK | P2 |
| 15 | 음성: 노드 읽어주기(TTS) + 음성으로 답 말하기(STT) | 이동 중에 손을 쓰지 않고 드릴다운 복습을 한다. 공개 전에 말로 먼저 인출하게 한다 | 공개 전에 하위 항목을 입력(타이핑·음성)하게 하는 쪽이 효과가 크다 [03 §2.2, Kang 2007]. Chrome의 SpeechRecognition은 음성을 Google 서버로 보낸다. ko-KR 온디바이스 지원은 [미확인]이다 [https://Developer.Mozilla.org/ko/docs/Web/API/Web_Speech_API, https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api] | M | 로컬 OK(TTS) / 서버 경유(STT, 브라우저 벤더) | P2 |

## 항목별 설명

**1. AI 프롬프트 복사 브리지.** 앱이 "이 교재 내용을 쟁점어 중심의 들여쓰기 개요로 만들어라. 노드 제목은 15자 이하로" 같은 프롬프트를 복사해 준다. 사용자가 ChatGPT, Claude 또는 NotebookLM에 교재와 함께 붙여 넣고, 돌려받은 개요를 기존 개요 붙여넣기로 넣는다. 서버·키·비용·개인정보 처리위탁이 모두 없어서, 결정 9의 취지와도 충돌하지 않는다.
- UX: 트리 목록의 [+ 새 트리] → "AI로 초안 만들기" 탭 → [프롬프트 복사] 버튼과 [결과 붙여넣기] 칸이 한 화면에 나란히 있다.

**2. PDF 목차 가져오기.** pdf.js를 동적 import로 불러와 `getOutline()`의 중첩 `items`를 `OutlineItem[]`로 바로 바꾼다. 북마크가 없는 PDF나 스캔 PDF는 지원하지 않는다. 수험서 PDF 중 북마크가 있는 비율은 [미확인]이다. pdf.js는 무거워서(수백 KB 이상 [미확인]) 가져오기 화면에서만 불러온다.
- UX: PDF를 드롭하면 목차 미리보기 트리가 뜨고, 필요한 장만 체크해서 [트리 만들기]를 누른다.

**3. 규칙 기반 별칭 제안.** 노드 제목에서 괄호 병기(`근로기준법(근기법)`), 영문·한자 병기, 띄어쓰기 변형, "~의 원칙"·"~제도" 같은 접미 생략형을 뽑아 별칭 후보로 보여준다. 백지 퀴즈에서 사용자가 쓴 답 가운데 자기채점으로 '맞음'을 받은 표현도 후보로 쌓는다. LLM 없이 채점 정확도를 올리는 가장 싼 레버다.
- UX: 노드를 편집할 때 제목 아래에 회색 칩 `+근기법 +근로기준 법`이 뜨고, 탭하면 별칭으로 확정된다.

**4. 시드 트리 갤러리.** 첫 단계에서는 검수된 트리 JSON을 앱 정적 자산으로 함께 배포하고, "복제해서 내 트리로" 버튼만 둔다. 서버도 사용자 업로드도 필요 없다. 콘텐츠 제작(트리당 60분 목표 [09 §5])이 실제 병목이고, 개발은 S다. 사용자 공유와 마켓은 R4(공유·커뮤니티)와 겹치므로 여기서는 정적 갤러리까지만 다룬다.
- UX: 빈 트리 목록에 "노무사 2차 · 노동법 목차 30개" 카드가 보이고, 탭하면 미리보기 후 [내 트리로 복제]를 누른다.

**5. Markdown·OPML·Notion 형식 개선.** 지금 파서는 들여쓰기와 글머리만 계층으로 읽는다. `#`~`######` 제목 단계를 깊이로 읽고, OPML(`<outline text>` 중첩)을 `DOMParser`로 읽고, Notion의 `<details><summary>` 토글을 자식으로 읽으면 대부분의 노트앱 내보내기를 받을 수 있다. 내보내기 쪽도 OPML을 추가하면 XMind·Workflowy로 돌려보낼 수 있다.
- UX: 기존 개요 붙여넣기 칸에 .md/.opml 파일을 드롭하면 형식을 자동으로 감지한다.

**6. XMind 가져오기.** ZIP을 풀어(fflate 등) `content.json`의 `rootTopic.children.attached`를 재귀로 따라가면 된다. 구형 XML 형식(content.xml)은 [미확인] 비율이므로 2단계로 미룬다. 노트(`notes.plain`)는 노드 내용으로 옮긴다.
- UX: .xmind 파일 드롭 → 시트가 여러 개면 시트를 고르는 목록 → 트리 생성.

**7. Anki .apkg 가져오기.** fflate와 sql.js(WASM)로 브라우저 안에서 읽는다. 덱 이름의 `::` 계층을 트리 가지로, 카드 앞면을 노드 제목으로, 뒷면을 노드 내용으로 옮긴다. `anki21b`(zstd)는 지원하지 않으므로 "Anki에서 '구형 호환' 옵션으로 내보내기"를 안내해야 한다. 평면 카드가 트리로 바뀌면서 Drill Down의 구조 퀴즈 가치가 약해질 수 있다는 점은 감안해야 한다 [추론].
- UX: apkg 드롭 → 덱 계층 미리보기 → "카드 앞면을 노드 제목으로" 옵션 확인 → 가져오기.

**8. 인쇄용 학습지.** `@media print` CSS와 `window.print()`만으로 만든다. 세 모드를 둔다. 원본 개요 / 빈칸 학습지(일부 단계의 제목을 밑줄로 바꿈) / 백지 학습지(루트와 노드 개수만 표시). 그래프 대신 들여쓰기 개요로 인쇄해서 A4 분할 문제를 피한다.
- UX: 트리 ⋯ 메뉴 → [인쇄] → 모드 3개 중 하나와 "가릴 깊이"를 고르면 브라우저 인쇄 대화상자가 열린다.

**9. 이미지 내보내기.** 그래프 뷰의 DOM을 `modern-screenshot`으로 PNG로 바꾼다(scale 2). 학습 상태 색칠을 끄거나 켜는 옵션을 둔다. 구조도 이미지는 무료 공유 콘텐츠로 유입을 늘리는 수단이 된다 [01 A6].
- UX: 그래프 뷰 툴바 [이미지로 저장] → 현재 보이는 범위와 전체 트리 중 하나를 고른다.

**10. 이미지 첨부.** 이미지는 IndexedDB에 Blob으로 저장하고, 노드 내용에서 참조한다. 업로드할 때 긴 변 1600px 이하로 줄여 저장소 용량을 관리한다. 이미지는 노드 내용(정답 공개 쪽)에만 두고 제목에는 두지 않는다. 그래야 텍스트 채점 엔진이 영향을 받지 않는다. 노드 `note` 형식 계약(orchestration_modes §3.2)을 확장해야 하므로 공유 계약 변경 사항이다.
- UX: 노드 내용을 편집하다 이미지를 붙여넣거나(Ctrl+V) 드롭하면 썸네일이 들어가고, 플래시카드에서 공개할 때 크게 보인다.

**11. 앱 내장 AI 트리 생성.** 교재 한 장을 2만 토큰 입력, 3천 토큰 출력으로 잡으면 Haiku 5.5 기준 약 $0.0035, 약 5원이다 [추론: 공식 단가 × 가정 크기]. 비용이 아니라 **서버 운영과 개인정보 국외이전 고지**가 진짜 장벽이다 [11 §6]. Pi API 서버에서 사용자당 월 한도를 두는 프록시를 만들면 M이다. 사용자가 자기 API 키를 넣는 방식(BYOK)이면 서버 없이도 되지만, 수험생 대상으로는 진입장벽이 높다 [추론]. #1로 수요를 확인한 뒤 결정한다.
- UX: 텍스트나 PDF 본문을 붙여넣고 [AI 초안] → 스트리밍으로 트리가 자라고 → 완료 후 바로 에디터로 넘어간다.

**12. AI 하위 노드·별칭 제안.** 선택한 노드에서 "빠진 하위 항목 제안"과 "동의어 제안"을 요청한다. 결과는 자동으로 넣지 않고 칩 후보로만 보여준다. AI의 낮은 정확도 [01 §6]를 사용자 검수로 막기 위해서다. Chrome Prompt API는 데스크톱 Chrome에서만 되고 한국어 품질도 [미확인]이어서, 서버 LLM이 주 경로다.
- UX: 노드 우클릭 → [하위 항목 제안] → 점선 유령 노드 3~5개가 뜨고, Enter로 채택한다.

**13. 이미지 가림.** 이미지 위에 사각형을 그리면 사각형마다 자식 노드(제목 = 라벨)가 생긴다. 플래시카드와 빈칸 퀴즈에서는 그 영역을 가리고 맞히게 한다. 노무사 비치헤드에는 수요가 낮고, 의대·약대로 확장할 때 필요하다 [02 표]. #10이 선행 조건이다.
- UX: 첨부 이미지 → [가림 편집] → 드래그로 박스를 그리고 라벨을 입력하면 트리에 자식 노드가 자동으로 생긴다.

**14. LaTeX.** KaTeX를 노드 내용의 `$…$`에만 적용하고, 제목에는 넣지 않는다(채점 대상이므로). KaTeX는 필요할 때 지연 로딩한다. 노무사·행정법 비치헤드에는 수요가 거의 없다.
- UX: 내용에 `$\frac{a}{b}$`를 입력하면 편집을 마칠 때 수식으로 렌더링된다.

**15. 음성.** TTS(`speechSynthesis`)는 OS 음성을 써서 로컬에서 바로 된다. 드릴다운 모드에서 노드 제목을 읽어주는 '듣기 복습'이 S다. STT 답 입력은 Chrome에서 Google 서버를 거치므로 개인정보 고지와 오프라인 불가를 함께 안내해야 한다. 한국어 인식 품질은 [미확인]이다.
- UX: 드릴다운 화면의 🎤 버튼을 누르고 하위 항목을 말하면, 받아쓴 텍스트를 채점 엔진이 기존 텍스트 답처럼 비교한다.

## 분야 Top 3
1. **#1 AI 프롬프트 복사 브리지**: 0원·서버 없이 "사용자는 직접 만들지 않는다"[02]와 "AI 초안 → 편집"[01 §6]을 동시에 해결한다. 기존 개요 파서를 그대로 쓰므로 S다.
2. **#2 PDF 목차 → 트리**: 수험생이 이미 가진 PDF에서 뼈대를 결정적으로(LLM 오류 없이) 뽑는다. 로컬에서만 처리하고 개인정보도 밖으로 나가지 않는다.
3. **#3 규칙 기반 별칭 제안**: 11 §4의 자기채점 30% 신호에 대한 1차 대응책이다. 입력 품질이 곧 채점 품질이 되는 Drill Down 고유의 레버다.

(차점: #4 시드 트리 갤러리. 개발은 S이지만 가치가 콘텐츠 제작에 달려 있어 biz 로드맵에서 따로 관리한다.)
