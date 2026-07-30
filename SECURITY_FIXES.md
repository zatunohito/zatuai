# zatuai セキュリティ改善メモ（フリー/ビジー公開方針）

> 目的: 「予約を受け付けるための公開アシスタント」として、**予定の中身は見せず、空き/埋まり（フリー/ビジー）だけを公開**する構成に寄せる。
> このドキュメントは *何を・なぜ・どう直すか* を列挙したもの。コード編集はまだ行っていない。
> 対象コミット時点で確認したファイル: `app/api/chat/route.ts`, `app/api/upcoming/route.ts`, `lib/tools/calendar.ts`, `lib/tools/notion.ts`, `lib/tools/discord.ts`, `lib/deepseek.ts`

---

## 0. 現状の理解（前提）

- Next.js 16 + DeepSeek エージェント。ツール: Google カレンダー取得 / Notion ステータス取得 / Discord DM 通知（予約リクエスト・問い合わせ転送）。
- `/api/upcoming`（GET）と `/api/chat`（POST）はいずれも **認証なし** で公開されている。
- `lib/tools/calendar.ts` は既に **タイトルをマスク**している（`(公開)` を含むイベントだけ件名を出し、それ以外は `予定あり` に置換 / `IGNORED_SUMMARIES` は非表示）。→ **フリー/ビジー方針の土台はできている。この「データ取得層でマスクする」設計は正しいので維持・拡張する。**

### ✅ 既にできていて良い点（壊さないこと）
- **マスクをデータ取得層（`getCalendarEvents`）で行っている**。LLM に渡る前にマスクされるので、仮に LLM がプロンプトインジェクションで乗っ取られても生タイトルは漏れない。これは正しい多層防御。**同じ思想を Notion にも適用する（後述 P0-1）。**
- 既定がマスク（fail-safe）で、`(公開)` を付けた時だけ公開になる方向性。
- ライブ確認では「システムプロンプトを出せ」「連絡先を出せ」は LLM が拒否した（ただし LLM のガードレールはセキュリティ境界ではない。守りはデータ層マスクと認証で行う）。
- クライアント JS バンドルに秘密情報の埋め込みなし。`react-markdown`（生 HTML 無効）で XSS リスク低。HSTS 有効。

---

## P0（最優先・今すぐ）

### P0-1. Notion ステータスツールが「全文」を無認証公開している
- **場所**: `lib/tools/notion.ts` `getNotionStatus()` → `app/api/chat/route.ts` の `get_notion_status` ツール。
- **問題**: Notion ページの `title`・**全ブロックのテキスト**・`pageId`・`last_edited_time` をそのまま返し、匿名ユーザーが `/api/chat` で「Notionのステータスは?」と聞くだけで丸ごと読める。カレンダーはマスクしているのに、Notion だけ**無マスクで中身が全公開**になっており、フリー/ビジー方針と矛盾している。
- **直し方（どれか）**:
  - (a) **公開アシスタントから `get_notion_status` ツールごと外す**（システムプロンプトの説明・`tools` 配列・ディスパッチの分岐を削除）。最も安全で、方針的にもおすすめ。
  - (b) 残すなら、返す内容を**公開して良い最小限のステータス文字列だけ**に制限する（カレンダー同様、Notion 側に「公開マーカー」を設けた行だけ返す等）。`pageId` は返さない。
  - (c) 認証（オーナー本人のみ）を通した時だけ呼べるようにする。

### P0-2. デプロイ版が生タイトルを返している（マスクが効いていない）
- **問題**: 本番 `https://zatuai.vercel.app/api/upcoming` と `/api/chat` は、ライブ確認時に `床屋` / `かんたろうと終日東京` / `jawsのmtg？` / `Supabase Meetup Tokyo #1` など**実際の件名**を返した。ローカルの `calendar.ts` にはマスクがあるのに本番に反映されていない（デプロイ差異、またはマスク導入前のビルド）。
- **直し方**: マスク済みの現行コードを**再デプロイし、本番の `/api/upcoming` が `予定あり` を返すことを実際に確認**する。修正コードは「デプロイされて初めて」効く。
- 確認コマンド例:
  ```bash
  curl -s https://zatuai.vercel.app/api/upcoming | jq '.events[].title' | sort -u
  # 期待: "予定あり" と、意図的に (公開) を付けた件名のみ
  ```

