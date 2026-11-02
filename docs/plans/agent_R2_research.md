# agent R2 plan — 콘텐츠 제작·입력 조사

산출물: `docs/research/R2_content.md` (형식: orchestration_feature_research.md §4)

## 조사 대상
- [x] 참고 문서 읽기: idea.md, 03_learning_science, 01_market, 02_customer, 09_synthesis, 11_cost_recovery
- [x] 현재 입력 기능 확인(src/ 개요 붙여넣기·내보내기 범위)
- [x] 가져오기: Markdown/OPML, XMind, Notion, Anki .apkg, PDF 목차, 강의 노트
- [x] AI 생성: 교재 텍스트→트리, 하위 노드 제안, 정답 별칭 제안 (경쟁 사례 + LLM 비용)
- [x] 미디어: 이미지, 이미지 가림, LaTeX, 음성(TTS/STT)
- [x] 템플릿·공유 트리 라이브러리
- [x] 내보내기: 인쇄용 PDF, 이미지
- [x] 보고서 작성·커밋

## 검증 방법
- 표 열 7개 고정, 후보 8~15개, 각 행 출처 URL, §3 기존 기능 중복 없음, 미확인 사실 [미확인] 표기.

## 변경 사항
- Notion 가져오기는 별도 행 대신 #5(Markdown·OPML·Notion 내보내기 형식)에 합쳤고, 사진 OCR(tesseract.js 한국어 정확도 미확인)은 후보에서 뺐다. 이유: 15개 상한을 지키기 위해서다.
