export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

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

    const systemPrompt = `あなたは大学の学部・学科選びの専門アドバイザーです。高校生にもわかりやすい言葉で、正直かつ具体的に分析してください。光（良い面）と影（厳しい面）の両方をバランスよく伝えてください。`;

    const userPrompt = `「${faculty.trim()}」について、以下の6つの観点から詳しく分析してください。

## 1. この学部で学べる内容と取得可能な資格
- 主なカリキュラム・学べる分野
- 在学中に取得できる資格や受験資格

## 2. 就職先のリアル（待遇・やりがい・厳しさ）
- 主な就職先・業界
- 平均的な初任給や年収のイメージ
- やりがいと厳しさの両面

## 3. 資格取得の可能性と強み/リスク
- 資格があることで得られるメリット
- 資格取得の難易度や注意点
- 資格だけに頼るリスク

## 4. AIや社会変化による将来展望
- この分野がAIや技術革新でどう変わるか
- 需要が増える可能性/減る可能性
- 10年後の見通し

## 5. 向いている人/避けたほうがいい人
- この学部に向いている人の特徴
- ミスマッチになりやすい人の特徴
- 入学前に確認すべきこと

## 6. 高校生へのアドバイス
- 今からできる準備
- 学部選びで後悔しないためのポイント
- 先輩たちのリアルな声（一般的な傾向）

各セクションは見出しを使い、読みやすく整理してください。`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI分析中にエラーが発生しました。しばらくしてからお試しください。" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders,
      },
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
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
