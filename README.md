# executive-news
행정부 카드뉴스의 제목/날짜/발행처를 가리고 클릭하면 보여주는 웹앱.

자료출처: https://www.korea.kr/multi/visualNewsList.do

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:4173`을 열면 됩니다. 서버는 korea.kr 목록 HTML을 `/api/cards?page=1` 형식으로 가져와 파싱합니다.

## Vercel 배포

Vercel에서는 `public/`을 정적 파일로 제공하고, `api/cards.js`와 `api/image.js`가 서버리스 함수로 실행됩니다.

```bash
npm run dev
```

GitHub 저장소를 Vercel에 연결하면 별도 빌드 명령 없이 배포할 수 있습니다.
