import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
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

interface Profile {
  name?: string;
  phone?: string;
  city?: string;
  email?: string;
  school?: string;
  major?: string;
  grad_year?: string | number;
  degree_level?: string;
  start_year?: string | number;
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
    spacing: { before: 340, after: 180 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.border } },
    children: [
      new TextRun({ text: label.toUpperCase(), bold: true, size: 18, color: COLOR.ink, font: "Georgia" }),
    ],
  });
}

const ZERO_CELL_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 };

// Title on the left, period pinned to the top-right — implemented as a 2-column
// borderless table (same pattern as the Skills table) instead of a tab stop.
// A tab stop only resolves against the line the cursor is currently on, so if the
// title wraps to a second line the period gets dragged down onto that second line
// (or crowds right up against the wrapped text). A table cell keeps the period's
// paragraph independent of how much the title wraps.
//
// NOTE: this table's cell paragraphs intentionally do NOT carry `spacing.before`.
// That was tried (see git history) as a way to create the gap between experience
// blocks, but Word does not honor `spacing.before` on the first paragraph of a
// table cell — it's silently dropped. The gap between blocks is created instead by
// `spacing.after` on the *previous* block's last bullet, a normal body paragraph,
// where before/after spacing is reliably respected.
function titlePeriodRow(title: string, period: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            borders: noBorders(),
            margins: ZERO_CELL_MARGINS,
            verticalAlign: VerticalAlign.TOP,
            children: [new Paragraph({
              spacing: { after: 40 },
              children: [new TextRun({ text: title, bold: true, size: 21, color: COLOR.ink, font: "Georgia" })],
            })],
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            borders: noBorders(),
            margins: ZERO_CELL_MARGINS,
            verticalAlign: VerticalAlign.TOP,
            children: [new Paragraph({
              spacing: { after: 40 },
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: period, size: 18, color: COLOR.ink3, font: "Georgia" })],
            })],
          }),
        ],
      }),
    ],
  });
}

function educationParagraphs(p: Profile): Paragraph[] {
  const degreeMajor = [p.degree_level, p.major].filter(Boolean).join(", ");
  let yearRange = "";
  if (p.start_year && p.grad_year) yearRange = `${p.start_year} – ${p.grad_year}`;
  else if (p.grad_year) yearRange = String(p.grad_year);
  else if (p.start_year) yearRange = String(p.start_year);

  const runs: TextRun[] = [];
  if (degreeMajor) runs.push(new TextRun({ text: degreeMajor, bold: true, size: 21, color: COLOR.ink, font: "Georgia" }));
  if (yearRange) {
    runs.push(new TextRun({ text: (runs.length ? " — " : "") + yearRange, size: 18, color: COLOR.ink3, font: "Georgia" }));
  }
  return [
    new Paragraph({ spacing: { after: 40 }, children: runs.length ? runs : [new TextRun({ text: "", size: 20 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: p.school || "", size: 20, color: COLOR.ink2, font: "Georgia" })] }),
  ];
}

function bulletParagraph(text: string, spacingAfter = 90): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: spacingAfter, line: 280 },
    children: [new TextRun({ text, size: 20, color: COLOR.ink2, font: "Georgia" })],
  });
}

function buildDocument(payload: ResumePayload): Document {
  const p = payload.profile || {};
  const contactLine = [p.city, p.phone, p.email].filter(Boolean).join("   |   ");

  const children: (Paragraph | Table)[] = [];

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
  experiences.forEach((exp, idx) => {
    const titleText = [exp.title, exp.activity_type].filter(Boolean).join(" · ");
    children.push(titlePeriodRow(titleText, exp.period || ""));
    const bullets = exp.bullets || [];
    const isLastBlock = idx === experiences.length - 1;
    bullets.forEach((b, bIdx) => {
      const isLastBullet = bIdx === bullets.length - 1;
      // Extra breathing room after the last bullet of every block except the final
      // one — that gap is what visually separates one experience block from the next.
      const spacingAfter = isLastBullet && !isLastBlock ? 280 : 90;
      children.push(bulletParagraph(b, spacingAfter));
    });
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
