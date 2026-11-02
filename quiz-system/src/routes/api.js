import express from "express";
import { pickRandomQuestion } from "../services/questionLoader.js";

function normalizeSelection(selected) {
  if (!Array.isArray(selected)) {
    return [];
  }
  return selected
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => ["A", "B", "C", "D"].includes(s));
}

function findQuestion(questions, questionId) {
  return questions.find((q) => q.questionId === questionId) || null;
}

export function buildApiRouter({ questions, store, com7 }) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  router.get("/stats", (_req, res) => {
    res.json(store.getTotals());
  });

  router.get("/questions", (_req, res) => {
    res.json({ total: questions.length, questions });
  });

  router.get("/questions/next", async (req, res) => {
    const nodeId = String(req.query.nodeId || "COM6");
    const targetNodeIds = [nodeId];
    const q = pickRandomQuestion(questions, store.getSeenIds());

    store.setCurrentQuestion(q.questionId);
    store.clearNodeAnswer(nodeId);

    const payload = {
      questionId: q.questionId,
      targetNodeIds,
      stem: `${q.stem.en}\n${q.stem.zh}`,
      options: q.options.map((o) => `${o.key}) ${o.text}`),
      mode: "single"
    };

    let gatewayResult = null;
    try {
      gatewayResult = await com7.publishQuestion(payload);
    } catch (error) {
      gatewayResult = { error: error.message };
    }

    res.json({
      question: q,
      gatewayResult
    });
  });

  async function collectNodeAnswers() {
    const answers = {};
    try {
      const remote = await com7.getNodes();
      for (const n of remote.nodes || []) {
        const selected = normalizeSelection(n.selected);
        answers[n.nodeId] = {
          selected,
          online: Boolean(n.online)
        };
        store.setNodeAnswer(n.nodeId, selected);
      }
    } catch (_error) {
      for (const [nodeId, selected] of Object.entries(store.getAllNodeAnswers())) {
        answers[nodeId] = { selected, online: false };
      }
    }
    return answers;
  }

  router.get("/answers", async (_req, res) => {
    const answers = await collectNodeAnswers();
    res.json({ answers });
  });

  router.post("/questions/judge-all", async (req, res) => {
    const questionId = Number(req.body?.questionId || store.getCurrentQuestionId());
    const question = findQuestion(questions, questionId);
    if (!question) {
      return res.status(404).json({ error: `Unknown question ${questionId}` });
    }
    const correctOption = question.correct;

    const answers = await collectNodeAnswers();
    const results = Object.keys(answers)
      .sort()
      .map((nodeId) => {
        const selected = answers[nodeId].selected;
        const isCorrect = selected.length === 1 && selected[0] === correctOption;
        return { nodeId, selected, isCorrect };
      })
      .filter((r) => answers[r.nodeId].online || r.selected.length > 0);

    for (const r of results) {
      store.recordJudgement(r.isCorrect);
    }

    await Promise.all(
      results.map(async (r) => {
        try {
          await com7.pushJudgement(r.nodeId, { questionId, isCorrect: r.isCorrect, correctOption });
        } catch (_error) {
          // judgement LED push is best-effort; results are still counted
        }
      })
    );

    const correctCount = results.filter((r) => r.isCorrect).length;
    res.json({
      questionId,
      correctOption,
      explanations: question.explanations,
      results,
      counts: { correct: correctCount, wrong: results.length - correctCount },
      stats: store.getTotals()
    });
  });

  router.get("/nodes", async (_req, res) => {
    try {
      const nodes = await com7.getNodes();
      res.json(nodes);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  router.get("/nodes/:nodeId/answer", async (req, res) => {
    const nodeId = req.params.nodeId;
    try {
      const remote = await com7.getNodeAnswer(nodeId);
      const selected = normalizeSelection(remote.selected || remote.answer || []);
      store.setNodeAnswer(nodeId, selected);
      res.json({ nodeId, selected, source: "com7" });
    } catch (_error) {
      const local = store.getNodeAnswer(nodeId);
      res.json({ nodeId, selected: local.selected, source: "local-cache" });
    }
  });

  router.post("/nodes/:nodeId/answer", (req, res) => {
    const nodeId = req.params.nodeId;
    const selected = normalizeSelection(req.body?.selected);
    store.setNodeAnswer(nodeId, selected);
    res.json({ ok: true, nodeId, selected });
  });

  router.post("/nodes/:nodeId/judge", async (req, res) => {
    const nodeId = req.params.nodeId;
    const questionId = Number(req.body?.questionId || store.getCurrentQuestionId());
    const question = findQuestion(questions, questionId);
    if (!question) {
      return res.status(404).json({ error: `Unknown question ${questionId}` });
    }
    const correctOption = question.correct;
    const selected = normalizeSelection(req.body?.selected || store.getNodeAnswer(nodeId).selected);

    const isCorrect = selected.length === 1 && selected[0] === correctOption;

    let gatewayResult = null;
    try {
      gatewayResult = await com7.pushJudgement(nodeId, { questionId, isCorrect, correctOption });
    } catch (error) {
      gatewayResult = { error: error.message };
    }

    store.recordJudgement(isCorrect);

    return res.json({
      nodeId,
      questionId,
      selected,
      correctOption,
      isCorrect,
      stats: store.getTotals(),
      gatewayResult
    });
  });

  router.get("/gateway/status", async (_req, res) => {
    try {
      const status = await com7.getStatus();
      res.json(status);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  return router;
}
