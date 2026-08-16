// LLM呼び出しの共通ヘルパー。使用モデルの優先順位:
//   1. GEMINI_API_KEY があれば Gemini 2.5 Flash-Lite（無料枠あり・最安）
//   2. ANTHROPIC_API_KEY があれば Claude（最高品質）
//   3. どちらもなければ Cloudflare Workers AI（要AIバインディング）
// いずれの場合もクライアントには Anthropic 形式の SSE（content_block_delta）を返す。

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// URLトークン方式のアクセス検証。
// クライアントは X-Access-Token ヘッダーでトークンを送り、env.ACCESS_TOKEN と照合する。
// 不一致（または ACCESS_TOKEN 未設定）なら 401 Response を返し、通過なら null を返す。
export function checkAccess(request, env, corsHeaders) {
  const token = request.headers.get("X-Access-Token") || "";
  if (!env.ACCESS_TOKEN || token !== env.ACCESS_TOKEN) {
    return new Response(
      JSON.stringify({ error: "アクセスが許可されていません。公式LINEのメニューから開き直してください。" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  return null;
}

export async function streamAI({ env, system, prompt, errorMessage, corsHeaders }) {
  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...corsHeaders,
  };

  // 1. Gemini（GEMINI_API_KEY設定時。USE_CLAUDE=true でClaude優先に戻せる）
  if (env.GEMINI_API_KEY && env.USE_CLAUDE !== "true") {
    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || GEMINI_MODEL}:streamGenerateContent?alt=sse`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(geminiToAnthropicSSE(response.body), { headers: sseHeaders });
  }

  const useWorkersAI = env.USE_WORKERS_AI === "true" || !env.ANTHROPIC_API_KEY;

  if (!useWorkersAI) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        stream: true,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(response.body, { headers: sseHeaders });
  }

  // Workers AI パス（Anthropic APIキー不要）
  if (!env.AI) {
    console.error("Workers AI binding (AI) is not configured");
    return new Response(
      JSON.stringify({ error: "AIの設定が完了していません。管理者にお問い合わせください。" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const model = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;

  let aiStream;
  try {
    aiStream = await env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      stream: true,
      max_tokens: 4096,
    });
  } catch (err) {
    console.error("Workers AI error:", err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(toAnthropicSSE(aiStream), { headers: sseHeaders });
}

// Gemini の SSE（data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}）を
// script.js が解釈する Anthropic 形式（content_block_delta / text_delta）に変換する
function geminiToAnthropicSSE(geminiStream) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = geminiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            const parts = parsed.candidates?.[0]?.content?.parts || [];
            const text = parts.map((p) => p.text || "").join("");
            if (text.length > 0) {
              const event = {
                type: "content_block_delta",
                delta: { type: "text_delta", text },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("Gemini stream error:", err);
        controller.error(err);
      }
    },
  });
}

// Workers AI の SSE（data: {"response":"..."}）を
// script.js が解釈する Anthropic 形式（content_block_delta / text_delta）に変換する
function toAnthropicSSE(workersAiStream) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = workersAiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;

            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            const text = parsed.response;
            if (typeof text === "string" && text.length > 0) {
              const event = {
                type: "content_block_delta",
                delta: { type: "text_delta", text },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("Workers AI stream error:", err);
        controller.error(err);
      }
    },
  });
}
