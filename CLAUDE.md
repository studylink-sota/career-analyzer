# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

高校生向けAI進路相談Webアプリ「AI進路相談室｜創太先生」。2つの機能を持つ：
- **学部分析**: 学部・学科名を入力するとAIが光と影の両面から分析
- **キャリア診断**: 5つの質問に答えるとAIが職業と学部を5つ提案

## Architecture

**Cloudflare Pages** でホスティングされる静的サイト + Cloudflare Functions（サーバーレスAPI）。

- `index.html` / `style.css` / `script.js` — フロントエンド（ビルドツールなし、vanilla HTML/CSS/JS）
- `functions/api/analyze.js` — 学部分析API（`POST /api/analyze`）
- `functions/api/career.js` — キャリア診断API（`POST /api/career`）

### データフロー

1. フロントエンドからAPIにPOSTリクエスト
2. Cloudflare Functionsが `functions/api/_llm.js` の `streamAI()` 経由でLLMをストリーミング呼び出し。プロバイダーは `resolveProvider()` が決定:
   - 強制フラグ最優先: `USE_CLAUDE=true` → Claude（両フラグtrueならこちらが優先。キー未設定なら警告して自動選択へ）、`USE_WORKERS_AI=true` → Workers AI
   - 自動選択: `GEMINI_API_KEY` があれば Gemini 2.5 Flash-Lite（`GEMINI_MODEL` で変更可）→ `ANTHROPIC_API_KEY` があれば Claude（`claude-haiku-4-5-20251001`）→ どちらもなければ Workers AI（既定: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`、`WORKERS_AI_MODEL` で変更可）
   - Gemini / Workers AI のストリームはサーバー側でAnthropic形式SSEに変換される（クライアントは常にAnthropic形式だけ解釈）
3. SSE（Server-Sent Events）形式でレスポンスをクライアントに中継
4. `script.js` の `readStream()` がSSEをパースし、`renderMarkdown()` でHTMLに変換してリアルタイム表示

Workers AI利用にはPagesプロジェクトに `AI` という名前のWorkers AIバインディングが必要（ダッシュボード: Settings → Bindings → Workers AI）。

### 認証（URLトークン方式）

LINEリッチメニュー等に登録した `https://<サイト>/?k=<トークン>` 形式のURLから開く前提。

- クライアント: URLの `?k=` を `sessionStorage` に保存し、`history.replaceState` でアドレスバーから即座に除去。以降のAPIリクエストに `X-Access-Token` ヘッダーで付与。トークンなしで開くと案内画面のみ表示。
- サーバー: 各Functionの冒頭で `checkAccess()`（`_llm.js`）が `env.ACCESS_TOKEN` と照合。不一致は401。`ACCESS_TOKEN` 未設定時は全拒否（フェイルクローズ）。
- トークン漏洩時は `ACCESS_TOKEN` を変更して再デプロイし、リッチメニューのURLを更新すれば旧トークンは無効化される。

### 環境変数

- `ACCESS_TOKEN`（必須）— URLトークン認証の照合値。未設定だとAPIは全拒否
- `GEMINI_API_KEY`（任意）— 設定されていればGeminiを最優先で使用
- `USE_CLAUDE`（任意）— `"true"` でClaudeを強制（`USE_WORKERS_AI` より優先）
- `ANTHROPIC_API_KEY`（任意）— 設定されていればClaude APIを使用（Gemini未設定時）
- `USE_WORKERS_AI`（任意）— `"true"` でキーがあってもWorkers AIを強制使用
- `WORKERS_AI_MODEL`（任意）— Workers AIのモデルIDを上書き

## Development

ビルドステップなし。ローカル確認は `npx wrangler pages dev .` でCloudflare Pages環境をエミュレート。

## Key Conventions

- API関数は Cloudflare Pages Functions の `onRequestPost` / `onRequestOptions` エクスポート形式
- Markdownレンダリングは外部ライブラリを使わず `renderMarkdown()` で自前実装（テーブル、見出し、太字、リスト、段落に対応）
- プロンプトの文字数制限は現在1500文字（コスト削減のため2026-08に2500文字から短縮。約4円/回 → 約2.5円/回）
