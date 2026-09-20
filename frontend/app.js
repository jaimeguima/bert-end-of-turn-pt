const API_BASE = "http://localhost:8000";

let currentMode = 1;
let classifyTimer = null;     // debounce for live classify
let waitTimer = null;         // 5s wait timer (mode 2)
let pendingText = null;       // text waiting to be sent (mode 2)
let typingBubbleEl = null;    // current typing bubble
let countdownEl = null;       // countdown label element
let countdownInterval = null; // countdown interval
let isBusy = false;           // prevent double sends

// ──────────────────────────────────────────────
// Mode switching
// ──────────────────────────────────────────────
function setMode(m) {
  currentMode = m;
  document.getElementById("btn-mode1").classList.toggle("active", m === 1);
  document.getElementById("btn-mode2").classList.toggle("active", m === 2);

  const desc = document.getElementById("mode-desc-text");
  if (m === 1) {
    desc.innerHTML = `Mode 1 &middot; Smart Routing: complete sentence → large model &nbsp;&nbsp;incomplete sentence → small model.`;
  } else {
    desc.innerHTML = `Mode 2 &middot; Wait &amp; Send: complete sentence → large model immediately. Incomplete → wait 5 s (if user stops typing) → large model.`;
  }

  cancelWait();
  clearBertLive();
}

function handleKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleInput() {
  const input = document.getElementById("user-input");
  autoResize(input);

  const text = input.value.trim();

  if (currentMode === 2 && waitTimer && pendingText !== null) {
    resetWaitTimer(text);
    return;
  }

  clearTimeout(classifyTimer);
  if (!text) {
    clearBertLive();
    return;
  }
  classifyTimer = setTimeout(() => liveClassify(text), 400);
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

async function handleSend() {
  if (isBusy) return;
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  input.style.height = "auto";
  clearBertLive();
  hideEmpty();

  const userGroup = addUserBubble(text);

  isBusy = true;
  setSendDisabled(true);

  try {
    const result = await classify(text);

    if (currentMode === 1) {
      await handleMode1(result);
    } else {
      await handleMode2(text, result, userGroup);
    }
  } catch (err) {
    addModelBubble("⚠️ Could not reach the API. Make sure the backend is running.", null);
  }

  isBusy = false;
  setSendDisabled(false);
  input.focus();
}

async function handleMode1(result) {
  const isComplete = result.label === 1;
  const modelType = isComplete ? "large" : "small";
  const conf = formatConf(result.confidence);

  showTyping();
  await sleep(700); // simulate brief processing
  removeTyping();

  addModelBubble(modelType, conf);
}

async function handleMode2(text, result, userGroup) {
  const conf = formatConf(result.confidence);

  addBertBadge(userGroup, result.label, conf);

  if (result.label === 1) {
    showTyping();
    await sleep(700);
    removeTyping();
    addModelBubble("large", conf);
  } else {
    pendingText = text;
    startWaitTimer(text, conf);
  }
}

function startWaitTimer(text, conf) {
  showTyping();
  let remaining = 5;
  showCountdown(remaining);

  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      showCountdown(remaining);
    }
  }, 1000);

  waitTimer = setTimeout(async () => {
    clearCountdown();
    removeTyping();
    addModelBubble("large", conf);
    pendingText = null;
    waitTimer = null;
    isBusy = false;
    setSendDisabled(false);
    document.getElementById("user-input").focus();
  }, 5000);
}

function resetWaitTimer(newText) {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
    clearCountdown();
    removeTyping();
    pendingText = null;
    isBusy = false;
    setSendDisabled(false);
  }

  clearTimeout(classifyTimer);
  if (!newText) { clearBertLive(); return; }
  classifyTimer = setTimeout(() => liveClassify(newText), 400);
}

function cancelWait() {
  if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  removeTyping();
  clearCountdown();
  pendingText = null;
}

async function classify(text) {
  const res = await fetch(`${API_BASE}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("API error");
  return res.json(); // { label, confidence }
}

async function liveClassify(text) {
  try {
    const result = await classify(text);
    const label = result.label === 1 ? "complete" : "incomplete";
    const conf = formatConf(result.confidence);
    const icon = result.label === 1 ? "●" : "○";
    document.getElementById("bert-live-text").textContent =
      `BERT → ${icon} ${label} · ${conf}`;
  } catch {
    document.getElementById("bert-live-text").textContent = "BERT → unavailable";
  }
}

function addUserBubble(text) {
  const container = document.getElementById("chat-container");
  const group = document.createElement("div");
  group.className = "msg-group user";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  group.appendChild(bubble);
  container.appendChild(group);
  scrollToBottom();
  return group;
}

function addBertBadge(userGroup, label, conf) {
  const badge = document.createElement("span");
  badge.className = "bert-badge";
  const labelText = label === 1 ? "complete" : "incomplete";
  badge.textContent = `bert: ${labelText} · ${conf}`;
  userGroup.appendChild(badge);
  scrollToBottom();
}

function addModelBubble(modelType, conf) {
  const container = document.getElementById("chat-container");
  const group = document.createElement("div");
  group.className = "msg-group model";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const label = document.createElement("span");
  label.className = "model-label";
  const modelName = modelType === "large" ? "large model" : "small model";
  label.textContent = conf ? `${modelName} · confidence: ${conf}` : modelName;

  bubble.appendChild(label);
  group.appendChild(bubble);
  container.appendChild(group);
  scrollToBottom();
}

function showTyping() {
  const container = document.getElementById("chat-container");
  const group = document.createElement("div");
  group.className = "msg-group model";
  group.id = "typing-group";

  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;
  group.appendChild(bubble);

  countdownEl = document.createElement("div");
  countdownEl.className = "countdown-label";
  countdownEl.id = "countdown-label";
  group.appendChild(countdownEl);

  container.appendChild(group);
  typingBubbleEl = group;
  scrollToBottom();
}

function removeTyping() {
  const el = document.getElementById("typing-group");
  if (el) el.remove();
  typingBubbleEl = null;
}

function showCountdown(sec) {
  const el = document.getElementById("countdown-label");
  if (el) el.textContent = `Waiting for confirmation… ${sec}s`;
}

function clearCountdown() {
  const el = document.getElementById("countdown-label");
  if (el) el.textContent = "";
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function clearBertLive() {
  document.getElementById("bert-live-text").textContent = "—";
}

function hideEmpty() {
  const el = document.getElementById("empty-state");
  if (el) el.remove();
}

function setSendDisabled(v) {
  document.getElementById("send-btn").disabled = v;
}

function scrollToBottom() {
  const c = document.getElementById("chat-container");
  c.scrollTop = c.scrollHeight;
}

function formatConf(v) {
  return (v * 100).toFixed(1) + "%";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
