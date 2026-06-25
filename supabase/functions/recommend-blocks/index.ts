import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  let body: { company_keywords?: string[]; blocks?: { id: string; title: string; competency_keywords: string[] }[] };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }); }

  const { company_keywords = [], blocks = [] } = body;
  if (!blocks.length) return new Response(JSON.stringify([]), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  const systemPrompt = `You are a career matching engine. You will be given a list of company-required competency keywords and a candidate's experience blocks.

Your job is to score each experience block from 0 to 100 based on how well its competency_keywords match the company_keywords.

Scoring criteria:
- Compare ALL blocks against each other relatively — a block that covers more company keywords scores higher
- Consider both exact matches and semantically similar competencies (e.g. "Team Leadership" matches "Managing Personnel Resources")
- A block that covers 80%+ of company keywords = 80-100
- A block that covers 50-79% = 50-79
- A block that covers 20-49% = 20-49
- A block that covers less than 20% = 0-19
- Scores must reflect relative ranking — no two blocks should have the exact same score unless they truly match equally

Return ONLY a JSON array sorted by score descending. No explanation. No markdown.
[
  { "id": "block_id", "score": 85, "reason": "one line explanation of why this score" },
  ...
]

Include ALL blocks in the response. Do not skip any.`;

  const userMessage = `Company-required keywords:
${JSON.stringify(company_keywords)}

Candidate experience blocks:
${blocks.map(b => `ID: ${b.id}\nTitle: ${b.title}\nKeywords: ${JSON.stringify(b.competency_keywords)}`).join('\n\n')}`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    })
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error("Groq API error:", errText);
    return new Response(JSON.stringify({ error: "Upstream API error" }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const data = await groqRes.json();
  const rawText = data?.choices?.[0]?.message?.content ?? "";

  let result: { id: string; score: number; reason: string }[];
  try {
    result = JSON.parse(rawText);
  } catch {
    const m = rawText.match(/\[[\s\S]*\]/);
    if (m) { result = JSON.parse(m[0]); }
    else return new Response(JSON.stringify({ error: "Failed to parse AI response" }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  result.sort((a, b) => b.score - a.score);

  return new Response(JSON.stringify(result), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
