# R3 — 에디터·시각화·탐색 UX

조사 방법: 경쟁 제품(RemNote, Anki, XMind, MindNode, Logseq, Heptabase, Obsidian 플러그인, Quizlet, Brainscape, 클래스카드)의 공식 도움말·스토어 설명을 웹 검색으로 확인했고, W3C APG로 접근성 기준을 확인했다(2026-11-02). 현재 구현 여부는 `src/`를 grep으로 확인했다. 확인 결과 다크 모드는 시스템 설정 연동만 있고, 핀치 줌·검색·아웃라인 뷰·태그는 없다. biz 문서(02 결론 2, 09 §5)가 "에디터 완성도는 우선순위가 낮다"고 했으므로, 우선순위는 학습 흐름에 직접 닿는 기능 쪽으로 매겼다.

| # | 기능 | 가치 | 근거(출처) | 난이도 | 제약 | 우선순위 |
|---|---|---|---|---|---|---|
| 1 | 노드 검색·빠른 이동 (Ctrl+F / Ctrl+K) | 큰 트리에서 원하는 쟁점을 몇 초 안에 찾는다 | RemNote Ctrl+P 검색·검색 포털 https://help.remnote.com/en/articles/6030721-searching-your-knowledge-base ; Anki 브라우저 검색 https://docs.ankiweb.net/searching.html | S | 로컬 OK | P0 |
| 2 | 포커스 모드(서브트리 줌인 + 경로 표시) | 큰 트리의 한 가지만 보면서 편집·학습한다 | MindNode Focus Mode https://mindnode.com/user-guide/discover-and-dive-deeper/focus-mode ; Logseq 블록 줌인 https://discuss.logseq.com/t/clicking-the-bullet-to-enter-the-block-to-immediately-view-its-children/2738 | S | 로컬 OK | P0 |
| 3 | 서브트리 드래그로 부모 바꾸기 | 잘라내기·붙여넣기 없이 끌어서 트리 구조를 고친다 | MindNode 다른 노드 위로 끌어 연결 https://mindnode.com/user-guide/organize/reconnect-and-navigate ; ClickUp 사용자 요청 https://feedback.clickup.com/feature-requests/p/mindmap-drag-child-to-new-node-to-reparent ; XMind 재구조화 불만(02_customer §3) https://apps.apple.com/kr/app/xmind-%EB%A7%88%EC%9D%B8%EB%93%9C%EB%A7%B5/id1286983622 | M | 로컬 OK | P0 |
| 4 | 개선: 모바일 터치 제스처(핀치 줌, 길게 눌러 끌기, 두 손가락 이동) | 휴대폰에서도 에디터와 백지 퀴즈 캔버스를 쓸 수 있다 | MindNode iOS 제스처 https://mindnode.com/user-guide/settings-and-devices/gestures ; 클래스카드 "한 손으로 넘기는" 학습 https://apps.apple.com/kr/app/%ED%81%B4%EB%9E%98%EC%8A%A4%EC%B9%B4%EB%93%9C/id1176435331 | M | 로컬 OK | P1 |
| 5 | 세로 아웃라인 뷰 전환 | 모바일·IME 입력에 맞는 목록형 편집. 09의 MVP S 범위와 같다 | MindNode 아웃라인 모드 https://www.macstories.net/reviews/mindnode-for-ipad-and-iphone-adds-editable-outline-mode/ ; Logseq/RemNote 아웃라이너 https://help.remnote.com/en/articles/6030548-moving-rem-organizing-hierarchies | M | 로컬 OK | P1 |
| 6 | 태그·색상 라벨(과목·중요도) | 노드를 과목·중요도로 표시하고 한눈에 구분한다 | 브리프 idea.md ① "중요도/과목별 색상 태그" ; XMind 마커·라벨 https://xmind.com/user-guide/topic-filtering-new ; Anki 7색 플래그 https://docs.ankiweb.net/searching.html | M | 로컬 OK | P1 |
| 7 | 라벨·필터 기반 부분 학습(별표·라벨만 퀴즈) | "중요 표시만" 또는 "자주 틀린 것만" 범위로 드릴·퀴즈를 돌린다 | Quizlet 별표 용어만 학습 https://help.quizlet.com/hc/en-us/sections/360005938691-Studying ; XMind 라벨 필터 https://xmind.com/user-guide/topic-filtering-new | M | 로컬 OK | P1 |
| 8 | 다중 선택·일괄 편집(이동·삭제·라벨·접기) | 여러 노드를 한 번에 정리한다 | RemNote Shift+방향키 다중 선택·잘라내기 https://help.remnote.com/en/articles/6030548-moving-rem-organizing-hierarchies ; Anki 브라우저 Ctrl/Shift 클릭·일괄 찾아 바꾸기 https://docs.ankiweb.net/browsing.html | M | 로컬 OK | P1 |
| 9 | 접근성: ARIA tree 패턴 + 타입어헤드 | 스크린리더와 키보드만으로 트리를 읽고 탐색한다 | W3C APG Tree View https://www.w3.org/WAI/ARIA/apg/patterns/treeview/ | M | 로컬 OK | P1 |
| 10 | 교차 링크(트리 밖 관계선) + 백링크 | "A조문 ↔ B판례"처럼 가지를 넘는 관계를 표시한다 | XMind Relationship https://xmind.com/user-guide/relationship-new ; MindNode Connections https://mindnode.com/user-guide/organize/connections ; RemNote 참조·백링크 https://help.remnote.com/en/articles/6030776-backlinks | M | 로컬 OK | P2 |
| 11 | 레이아웃 전환(좌→우 / 위→아래 / 방사형) | 내용 모양에 맞는 배치로 보고, 인쇄·공유용 이미지를 만든다 | XMind 9종 구조, 클릭 한 번으로 전환 https://xmind.com/structure | L | 로컬 OK | P2 |
| 12 | 명령 팔레트(Ctrl+K)·단축키 도움말 통합 | 메뉴를 찾지 않고 기능 이름으로 실행한다 | RemNote Omnibar https://help.remnote.com/en/articles/7852647-using-the-omnibar ; Obsidian 플러그인 단축키 커스터마이즈 https://community.obsidian.md/plugins/native-mindmap | S | 로컬 OK | P2 |
| 13 | 개선: 다크 모드 수동 전환(시스템·라이트·다크) | 시스템 설정과 다르게 앱만 어둡게 쓰는 야간 학습 | Anki 환경설정 테마 선택 https://docs.ankiweb.net/preferences.html [미확인: 세부 옵션명] ; 현재 앱은 `prefers-color-scheme`만 사용(`src/index.css:11`) | S | 로컬 OK | P2 |

