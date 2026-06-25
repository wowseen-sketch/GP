import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MatchStatus = "matched" | "partial" | "missing";

interface MatchItem {
  keyword: string;
  status: MatchStatus;
}

interface Block {
  id: string;
  title: string;
  keywords: string[];
  period?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are an AI job-fit matching engine.

You are given two lists of professional competency keywords:
- COMPANY_KEYWORDS: competencies a job requires.
- MY_KEYWORDS: competencies a candidate already has.

For EACH company keyword, decide how well the candidate's keywords cover it BY MEANING, not by exact wording. Synonyms, paraphrases, and clearly implied equivalents count.

A competency keyword has three components:
- Domain: the field or area (e.g. data, stakeholder management, product strategy)
- Action: what is being done (e.g. analysis, communication, decision making)
- Scope: the target or range (e.g. business-wide, cross-functional, external partners)

Follow these steps in order for EACH company keyword:

STEP 1: Does the candidate have a keyword in the same Domain?
- If NO → classify as "missing". Stop.
- If YES → go to STEP 2.

STEP 2: Is the Action the same or in an inclusion relationship?
(e.g. "management" includes "communication"; "decision making" does not include "analysis")
- If YES → classify as "matched"
- If NO → classify as "partial"

Calibration examples:
- "Data Analysis" vs "Data-Driven Decision Making" → domain: same (data), action: different → partial
- "Stakeholder Management" vs "Stakeholder Communication" → domain: same, action: management includes communication → matched
- "Go-to-Market Strategy" vs "Project Management" → domain: different → missing
- "Product Roadmap Planning" vs "Product Strategy Development" → domain: same, action: planning included in strategy → matched
- "UX Design" vs "Data Analysis" → domain: different → missing

Do NOT use percentage thresholds. Use the domain/action/scope framework only.

Return ONLY this JSON. No explanation. No markdown.
{
  "results": [
    { "keyword": "<exact company keyword text>", "status": "matched" }
  ]
}

Rules:
- Include EVERY company keyword exactly once, copying its original text verbatim.
- Only valid statuses: "matched", "partial", "missing".`;

async function classifyKeywords(
  companyKeywords: string[],
  myKeywords: string[],
  apiKey: string,
): Promise<MatchItem[]> {
  const companyList = companyKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n");
  const myList = myKeywords.length
    ? myKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n")
    : "(none)";

  const userMessage = `COMPANY_KEYWORDS:\n${companyList}\n\nMY_KEYWORDS:\n${myList}\n\nClassify every company keyword and return the JSON.`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error("Groq API error:", groqRes.status, errText);
    throw new Error(`Upstream API error: ${groqRes.status}`);
  }

  const data = await groqRes.json();
  const rawText: string = data?.choices?.[0]?.message?.content ?? "";

  let parsed: { results?: { keyword: string; status: string }[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse AI response");
    parsed = JSON.parse(match[0]);
  }

  const valid: MatchStatus[] = ["matched", "partial", "missing"];
  const byKeyword = new Map<string, MatchStatus>();
  for (const item of parsed.results ?? []) {
    if (item && typeof item.keyword === "string" && valid.includes(item.status as MatchStatus)) {
      byKeyword.set(item.keyword.trim().toLowerCase(), item.status as MatchStatus);
    }
  }

  return companyKeywords.map((kw) => ({
    keyword: kw,
    status: byKeyword.get(kw.trim().toLowerCase()) ?? "missing",
  }));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) return json({ error: "API key not configured" }, 500);

    let body: { company_keywords?: unknown; blocks?: unknown };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const companyKeywords = Array.isArray(body.company_keywords)
      ? (body.company_keywords as unknown[]).map((k) => String(k).trim()).filter(Boolean)
      : [];
    const blocks: Block[] = Array.isArray(body.blocks) ? body.blocks as Block[] : [];

    if (!companyKeywords.length) return json({ error: "company_keywords is required" }, 400);

    const allKeywords = blocks.flatMap((b) => b.keywords ?? []);

    // Run overall + per-block classifications in parallel
    const [overall, ...byBlockResults] = await Promise.all([
      classifyKeywords(companyKeywords, allKeywords, apiKey),
      ...blocks.map((block) => classifyKeywords(companyKeywords, block.keywords ?? [], apiKey)),
    ]);

    const by_block = blocks.map((block, i) => ({
      block_id: block.id,
      block_title: block.title,
      block_period: block.period ?? "",
      results: byBlockResults[i] ?? [],
    }));

    return json({ overall, by_block }, 200);
  } catch (err) {
    console.error("Unhandled error in match-keywords:", err);
    return json({ error: String(err) }, 500);
  }
});
