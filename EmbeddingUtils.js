// EmbeddingUtils.js
const { get_encoding } = require("@dqbd/tiktoken");
const encoding = get_encoding("cl100k_base");

// 配置
const embeddingMaxToken = parseInt(process.env.WhitelistEmbeddingModelMaxToken, 10) || 8000;
const safeMaxTokens = Math.floor(embeddingMaxToken * 0.85);
const MAX_BATCH_ITEMS = 100; // Gemini/OpenAI 限制
const DEFAULT_CONCURRENCY = parseInt(process.env.TAG_VECTORIZE_CONCURRENCY) || 5; // 🌟 读取并发配置

/**
 * 内部函数：发送单个批次
 */
async function _sendBatch(batchTexts, config, batchNumber) {
    const { default: fetch } = await import('node-fetch');
    const retryAttempts = 3;
    const baseDelay = 1000;
    // 兼容两种环境变量名：GOOGLE_API_KEY 或 GEMINI_API_KEY
    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

    // 调试日志：检查配置
    console.log(`[Embedding] Batch ${batchNumber}: model="${config.model}", GOOGLE_API_KEY=${googleApiKey ? 'present (' + googleApiKey.substring(0, 10) + '...)' : 'missing'}`);

    // 检查是否使用 Gemini API
    if (googleApiKey && config.model.includes('gemini-embedding')) {
        console.log(`[Embedding] Batch ${batchNumber}: Using direct Google API call`);
        // Gemini API 一次只能处理一个文本，所以需要逐个处理
        const embeddings = [];
        
        for (let i = 0; i < batchTexts.length; i++) {
            const text = batchTexts[i];
            
            for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                try {
                    // 为每个文本单独调用 Gemini API
                    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:embedContent?key=${googleApiKey}`;
                    const requestBody = {
                        content: {
                            parts: [{ text }]
                        }
                    };
                    const requestHeaders = { 'Content-Type': 'application/json' };
                    const fetchOptions = {
                        method: 'POST',
                        headers: requestHeaders,
                        body: JSON.stringify(requestBody)
                    };
                    
                    // 添加代理设置
                    if (proxy) {
                        fetchOptions.agent = new (require('https-proxy-agent'))(proxy);
                    }

                    const response = await fetch(requestUrl, fetchOptions);
                    const responseBodyText = await response.text();

                    if (!response.ok) {
                        if (response.status === 429) {
                            // 429 限流时，增加等待时间
                            const waitTime = 5000 * attempt;
                            console.warn(`[Embedding] Text ${i + 1} in Batch ${batchNumber} rate limited (429). Retrying in ${waitTime / 1000}s...`);
                            await new Promise(r => setTimeout(r, waitTime));
                            continue;
                        }
                        throw new Error(`API Error ${response.status}: ${responseBodyText.substring(0, 500)}`);
                    }

                    let data;
                    try {
                        data = JSON.parse(responseBodyText);
                    } catch (parseError) {
                        console.error(`[Embedding] JSON Parse Error for Text ${i + 1} in Batch ${batchNumber}:`);
                        console.error(`Response (first 500 chars): ${responseBodyText.substring(0, 500)}`);
                        throw new Error(`Failed to parse API response as JSON: ${parseError.message}`);
                    }

                    // 增强的响应结构验证和详细错误信息
                    if (!data) {
                        throw new Error(`API returned empty/null response`);
                    }

                    // 检查是否是错误响应
                    if (data.error) {
                        const errorMsg = data.error.message || JSON.stringify(data.error);
                        const errorCode = data.error.code || response.status;
                        console.error(`[Embedding] API Error for Text ${i + 1} in Batch ${batchNumber}:`);
                        console.error(`  Error Code: ${errorCode}`);
                        console.error(`  Error Message: ${errorMsg}`);
                        console.error(`  Hint: Check if embedding model "${config.model}" is available on your API server`);
                        throw new Error(`API Error ${errorCode}: ${errorMsg}`);
                    }

                    // Gemini API 响应格式
                    if (!data.embedding || !data.embedding.values) {
                        console.error(`[Embedding] Missing 'embedding.values' field in Gemini API response for Text ${i + 1} in Batch ${batchNumber}`);
                        console.error(`Response keys: ${Object.keys(data).join(', ')}`);
                        console.error(`Response preview: ${JSON.stringify(data).substring(0, 500)}`);
                        throw new Error(`Invalid Gemini API response structure: missing 'embedding.values' field`);
                    }
                    
                    if (!Array.isArray(data.embedding.values)) {
                        console.error(`[Embedding] 'embedding.values' is not an array for Text ${i + 1} in Batch ${batchNumber}`);
                        console.error(`type: ${typeof data.embedding.values}`);
                        console.error(`value: ${JSON.stringify(data.embedding.values).substring(0, 200)}`);
                        throw new Error(`Invalid Gemini API response structure: 'embedding.values' is not an array`);
                    }
                    
                    embeddings.push(data.embedding.values);
                    break; // 成功，跳出重试循环
                    
                } catch (e) {
                    console.warn(`[Embedding] Text ${i + 1} in Batch ${batchNumber}, Attempt ${attempt} failed: ${e.message}`);
                    if (attempt === retryAttempts) {
                        embeddings.push(null); // 失败，添加 null
                    } else {
                        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
                    }
                }
            }
        }
        
        return embeddings;
    } else {
        // 原有逻辑：批量处理
        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                const requestUrl = `${config.apiUrl}/v1/embeddings`;
                const requestBody = { model: config.model, input: batchTexts };
                const requestHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };

                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify(requestBody)
                });

                const responseBodyText = await response.text();

                if (!response.ok) {
                    if (response.status === 429) {
                        // 429 限流时，增加等待时间
                        const waitTime = 5000 * attempt;
                        console.warn(`[Embedding] Batch ${batchNumber} rate limited (429). Retrying in ${waitTime / 1000}s...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                    throw new Error(`API Error ${response.status}: ${responseBodyText.substring(0, 500)}`);
                }

                let data;
                try {
                    data = JSON.parse(responseBodyText);
                } catch (parseError) {
                    console.error(`[Embedding] JSON Parse Error for Batch ${batchNumber}:`);
                    console.error(`Response (first 500 chars): ${responseBodyText.substring(0, 500)}`);
                    throw new Error(`Failed to parse API response as JSON: ${parseError.message}`);
                }

                // 增强的响应结构验证和详细错误信息
                if (!data) {
                    throw new Error(`API returned empty/null response`);
                }

                // 检查是否是错误响应
                if (data.error) {
                    const errorMsg = data.error.message || JSON.stringify(data.error);
                    const errorCode = data.error.code || response.status;
                    console.error(`[Embedding] API Error for Batch ${batchNumber}:`);
                    console.error(`  Error Code: ${errorCode}`);
                    console.error(`  Error Message: ${errorMsg}`);
                    console.error(`  Hint: Check if embedding model "${config.model}" is available on your API server`);
                    throw new Error(`API Error ${errorCode}: ${errorMsg}`);
                }

                if (!data.data) {
                    console.error(`[Embedding] Missing 'data' field in response for Batch ${batchNumber}`);
                    console.error(`Response keys: ${Object.keys(data).join(', ')}`);
                    console.error(`Response preview: ${JSON.stringify(data).substring(0, 500)}`);
                    throw new Error(`Invalid API response structure: missing 'data' field`);
                }

                if (!Array.isArray(data.data)) {
                    console.error(`[Embedding] 'data' field is not an array for Batch ${batchNumber}`);
                    console.error(`data type: ${typeof data.data}`);
                    console.error(`data value: ${JSON.stringify(data.data).substring(0, 200)}`);
                    throw new Error(`Invalid API response structure: 'data' is not an array`);
                }

                if (data.data.length === 0) {
                    console.warn(`[Embedding] Warning: Batch ${batchNumber} returned empty embeddings array`);
                }

                // 简单的 Log，证明并发正在跑
                // console.log(`[Embedding] ✅ Batch ${batchNumber} completed (${batchTexts.length} items).`);

                return data.data.sort((a, b) => a.index - b.index).map(item => item.embedding);

            } catch (e) {
                console.warn(`[Embedding] Batch ${batchNumber}, Attempt ${attempt} failed: ${e.message}`);
                if (attempt === retryAttempts) throw e;
                await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
            }
        }
    }
}

