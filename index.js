const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

// ===== config =====
const accounts = [
  { user: process.env.ACC1_USER, pass: process.env.ACC1_PASS },
  { user: process.env.ACC2_USER, pass: process.env.ACC2_PASS }
];

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const boxId = 943386; // sửa ID chat

let currentAcc = 0;
let lastMsg = "";
let lastActive = Date.now();

// ===== AI =====
async function askAI(msg) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: "Trả lời ngắn, cà khịa, tự nhiên." },
          { role: "user", content: msg }
        ]
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "đơ 🤡";
  } catch {
    return "lỗi api 🤡";
  }
}

// ===== BOT =====
async function startBot(acc) {
  console.log("🚀 chạy acc:", acc.user);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  // giảm tải
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "stylesheet", "font"].includes(req.resourceType())) {
      req.abort();
    } else req.continue();
  });

  await page.goto("https://lazi.vn/login", { waitUntil: "networkidle2" });

  await page.type("#username", acc.user);
  await page.type("#password", acc.pass);
  await page.click("button[type=submit]");

  await page.waitForTimeout(5000);

  console.log("✅ login ok");

  // ===== loop =====
  while (true) {
    try {
      await page.goto("https://lazi.vn/messages", {
        waitUntil: "networkidle2"
      });

      const msg = await page.evaluate(() => {
        const msgs = document.querySelectorAll(".bfriend .rchat div div");
        return msgs[msgs.length - 1]?.innerText;
      });

      if (msg && msg !== lastMsg) {
        console.log("📩", msg);
        lastMsg = msg;
        lastActive = Date.now();

        const reply = await askAI(msg);
        console.log("🤖", reply);

        await page.evaluate((boxId, reply) => {
          const box = document.querySelector(`#lzc_text_${boxId}`);
          box.innerText = reply;
          lazi.sendButton(boxId);
        }, boxId, reply);
      }

      await new Promise(r => setTimeout(r, 10000));

    } catch (e) {
      console.log("❌ lỗi:", e.message);
      throw e; // cho failover xử lý
    }
  }
}

// ===== watchdog =====
setInterval(() => {
  if (Date.now() - lastActive > 60000) {
    console.log("⚠️ bot đơ → restart");
    process.exit(1);
  }
}, 30000);

// ===== failover =====
async function run() {
  while (true) {
    try {
      await startBot(accounts[currentAcc]);
    } catch (e) {
      console.log("💀 acc chết → đổi acc");

      currentAcc = (currentAcc + 1) % accounts.length;

      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

run();
