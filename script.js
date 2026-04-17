const form = document.getElementById("analyzeForm");
const input = document.getElementById("facultyInput");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const btnLoading = submitBtn.querySelector(".btn-loading");
const resultDiv = document.getElementById("result");
const resultContent = document.getElementById("resultContent");
const errorDiv = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const faculty = input.value.trim();
  if (!faculty) return;

  setLoading(true);
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
    await readStream(response.body);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

async function readStream(body) {
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
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta"
        ) {
          markdown += event.delta.text;
          resultContent.innerHTML = renderMarkdown(markdown);
          resultDiv.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }
}

function renderMarkdown(text) {
  let html = text;

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Paragraphs - wrap standalone lines
  html = html
    .split("\n\n")
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (
        block.startsWith("<h") ||
        block.startsWith("<ul") ||
        block.startsWith("<ol")
      ) {
        return block;
      }
      return `<p>${block}</p>`;
    })
    .join("\n");

  // Clean up newlines inside paragraphs
  html = html.replace(/<p>(.*?)\n(.*?)<\/p>/gs, "<p>$1<br>$2</p>");

  return html;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  input.disabled = loading;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;
}

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.hidden = false;
}

function hideError() {
  errorDiv.hidden = true;
}
