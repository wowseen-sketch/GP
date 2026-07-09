import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

interface Profile {
  name?: string;
  school?: string;
  major?: string;
  grad_year?: string | number;
  edu_status?: string;
  desired_role?: string;
}

interface Experience {
  id: string;
  title?: string;
  activity_type?: string;
  period?: string;
  goal?: string;
  strategy?: string;
  actions?: string;
  outcome_measurable?: string;
  failure_improvement?: string;
  takeaway?: string;
}

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function buildPrompt(profile: Profile, experiences: Experience[], companyName: string, jobTitle: string): string {
  const expBlocks = experiences.map((e, i) => `
EXPERIENCE ${i + 1} (id: ${e.id})
Title: ${e.title || ""}
Type: ${e.activity_type || ""}
Period: ${e.period || ""}
Situation/Goal: ${e.goal || ""}
Task/Strategy: ${e.strategy || ""}
Actions: ${e.actions || ""}
Measurable Outcome: ${e.outcome_measurable || ""}
Failure & Improvement: ${e.failure_improvement || ""}
Takeaway: ${e.takeaway || ""}`).join("\n");

  return `You are a professional resume writer preparing a tailored resume for a US-style job application.

CANDIDATE PROFILE:
Name: ${profile.name || ""}
School: ${profile.school || ""}
Major: ${profile.major || ""}
Graduation Year: ${profile.grad_year || ""}
Enrollment Status: ${profile.edu_status || ""}
Desired Role: ${profile.desired_role || ""}

TARGET COMPANY: ${companyName || ""}
TARGET ROLE: ${jobTitle || ""}

CANDIDATE EXPERIENCE BLOCKS:
${expBlocks}

TASK:
1. Write a professional 2-3 sentence SUMMARY that positions the candidate for the target role at the target company. Reference the candidate's strongest, most relevant experience. Write in third-person-omitted resume style (no "I" or "She/He"), confident and concise, no fluff.
2. For EACH experience block, write exactly 3 resume bullet points based on its Situation/Goal, Task/Strategy, Actions, Measurable Outcome, Failure & Improvement, and Takeaway fields. Each bullet:
   - Starts with a strong US-resume action verb (e.g. Led, Built, Drove, Launched, Analyzed, Designed, Negotiated, Reduced, Increased)
   - Is achievement/result-oriented, not a duty description
   - Includes a quantifiable metric when the source data supports one
   - Is a single sentence, no period at the end, under 220 characters

Return ONLY this JSON. No explanation. No markdown code fences.
{
  "summary": "...",
  "experience_bullets": {
    "<experience id>": ["bullet 1", "bullet 2", "bullet 3"]
  }
}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) return json({ error: "API key not configured" }, 500);

    let body: { profile?: Profile; experiences?: Experience[]; company_name?: string; job_title?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const profile = body.profile || {};
    const experiences = Array.isArray(body.experiences) ? body.experiences : [];
    const companyName = body.company_name || "";
    const jobTitle = body.job_title || "";

    if (!experiences.length) return json({ error: "experiences is required" }, 400);

    const prompt = buildPrompt(profile, experiences, companyName, jobTitle);

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2048,
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are a professional resume writer. You always return valid JSON only, with no markdown formatting." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API error:", groqRes.status, errText);
      return json({ error: "Upstream API error" }, 502);
    }

    const data = await groqRes.json();
    const rawText: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = stripJsonFence(rawText);

    let result: { summary?: string; experience_bullets?: Record<string, string[]> };
    try {
      result = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return json({ error: "Failed to parse AI response" }, 500);
      result = JSON.parse(match[0]);
    }

    const summary = typeof result.summary === "string" ? result.summary.trim() : "";
    const experienceBullets: Record<string, string[]> = {};
    const rawBullets = result.experience_bullets || {};
    for (const exp of experiences) {
      const bullets = Array.isArray(rawBullets[exp.id]) ? rawBullets[exp.id] : [];
      experienceBullets[exp.id] = bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 3);
    }

    return json({ summary, experience_bullets: experienceBullets }, 200);
  } catch (err) {
    console.error("Unhandled error in generate-resume-content:", err);
    return json({ error: String(err) }, 500);
  }
});
