# Claude with Ditto

메타몽이 프롬프트 위에서 작업 상태를 표정으로 알려 주는 Claude Code Mods입니다. 터미널(CLI)과 Claude Desktop의 Code 탭에서 모두 동작합니다.

## 설치

터미널에서 Claude Code를 실행한 뒤 프롬프트에 입력합니다.

```text
/plugin install ditto --marketplace 4anghyeon/claude-with-ditto
```

셸에서 바로 설치할 수도 있습니다.

```sh
claude plugin install ditto --marketplace 4anghyeon/claude-with-ditto
```

Desktop 앱에서는 `/plugin`이 동작하지 않습니다. 프롬프트 입력창 옆의 + 버튼을 누르고 Plugins에서 Add marketplace로 `4anghyeon/claude-with-ditto`를 추가한 뒤 Add plugin을 누르세요.

## 제거

셸에서 모드를 지웁니다.

```sh
claude plugin uninstall ditto@claude-with-ditto
```

마켓플레이스 등록까지 지우려면 이어서 실행합니다.

```sh
claude plugin marketplace remove claude-with-ditto
```


## 기능

- 프롬프트 위에서 도트 메타몽이 움직입니다. 터미널에서는 반 칸 블록 문자, Desktop에서는 애니메이션 SVG로 그립니다.
- 작업 상태에 따라 표정이 바뀝니다.

  | 상태 | 모습 | 언제 | 움직임 |
  |---|---|---|---|
  | 대기 중 | ![대기 중](docs/images/idle.gif) | 세션을 시작했을 때 | 눈만 깜박임 |
  | 생각 중 | ![생각 중](docs/images/thinking.gif) | 프롬프트를 보냈을 때, 파일 읽기, 테스트 실행 | 통통 튀고 물음표가 뜸 |
  | 함께 작업 중 | ![함께 작업 중](docs/images/working.gif) | 파일 수정, 그 밖의 명령 실행 | 노트북 앞에서 타이핑 |
  | 오류 발견 | ![오류 발견](docs/images/error.gif) | 답변에 오류나 실패가 있을 때 | 물방울이 맺힘 |
  | 작업 완료 | ![작업 완료](docs/images/done.gif) | Claude가 답을 마쳤을 때 | 별이 반짝임 |

- 메타몽 옆에는 지금 상태와 한마디가 뜹니다. 한마디는 상태별 10개 중에서 무작위로 나오고 5초마다 바뀝니다.
- `/ditto <질문>`으로 메타몽에게 물어볼 수 있습니다. 질문은 지금 세션으로 바로 가고, Claude가 대화 맥락을 그대로 이어서 메타몽 말투로 답합니다.
- `/ditto mood <idle|thinking|working|error|done>`로 표정을 직접 바꿔 보고, `/ditto demo`로 다섯 표정을 차례로 봅니다.

## 알아 둘 점

스프라이트 프레임은 `hooks/sprites.mjs`에 들어 있습니다. 외부 이미지나 네트워크 요청은 쓰지 않습니다.

터미널에서는 줄 간격을 1.0으로 맞추고 블록 문자가 들어 있는 고정폭 글꼴(JetBrains Mono 등)을 쓰면 메타몽이 끊기지 않고 깔끔하게 보입니다.

## 요구 사항

- 모드를 지원하는 Claude Code 2.1.287 이상
- 대화형 CLI나 Claude Desktop의 Code 탭 (그리는 방식은 화면마다 조금 다릅니다)

## 검사와 실행

`claude-with-ditto/` 폴더가 있는 곳에서 실행합니다.

```sh
claude plugin validate ./claude-with-ditto
claude plugin test ./claude-with-ditto
claude --plugin-dir ./claude-with-ditto
```

세션 안에서 이렇게 써 봅니다.

```text
/ditto demo
/ditto 이 컴포넌트의 상태 관리 구조를 같이 검토해 줘
```

## 폴더 구성

```text
claude-with-ditto/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── docs/
│   └── images/            README의 상태별 GIF
├── hooks/
│   ├── hooks.json
│   ├── ditto.mjs
│   └── sprites.mjs
├── tests/
│   └── *.test.ts
├── types/
│   └── index.d.ts
└── README.md
```

## 보안

이 모드는 세션 이벤트를 보고 메타몽을 그리는 일 말고는 아래 두 가지만 합니다.

- `/ditto <질문>`을 입력하면 그 질문을 현재 세션에 보냅니다.
- 메타몽에게 온 질문에 메타몽 말투로 답하도록 시스템 프롬프트에 짧은 섹션을 붙입니다.

사용자가 입력한 프롬프트는 건드리지 않고, 도구 실행을 막거나 대신 승인하지도 않습니다. 파일을 읽거나 쓰지 않고 네트워크 요청도 보내지 않습니다.
