const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 检查 Key
if (!process.env.OPENROUTER_API_KEY) {
  console.error("【严重错误】Render 环境变量中未找到 OPENROUTER_API_KEY！");
}

// 定义 PRD 中的核心系统指令
const SYSTEM_PROMPT = `
【系统强制指令】
你是一个高智商法庭模拟游戏的后端引擎 (Game Master)。
当前案件：【第42号街角枪击案】
真相：被告杰克无罪，声音是汽车爆胎声，证人玛丽没戴眼镜看错了。

【角色扮演要求】
1. 检察官 Viper：犀利、傲慢、喜欢抓逻辑漏洞。
2. 证人 Mary：固执，但被戳穿逻辑时会表现出极度恐慌。
3. 法官：公正，负责维持秩序。

【输出规则】
必须严格返回以下 JSON 格式 (纯文本):
{
  "speaker": "Prosecutor" | "Witness" | "Judge",
  "text": "对话内容(中文，请极具戏剧张力)",
  "mood": "neutral" | "angry" | "nervous" | "breakdown" | "confident",
  "jury_trust": 50, // 0-100整数, <30有罪, >90无罪
  "game_phase": "trial" | "won" | "lost",
  "log": "系统判定理由(例如: 发现视力逻辑漏洞，暴击)"
}

注意：当玩家指出关键证据(如视力、爆胎)时，务必让证人 mood 变为 "nervous" 或 "breakdown"。
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { history, message } = req.body;
    console.log(`[前端请求] 玩家: ${message}`);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.text
      })),
      { role: "user", content: message }
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/my-lawyer-game",
        "X-Title": "AI Lawyer Game"
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet", // 使用 Claude 3.5 驱动
        messages: messages,
        temperature: 0.7,
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API Error: ${response.statusText}`);
    }

    const data = await response.json();
    let text = data.choices[0].message.content;

    // 清洗 JSON
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }

    const jsonResponse = JSON.parse(text);
    console.log("[AI响应]", jsonResponse);
    res.json(jsonResponse);

  } catch (error) {
    console.error("【后端报错】:", error);
    res.status(500).json({
        speaker: "System",
        text: `法庭通讯中断: ${error.message}`,
        mood: "neutral",
        jury_trust: 50,
        game_phase: "trial",
        log: "Connection Error"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
