const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- 启动时自检：列出所有可用模型 ---
// 这样我们就能在 Render 日志里看到你到底拥有哪些模型权限
if (process.env.GEMINI_API_KEY) {
  const key = process.env.GEMINI_API_KEY;
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  
  fetch(listUrl)
    .then(res => res.json())
    .then(data => {
      console.log("---------------------------------------------------");
      console.log("【账号权限自检】你的 API Key 支持以下模型：");
      if (data.models) {
        data.models.forEach(m => console.log(` - ${m.name}`));
      } else {
        console.log("未找到模型列表，可能是 Key 权限不足或被锁区。", JSON.stringify(data));
      }
      console.log("---------------------------------------------------");
    })
    .catch(err => console.error("自检失败:", err));
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
  const { history, message } = req.body;
  console.log(`收到玩家消息: ${message}`);

  try {
    // 尝试使用 gemini-1.5-flash (这是目前最标准的型号)
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const apiBody = {
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] }, // 注入规则
        { role: "model", parts: [{ text: "OK. JSON mode engaged." }] },
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        })),
        { role: "user", parts: [{ text: message }] }
      ],
      generationConfig: { temperature: 0.7 }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody)
    });

    if (!response.ok) {
      throw new Error(`API Status ${response.status}`); // 抛出错误，进入下方的 catch 环节
    }

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    
    // 清洗数据
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }

    const jsonResponse = JSON.parse(text);
    res.json(jsonResponse);

  } catch (error) {
    console.error("【AI 连接失败，切换至备用脚本模式】:", error.message);

    // --- 备用发电机 (Fallback Logic) ---
    // 如果 AI 挂了，我们用简单的关键词匹配来模拟游戏，保证 UI 不报错
    
    let fallbackResponse = {
      speaker: "Judge (Offline)",
      text: "（AI连接波动，启动应急法官）本庭已记录你的发言。请继续出示证据。",
      mood: "neutral",
      jury_trust: 50,
      game_phase: "trial",
      log: "Offline Mode"
    };

    // 简单的关键词检测逻辑
    if (message.includes("眼镜") || message.includes("视力") || message.includes("看不清")) {
      fallbackResponse.speaker = "Witness";
      fallbackResponse.text = "呃……那天晚上确实很黑……我可能……也没戴眼镜……";
      fallbackResponse.mood = "nervous";
      fallbackResponse.jury_trust = 75;
      fallbackResponse.log = "击中要害 (Scripted)";
    } else if (message.includes("爆胎") || message.includes("汽车")) {
      fallbackResponse.speaker = "Prosecutor";
      fallbackResponse.text = "反对！这只是辩方律师的臆测！你有证据证明那是爆胎声吗？";
      fallbackResponse.mood = "angry";
      fallbackResponse.jury_trust = 60;
      fallbackResponse.log = "逻辑冲突 (Scripted)";
    } else if (message.includes("你好") || message.includes("开始")) {
        fallbackResponse.speaker = "Judge";
        fallbackResponse.text = "庭审正式开始。辩方律师，你可以开始盘问证人了。";
        fallbackResponse.mood = "neutral";
    } else {
        fallbackResponse.speaker = "Prosecutor";
        fallbackResponse.text = "辩方律师，你的发言毫无逻辑。请问你到底想问证人什么？";
        fallbackResponse.mood = "confident";
        fallbackResponse.jury_trust = 45;
    }

    // 稍微延迟一点返回，模拟思考
    setTimeout(() => {
        res.json(fallbackResponse);
    }, 1000);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
