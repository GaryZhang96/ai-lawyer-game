const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
// 注意：我们不再引入 google-generative-ai 库，直接用 Node.js 自带的 fetch

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

if (!process.env.GEMINI_API_KEY) {
  console.error("【严重错误】Render 环境变量中未找到 GEMINI_API_KEY！");
}

const SYSTEM_PROMPT = `
你是一个法庭模拟游戏的后端引擎。
当前案件：【第42号街角枪击案】
真相：被告杰克无罪，声音是汽车爆胎声，证人玛丽没戴眼镜看错了。

你的回复必须严格遵守以下 JSON 格式（不要使用 markdown）：
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
    console.log("收到请求，准备通过原生 fetch 发送...");
    const { history, message } = req.body;

    // 1. 手动构建请求体 (REST API 格式)
    const apiBody = {
      contents: [
        // 转换历史记录格式
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        })),
        // 添加当前用户消息
        {
          role: "user",
          parts: [{ text: message }]
        }
      ],
      // 系统指令 (Gemini 1.5 支持的原生字段)
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      generationConfig: {
        responseMimeType: "application/json", // 强制 JSON
        temperature: 0.7
      }
    };

    // 2. 直接向 Google API 发起请求
    const apiKey = process.env.GEMINI_API_KEY;
    // 使用 v1beta 接口，这是目前支持 1.5 Flash 最好的接口
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apiBody)
    });

    // 3. 处理响应
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log("Google API 原始响应:", JSON.stringify(data));

    // 4. 解析内容
    // Gemini REST API 的返回结构略有不同
    let text = data.candidates[0].content.parts[0].text;
    
    // 清洗可能存在的 Markdown
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonResponse = JSON.parse(text);
    res.json(jsonResponse);

  } catch (error) {
    console.error("【后端报错】:", error);
    
    // 提取更详细的错误信息
    let userMsg = "连接波动";
    if (error.message.includes("404")) userMsg = "模型路径错误(404)";
    if (error.message.includes("400")) userMsg = "请求格式错误(400)";
    if (error.message.includes("403")) userMsg = "API Key 无效(403)";

    res.status(500).json({ 
        speaker: "System", 
        text: `法庭通讯故障: ${userMsg} (请查看 Render 后台日志)`, 
        mood: "nervous", 
        jury_trust: 50, 
        game_phase: "trial" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