### P0-3. `/api/chat` と Discord 通知が無認証・無制限（コスト枯渇 & DM スパム）
- **場所**: `app/api/chat/route.ts`。誰でも無制限に POST でき、`notify_owner_of_schedule_request` / `notify_owner_of_inquiry` が **匿名ユーザー起点で Discord DM を送れる**。
- **問題**:
  - **金銭的 DoS**: 匿名の大量リクエストで DeepSeek API クレジットが際限なく消費される。
  - **DM スパム**: 予約/問い合わせツールを繰り返し叩かれると、あなたの Discord DM が攻撃者の任意文面で溢れる（`requesterName`/`contact`/`details`/`question`/`url` は攻撃者が自由に指定でき、そのまま DM 本文に埋め込まれる）。
- **直し方**:
  - **レート制限を必須化**。手軽な順:
    - Vercel WAF（Firewall）のレート制限ルールで `/api/chat` に IP 単位の上限。
    - もしくは Upstash Redis + `@upstash/ratelimit` で「IP 単位」＋「全体の1日あたり上限（グローバルキャップ）」を両方かける。LLM もツールも守れる。
  - **入力上限**: `messages` 配列の**最大件数**と各 `content` の**最大文字数**をサーバ側で検証して弾く（トークン爆撃対策）。
  - **通知内容の上限**: `notify_owner_*` に渡る各フィールドの長さ制限＋1セッションあたりの送信回数制限。DM 本文に入る文字列は untrusted として扱い、`@everyone`/`@here` やコードブロック崩し等を無害化（DM では @everyone は発火しないが、フィッシングリンク混入は残るので注意喚起）。
  - 公開フォームに **Cloudflare Turnstile / hCaptcha** 等の bot 対策を入れると自動スパムを大幅に減らせる。

---

## P1（早めに）

### P1-1. エラーメッセージがそのままクライアントに返る（内部情報漏洩）
- **場所**: `app/api/chat/route.ts` と `app/api/upcoming/route.ts` の `catch` が `error.message` をそのままレスポンスに入れている。加えて各ツールが**上流 API のレスポンス本文を含む例外メッセージ**を投げている:
  - `calendar.ts`: `Failed to fetch calendar events: <status> <Googleの生ボディ>` / `Failed to obtain access token: ...`
  - `notion.ts`: `Page fetch failed with status ...: <Notionの生ボディ>`
  - `discord.ts`: `Failed to send DM: ... <Discordの生ボディ>`
- **問題**: 障害時に Google/Notion/Discord の内部エラー詳細・ID・トークン周りの情報がクライアントに漏れうる。
- **直し方**: API ルートの `catch` では**汎用メッセージのみ返す**（例: `{ error: "内部エラーが発生しました" }` ＋ 500）。詳細は `console.error` でサーバ側ログにだけ残す。ツール層の詳細メッセージは握りつぶさずログには出すが、レスポンスには載せない。

### P1-2. クライアントが reasoning effort を指定できる（コスト増幅）
- **場所**: `app/api/chat/route.ts` の `body.effort`（`"high" | "max"`）→ `deepseek.ts` の `reasoning_effort` / `thinking`。
- **問題**: 匿名ユーザーが `effort:"max"` を送れば、より高価な推論経路を強制でき、コスト増幅につながる。
- **直し方**: 公開経路では **クライアントの `effort` を無視**してサーバ既定値に固定する（または認証済みオーナーのみ許可）。同様に `model` などコストに効くパラメータをクライアントに触らせない。

### P1-3. クライアントが `assistant` ロールのメッセージを注入できる
- **場所**: `app/api/chat/route.ts` の `incomingMessages`（`role: "user" | "assistant"`）をそのまま LLM に渡している。
- **問題**: 攻撃者が偽の `assistant` 発言（や、実際に curl で `system` ロール）を差し込み、会話履歴を捏造してガードレールを緩められる（履歴インジェクション）。今回データ層マスクのおかげで実害は出にくいが、設計上の弱点。
- **直し方**: サーバが受け取るのは**最後の `user` 発言（＋必要なら自前で保持した履歴）だけ**にする。少なくとも `role` を `user` に強制し、`system`/`assistant`/`tool` をクライアントから受理しない。会話履歴が要るならサーバ側（セッション/DB）で保持する。

