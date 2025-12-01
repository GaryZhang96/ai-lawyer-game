const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

if (!process.env.GEMINI_API_KEY) {
  console.error("【严重错误】Render 环境变量中未找到 GEMINI_API_KEY！");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
【系统指令】
你是一个法庭模拟游戏的后端引擎。
当前案件：【第42号街角枪击案】
真相：被告杰克无罪，声音是汽车爆胎声，证人玛丽没戴眼镜看错了。

你的回复必须严格遵守以下 JSON 格式（纯文本，无 Markdown）：
{
  "speaker": "Prosecutor",
  "text": "对话内容(中文)",
  "mood": "neutral",
  "jury_trust": 50,
  "game_phase": "trial",
  "log": "系统判定理由"
}
`;

app.post('/api/chat', async (req, res) => {
  try {
    console.log("收到请求...");
    const { history, message } = req.body;
    
    // 【关键修改】使用目前最稳定的模型名称
    // 如果这个还不行，Google 账号可能有限制
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const chatHistory = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }] 
      },
      {
        role: "model",
        parts: [{ text: "OK. JSON mode engaged." }]
      },
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    ];

    const chat = model.startChat({ history: chatHistory });

    console.log("发送给 Gemini 1.5 Flash...");
    const result = await chat.sendMessage(message);
    const response = await result.response;
    let text = response.text();
    
    console.log("AI 回复:", text);

    // 清洗 Markdown
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }

    const jsonResponse = JSON.parse(text);
    res.json(jsonResponse);

  } catch (error) {
    console.error("【后端报错】:", error);
    
    // 如果是 404，说明模型名称不对或地区受限
    let errorMsg = "系统连接错误";
    if (error.message.includes("404")) errorMsg = "模型未找到(404)，请检查 API Key 权限或 Render 地区";
    
    res.status(500).json({ 
        speaker: "System", 
        text: `法庭休庭维护中... (${errorMsg})`, 
        mood: "nervous", 
        jury_trust: 50, 
        game_phase: "trial" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
