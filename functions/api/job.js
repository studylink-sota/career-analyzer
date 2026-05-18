export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { job } = await request.json();

    if (!job || typeof job !== "string" || job.trim().length === 0) {
      return new Response(JSON.stringify({ error: "職業名を入力してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (job.trim().length > 60) {
      return new Response(JSON.stringify({ error: "職業名は60文字以内で入力してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const systemPrompt = `あなたは様々な業界に精通した、現役高校生向けのプロのキャリアアドバイザーです。指定された職業について、高校生がイメージしている「キラキラした表面」ではなく、業界の内側から見た「リアルな実態」を、光と影の両面から正直に解説してください。

【重要なルール】
- 表（テーブル）は使わず、見出しと箇条書きと短い文章で書くこと
- 全体で2500文字程度にまとめること
- きれいごとで終わらせず、業界の本音や厳しい現実も具体的に書くこと
- 数字（年収、労働時間、合格率など）はできるだけ具体的に出すこと`;

    const userPrompt = `「${job.trim()}」という職業について、以下の観点から深掘り解説してください。

## 1. 仕事内容のリアル
表面的な仕事内容ではなく、実際の業務の中身と、高校生がイメージしている姿とのギャップ。地味な作業や雑務も含めて正直に。

## 2. 1日のスケジュール例
朝から夜までの典型的な1日を時系列で。繁忙期と通常期の違いがあれば両方。

## 3. 必要な資格・スキル・素質
必須の資格、あると有利な資格、現場で求められるスキル、向いている人の素質。

## 4. キャリアパスと年収推移
新卒入社〜30代〜トップ層まで、年収の伸び方と昇進・転職パターン。額面と手取りの目安、トップ層の年収目安も。

## 5. 業界の構造と代表的な企業・組織
この職業が活躍する業界の構造、代表的な企業や組織名（日本国内中心に）、業界内のヒエラルキー。

## 6. 向いている人・向かない人
具体的な性格・価値観・行動パターンで。「やめておいた方がいい人」も率直に。

## 7. AI時代の将来性
AIや自動化でこの職業がどう変わるか。代替されるリスクと、逆にAIで強化される部分。10年後の見通し。

## 8. 高校生のうちにやっておくべきこと
進学先選び、課外活動、読むべき本、触れておくべき体験など、具体的に。

見出しを使い、箇条書き中心で読みやすく整理してください。`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
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
