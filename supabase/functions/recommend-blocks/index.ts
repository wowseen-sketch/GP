import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "API key not configured" }, 500);

    let body: { company_keywords?: string[]; blocks?: { id: string; title: string; competency_keywords: string[] }[] };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { company_keywords = [], blocks = [] } = body;
    if (!blocks.length) return json([], 200);

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

Return ONLY a JSON array. No explanation. No markdown. No code fences. No newlines inside string values.
[
  { "id": "block_id", "score": 85, "reason": "one line explanation under 20 words" },
  ...
]

Include ALL blocks in the response. Do not skip any.`;

    const userMessage = `Company-required keywords:
${JSON.stringify(company_keywords)}

Candidate experience blocks:
${blocks.map(b => `ID: ${b.id}\nTitle: ${b.title}\nKeywords: ${JSON.stringify(b.competency_keywords)}`).join('\n\n')}`;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userMessage }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return json({ error: `Upstream API error: ${geminiRes.status}` }, 502);
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const finishReason = geminiData?.candidates?.[0]?.finishReason ?? "unknown";
    console.log("recommend-blocks finishReason:", finishReason);
    console.log("recommend-blocks rawText (first 400):", rawText.slice(0, 400));

    const stripped = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    let parsed: { id: string; score: number; reason: string }[];
    try {
      parsed = JSON.parse(stripped);
    } catch {
      const match = stripped.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error("No JSON array found in response:", stripped.substring(0, 300));
        return json({ error: "Failed to parse AI response" }, 500);
      }
      parsed = JSON.parse(match[0]);
    }

    parsed.sort((a, b) => b.score - a.score);
    return json(parsed, 200);

  } catch (err) {
    console.error("Unhandled error in recommend-blocks:", err);
    return json({ error: String(err) }, 500);
  }
});
