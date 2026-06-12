# executive-news
행정부 카드뉴스의 제목/날짜/발행처를 가리고 클릭하면 보여주는 웹앱.

자료출처: https://www.korea.kr/multi/visualNewsList.do

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:4173`을 열면 됩니다. 서버는 korea.kr 목록 HTML을 `/api/cards?page=1` 형식으로 가져와 파싱합니다.

## Cloudflare Workers 배포

Cloudflare Workers에서는 정적 파일을 `public/`에서 제공하고, `src/worker.js`가 `/api/cards`와 `/api/image`를 처리합니다.

```bash
npm run worker:dev
npm run deploy
```
