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

  let body: {
    freetext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { freetext = "" } = body;

  const systemPrompt = `You are an AI career analysis engine.

Analyze the user's experience input and return a structured JSON result by following the 4 steps below.

USER EXPERIENCE INPUT (raw, unstructured):
${freetext}

Before analyzing, do the following:
- Fix all typos, grammar errors, and informal phrasing
- Restructure the cleaned content into STAR format:
  S (Situation): context and background
  T (Task): the goal or responsibility
  A (Action): what was actually done
  R (Result): outcomes and impact
Use this STAR-structured version as the basis for all analysis steps below.

First, populate star_structured by restructuring the input into STAR format:
- situation: background context, team setup, role, where and when
- task: the goal, objective, or problem to solve
- action: specific actions taken, methods, tools used, collaboration
- result: outcomes, measurable impact, recognition, lessons learned

STEP 1. Select all relevant Work Activities from the list below. Only select items clearly supported by the experience. Do not infer.

Work Activities (41 total):
Analyzing Data or Information, Assisting and Caring for Others, Coaching and Developing Others, Communicating with People Outside the Organization, Communicating with Supervisors, Peers, or Subordinates, Controlling Machines and Processes, Coordinating the Work and Activities of Others, Developing Objectives and Strategies, Developing and Building Teams, Documenting/Recording Information, Drafting, Laying Out, and Specifying Technical Devices, Parts, and Equipment, Establishing and Maintaining Interpersonal Relationships, Estimating the Quantifiable Characteristics of Products, Events, or Information, Evaluating Information to Determine Compliance with Standards, Getting Information, Guiding, Directing, and Motivating Subordinates, Handling and Moving Objects, Identifying Objects, Actions, and Events, Inspecting Equipment, Structures, or Materials, Interpreting the Meaning of Information for Others, Judging the Qualities of Objects, Services, or People, Making Decisions and Solving Problems, Monitoring Processes, Materials, or Surroundings, Monitoring and Controlling Resources, Operating Vehicles, Mechanized Devices, or Equipment, Organizing, Planning, and Prioritizing Work, Performing Administrative Activities, Performing General Physical Activities, Performing for or Working Directly with the Public, Processing Information, Providing Consultation and Advice to Others, Repairing and Maintaining Electronic Equipment, Repairing and Maintaining Mechanical Equipment, Resolving Conflicts and Negotiating with Others, Scheduling Work and Activities, Selling or Influencing Others, Staffing Organizational Units, Thinking Creatively, Training and Teaching Others, Updating and Using Relevant Knowledge, Working with Computers

STEP 2. Select all relevant Software Skills from the list below. Only select if a specific tool or software was explicitly mentioned or clearly implied.

Software Skills (134 total):
Access software, Accounting software, Action games, Administration software, Analytical or scientific software, Application server software, Audit software, Authentication server software, Aviation ground support software, Backup or archival software, Bar coding software, Billing and invoicing software, Bridge software, Business intelligence and data analysis software, Calendar and scheduling software, Categorization or classification software, Charting software, Cloud-based data access and sharing software, Cloud-based management software, Cloud-based protection or security software, Clustering software, Communications server software, Compiler and decompiler software, Compliance software, Computer aided design CAD software, Computer based training software, Configuration management software, Contact center software, Content workflow software, Customer relationship management CRM software, Data base management system software, Data base reporting software, Data base user interface and query software, Data mining software, Desktop communications software, Desktop publishing software, Development environment software, Document management software, Electronic mail software, Enterprise application integration software, Enterprise resource planning ERP software, File versioning software, Financial analysis software, Graphical user interface development software, Graphics or photo imaging software, Helpdesk or call center software, Human resources software, Information retrieval or search software, Instant messaging software, Inventory management software, Network monitoring software, Object or component oriented development software, Office suite software, Operating system software, Presentation software, Process mapping and design software, Procurement software, Program testing software, Project management software, Requirements analysis and system architecture software, Risk management data and analysis software, Sales and marketing software, Spreadsheet software, Tax preparation software, Video conferencing software, Video creation and editing software, Web page creation and editing software, Web platform development software, Word processing software

STEP 3. Select all relevant Transferable Skills from the list below. Each item includes its official definition. Only select if clearly supported by the experience.

Transferable Skills (25 total):
- Social Perceptiveness: Being aware of others' reactions and understanding why they react as they do.
- Coordination: Adjusting actions in relation to others' actions.
- Persuasion: Persuading others to change their minds or behavior.
- Negotiation: Bringing others together and trying to reconcile differences.
- Instructing: Teaching others how to do something.
- Service Orientation: Actively looking for ways to help people.
- Complex Problem Solving: Identifying complex problems and reviewing related information to develop and evaluate options and implement solutions.
- Operations Analysis: Analyzing needs and product requirements to create a design.
- Technology Design: Generating or adapting equipment and technology to serve user needs.
- Equipment Selection: Determining the kind of tools and equipment needed to do a job.
- Installation: Installing equipment, machines, wiring, or programs to meet specifications.
- Programming: Writing computer programs for various purposes.
- Operations Monitoring: Watching gauges, dials, or other indicators to make sure a machine is working properly.
- Operation and Control: Controlling operations of equipment or systems.
- Equipment Maintenance: Performing routine maintenance on equipment and determining when and what kind of maintenance is needed.
- Troubleshooting: Determining causes of operating errors and deciding what to do about it.
- Repairing: Repairing machines or systems using the needed tools.
- Quality Control Analysis: Conducting tests and inspections of products, services, or processes to evaluate quality or performance.
- Judgment and Decision Making: Considering the relative costs and benefits of potential actions to choose the most appropriate one.
- Systems Analysis: Determining how a system should work and how changes in conditions, operations, and the environment will affect outcomes.
- Systems Evaluation: Identifying measures or indicators of system performance and the actions needed to improve or correct performance, relative to the goals of the system.
- Time Management: Managing one's own time and the time of others.
- Management of Financial Resources: Determining how money will be spent to get the work done, and accounting for these expenditures.
- Management of Material Resources: Obtaining and seeing to the appropriate use of equipment, facilities, and materials needed to do certain work.
- Management of Personnel Resources: Motivating, developing, and directing people as they work, identifying the best people for the job.

STEP 4. Based on the selected Work Activities, Software Skills, Transferable Skills, and the overall context of the experience, infer the user's core job-oriented competency keywords. Keywords must sound natural in the US hiring market, represent specific business capabilities, not simply repeat skill names, and be expressed as professional noun phrases.

Return ONLY this JSON. No explanation. No markdown.
{
  "star_structured": {
    "situation": "...",
    "task": "...",
    "action": "...",
    "result": "..."
  },
  "work_activities": ["item1", "item2"],
  "software_skills": ["item1", "item2"],
  "transferable_skills": ["item1", "item2"],
  "competency_keywords": ["keyword1", "keyword2", "keyword3"]
}`;

  const userMessage = `Analyze the experience described above and return the JSON.`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
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

  let result: {
    work_activities: string[];
    software_skills: string[];
    transferable_skills: string[];
    competency_keywords: string[];
    star_structured: { situation: string; task: string; action: string; result: string; };
  };
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