/**
 * 🚀 终极版：并发批量获取 Embeddings
 * 🛡️ 核心保证：返回数组长度 === 输入 texts 长度，跳过/失败的位置填 null
 */
async function getEmbeddingsBatch(texts, config) {
    if (!texts || texts.length === 0) return [];

    // 1. ⚡️ 第一步：纯 CPU 操作，先把所有文本切分成 Batches
    //    同时记录每个文本在原始数组中的索引，以便后续对齐
    const batches = [];         // 每个元素: { texts: string[], originalIndices: number[] }
    let currentBatchTexts = [];
    let currentBatchIndices = [];
    let currentBatchTokens = 0;
    const oversizeIndices = new Set(); // 记录被跳过的超长文本位置

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const textTokens = encoding.encode(text).length;
        if (textTokens > safeMaxTokens) {
            console.warn(`[Embedding] ⚠️ Text at index ${i} exceeds token limit (${textTokens} > ${safeMaxTokens}), skipping.`);
            oversizeIndices.add(i);
            continue; // Skip oversize，但记录位置
        }

        const isTokenFull = currentBatchTexts.length > 0 && (currentBatchTokens + textTokens > safeMaxTokens);
        const isItemFull = currentBatchTexts.length >= MAX_BATCH_ITEMS;

        if (isTokenFull || isItemFull) {
            batches.push({ texts: currentBatchTexts, originalIndices: currentBatchIndices });
            currentBatchTexts = [text];
            currentBatchIndices = [i];
            currentBatchTokens = textTokens;
        } else {
            currentBatchTexts.push(text);
            currentBatchIndices.push(i);
            currentBatchTokens += textTokens;
        }
    }
    if (currentBatchTexts.length > 0) {
        batches.push({ texts: currentBatchTexts, originalIndices: currentBatchIndices });
    }

    if (oversizeIndices.size > 0) {
        console.warn(`[Embedding] ⚠️ ${oversizeIndices.size} texts skipped due to token limit.`);
    }
    console.log(`[Embedding] Prepared ${batches.length} batches from ${texts.length} texts. Executing with concurrency: ${DEFAULT_CONCURRENCY}...`);

    // 2. 🌊 第二步：并发执行器
    const batchResults = new Array(batches.length); // 预分配结果数组，保证顺序
    let cursor = 0; // 当前处理到的批次索引

    // 定义 Worker：只要队列里还有任务，就不断抢任务做
    const worker = async (workerId) => {
        while (true) {
            // 🔒 获取任务索引 (原子操作模拟)
            const batchIndex = cursor++;
            if (batchIndex >= batches.length) break; // 没任务了，下班

            const batch = batches[batchIndex];
            try {
                // 执行请求 (Batch ID 从 1 开始显示)
                batchResults[batchIndex] = {
                    vectors: await _sendBatch(batch.texts, config, batchIndex + 1),
                    originalIndices: batch.originalIndices
                };
            } catch (e) {
                // 🛡️ 不再让单个 batch 失败导致整个 Promise.all 崩溃
                // 而是记录失败，对应位置将填 null
                console.error(`[Embedding] ❌ Batch ${batchIndex + 1} failed permanently: ${e.message}`);
                batchResults[batchIndex] = {
                    vectors: null, // 标记为失败
                    originalIndices: batch.originalIndices,
                    error: e.message
                };
            }
        }
    };

    // 启动 N 个 Worker
    const workers = [];
    for (let i = 0; i < DEFAULT_CONCURRENCY; i++) {
        workers.push(worker(i));
    }

    // 等待所有 Worker 下班
    await Promise.all(workers);

    // 3. 📦 第三步：按原始索引回填结果，保证 output.length === input.length
    const finalResults = new Array(texts.length).fill(null); // 默认全部为 null
    let successCount = 0;
    let failCount = 0;

    for (const result of batchResults) {
        if (!result || !result.vectors) {
            // 整个 batch 失败，对应位置保持 null
            if (result) failCount += result.originalIndices.length;
            continue;
        }
        result.originalIndices.forEach((origIdx, vecIdx) => {
            finalResults[origIdx] = result.vectors[vecIdx] || null;
            if (result.vectors[vecIdx]) successCount++;
            else failCount++;
        });
    }

    failCount += oversizeIndices.size; // 超长文本也算失败

    if (failCount > 0) {
        console.warn(`[Embedding] ⚠️ Results: ${successCount} succeeded, ${failCount} failed/skipped out of ${texts.length} total.`);
    }

    return finalResults; // 🛡️ 长度严格等于 texts.length，失败位置为 null
}

/**
 * 余弦相似度计算（公共版本）
 * 供 toolExecutor / messageProcessor / 其他模块复用
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

module.exports = { getEmbeddingsBatch, cosineSimilarity };
