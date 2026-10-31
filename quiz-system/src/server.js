import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { buildCom7Client } from "./services/com7Client.js";
import { loadQuestions } from "./services/questionLoader.js";
import { SessionStore } from "./services/sessionStore.js";
import { buildApiRouter } from "./routes/api.js";

const app = express();
app.use(cors());
app.use(express.json());

const questions = loadQuestions(config.questionCsvPath);
const store = new SessionStore();
const com7 = buildCom7Client(config.com7BaseUrl);

app.use(
  "/api/v1",
  buildApiRouter({
    questions,
    store,
    com7
  })
);

app.listen(config.port, () => {
  console.log(`Quiz API listening on http://localhost:${config.port}`);
  console.log(`Loaded ${questions.length} questions from ${config.questionCsvPath}`);
  console.log(`COM7 base URL: ${config.com7BaseUrl}`);
});
