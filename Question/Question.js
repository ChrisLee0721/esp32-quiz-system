// JavaScript Document
const API_BASE = "http://localhost:3000/api/v1";
const NODE_ID = "COM6";

let currentQuestion = null;
let view = "question";
let busy = false;

async function fetchJson(url, options = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 4000);
	try {
		const response = await fetch(url, {
			headers: { "Content-Type": "application/json" },
			...options,
			signal: controller.signal
		});

		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Request failed");
		}
		return data;
	} finally {
		clearTimeout(timer);
	}
}

function renderQuestion(question) {
	const title = document.getElementById("question");
	title.className = "";
	title.innerHTML = `Question ${question.questionId}`;

	const content = [
		`<div class="stem">${question.stem.en}</div>`,
		`<div class="stem stem-zh">${question.stem.zh}</div>`,
		"<div class=\"options\">",
		...question.options.map((o) => `
			<div class="option">
				<span class="option-key">${o.key}</span>
				<span class="option-text">${o.text}</span>
			</div>`),
		"</div>"
	].join("");

	document.getElementById("variable").innerHTML = content;
}

function renderExplanation(question, data) {
	const title = document.getElementById("question");
	title.className = "";
	title.innerHTML = `Question ${question.questionId} | 讲评`;

	const nodeLines = data.results.map((r) => {
		const sel = r.selected.length > 0 ? r.selected.join(",") : "未选";
		return `${r.nodeId} → ${sel} ${r.isCorrect ? "✓" : "✗"}`;
	}).join("　");

	const content = [
		`<div class="stem">${question.stem.en}</div>`,
		`<div class="stem stem-zh">${question.stem.zh}</div>`,
		`<div class="tally">本题: 对 ${data.counts.correct} 人 / 错 ${data.counts.wrong} 人　·　正确答案: <b>${data.correctOption}</b></div>`,
		data.results.length > 0 ? `<div class="node-results">答题情况: ${nodeLines}</div>` : "",
		"<div class=\"options\">",
		...question.options.map((o) => {
			const isCorrect = o.key === data.correctOption;
			const explain = data.explanations[o.key] || "";
			return `
				<div class="option ${isCorrect ? "is-correct" : "is-wrong"}">
					<span class="option-key ${isCorrect ? "key-correct" : "key-wrong"}">${o.key}</span>
					<div class="option-body">
						<div class="option-text">${o.text}${isCorrect ? ' <span class="tag-correct">正确答案</span>' : ""}</div>
						<div class="option-explain">${explain}</div>
					</div>
				</div>`;
		}),
		"</div>"
	].join("");

	document.getElementById("variable").innerHTML = content;
}

function renderSelection(answers) {
	const el = document.getElementById("selection");
	const ids = Object.keys(answers).sort();

	if (ids.length === 0) {
		el.className = "badge badge-selection";
		el.innerHTML = "各终端: 暂无";
		return;
	}

	const anySelected = ids.some((id) => (answers[id].selected || []).length > 0);
	const parts = ids.map((id) => {
		const sel = answers[id].selected || [];
		return `${id}: ${sel.length > 0 ? sel.join(",") : "无"}`;
	});

	el.className = anySelected ? "badge badge-selection active" : "badge badge-selection";
	el.innerHTML = `各终端 | ${parts.join("　")}`;
}

function renderStats(stats) {
	if (!stats) return;
	document.getElementById("stats-correct").innerHTML = `答对: ${stats.totalCorrect} 人`;
	document.getElementById("stats-wrong").innerHTML = `答错: ${stats.totalWrong} 人`;
}

async function loadNextQuestion() {
	const data = await fetchJson(`${API_BASE}/questions/next?nodeId=${NODE_ID}`);
	currentQuestion = data.question;
	renderQuestion(currentQuestion);
	renderSelection({});
	view = "question";
	document.getElementById("button").innerHTML = "Next";
}

async function again() {
	if (busy) return;
	busy = true;
	const btn = document.getElementById("button");
	btn.disabled = true;

	try {
		if (view === "explanation") {
			await loadNextQuestion();
		} else if (currentQuestion) {
			const data = await fetchJson(`${API_BASE}/questions/judge-all`, {
				method: "POST",
				body: JSON.stringify({ questionId: currentQuestion.questionId })
			});
			renderExplanation(currentQuestion, data);
			renderStats(data.stats);
			view = "explanation";
			btn.innerHTML = "下一题";
		} else {
			await loadNextQuestion();
		}
	} catch (error) {
		const title = document.getElementById("question");
		title.className = "wrong";
		title.innerHTML = `Error: ${error.message}`;
	} finally {
		busy = false;
		btn.disabled = false;
	}
}

async function pollSelection() {
	try {
		const data = await fetchJson(`${API_BASE}/answers`);
		renderSelection(data.answers || {});
	} catch (error) {
		console.warn("Poll answers failed:", error.message);
	} finally {
		setTimeout(pollSelection, 1500);
	}
}

window.addEventListener("load", () => {
	pollSelection();
	fetchJson(`${API_BASE}/stats`).then(renderStats).catch(() => {});
});
