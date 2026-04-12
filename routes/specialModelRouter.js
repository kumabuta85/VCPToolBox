// routes/specialModelRouter.js
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: 'config.env' });

const router = express.Router();
const API_URL = process.env.API_URL;
const API_KEY = process.env.API_Key;
// 兼容两种环境变量名：GOOGLE_API_KEY 或 GEMINI_API_KEY
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const DEBUG_MODE = (process.env.DebugMode || "False").toLowerCase() === "true";
const http = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 代理配置
const HTTP_PROXY = process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const HTTPS_PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:7897';
const httpsProxyAgent = new HttpsProxyAgent(HTTPS_PROXY);

// 🌟 核心网络优化：引入防御性长连接池 (Keep-Alive Pool)
const agentOptions = {
  keepAlive: true,
  keepAliveMsecs: 1000,
  freeSocketTimeout: 8000,
  scheduling: 'lifo',
  maxSockets: 10000
};
const keepAliveHttpAgent = new http.Agent(agentOptions);
const keepAliveHttpsAgent = new https.Agent(agentOptions);

const getFetchAgent = function(_parsedURL) {
  return _parsedURL.protocol === 'http:' ? keepAliveHttpAgent : keepAliveHttpsAgent;
};

const WHITELIST_IMAGE_MODELS = (process.env.WhitelistImageModel || '').split(',').map(m => m.trim()).filter(Boolean);
const WHITELIST_EMBEDDING_MODELS = (process.env.WhitelistEmbeddingModel || '').split(',').map(m => m.trim()).filter(Boolean);

if (WHITELIST_IMAGE_MODELS.length > 0) {
    console.log(`[SpecialRouter] 加载了 ${WHITELIST_IMAGE_MODELS.length} 个图像白名单模型：${WHITELIST_IMAGE_MODELS.join(', ')}`);
}
if (WHITELIST_EMBEDDING_MODELS.length > 0) {
    console.log(`[SpecialRouter] 加载了 ${WHITELIST_EMBEDDING_MODELS.length} 个向量化白名单模型：${WHITELIST_EMBEDDING_MODELS.join(', ')}`);
}


// 中间件，用于检查请求是否适用于此特殊路由
router.use((req, res, next) => {
    // 对于非 POST 请求或没有请求体的请求，立即跳过此路由。
    // 这可以防止对管理面板的 GET 请求等造成崩溃。
    if (req.method !== 'POST' || !req.body) {
        return next('router');
    }

    // 对于 POST 请求，检查 model 属性。
    const model = req.body.model;

    // 如果没有 model，跳过此路由。
    if (!model) {
        return next('router');
    }

    // 如果模型在白名单中，则在此路由中处理。
    if (WHITELIST_IMAGE_MODELS.includes(model) || WHITELIST_EMBEDDING_MODELS.includes(model)) {
        if (DEBUG_MODE) console.log(`[SpecialRouter] 模型 "${model}" 被特殊模型路由接管。`);
        return next(); // 继续到此路由中的下一个处理程序
    }

    // 如果模型不在任何白名单中，跳过此路由。
    return next('router');
});


// 处理图像模型
router.post('/v1/chat/completions', async (req, res) => {
    const model = req.body.model;

    if (!WHITELIST_IMAGE_MODELS.includes(model)) {
        // 理论上不会进入这里，因为上面的 use 中间件已经过滤了
        return res.status(400).json({ error: "模型不匹配图像模型白名单" });
    }

    if (DEBUG_MODE) console.log(`[SpecialRouter] 正在处理图像模型：${model}`);
    
    // 图像模型需要特殊的 generationConfig
    const modifiedBody = {
        ...req.body,
        generationConfig: {
            ...req.body.generationConfig,
            responseModalities: ["TEXT", "IMAGE"],
            responseMimeType: "text/plain",
        }
    };

    try {
        const { default: fetch } = await import('node-fetch');
        const apiResponse = await fetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] }),
                'Accept': req.headers['accept'] || 'application/json',
            },
            agent: getFetchAgent, // 注入防御性长连接池
            body: JSON.stringify(modifiedBody),
        });

        // 对于非流式 JSON API，更稳妥的方式是完整接收后用 res.json() 返回
        const responseJson = await apiResponse.json();
        // 同样，客户端可能只期望得到核心的 candidates 数组
        if (responseJson && responseJson.candidates) {
            res.status(apiResponse.status).json(responseJson.candidates);
        } else {
            res.status(apiResponse.status).json(responseJson);
        }

    } catch (error) {
        console.error(`[SpecialRouter] 转发图像模型 "${model}" 请求时出错:`, error.message, error.stack);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error during image model proxy', details: error.message });
        }
    }
});


// 处理向量化模型
router.post('/v1/embeddings', async (req, res) => {
    const model = req.body.model;

    if (!WHITELIST_EMBEDDING_MODELS.includes(model)) {
        return res.status(400).json({ error: "模型不匹配向量化模型白名单" });
    }

    if (DEBUG_MODE) console.log(`[SpecialRouter] 正在处理向量化模型：${model}`);

    // 检查是否为 Gemini embedding 模型，如果是则直接调用 Google API
    if (model && model.includes('gemini-embedding')) {
        if (!GOOGLE_API_KEY) {
            return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
        }

        try {
            const { default: fetch } = await import('node-fetch');
            
            // Google API 端点
            const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GOOGLE_API_KEY}`;
            
            // 转换 OpenAI 格式为 Google 格式
            const googleBody = {
                content: {
                    parts: Array.isArray(req.body.input) 
                        ? req.body.input.map(text => ({ text }))
                        : [{ text: req.body.input }]
                }
            };

            if (DEBUG_MODE) console.log(`[SpecialRouter] 使用 Google API 处理 ${model}`);

            const apiResponse = await fetch(googleApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] }),
                    'Accept': req.headers['accept'] || 'application/json',
                },
                agent: httpsProxyAgent, // 使用代理连接 Google API
                body: JSON.stringify(googleBody),
            });

            const googleResponse = await apiResponse.json();
            
            // 转换 Google 响应为 OpenAI 格式
            const openaiFormatResponse = {
                object: 'list',
                data: [{
                    object: 'embedding',
                    embedding: googleResponse.embedding?.values || [],
                    index: 0
                }],
                model: model,
                usage: {
                    prompt_tokens: googleResponse.usage_metadata?.token_count || 0,
                    total_tokens: googleResponse.usage_metadata?.token_count || 0
                }
            };

            res.status(200).json(openaiFormatResponse);

        } catch (error) {
            console.error(`[SpecialRouter] 调用 Google API 处理 ${model} 时出错:`, error.message, error.stack);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error during Google API call', details: error.message });
            }
        }
    } else {
        // 非 Gemini 模型，透传到 API_URL
        try {
            const { default: fetch } = await import('node-fetch');
            const apiResponse = await fetch(`${API_URL}/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] }),
                    'Accept': req.headers['accept'] || 'application/json',
                },
                agent: getFetchAgent, // 注入防御性长连接池
                body: JSON.stringify(req.body),
            });

            const responseJson = await apiResponse.json();
            // 直接将从上游 API 收到的完整 JSON 响应转发给客户端，实现真正的"透传"
            res.status(apiResponse.status).json(responseJson);

        } catch (error) {
            console.error(`[SpecialRouter] 转发向量化模型 "${model}" 请求时出错:`, error.message, error.stack);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error during embedding model proxy', details: error.message });
            }
        }
    }
});


module.exports = router;
