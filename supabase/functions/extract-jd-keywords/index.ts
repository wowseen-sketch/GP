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

  const systemPrompt = `You are an AI job-description analysis engine trained on O*NET occupational standards.

Analyze the job description below and extract required competencies using O*NET frameworks.

COMPANY: ${company}
ROLE: ${role}
JOB DESCRIPTION:
${jd_text}

STEP 1. Read every line of the JD and classify it as one of two types:

TYPE A — Action/Duty items (what this person will DO on the job)
Signals: starts with a verb, contains "you will", "responsible for", "lead", "drive", "build", "manage", "define", "develop"
→ Map to O*NET Work Activities

TYPE B — Qualification/Competency items (what this person must ALREADY HAVE)
Signals: contains "experience in/with", "knowledge of", "ability to", "proven track record", "X+ years", names a specific tool or technology, describes a personal trait or skill
→ Map to O*NET Software Skills and/or Transferable Skills

If ambiguous, ask: "Does the candidate need this BEFORE joining?"
YES → Type B. NO → Type A.

STEP 2. From TYPE A items, select matching Work Activities from this list (41 total):
Analyzing Data or Information, Assisting and Caring for Others, Coaching and Developing Others, Communicating with People Outside the Organization, Communicating with Supervisors Peers or Subordinates, Coordinating the Work and Activities of Others, Developing Objectives and Strategies, Developing and Building Teams, Documenting/Recording Information, Establishing and Maintaining Interpersonal Relationships, Evaluating Information to Determine Compliance with Standards, Getting Information, Guiding Directing and Motivating Subordinates, Identifying Objects Actions and Events, Interpreting the Meaning of Information for Others, Judging the Qualities of Objects Services or People, Making Decisions and Solving Problems, Monitoring Processes Materials or Surroundings, Monitoring and Controlling Resources, Organizing Planning and Prioritizing Work, Performing Administrative Activities, Performing for or Working Directly with the Public, Processing Information, Providing Consultation and Advice to Others, Resolving Conflicts and Negotiating with Others, Scheduling Work and Activities, Selling or Influencing Others, Staffing Organizational Units, Thinking Creatively, Training and Teaching Others, Updating and Using Relevant Knowledge, Working with Computers

STEP 3. From TYPE B items, select matching Software Skills from this list:
Analytical or scientific software, Business intelligence and data analysis software, Calendar and scheduling software, Cloud-based data access and sharing software, Cloud-based management software, Customer relationship management CRM software, Data base management system software, Data base user interface and query software, Data mining software, Development environment software, Document management software, Electronic mail software, Enterprise resource planning ERP software, Financial analysis software, Graphics or photo imaging software, Human resources software, Information retrieval or search software, Object or component oriented development software, Office suite software, Presentation software, Process mapping and design software, Project management software, Risk management data and analysis software, Sales and marketing software, Spreadsheet software, Video conferencing software, Web platform development software, Word processing software

STEP 4. From TYPE B items, select matching Transferable Skills from this list:
Social Perceptiveness, Coordination, Persuasion, Negotiation, Instructing, Service Orientation, Complex Problem Solving, Operations Analysis, Technology Design, Programming, Quality Control Analysis, Judgment and Decision Making, Systems Analysis, Systems Evaluation, Time Management, Management of Financial Resources, Management of Personnel Resources

STEP 5. Based on the selected Work Activities, Software Skills, and Transferable Skills, generate competency_keywords.

Use these exact conversion examples as your guide — the output must follow the same pattern:

Work Activities → competency keywords:
- "Analyzing Data or Information" → "Data Analysis and Interpretation"
- "Developing Objectives and Strategies" → "Strategic Planning and Execution"
- "Coordinating the Work and Activities of Others" → "Cross-Functional Team Coordination"
- "Making Decisions and Solving Problems" → "Data-Driven Decision Making"
- "Thinking Creatively" → "Creative Problem Solving"
- "Selling or Influencing Others" → "Stakeholder Influence and Persuasion"
- "Communicating with People Outside the Organization" → "External Stakeholder Communication"
- "Communicating with Supervisors, Peers, or Subordinates" → "Cross-Level Team Communication"
- "Developing and Building Teams" → "Team Development and Leadership"
- "Guiding, Directing, and Motivating Subordinates" → "People Management and Motivation"
- "Organizing, Planning, and Prioritizing Work" → "Project Planning and Prioritization"
- "Providing Consultation and Advice to Others" → "Strategic Advisory and Consulting"
- "Interpreting the Meaning of Information for Others" → "Data Storytelling and Communication"
- "Evaluating Information to Determine Compliance with Standards" → "Quality Assurance and Compliance"
- "Resolving Conflicts and Negotiating with Others" → "Conflict Resolution and Negotiation"
- "Training and Teaching Others" → "Training and Knowledge Transfer"
- "Monitoring and Controlling Resources" → "Resource Planning and Control"
- "Processing Information" → "Information Processing and Synthesis"
- "Getting Information" → "Market and Competitive Research"
- "Updating and Using Relevant Knowledge" → "Continuous Learning and Knowledge Application"
- "Identifying Objects, Actions, and Events" → "Pattern Recognition and Insight Generation"
- "Scheduling Work and Activities" → "Workflow Scheduling and Coordination"
- "Staffing Organizational Units" → "Talent Acquisition and Team Building"
- "Judging the Qualities of Objects, Services, or People" → "Evaluation and Quality Judgment"
- "Estimating the Quantifiable Characteristics of Products, Events, or Information" → "Quantitative Estimation and Forecasting"
- "Performing for or Working Directly with the Public" → "Customer-Facing Communication"
- "Establishing and Maintaining Interpersonal Relationships" → "Relationship Building and Stakeholder Management"
- "Working with Computers" → "Digital Tool Proficiency"
- "Documenting/Recording Information" → "Documentation and Reporting"

Transferable Skills → competency keywords:
- "Complex Problem Solving" → "Complex Problem Solving and Solution Design"
- "Judgment and Decision Making" → "Strategic Judgment and Decision Making"
- "Systems Analysis" → "Systems Thinking and Process Analysis"
- "Operations Analysis" → "Operations Analysis and Requirements Design"
- "Coordination" → "Cross-Functional Coordination"
- "Persuasion" → "Influence and Stakeholder Persuasion"
- "Negotiation" → "Negotiation and Conflict Resolution"
- "Social Perceptiveness" → "Interpersonal Awareness and Empathy"
- "Service Orientation" → "Customer-Centric Service Delivery"
- "Time Management" → "Time and Priority Management"
- "Management of Personnel Resources" → "People Leadership and Team Management"
- "Management of Financial Resources" → "Budget Planning and Financial Management"
- "Management of Material Resources" → "Resource Allocation and Operations Management"
- "Quality Control Analysis" → "Quality Control and Performance Evaluation"
- "Systems Evaluation" → "System Performance Evaluation and Optimization"
- "Technology Design" → "Technology Design and Innovation"
- "Programming" → "Software Development and Programming"
- "Instructing" → "Training Design and Knowledge Transfer"
- "Troubleshooting" → "Technical Troubleshooting and Problem Resolution"

Software Skills → use the software category name directly as-is (e.g. "Project management software", "Data mining software")

Rules:
- Follow the conversion pattern above strictly
- Do NOT invent new expressions outside this pattern
- If a selected item is not in the examples above, follow the closest pattern
- Return 8 to 15 keywords total
- No duplicates

Return ONLY this JSON. No explanation. No markdown.
{
  "work_activities": ["item1", "item2"],
  "software_skills": ["item1", "item2"],
  "transferable_skills": ["item1", "item2"],
  "company_keywords": ["keyword1", "keyword2"]
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
    return new Response(JSON.stringify({ error: "Upstream API error" }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const data = await groqRes.json();
  const rawText = data?.choices?.[0]?.message?.content ?? "";

  let result: { work_activities?: string[]; software_skills?: string[]; transferable_skills?: string[]; company_keywords: string[] };
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
