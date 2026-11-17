import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const lessonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lessons: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          action: { type: "string" },
          reflection: { type: "string" },
        },
        required: ["title", "action", "reflection"],
      },
    },
  },
  required: ["lessons"],
};

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) throw new Error("Request is too large.");
  }
  return JSON.parse(body);
}

async function generateLessons(request, response) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, { error: "Add OPENAI_API_KEY to .env and restart the app." });
    return;
  }

  let book;
  try {
    book = await readJson(request);
  } catch {
    sendJson(response, 400, { error: "Send a valid book title and author." });
    return;
  }

  const title = typeof book.title === "string" ? book.title.trim().slice(0, 180) : "";
  const author = typeof book.author === "string" ? book.author.trim().slice(0, 180) : "";
  if (!title) {
    sendJson(response, 400, { error: "Enter a book title." });
    return;
  }

  const identity = author ? ` titled "${title}" by ${author}` : ` titled "${title}"`;
  const prompt = `Create exactly seven concise, practical lessons for the book${identity}. Draw on your knowledge of the book's core ideas. If the book or its contents are not reliably known, make the lessons useful for exploring the book without inventing specific claims. Do not claim to have read the user's copy, do not quote the book, and write original phrasing. Each lesson needs a short title, one concrete action, and one reflection question.`;

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "book_lessons",
            strict: true,
            schema: lessonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    sendJson(response, 502, { error: "Could not reach OpenAI. Check your connection and try again." });
    return;
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    sendJson(response, 502, { error: "OpenAI returned an unreadable response." });
    return;
  }

  if (!upstream.ok) {
    const message = upstream.status === 401
      ? "OpenAI rejected the API key. Check OPENAI_API_KEY in .env."
      : upstream.status === 429
        ? "OpenAI rate limit or usage limit reached. Check your OpenAI account."
        : "OpenAI could not generate lessons for this book.";
    sendJson(response, upstream.status === 401 ? 401 : 502, { error: message });
    return;
  }

  try {
    const outputText = result.output_text ?? result.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
    const generated = JSON.parse(outputText);
    if (!Array.isArray(generated.lessons) || generated.lessons.length !== 7 || generated.lessons.some((lesson) =>
      ![lesson.title, lesson.action, lesson.reflection].every((value) => typeof value === "string" && value.trim())
    )) throw new Error("Invalid lesson response.");
    sendJson(response, 200, { lessons: generated.lessons });
  } catch {
    sendJson(response, 502, { error: "OpenAI returned lessons in an unexpected format. Please try again." });
  }
}

async function serveFile(request, response, pathname) {
  let requestedPath;
  try {
    requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (requestedPath.split("/").some((part) => part.startsWith("."))) {
    response.writeHead(404).end("Not found");
    return;
  }

  let filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, "index.html");
    const content = await readFile(filePath);
    const type = filePath.endsWith(".html") ? "text/html; charset=utf-8"
      : filePath.endsWith(".mjs") ? "text/javascript; charset=utf-8"
        : "application/octet-stream";
    response.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

export function createServer() {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "POST" && url.pathname === "/api/generate-lessons") {
      await generateLessons(request, response);
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveFile(request, response, url.pathname);
      return;
    }
    response.writeHead(405, { allow: "GET, HEAD, POST" }).end("Method not allowed");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Book Lessons is running at http://127.0.0.1:${port}`);
  });
}