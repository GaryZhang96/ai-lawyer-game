const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

if (!process.env.GEMINI_API_KEY) {
  console.error("【严重错误】Render 环境变量中未找到 GEMINI_API_KEY！");
}

const SYSTEM_PROMPT = `
【系统强制指令】
你是一个法庭模拟游戏的后端引擎。
当前案件：【第42号街角枪击案】
真相：被告杰克无罪，声音是汽车爆胎声，证人玛丽没戴眼镜看错了。

你的回复必须严格遵守以下 JSON 格式（纯文本，不要 markdown）：
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
    console.log("收到请求，准备通过原生 fetch 发送 (Gemini Pro)...");
    const { history, message } = req.body;

    // --- 关键改动 1: 手动把系统指令塞进历史记录 ---
    // 因为 gemini-pro 不支持 systemInstruction 字段
    const safeContents = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }] // 把规则伪装成用户的第一句话
      },
      {
        role: "model",
        parts: [{ text: "收到，我将严格按照 JSON 格式扮演法官。" }] // 假装 AI 同意了
      },
      // 转换历史记录
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      })),
      // 当前消息
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    const apiBody = {
      contents: safeContents,
      generationConfig: {
        // gemini-pro 甚至可能不支持 responseMimeType: application/json
        // 所以我们先去掉它，靠 Prompt 约束
        temperature: 0.7
      }
    };

    const apiKey = process.env.GEMINI_API_KEY;
    // --- 关键改动 2: 使用最通用的 v1 版本和 gemini-pro 模型 ---
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log("Google API 原始响应:", JSON.stringify(data));

    // 解析内容
    let text = data.candidates[0].content.parts[0].text;
    
    // 清洗 Markdown (gemini-pro 很喜欢加 markdown)
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
    
    res.status(500).json({ 
        speaker: "System", 
        text: `通讯故障: ${error.message}`, 
        mood: "nervous", 
        jury_trust: 50, 
        game_phase: "trial" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
