import fs from "fs";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export function loadQuestions(csvPath) {
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return [];
  }

  const header = rows[0].map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const required = [
    "question_id", "stem_en", "stem_zh",
    "option_a", "option_b", "option_c", "option_d",
    "correct", "explain_a", "explain_b", "explain_c", "explain_d"
  ];
  for (const name of required) {
    if (col[name] === undefined) {
      throw new Error(`questions.csv missing column: ${name}`);
    }
  }

  return rows.slice(1).map((r, rowIndex) => {
    const questionId = Number((r[col.question_id] || "").trim());
    const correct = (r[col.correct] || "").trim().toUpperCase();
    if (!Number.isInteger(questionId)) {
      throw new Error(`questions.csv row ${rowIndex + 2}: invalid question_id`);
    }
    if (!["A", "B", "C", "D"].includes(correct)) {
      throw new Error(`questions.csv row ${rowIndex + 2}: invalid correct answer`);
    }

    const cell = (name) => (r[col[name]] || "").trim();
    return {
      questionId,
      stem: { en: cell("stem_en"), zh: cell("stem_zh") },
      options: ["A", "B", "C", "D"].map((key) => ({
        key,
        text: cell(`option_${key.toLowerCase()}`)
      })),
      correct,
      explanations: {
        A: cell("explain_a"),
        B: cell("explain_b"),
        C: cell("explain_c"),
        D: cell("explain_d")
      }
    };
  });
}

export function pickRandomQuestion(questions, seenSet) {
  const unseen = questions.filter((q) => !seenSet.has(q.questionId));
  const pool = unseen.length > 0 ? unseen : questions;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}
