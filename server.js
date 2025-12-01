const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 检查 API KEY
if (!process.env.GEMINI_API_KEY) {
  console.error("【严重错误】Render 环境变量中未找到 GEMINI_API_KEY！");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 核心规则
const SYSTEM_PROMPT = `
【系统指令】
你是一个法庭模拟游戏的后端引擎。
当前案件：【第42号街角枪击案】
真相：被告杰克无罪，声音是汽车爆胎声，证人玛丽没戴眼镜看错了。

你的回复必须严格遵守以下 JSON 格式（不要用 Markdown，只返回纯 JSON 文本）：
{
  "speaker": "Prosecutor (或 Judge 或 Witness)",
  "text": "对话内容(中文)",
  "mood": "neutral (或 angry, nervous, confident)",
  "jury_trust": 50 (根据逻辑加减，0-100),
  "game_phase": "trial (或 won, lost)",
  "log": "系统判定理由"
}
`;

app.post('/api/chat', async (req, res) => {
  try {
    console.log("收到请求，正在处理...");
    const { history, message } = req.body;
    
    // 1. 改用最稳定的 gemini-pro 模型
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // 2. 手动构建历史记录，把规则“强塞”进第一句
    // 这种方法比 systemInstruction 兼容性更好
    const chatHistory = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }] // 强制注入规则
      },
      {
        role: "model",
        parts: [{ text: "收到。我将严格以 JSON 格式扮演法官、检察官和证人。" }] // 假装 AI 已经答应了
      },
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    ];

    const chat = model.startChat({
      history: chatHistory
    });

    console.log("正在请求 Google Gemini Pro...");
    const result = await chat.sendMessage(message);
    const response = await result.response;
    let text = response.text();
    
    console.log("AI 原始回复:", text);

    // 3. 强力清洗数据（防止 AI 啰嗦）
    // 去掉 markdown 符号，去掉首尾可能的杂质
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 尝试找到第一个 { 和最后一个 } 之间的内容
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }

    const jsonResponse = JSON.parse(text);
    res.json(jsonResponse);

  } catch (error) {
    console.error("【后端报错】:", error);
    
    // 返回备用数据，防止游戏卡死
    res.status(500).json({ 
        speaker: "System", 
        text: `服务器连接波动，请重试。(Error: ${error.message})`, 
        mood: "neutral",
        jury_trust: 50,
        game_phase: "trial",
        log: "Retry Needed"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
