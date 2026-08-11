# CubicJ Brewing

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-Desktop%20%2B%20Mobile-483699?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Release](https://img.shields.io/github/v/release/cubicj/CubicJ-Brewing)](https://github.com/cubicj/CubicJ-Brewing/releases/latest)

[English](README.md) | **한국어**

커피 브루잉을 위한 [Obsidian](https://obsidian.md) 플러그인 — 실시간 BLE 저울 연동, 가이드 브루잉 플로우, 구조화된 기록 관리를 옵시디언 노트 안에서 기록합니다.

> 현재 **Windows**에서 **Acaia Pearl S**를 지원합니다. 다른 Acaia 모델 및 플랫폼은 계획 중입니다.

<p align="center">
  <img src="assets/ko/Brewing.gif" alt="실시간 BLE 브루잉 세션 — 라이브 무게 차트" width="360">
  <br>
  <em>라이브 브루잉 세션 — Acaia Pearl S를 통한 실시간 무게 추적 및 프로파일 차트</em>
</p>

## 기능

- **실시간 저울 연결** — Acaia Pearl S 블루투스 연동
- **가이드 브루 플로우** — 5단계 아코디언 UI (방식 → 원두 → 파라미터 → 추출 → 저장)
- **필터 & 에스프레소 모드** — 추출 방식별 파라미터
- **라이브 브루 프로파일 차트** — 추출 중 실시간 무게-시간 그래프 기록, 호버 시 무게·유량·시간 표시
- **원두 인벤토리** — 로스팅 일수, 남은 원두 무게, 상태 추적
- **브루 히스토리** — 원두별/일자별 기록, 추출 그래프, 로스팅 경과일, 사용 장비, 인라인 메모 편집
- **장비 관리** — RPM 설정을 포함한 그라인더, 드리퍼, 필터, 바스켓, 액세서리
- **볼트 네이티브 저장** — 모든 데이터를 일반 파일로, Obsidian Sync 호환
- **다국어 지원** — 한국어, 영어, 커뮤니티 확장 가능

BLE와 브루잉 사이드바는 데스크톱(Windows) 전용이며, 원두 인벤토리·브루 히스토리·일일 기록은 모바일에서도 동작합니다.

## 스크린샷

<p align="center">
  <img src="assets/ko/beans-table.png" alt="원두 인벤토리 — 로스팅 일수와 잔여 무게" width="720">
  <br>
  <em>원두 인벤토리 — 원두별 로스팅 일수, 남은 원두 무게, 상태 추적</em>
</p>

<p align="center">
  <img src="assets/ko/brews-table.png" alt="브루잉 기록 테이블 — 날짜, 방식, 메모" width="720">
  <br>
  <em>원두별 브루잉 히스토리 테이블</em>
</p>

<p align="center">
  <img src="assets/ko/brews-detail.png" alt="브루잉 상세 모달 — 프로파일 차트" width="720">
  <br>
  <em>브루잉 상세 — 추출 파라미터와 무게-시간 그래프</em>
</p>

## 설치

1. [최신 릴리즈](https://github.com/cubicj/CubicJ-Brewing/releases/latest)에서 `cubicj-brewing.zip` 다운로드
2. zip 압축 해제 — `main.js`, `manifest.json`, `styles.css`, `noble/` 폴더가 있어야 합니다.
3. 모든 내용을 `<볼트 경로>/.obsidian/plugins/cubicj-brewing/`에 복사
4. Obsidian 재시작 → 설정 → 커뮤니티 플러그인 → "CubicJ Brewing" 활성화

> `noble/` 폴더는 네이티브 BLE 애드온입니다 — 빠뜨리지 마세요.

## 문서

전체 문서는 **[위키](https://github.com/cubicj/CubicJ-Brewing/wiki)**에 있습니다:

- [설치](https://github.com/cubicj/CubicJ-Brewing/wiki/Installation-(Korean)) — 요구사항과 설치 절차
- [시작하기](https://github.com/cubicj/CubicJ-Brewing/wiki/Getting-Started-(Korean)) — 저울 연결과 단계별 브루 플로우
- [기록 관리](https://github.com/cubicj/CubicJ-Brewing/wiki/Record-Keeping-(Korean)) — 원두 재고, 브루잉 기록, 일일 기록
- [설정과 장비](https://github.com/cubicj/CubicJ-Brewing/wiki/Settings-and-Equipment-(Korean)) — 플러그인 설정과 장비 관리

## 감사의 말

- [Matrix Sans](https://github.com/FriedOrange/MatrixSans) 도트 매트릭스 폰트 — [SIL Open Font License 1.1](FONT-LICENSE-OFL.txt)

## 라이선스

[MIT](LICENSE)
