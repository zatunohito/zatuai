<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# opencode MCP (`mcp__opencode__opencode`) を呼ぶときの注意

- このMCPサーバー(`~/dev/tools/Better-OpenCodeMCP`)は内部で `child_process.spawn(cmd, args, { shell: true })` を使って `opencode` CLIを起動しており、`args`をシェル用にエスケープしていない。
- そのため `task` 引数の文字列に **シェル特殊文字**（`()`, `"`, `'`, `` ` ``, `;`, `$`, `|`, `&`, `<`, `>` など）が含まれると、`/bin/sh` の構文エラーで**即座に**失敗する。
  - `opencode_sessions({status:"all"})` で確認すると `status: "failed"`, `statusMessage: "Process exited with code 2"`、かつ `durationMs` が一桁〜十数msという極端に短い値になる。これが「シェル構文エラーで即死」の典型パターン。CLI自体が実際に応答した場合は数秒〜数十秒かかるはずなので、durationMsの短さで見分けられる。
- **対策**: `task` には括弧や引用符などの記号を避けた平易な文章で指示する。「関数(Home)を…」のような書き方は避け、「Homeという名前のdefault export関数を…」のように言い換える。特に補足の注釈「(現在時刻は使わないこと)」のような一箇所だけの括弧でも即死するので、プロンプト全体を見直すこと。
- 呼び出しは非同期。`opencode` ツール実行後は `opencode_sessions` をポーリングして `status` が `completed`/`failed` になるまで待つこと（`working`のまま即座に結果を決めつけない）。
