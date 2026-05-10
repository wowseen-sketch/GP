import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

  let body: { activity_name?: string; plan?: string; do?: string; check?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { activity_name = "", plan = "", do: doText = "", check = "", action = "" } = body;

  const systemPrompt = `You are a career experience analyst. Given a work experience described using the PDCA framework, extract:
1. strength_keywords: up to 8 specific 2–4 word competency keywords demonstrating what the person did well
2. gap_keywords: up to 5 specific 2–4 word keywords indicating areas that could be strengthened

Good keyword examples: "A/B Test Execution", "Cross-functional Collaboration", "Budget Planning", "Data-Driven Decision Making", "Stakeholder Alignment"
Bad keyword examples: "Leadership", "Execution", "Teamwork" (too vague — must be specific and descriptive)

Respond ONLY with valid JSON in this exact format, no other text:
{"strength_keywords": ["keyword1", "keyword2"], "gap_keywords": ["keyword1"]}`;

  const userMessage = `Activity: ${activity_name}
Plan: ${plan}
Do: ${doText}
Check: ${check}
Action: ${action}`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage },
      ],
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error("Groq API error:", errText);
    return new Response(JSON.stringify({ error: "Upstream API error" }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const data = await groqRes.json();
  const rawText = data?.choices?.[0]?.message?.content ?? "";

  let result: { strength_keywords: string[]; gap_keywords: string[] };
  try {
    result = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      result = JSON.parse(match[0]);
    } else {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
