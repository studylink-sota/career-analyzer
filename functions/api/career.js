export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { answers } = await request.json();

    if (!answers || !answers.q1 || !answers.q2 || !answers.q3 || !answers.q4 || !answers.q5) {
      return new Response(JSON.stringify({ error: "すべての質問に回答してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const systemPrompt = `あなたは、現役の高校生に寄り添い、将来の可能性を引き出すプロのキャリアアドバイザーです。以下の入力内容を分析し、ぴったりの仕事と、そのために進むべき大学の学部・学科を5つ提案してください。

このキャリア診断は、以下の質問への回答内容のみを分析対象とします。過去の会話履歴、以前の相談内容、過去に示した興味関心は一切参照しないでください。あなたの役割は、今回提供される回答データだけを客観的に分析し、そこから導かれる職業適性を提案することです。推測や補完は行わず、記載された情報のみを判断材料としてください。

【重要なルール】
- 表（テーブル）は使わず、箇条書きと短い文章で書くこと
- 1つの職業提案につき10〜15行程度でまとめること
- 全体で4000文字程度に収めること
- 年収は平均レンジに加え、トップ層の最大年収目安も記載すること`;

    const q1Labels = {
      "ア": "一人暮らしで安定した生活ができれば十分",
      "イ": "旅行や趣味も楽しみながら、余裕ある生活をしたい",
      "ウ": "専門スキルを磨いて、周りより高い収入を目指したい",
      "エ": "自分で事業をつくったり、組織のトップに立って大きく稼ぎたい",
      "オ": "まだ具体的には分からない",
    };
    const q2Labels = {
      "ア": "新しいアイデアを考えたり、何かを表現したい",
      "イ": "決まった流れがある方が安心する",
      "ウ": "毎日違う人に会ったり、外に出る刺激がほしい",
      "エ": "仲の良いメンバーと協力して進めたい",
      "オ": "最新の流行や技術をどんどん取り入れたい",
      "カ": "一人の時間を大切に、作業に没頭したい",
      "キ": "新しいモノやコンテンツをつくってみたい",
      "ク": "研究活動をしたい",
      "ケ": "地位と名誉が欲しい",
    };
    const q3Labels = {
      "ア": "ノートまとめやスケジュール管理",
      "イ": "面白いアイデアを出すこと",
      "ウ": "友達の悩み相談に乗ること",
      "エ": "パズルやゲームの攻略を考えること",
      "オ": "好きなことを人に熱く語ること",
      "カ": "みんなをまとめる役割",
      "キ": "地味な作業をコツコツ続けること",
      "ク": "知らない場所や初めての人が平気",
      "ケ": "困っている人を手助けすること",
      "コ": "SNS発信、動画や絵を作ること",
      "サ": "友達とわいわいお喋りすること",
      "シ": "時間を忘れてゲームに熱中すること",
      "ス": "流行や新しいモノをすぐ試すこと",
    };
    const q4Labels = {
      "ア": "大勢の前で発表すること",
      "イ": "「自由にやっていいよ」と言われること",
      "ウ": "数学の細かい計算や理屈っぽい話",
      "エ": "初対面の人への話しかけ",
      "オ": "じっとして単純作業を続けること",
      "カ": "順位競争や厳しいノルマ",
      "キ": "責任ある立場で指示を出すこと",
      "ク": "きっちり時間を守り続けること",
      "ケ": "文字ばかりの難しい資料の読み込み",
      "コ": "上下関係が厳しい体育会系環境",
      "サ": "汚れる仕事や体力を激しく使う仕事",
    };

    const expand = (arr, labels) =>
      arr.map((v) => (v.startsWith("その他:") ? v : `（${v}）${labels[v] || v}`)).join("、");

    const userPrompt = `以下の回答を分析してください。

【Q1. 将来、どんな生活をしたい？】
回答：${expand(answers.q1, q1Labels)}
※選んだ生活を実現するために必要な「目標手取り額」と「額面年収」を推測して解説してください。

【Q2. どんなふうに働きたい？】
回答：${expand(answers.q2, q2Labels)}

【Q3. 「なんとなく好き」「苦ではない」こと】
回答：${expand(answers.q3, q3Labels)}

【Q4. 正直「苦手」「やりたくない」こと】
回答：${expand(answers.q4, q4Labels)}

【Q5. 今のあなたの状況】
${answers.q5}

---

【出力形式】以下の項目に沿って、この生徒に合う職業・大学の学部学科を5つ提案してください。

提案ごとに以下を記載：
① 職業名
② 仕事内容（高校生向け解説）
③ 向いている理由
④ 進学すべき学部・学科（可能なら具体的な大学名も出力）
⑤ 想定年収レンジ（額面と手取り目安）
⑥ その職業の良い点
⑦ その職業の厳しい現実
⑧ 今からできる準備

各提案は見出しを使い、読みやすく整理してください。`;

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
      return new Response(JSON.stringify({ error: "AI診断中にエラーが発生しました。しばらくしてからお試しください。" }), {
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
