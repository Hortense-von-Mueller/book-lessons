# Book Lessons

The app uses a local Node.js server to keep your OpenAI API key out of browser code.

1. Add your key to `.env` as `OPENAI_API_KEY=...`. The file is ignored by Git.
2. Start the app with `node --env-file=.env server.mjs` using Node.js 20 or newer.
3. Open `http://127.0.0.1:4173` and enter a book title and optional author.

The server calls OpenAI's Responses API to generate seven original practice lessons. The lessons draw on the model's available knowledge and are not checked against the full text of a specific edition. OpenAI API usage may incur charges.

Run the local tests with `node --test scripts/app.test.mjs`.