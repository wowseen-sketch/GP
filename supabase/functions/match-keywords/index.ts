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
  matched_with: string[];
}

// ─────────────────────────────────────────────────────────────
// SWAPPABLE MATCHING LOGIC
// Input : two keyword lists. Output: one classification per company
//   keyword (matched | partial | missing) + which of my keywords justify it.
// Scoring is NOT done here — the caller computes the score from these counts.
// To change the matching approach later, replace this function only.
// ─────────────────────────────────────────────────────────────
async function classifyKeywords(
  companyKeywords: string[],
  myKeywords: string[],
  apiKey: string,
): Promise<{ results: MatchItem[] }> {
  const companyList = companyKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n");
  const myList = myKeywords.length
    ? myKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n")
    : "(none)";

  const systemPrompt = `You are an AI job-fit matching engine.

You are given two lists of professional competency keywords:
- COMPANY_KEYWORDS: competencies a job requires.
- MY_KEYWORDS: competencies a candidate already has, drawn from their experience.

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

COMPANY_KEYWORDS:
${companyList}

MY_KEYWORDS:
${myList}

Return ONLY this JSON. No explanation. No markdown.
{
  "results": [
    { "keyword": "<exact company keyword text>", "status": "matched", "matched_with": ["<my keyword>"] }
  ]
}

Rules:
- Include EVERY company keyword exactly once, copying its original text verbatim.
- "matched_with" lists the my-keywords that justify a matched/partial decision. Use an empty array for "missing".
- Only use keywords that appear in the lists above. Do not invent new keywords.`;

  const userMessage = `Classify every company keyword and return the JSON.`;

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
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage },
      ],
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error("Groq API error:", errText);
    throw new Error("Upstream API error");
  }

  const data = await groqRes.json();
  const rawText = data?.choices?.[0]?.message?.content ?? "";

  let parsed: { results?: MatchItem[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse AI response");
    parsed = JSON.parse(match[0]);
  }

  // Reconcile against the original company list so the contract is guaranteed:
  // every company keyword appears exactly once, with its exact text. Anything
  // the model dropped or mislabeled defaults to "missing".
  const byKeyword = new Map<string, MatchItem>();
  for (const item of parsed.results ?? []) {
    if (item && typeof item.keyword === "string") {
      byKeyword.set(item.keyword.trim().toLowerCase(), item);
    }
  }

  const valid: MatchStatus[] = ["matched", "partial", "missing"];
  const results: MatchItem[] = companyKeywords.map((kw) => {
    const hit = byKeyword.get(kw.trim().toLowerCase());
    const status: MatchStatus =
      hit && valid.includes(hit.status) ? hit.status : "missing";
    const matched_with =
      status !== "missing" && Array.isArray(hit?.matched_with)
        ? hit!.matched_with.map((m) => String(m).trim()).filter(Boolean)
        : [];
    return { keyword: kw, status, matched_with };
  });

  return { results };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { company_keywords?: unknown; my_keywords?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const companyKeywords = Array.isArray(body.company_keywords)
    ? body.company_keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const myKeywords = Array.isArray(body.my_keywords)
    ? body.my_keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  if (!companyKeywords.length) {
    return new Response(JSON.stringify({ error: "company_keywords is required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await classifyKeywords(companyKeywords, myKeywords, apiKey);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("match-keywords error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
