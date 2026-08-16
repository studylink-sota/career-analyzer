import { streamAI, checkAccess } from "./_llm.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Token",
  };

  const denied = checkAccess(request, env, corsHeaders);
  if (denied) return denied;

  try {
    const { faculty } = await request.json();

    if (!faculty || typeof faculty !== "string" || faculty.trim().length === 0) {
      return new Response(JSON.stringify({ error: "学部名を入力してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (faculty.trim().length > 50) {
      return new Response(JSON.stringify({ error: "学部名は50文字以内で入力してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const systemPrompt = `あなたは大学の学部・学科選びの専門アドバイザーです。高校生にもわかりやすい言葉で、正直かつ具体的に分析してください。光（良い面）と影（厳しい面）の両方をバランスよく伝えてください。

【重要なルール】
- 表（テーブル）は使わず、箇条書きと短い文章で書くこと
- 各セクションは5〜10行程度でしっかり書くこと
- 全体で2500文字程度にまとめること`;

    const userPrompt = `「${faculty.trim()}」について、以下の4つの観点から分析してください。

## 1. 学べること・取れる資格
この学部学科で何を学び、どんな資格が取れるか。主なカリキュラムや学びの特徴も含めて。

## 2. 就職と年収のリアル
主な就職先・業界、平均的な年収レンジ、最大でどこまで稼げるか（トップ層の年収目安）、やりがいと厳しさを正直に。

## 3. AI時代の将来性
AIや社会変化でこの分野がどう変わるか、需要の増減、10年後の見通し。

## 4. 向いている人・高校生へのアドバイス
向いている人の特徴、ミスマッチになりやすい人、今からできる準備。

箇条書き中心で、読みやすく整理してください。`;

    return await streamAI({
      env,
      system: systemPrompt,
      prompt: userPrompt,
      errorMessage: "AI分析中にエラーが発生しました。しばらくしてからお試しください。",
      corsHeaders,
    });
  } catch (err) {
    console.error("Worker error:", err);
    return new Response(JSON.stringify({ error: "サーバーエラーが発生しました" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Token",
    },
  });
}