### 1. 노드 검색·빠른 이동
제목·내용·별칭을 대상으로 하는 증분 검색이다. 기존 채점 엔진의 정규화와 자모 퍼지 매칭을 재사용하면 오타와 초성 검색도 처리된다. Anki처럼 `miss:>2`, `tag:민법` 같은 조건 검색은 나중에 붙인다.
UX: Ctrl+F를 누르면 상단에 입력창이 열리고 결과 목록이 경로("민법 › 물권 › 점유")와 함께 보인다. Enter를 누르면 그 노드로 화면이 이동하고 선택된다.

### 2. 포커스 모드
선택한 노드를 임시 루트로 삼아 그 서브트리만 보여 준다. 위쪽에는 클릭할 수 있는 경로 표시를 둔다. 드릴다운과 퀴즈 범위 선택(`kit.tsx`의 범위 select)과 같은 개념이라, 에디터에서 바로 "이 가지만 학습"으로 이어진다. Logseq 사용자들은 "줌인 시 접힌 자식이 안 보인다"는 불만을 낸다. 따라서 줌인하면 자동으로 펼쳐야 한다.
UX: 노드를 고르고 `F`를 누르면 그 가지만 화면에 맞춰 확대되고, `Esc`나 경로 클릭으로 빠져나온다.

### 3. 서브트리 드래그로 부모 바꾸기
지금 드래그는 offset만 옮기고, 부모를 바꾸려면 Ctrl+X/V를 써야 한다. MindNode는 끌어서 다른 노드 위에 놓으면 그 노드의 자식이 되고, 형제 사이에 놓으면 순서가 바뀐다. 실행 취소 스택과 `order` 중간값 규칙을 그대로 쓰면 된다.
UX: 카드를 끌어 다른 카드 위에 올리면 대상 카드에 테두리가 생긴다. 놓으면 하위로 붙고 "되돌리기" 토스트가 뜬다.

### 4. 개선: 모바일 터치 제스처
지금 캔버스는 Ctrl+휠과 버튼으로만 확대한다(`touch-action: none`, 핀치 처리 코드 없음). 두 손가락 핀치 줌과 이동, 길게 눌러 끌기(짧은 탭은 선택), 길게 눌러 서브트리 선택을 추가한다. 백지·빈칸 퀴즈의 카드 D&D도 같은 포인터 처리를 쓰므로 함께 좋아진다.
UX: 휴대폰에서 두 손가락으로 벌리면 확대되고, 카드를 0.4초 누르면 살짝 떠오르면서 끌 수 있게 된다.

### 5. 세로 아웃라인 뷰 전환
그래프와 같은 데이터를 들여쓰기 목록으로 보여 준다. 좁은 화면과 한글 IME 입력에서 그래프보다 안정적이다. 09_synthesis는 MVP를 "세로 목차 에디터"로 정했는데, 지금 앱은 그래프 에디터만 있다. 키보드 단축키(Enter·Tab·방향키)는 그대로 쓸 수 있다.
UX: 상단 토글 `그래프 | 목록`. 목록에서는 Tab으로 들여쓰고, 왼쪽 ▸를 탭하면 접고 편다.

