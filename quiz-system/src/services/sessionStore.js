export class SessionStore {
  constructor() {
    this.currentQuestionId = null;
    this.history = [];
    this.seen = new Set();
    this.nodeAnswers = new Map();
    this.totals = { correct: 0, wrong: 0 };
  }

  recordJudgement(isCorrect) {
    if (isCorrect) {
      this.totals.correct += 1;
    } else {
      this.totals.wrong += 1;
    }
  }

  getTotals() {
    return { totalCorrect: this.totals.correct, totalWrong: this.totals.wrong };
  }

  setCurrentQuestion(questionId) {
    this.currentQuestionId = questionId;
    this.history.push(questionId);
    this.seen.add(questionId);
  }

  getCurrentQuestionId() {
    return this.currentQuestionId;
  }

  clearNodeAnswer(nodeId) {
    this.nodeAnswers.set(nodeId, { selected: [], updatedAt: Date.now() });
  }

  setNodeAnswer(nodeId, selected) {
    this.nodeAnswers.set(nodeId, { selected: [...selected], updatedAt: Date.now() });
  }

  getNodeAnswer(nodeId) {
    return this.nodeAnswers.get(nodeId) || { selected: [], updatedAt: null };
  }

  getAllNodeAnswers() {
    return Object.fromEntries(
      [...this.nodeAnswers.entries()].map(([nodeId, v]) => [nodeId, v.selected])
    );
  }

  getSeenIds() {
    return new Set(this.seen);
  }
}
