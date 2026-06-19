import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  let body: {
    company?: string;
    role?: string;
    jd_text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { company = "", role = "", jd_text = "" } = body;

  if (!jd_text.trim()) {
    return new Response(JSON.stringify({ error: "jd_text is required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const systemPrompt = `You are an AI job-description analysis engine.

Extract the required competencies from the job posting below.

COMPANY: ${company}
ROLE: ${role}
JOB DESCRIPTION:
${jd_text}

Rules:
- Extract only competencies the job description actually requires. Do not invent or infer beyond the text.
- Express each competency as a professional noun phrase that sounds natural in the US hiring market. Represent a specific business capability, not a generic buzzword, and do not simply repeat tool or section names.
- This format MUST match the candidate-side competency keywords so the two can be compared directly.
- Merge duplicates and near-duplicates. Return between 8 and 15 keywords.

Return ONLY this JSON. No explanation. No markdown.
{
  "company_keywords": ["keyword1", "keyword2", "keyword3"]
}`;

  const userMessage = `Analyze the job description above and return the JSON.`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 512,
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

  let result: { company_keywords: string[] };
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

  // Normalize: ensure company_keywords is always a clean string array.
  const keywords = Array.isArray(result?.company_keywords)
    ? result.company_keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  return new Response(JSON.stringify({ company_keywords: keywords }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
