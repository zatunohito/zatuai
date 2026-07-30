# zatuai とは

**zatuai** は、個人(カレンダー所有者: zatunohito / 大畠朔翔)向けの「スケジュール調整チャットボット」。訪問者がチャットで空き時間を尋ねたり、打ち合わせの時間枠をリクエストしたりできる、認証不要の公開Webアプリ。Next.js 16 (App Router) 製で、Vercelにデプロイされている。

## コンセプト

- 所有者のGoogleカレンダーやNotionのステータスに**匿名の訪問者が直接アクセスすることはない**。すべてLLM(DeepSeek)エージェントが仲介し、ツール呼び出し経由でのみ情報を取得・加工する。
- 予定の**中身は見せず、フリー/ビジー(空き/埋まり)だけを公開**する設計方針(`SECURITY_FIXES.md`にその経緯と対応チェックリストがまとまっている)。
- 実際の予約確定は行わない。「時間枠をリクエストする」→「所有者にDiscord DMで通知」→「所有者が手動で判断」という一方向のフローに限定している。

## 主な機能

### 1. チャットアシスタント (`/`, `app/api/chat/route.ts`)
- バックエンドLLMは [DeepSeek](https://api.deepseek.com) (`deepseek-v4-flash`)。`lib/deepseek.ts`経由でChat Completions APIを呼ぶ。
- システムプロンプトでツール利用ルールを規定し、以下のfunction toolを持つ:
  - `get_calendar_events` — 指定期間のカレンダー予定を取得(公開マーカーが無い予定は`予定あり`にマスクされる)
  - `get_notion_status` — Notionページのステータスを取得
  - `present_calendar_events` / `present_choices` — 自由文の代わりに構造化されたカード/選択ボタンをUIに提示させるための"表示専用"ツール
  - `notify_owner_of_schedule_request` — 依頼者情報・日時(ISO形式必須)・詳細を集めてDiscord DMで所有者に通知。ISO日時からGoogleカレンダー追加リンクを自動生成
  - `notify_owner_of_inquiry` — 予約以外の一般的な問い合わせをDiscord DMで通知
- ツール呼び出しループは最大5往復、通知系ツールは1リクエストにつき最大3回まで。
- **回答監査(オプション)**: 画面上のトグルをONにすると、最終回答をもう一度独立したDeepSeekセッション(`submit_review`ツール)に監査させ、問題があれば自動修正してから表示する。
- **エフォートスライダー**: 推論の深さ(通常/高/最高)をUIから選べる。

### 2. 直近の予定表示 (`/api/upcoming`)
- 認証なしのGETエンドポイント。今後90日分のイベントを取得し、直近7件だけをフリー/ビジー形式(曜日・時間帯・マスク済みタイトル・簡易カテゴリ)で返す。
- カテゴリはタイトルに含まれるキーワード(会議/勉強/部活/通院/外出など)から機械的に推定。

### 3. UI (`app/page.tsx`)
- チャット風のシングルページ。ユーザー/アシスタントの吹き出し、予定カード、選択肢ボタン、クイックリプライ、エフォートスライダー、監査トグルなどを持つ。
- ダークモード対応のTailwind CSS。会話・各種設定は`localStorage`に保存。

## 外部連携

| サービス | 用途 | 実装 |
|---|---|---|
| DeepSeek API | チャット応答・監査 | `lib/deepseek.ts` |
| Google Calendar API | 予定の取得(OAuth refresh token方式) | `lib/tools/calendar.ts` |
| Notion API | ステータスページの取得 | `lib/tools/notion.ts` |
| Discord Bot API | 予約リクエスト/問い合わせをDMで所有者に通知 | `lib/tools/discord.ts` |

## セキュリティ上の設計

- **データ層でのマスク**: LLMに渡す前に`getCalendarEvents`がタイトルをマスク(`(公開)`マーカーが付いた予定だけ実タイトルを公開)。プロンプトインジェクションでLLMが乗っ取られても生データは漏れない多層防御。
- **レート制限** (`lib/rateLimit.ts`): インメモリのベストエフォート実装。チャット/upcomingはIPごと20回/10分・全体300回/日、通知系ツールはIPごと5回/時間。
- **入力検証**: メッセージ件数・文字数の上限、クライアントは`user`/`assistant`ロールのみ送信可(`system`/`tool`ロールの偽装を拒否)。
- **取得期間のクランプ**: カレンダー取得はサーバ側で過去1日〜未来90日にクランプし、任意の期間を無制限に引けないようにしている。
- **エラーメッセージの汎用化**: 上流API(Google/Notion/Discord)の内部エラー詳細をクライアントに漏らさず、汎用メッセージのみ返す。
- **セキュリティヘッダー / CSP** (`next.config.ts`): `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`を全パスに付与。CSPの`unsafe-eval`は開発モードのみ有効化し、本番では厳格なポリシーを維持。

## 技術スタック

- Next.js 16.2.12 (App Router, Turbopack) / React 19.2
- TypeScript, Tailwind CSS 4
- `react-markdown` + `remark-gfm`(アシスタント回答のMarkdown描画、生HTMLは無効化)
- デプロイ: Vercel

## ディレクトリ構成(抜粋)

```
app/
  page.tsx              # チャットUI
  layout.tsx            # ルートレイアウト・メタデータ
  api/
    chat/route.ts        # チャット本体(LLM・ツール呼び出しループ・監査)
    upcoming/route.ts     # 公開フリー/ビジーAPI
lib/
  deepseek.ts            # DeepSeek Chat Completions クライアント
  rateLimit.ts           # インメモリレート制限
  tools/
    calendar.ts          # Googleカレンダー取得+マスク
    notion.ts             # Notionステータス取得
    discord.ts             # Discord DM送信
```