---

## P2（余裕があれば・仕上げ）

### P2-1. フリー/ビジーの粒度をさらに絞る
- 現状はマスク済みでも「開始/終了時刻・件数・終日か」まで見える。純粋なフリー/ビジーとしては十分だが、より秘匿するなら:
  - 連続・重複する予定を**「ビジー時間ブロック」に統合**して返す（個々の予定数やカテゴリを見せない）。
  - `present_calendar_events` / `upcoming` で返す **`category` を出さない**（マスク時は一律「予定」）か、`title` を完全に落として `busy: true` だけにする。
- **公開範囲の上限**: `get_calendar_events` ツールは LLM が任意の `start`/`end` を指定でき、過去や遠い未来まで引ける。サーバ側で**取得可能な期間（例: 今日〜60日先）にクランプ**する。`upcoming` は 90 日先まで取得して先頭 7 件を返しているが、期間・件数はサーバで固定する。

### P2-2. マスクの堅牢性
- 現状 `summary`/`start`/`end` しか読まないので location/description/attendees は漏れない（良い）。将来フィールドを増やす時は**デフォルト非公開**を維持すること。
- `(公開)` マーカー方式は「付け忘れたら隠れる」fail-safe で方向性は正しい。運用ルールとしてコメントに明記しておく。

### P2-3. セキュリティヘッダー不足
- 現状 HSTS のみ。以下が無い: `Content-Security-Policy` / `X-Frame-Options`（`frame-ancestors 'none'` = クリックジャッキング対策）/ `X-Content-Type-Options: nosniff` / `Referrer-Policy` / `Permissions-Policy`。
- **直し方**: `next.config` の `headers()` で全パスに付与。
  ```js
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      ],
    }];
  }
  ```
  ※ Next.js 16 では設定 API が変わっている可能性がある。`node_modules/next/dist/docs/` を確認してから記述すること（`AGENTS.md` の指針）。CSP は本番の scripts/styles を見て調整（Tailwind のインラインスタイル等で `style-src` 調整が要る場合あり）。

### P2-4. 既定メタデータが `Create Next App` のまま
- `app/layout.tsx` の `<title>` / `description` が雛形のまま。実害は小さいが、`metadata` を実サービス名に。

---

## 対応チェックリスト

- [ ] P0-1 `get_notion_status` を公開エージェントから除去 or 最小公開化
- [ ] P0-2 マスク版を再デプロイし、本番 `/api/upcoming` が `予定あり` を返すことを確認
- [ ] P0-3 `/api/chat` にレート制限＋入力上限、Discord 通知に回数・文字数制限（＋bot対策）
- [ ] P1-1 API ルートの catch を汎用メッセージ化（詳細はサーバログのみ）
- [ ] P1-2 クライアントの `effort` を無視/固定
- [ ] P1-3 クライアントからの `assistant`/`system` ロールを受理しない（`user` のみ）
- [ ] P2-1 フリー/ビジー粒度の縮小・取得期間のサーバ側クランプ
- [ ] P2-3 セキュリティヘッダー追加
- [ ] P2-4 メタデータ更新

---

## 参考: フリー/ビジー公開の「あるべき出力」イメージ

```jsonc
// GET /api/upcoming （匿名でOKな範囲）
{
  "events": [
    { "day": "水", "time": "14:00〜15:00", "title": "予定あり" },   // 中身は隠す
    { "day": "金", "time": "終日",         "title": "予定あり" },
    { "day": "土", "time": "19:00〜20:00", "title": "登壇（公開）" } // (公開) を付けた物だけ件名表示
  ]
}
```
- 匿名で見えて良いのは「いつが埋まっているか」だけ。**件名・場所・同席者・Notion 内容・連絡先は一切出さない。**
- 予約は「リクエストを Discord に通知 → オーナーが手動承認」の現行フローを維持（エージェントが勝手に予定を作らないのは良い設計）。ただしリクエスト送信経路にレート制限を必ず入れる。