### 6. 태그·색상 라벨
노드마다 라벨을 0개 이상 단다. 라벨 이름과 색은 트리별 팔레트에서 고른다. `TreeNode`에 필드를 추가해야 하므로 공유 계약 변경(오케스트레이터 소유)이 필요하다. 오답 붉은색·학습 상태 색칠과 겹치지 않게, 색은 카드 왼쪽 띠나 점으로만 표시한다.
UX: 노드를 선택하고 `L`을 누르면 라벨 팝오버가 열리고, 숫자키 1~7로 바로 붙인다.

### 7. 라벨·필터 기반 부분 학습
Quizlet "별표만 학습", Anki `flag:1` 검색처럼, 라벨·별표·오답 점수 조건으로 드릴다운·FSRS·퀴즈 범위를 좁힌다. #6에 의존한다. 별표 하나만 먼저 만들면 S다. 학습 효과 면에서는 R1(오답 관리)과 겹치므로 통합할 때 합쳐야 한다.
UX: 퀴즈 시작 화면의 범위 선택에 `⭐ 별표만`, `자주 틀림` 칩이 추가된다.

### 8. 다중 선택·일괄 편집
Shift+클릭, Shift+방향키, 캔버스 드래그 사각형 선택. 선택한 것들에 이동(Ctrl+X/V)·삭제·라벨·접기를 한 번에 적용한다. 실행 취소는 묶음 하나로 처리한다. RemNote에서도 다중 선택 상태의 Alt+방향키 이동은 버그 보고가 있으므로, 처음에는 잘라내기·붙여넣기 방식만 지원한다.
UX: Shift를 누른 채 카드를 여러 개 클릭하면 상단에 "3개 선택됨 · 라벨 · 삭제 · 접기" 바가 나타난다.

### 9. 접근성: ARIA tree 패턴
지금 그래프 카드에는 tree 역할이 없다(aria는 퀴즈 슬롯·줌 버튼 정도에만 있다). APG Tree View 기준으로 `role="tree"/"treeitem"`, `aria-level`, `aria-expanded`, `aria-selected`를 붙이고, 첫 글자 타입어헤드 이동을 넣는다. 방향키 탐색은 이미 있으므로 대부분 속성 추가 작업이다. 공공·교육 시장에 진입하려면 필요할 수 있다 [미확인: 국내 조달 요건].
UX: 스크린리더가 "점유, 3수준, 펼침, 2/5"처럼 읽고, `ㅁ`이나 `m`을 누르면 그 글자로 시작하는 다음 노드로 이동한다.

### 10. 교차 링크 + 백링크
트리 바깥 관계(비교·대립·예외)를 점선 곡선으로 잇고, 대상 노드에는 "연결됨 2" 백링크를 표시한다. 채점 엔진의 구조 비교는 부모-자식만 보므로, 링크는 채점에서 빼고 표시용으로만 둔다. 데이터 모델에 새 테이블이 필요하다(계약 변경).
UX: 노드에서 `R`을 누르고 다른 노드를 클릭하면 점선이 생기고, 선 가운데 라벨("vs")을 편집할 수 있다.

### 11. 레이아웃 전환
지금 자동 정렬은 한 방향뿐이다. XMind는 9가지 구조를 클릭 한 번으로 바꾸고, 가지마다 다른 구조를 섞을 수도 있다. 방사형은 offset 누적 규칙과 충돌하므로, 처음에는 좌→우와 위→아래(조직도) 두 가지만 지원한다. 수험생이 쓰는 판서·목차 형태와 비슷한 구조를 고를 수 있다.
UX: 툴바 `배치 ▾`에서 고르면 노드들이 새 위치로 애니메이션하며 이동한다.

### 12. 명령 팔레트
#1 검색창에 `>`를 입력하면 명령 모드가 된다(VS Code 방식). 지금 `?` 단축키 팝오버의 항목을 그대로 실행할 수 있는 목록으로 바꾼다. 단축키를 외우지 않은 신규 사용자가 기능을 찾는 데 도움이 된다.
UX: Ctrl+K → "자동 정렬" 입력 → Enter.

### 13. 개선: 다크 모드 수동 전환
CSS 토큰은 이미 다크용이 있으므로, `data-theme` 속성으로 덮어쓰는 토글만 추가하면 된다. 설정은 localStorage에 저장한다.
UX: 트리 목록 ⋯ 메뉴의 `테마: 시스템 / 라이트 / 다크`.

## 분야 Top 3
1. **노드 검색·빠른 이동 (#1)**: 난이도 S이고 기존 퍼지 매칭을 재사용할 수 있다. 트리가 커질수록 모든 작업의 출발점이 된다.
2. **포커스 모드 (#2)**: 난이도 S. 에디터에서 학습 범위 선택(드릴다운·퀴즈)으로 바로 넘어가는 다리 역할을 해서, 차별점인 인출 흐름을 강화한다.
3. **서브트리 드래그로 부모 바꾸기 (#3)**: 사용자 핵심 흐름인 "AI 초안이나 남의 트리를 고쳐 쓴다"(01·02)에서 가장 자주 하는 재구조화 작업을 직접 조작으로 만든다. XMind 리뷰의 불만 지점이기도 하다.
