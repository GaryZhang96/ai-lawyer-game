const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // 托管前端页面

// 检查 API KEY 是否存在
if (!process.env.GEMINI_API_KEY) {
  console.error("错误：未检测到 GEMINI_API_KEY 环境变量！");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 系统核心提示词 (策划案的核心)
const SYSTEM_PROMPT = `
你是一个法庭模拟游戏的后端引擎 (Game Master)。
当前案件：【第42号街角枪击案】
真相：被告杰克无罪，声音是汽车爆胎声，证人玛丽没戴眼镜看错了。

规则：
1. 你扮演【法官】、【检察官Viper】和【证人】。
2. 必须以 JSON 格式回复，不要使用 Markdown。
3. JSON 格式必须包含：
   {
     "speaker": "角色名 (Prosecutor/Judge/Witness)",
     "text": "对话内容(中文)",
     "mood": "neutral/angry/nervous/confident",
     "jury_trust": 50 (根据玩家逻辑加减, 0-100),
     "game_phase": "trial (进行中) 或 won (胜诉) 或 lost (败诉)",
     "log": "系统判词"
   }
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { history, message } = req.body;
    
    // 初始化模型
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", // 使用 Flash 版本速度更快，省钱
        generationConfig: { responseMimeType: "application/json" },
        systemInstruction: SYSTEM_PROMPT
    });

    // 构建对话历史
    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();
    
    // 解析 JSON
    const jsonResponse = JSON.parse(text);
    res.json(jsonResponse);

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
        speaker: "System", 
        text: "法庭书记员：记录系统出现故障，请重试。(API Error)", 
        mood: "neutral",
        jury_trust: 50,
        game_phase: "trial"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
