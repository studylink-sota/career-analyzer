// --- Tab switching ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

// --- "Other" checkbox toggles free input ---
document.querySelectorAll("[data-has-text]").forEach((cb) => {
  cb.addEventListener("change", () => {
    const input = document.getElementById(cb.dataset.hasText);
    input.hidden = !cb.checked;
    if (!cb.checked) input.value = "";
  });
});

// =====================
// 学部分析
// =====================
const form = document.getElementById("analyzeForm");
const input = document.getElementById("facultyInput");
const submitBtn = document.getElementById("submitBtn");
const resultDiv = document.getElementById("result");
const resultContent = document.getElementById("resultContent");
const errorDiv = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const faculty = input.value.trim();
  if (!faculty) return;

  setLoading(submitBtn, true);
  input.disabled = true;
  hideError();
  resultDiv.hidden = true;
  resultContent.innerHTML = "";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faculty }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "エラーが発生しました");
    }

    resultDiv.hidden = false;
    await readStream(response.body, resultContent, resultDiv);
  } catch (err) {
    showError(errorDiv, err.message);
  } finally {
    setLoading(submitBtn, false);
    input.disabled = false;
  }
});

// =====================
// キャリア診断
// =====================
const careerForm = document.getElementById("careerForm");
const careerSubmitBtn = document.getElementById("careerSubmitBtn");
const careerResultDiv = document.getElementById("careerResult");
const careerResultContent = document.getElementById("careerResultContent");
const careerErrorDiv = document.getElementById("careerError");

careerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const answers = buildCareerAnswers();
  if (!answers) return;

  setLoading(careerSubmitBtn, true);
  disableCareerForm(true);
  hideError(careerErrorDiv);
  careerResultDiv.hidden = true;
  careerResultContent.innerHTML = "";

  try {
    const response = await fetch("/api/career", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "エラーが発生しました");
    }

    careerResultDiv.hidden = false;
    await readStream(response.body, careerResultContent, careerResultDiv);
  } catch (err) {
    showError(careerErrorDiv, err.message);
  } finally {
    setLoading(careerSubmitBtn, false);
    disableCareerForm(false);
  }
});

function buildCareerAnswers() {
  const get = (name, freeId) => {
    const checked = [...document.querySelectorAll(`[name="${name}"]:checked`)].map((c) => c.value);
    const freeEl = document.getElementById(freeId);
    const free = freeEl && !freeEl.hidden ? freeEl.value.trim() : "";
    if (free) {
      return checked.filter((v) => v !== "カ" && v !== "セ" && v !== "シ" && v !== "コ").concat([`その他: ${free}`]);
    }
    return checked;
  };

  const q1 = get("q1", "q1free");
  const q2 = get("q2", "q2free");
  const q3 = get("q3", "q3free");
  const q4 = get("q4", "q4free");
  const q5 = document.getElementById("q5text").value.trim();

  if (q1.length === 0 || q2.length === 0 || q3.length === 0 || q4.length === 0 || !q5) {
    showError(careerErrorDiv, "すべての質問に回答してください。");
    return null;
  }

  return { q1, q2, q3, q4, q5 };
}

function disableCareerForm(disabled) {
  careerForm.querySelectorAll("input, textarea, button").forEach((el) => {
    el.disabled = disabled;
  });
}

// =====================
// Shared utilities
// =====================
async function readStream(body, contentEl, containerEl) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let markdown = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") break;

      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          markdown += event.delta.text;
          contentEl.innerHTML = renderMarkdown(markdown);
          containerEl.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      } catch {
        // skip
      }
    }
  }
}

function renderMarkdown(text) {
  let html = text;
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html
    .split("\n\n")
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (block.startsWith("<h") || block.startsWith("<ul") || block.startsWith("<ol")) return block;
      return `<p>${block}</p>`;
    })
    .join("\n");
  html = html.replace(/<p>(.*?)\n(.*?)<\/p>/gs, "<p>$1<br>$2</p>");
  return html;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.querySelector(".btn-text").hidden = loading;
  btn.querySelector(".btn-loading").hidden = !loading;
}

function showError(el, message) {
  if (!el) el = errorDiv;
  el.textContent = message;
  el.hidden = false;
}

function hideError(el) {
  if (!el) el = errorDiv;
  el.hidden = true;
}
