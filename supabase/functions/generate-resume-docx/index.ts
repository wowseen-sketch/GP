import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "npm:docx@8.5.0";

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

// Grayscale palette — matches the app's CSS design tokens (--ink / --ink-2 / --ink-3 / --ink-4 / --border).
const COLOR = {
  ink: "111318",
  ink2: "374151",
  ink3: "6B7280",
  ink4: "9CA3AF",
  border: "D1D5DB",
};

const PAGE_WIDTH_TWIPS = 9026; // usable width inside 1in margins on a Letter page

interface Profile {
  name?: string;
  phone?: string;
  city?: string;
  email?: string;
  school?: string;
  major?: string;
  grad_year?: string | number;
  desired_role?: string;
}

interface ExperienceEntry {
  id?: string;
  title?: string;
  activity_type?: string;
  period?: string;
  bullets?: string[];
}

interface ResumePayload {
  profile?: Profile;
  summary?: string;
  experiences?: ExperienceEntry[];
  skills?: string[];
  company_name?: string;
  job_title?: string;
}

function sectionHeading(label: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.border } },
    children: [
      new TextRun({ text: label.toUpperCase(), bold: true, size: 18, color: COLOR.ink, font: "Georgia" }),
    ],
  });
}

function titlePeriodLine(title: string, period: string): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: PAGE_WIDTH_TWIPS }],
    spacing: { after: 60 },
    children: [
      new TextRun({ text: title, bold: true, size: 21, color: COLOR.ink, font: "Georgia" }),
      new TextRun({ text: "\t" + period, size: 18, color: COLOR.ink3, font: "Georgia" }),
    ],
  });
}

function educationParagraphs(p: Profile): Paragraph[] {
  const runs: TextRun[] = [];
  if (p.major) runs.push(new TextRun({ text: p.major, bold: true, size: 21, color: COLOR.ink, font: "Georgia" }));
  if (p.grad_year) {
    runs.push(new TextRun({ text: (runs.length ? " — " : "") + String(p.grad_year), size: 18, color: COLOR.ink3, font: "Georgia" }));
  }
  return [
    new Paragraph({ spacing: { after: 40 }, children: runs.length ? runs : [new TextRun({ text: "", size: 20 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: p.school || "", size: 20, color: COLOR.ink2, font: "Georgia" })] }),
  ];
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, color: COLOR.ink2, font: "Georgia" })],
  });
}

function buildDocument(payload: ResumePayload): Document {
  const p = payload.profile || {};
  const contactLine = [p.city, p.phone, p.email].filter(Boolean).join("   |   ");

  const children: Paragraph[] = [];

  if (p.desired_role) {
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: p.desired_role.toUpperCase(), bold: true, size: 16, color: COLOR.ink4, font: "Georgia" })],
    }));
  }
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: p.name || "", bold: true, size: 40, color: COLOR.ink, font: "Georgia" })],
  }));
  children.push(new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR.border } },
    children: [new TextRun({ text: contactLine, size: 18, color: COLOR.ink3, font: "Georgia" })],
  }));

  children.push(sectionHeading("Summary"));
  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: payload.summary || "", size: 20, color: COLOR.ink2, font: "Georgia" })],
  }));

  children.push(sectionHeading("Experience"));
  const experiences = payload.experiences || [];
  if (!experiences.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "No experience data.", size: 20, color: COLOR.ink4, font: "Georgia" })],
    }));
  }
  experiences.forEach((exp) => {
    const titleText = [exp.title, exp.activity_type].filter(Boolean).join(" · ");
    children.push(titlePeriodLine(titleText, exp.period || ""));
    (exp.bullets || []).forEach((b) => children.push(bulletParagraph(b)));
  });

  children.push(sectionHeading("Education"));
  children.push(...educationParagraphs(p));

  children.push(sectionHeading("Skills"));
  const skills = payload.skills || [];
  const skillParas = skills.map((k) =>
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "•  " + k, size: 20, color: COLOR.ink2, font: "Georgia" })] })
  );
  const half = Math.ceil(skillParas.length / 2);
  const leftCol = skillParas.slice(0, half);
  const rightCol = skillParas.slice(half);
  const rowCount = Math.max(leftCol.length, rightCol.length, 1);
  const rows: TableRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders(),
          children: [leftCol[i] || new Paragraph({ children: [] })],
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders(),
          children: [rightCol[i] || new Paragraph({ children: [] })],
        }),
      ],
    }));
  }
  const skillsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: [...children, skillsTable],
    }],
  });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    let body: ResumePayload;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!body.profile) return json({ error: "profile is required" }, 400);

    const doc = buildDocument(body);
    const buffer = await Packer.toBuffer(doc);
    const docxBase64 = base64Encode(buffer);

    return json({ docx_base64: docxBase64 }, 200);
  } catch (err) {
    console.error("Unhandled error in generate-resume-docx:", err);
    return json({ error: String(err) }, 500);
  }
});
