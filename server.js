const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 检查 OpenRouter Key
if (!process.env.OPENROUTER_API_KEY) {
  console.error("【严重错误】Render 环境变量中未找到 OPENROUTER_API_KEY！");
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
    const { history, message } = req.body;
    console.log(`收到消息: ${message}`);

    // --- 构造请求 ---
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
        // 【关键修改】这里指定使用 Claude 模型
        // 目前地表最强逻辑模型：Claude 3.5 Sonnet
        // 如果未来 4.5 出了，只需改成 "anthropic/claude-4.5-sonnet"
        model: "anthropic/claude-4.5-sonnet", 
        
        messages: messages,
        temperature: 0.7, // 0.7 比较适合有创意的辩论
        // Claude 对 json_object 模式的支持稍有不同，我们通过 Prompt 强约束即可
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      // 如果余额不足，这里会报错 "Insufficient credits"
      throw new Error(`OpenRouter Error: ${errText}`);
    }

    const data = await response.json();
    console.log("OpenRouter/Claude 响应:", JSON.stringify(data));

    // 解析 Claude 的回复
    let text = data.choices[0].message.content;

    // 清洗数据 (Claude 有时会很礼貌地加前缀，必须删掉)
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
    
    // 如果是余额不足，提示玩家
    let errorMsg = error.message;
    if (error.message.includes("Insufficient credits")) {
        errorMsg = "OpenRouter 余额不足，请充值 (No Credits)";
    }

    res.status(500).json({ 
        speaker: "System", 
        text: `法庭联机中断: ${errorMsg}`, 
        mood: "nervous", 
        jury_trust: 50, 
        game_phase: "trial" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
