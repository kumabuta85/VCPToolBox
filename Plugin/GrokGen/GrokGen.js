#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// --- Configuration ---
// 使用主程序 config.env 中的全局配置
const API_KEY = process.env.API_Key;
const API_URL = process.env.API_URL;
const PROJECT_BASE_PATH = process.env.PROJECT_BASE_PATH;
const SERVER_PORT = process.env.PORT;
const IMAGESERVER_IMAGE_KEY = process.env.Image_Key;
const VAR_HTTP_URL = process.env.VarHttpUrl || `http://127.0.0.1`;

const GROK_API_CONFIG = {
    MODEL_ID: "grok-4-image",
    DEFAULT_PARAMS: {
        size: "1024x1024",
        n: 1
    }
};

// Helper to validate input arguments
function isValidGrokGenArgs(args) {
    if (!args || typeof args !== 'object') return false;
    
    // 支持 arg 和 prompt 两种参数名（兼容 Agent 调用）
    const prompt = args.prompt || args.arg;
    if (typeof prompt !== 'string' || !prompt.trim()) return false;
    
    const validResolutions = ["1024x1024", "1536x1536", "1024x1536", "1536x1024"];
    if (args.resolution !== undefined && (typeof args.resolution !== 'string' || !validResolutions.includes(args.resolution))) {
        return false;
    }
    
    if (args.seed !== undefined && (typeof args.seed !== 'number' || !Number.isInteger(args.seed) || args.seed < 0)) {
        return false;
    }
    
    return true;
}

// Helper to validate image-to-image arguments
function isValidImageToImageArgs(args) {
    if (!isValidGrokGenArgs(args)) return false;
    if (!args.image_url && !args.images) return false;
    return true;
}

async function generateImage(args) {
    // Check for essential environment variables
    if (!API_KEY) {
        throw new Error("GrokGen Plugin Error: API_Key environment variable is required and not set in config.env");
    }
    if (!API_URL) {
        throw new Error("GrokGen Plugin Error: API_URL environment variable is required and not set in config.env");
    }
    if (!PROJECT_BASE_PATH) {
        throw new Error("GrokGen Plugin Error: PROJECT_BASE_PATH environment variable is required for saving images.");
    }
    if (!SERVER_PORT) {
        throw new Error("GrokGen Plugin Error: PORT environment variable is required for constructing image URL.");
    }
    if (!IMAGESERVER_IMAGE_KEY) {
        throw new Error("GrokGen Plugin Error: Image_Key environment variable is required for constructing image URL.");
    }

    if (!isValidGrokGenArgs(args)) {
        throw new Error(`GrokGen Plugin Error: Invalid arguments received: ${JSON.stringify(args)}. Required: prompt or arg (string). Optional: resolution (enum), seed (integer).`);
    }

    // 支持 arg 和 prompt 两种参数名（兼容 Agent 调用）
    const prompt = args.prompt || args.arg;
    const resolution = args.resolution || GROK_API_CONFIG.DEFAULT_PARAMS.size;

    // Create axios instance for Grok API
    const grokAxiosInstance = axios.create({
        baseURL: API_URL,
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: 120000 // 120 second timeout for API call
    });

    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: prompt,
        size: resolution,
        n: GROK_API_CONFIG.DEFAULT_PARAMS.n
    };
    
    if (args.seed !== undefined) {
        payload.seed = args.seed;
    }

    console.error(`[GrokGen Plugin] Sending request to Grok API: ${JSON.stringify(payload)}`);

    // Try different API endpoints based on common patterns
    const endpointsToTry = [
        '/v1/images/generations',  // OpenAI/聚合 API 标准格式
        '/images/generations',      // 简化格式
        '/api/images/generations',  // API 网关格式
        '/v1/grok-4-image'          // 特定模型格式
    ];
    
    let response = null;
    let lastError = null;
    
    for (const endpoint of endpointsToTry) {
        try {
            console.error(`[GrokGen Plugin] Trying endpoint: ${endpoint}`);
            response = await grokAxiosInstance.post(endpoint, payload);
            console.error(`[GrokGen Plugin] Success with endpoint: ${endpoint}`);
            break;
        } catch (err) {
            lastError = err;
            console.error(`[GrokGen Plugin] Failed endpoint ${endpoint}: ${err.response?.status || err.message}`);
            continue;
        }
    }
    
    if (!response) {
        throw new Error(`GrokGen Plugin Error: All API endpoints failed. Last error: ${lastError?.message}`);
    }

    console.error(`[GrokGen Plugin] Received response from Grok API`);
    console.error(`[GrokGen Plugin] Response type: ${Array.isArray(response.data) ? 'Array' : typeof response.data}`);
    
    // Extract image URL from response
    // Grok API response format may vary, try multiple patterns
    let grokImageUrl = null;
    
    // Pattern 1: Array response (e.g., [{ url: "..." }])
    if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].url) {
        grokImageUrl = response.data[0].url;
        console.error(`[GrokGen Plugin] Found URL in array response: ${grokImageUrl}`);
    }
    // Pattern 2: { data: [{ url: "..." }] }
    else if (response.data?.data?.[0]?.url) {
        grokImageUrl = response.data.data[0].url;
        console.error(`[GrokGen Plugin] Found URL in data array: ${grokImageUrl}`);
    }
    // Pattern 3: { images: [{ url: "..." }] }
    else if (response.data?.images?.[0]?.url) {
        grokImageUrl = response.data.images[0].url;
        console.error(`[GrokGen Plugin] Found URL in images array: ${grokImageUrl}`);
    }
    // Pattern 4: { output: { url: "..." } }
    else if (response.data?.output?.url) {
        grokImageUrl = response.data.output.url;
        console.error(`[GrokGen Plugin] Found URL in output: ${grokImageUrl}`);
    }
    // Pattern 5: Direct URL in response
    else if (typeof response.data === 'string' && response.data.startsWith('http')) {
        grokImageUrl = response.data;
        console.error(`[GrokGen Plugin] Found direct URL: ${grokImageUrl}`);
    }
    
    if (!grokImageUrl) {
        console.error(`[GrokGen Plugin] Full response (first 500 chars): ${JSON.stringify(response.data).substring(0, 500)}`);
        throw new Error(`GrokGen Plugin Error: Failed to extract image URL from Grok API response.`);
    }

    console.error(`[GrokGen Plugin] Image URL from API: ${grokImageUrl}`);

    // Download the image from Grok URL
    const imageResponse = await axios({
        method: 'get',
        url: grokImageUrl,
        responseType: 'arraybuffer',
        timeout: 120000 // 120 second timeout for image download
    });

    // Determine image extension
    let imageExtension = 'png'; // Default extension
    const contentType = imageResponse.headers['content-type'];
    if (contentType && contentType.startsWith('image/')) {
        imageExtension = contentType.split('/')[1];
    } else {
        // Fallback to extract from URL if content-type is not helpful
        const urlExtMatch = grokImageUrl.match(/\.([^.?]+)(?:[?#]|$)/);
        if (urlExtMatch && urlExtMatch[1]) {
            imageExtension = urlExtMatch[1];
        }
    }
    
    const generatedFileName = `${uuidv4()}.${imageExtension}`;
    const grokGenImageDir = path.join(PROJECT_BASE_PATH, 'image', 'grokgen');
    const localImageServerPath = path.join(grokGenImageDir, generatedFileName);

    // Create directory and save image
    await fs.mkdir(grokGenImageDir, { recursive: true });
    await fs.writeFile(localImageServerPath, imageResponse.data);
    console.error(`[GrokGen Plugin] Image saved to: ${localImageServerPath}`);

    // Construct the URL accessible via our own ImageServer plugin
    // Ensure path separators are URL-friendly (/)
    const relativeServerPathForUrl = path.join('grokgen', generatedFileName).replace(/\\/g, '/');
    const accessibleImageUrl = `${VAR_HTTP_URL}:${SERVER_PORT}/pw=${IMAGESERVER_IMAGE_KEY}/images/${relativeServerPathForUrl}`;

    const altText = args.prompt ? args.prompt.substring(0, 80) + (args.prompt.length > 80 ? "..." : "") : (generatedFileName || "生成的图片");
    const imageHtml = `<img src="${accessibleImageUrl}" alt="${altText}" width="300">`;
    
    // 将图片转换为 Base64 格式，以便前端直接展示
    const imageBuffer = imageResponse.data;
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const imageMimeType = `image/${imageExtension}`;
    
    // 返回包含 Base64 图片的结构化数据，参考 FluxGen 的格式
    const result = {
        content: [
            {
                type: 'text',
                text: `图片已成功生成！\n- 提示词：${prompt}\n- 分辨率：${resolution}\n- 可访问 URL: ${accessibleImageUrl}`
            },
            {
                type: 'image_url',
                image_url: {
                    url: `data:${imageMimeType};base64,${base64Image}`
                }
            }
        ],
        details: {
            serverPath: `image/grokgen/${generatedFileName}`,
            fileName: generatedFileName,
            prompt: prompt,
            resolution: resolution,
            imageUrl: accessibleImageUrl
        }
    };
    
    return result;
}

// 图生图函数
async function generateImageFromImage(args) {
    // 验证环境变量
    if (!API_KEY) {
        throw new Error("GrokGen Plugin Error: API_Key environment variable is required");
    }
    if (!API_URL) {
        throw new Error("GrokGen Plugin Error: API_URL environment variable is required");
    }
    if (!PROJECT_BASE_PATH) {
        throw new Error("GrokGen Plugin Error: PROJECT_BASE_PATH environment variable is required");
    }
    if (!SERVER_PORT) {
        throw new Error("GrokGen Plugin Error: PORT environment variable is required");
    }
    if (!IMAGESERVER_IMAGE_KEY) {
        throw new Error("GrokGen Plugin Error: Image_Key environment variable is required");
    }

    if (!isValidImageToImageArgs(args)) {
        throw new Error(`GrokGen Plugin Error: Invalid arguments. Required: prompt or arg (string), image_url (string). Optional: resolution, seed.`);
    }

    // 支持 arg 和 prompt 两种参数名（兼容 Agent 调用）
    const prompt = args.prompt || args.arg;
    const resolution = args.resolution || GROK_API_CONFIG.DEFAULT_PARAMS.size;
    
    // 提取图片 URL（支持多种格式）
    let imageUrl = args.image_url;
    if (!imageUrl && args.images && Array.isArray(args.images)) {
        imageUrl = args.images[0];  // 取第一张
    }
    
    if (!imageUrl) {
        throw new Error("GrokGen Plugin Error: No image URL provided");
    }

    // 创建 API 请求
    const grokAxiosInstance = axios.create({
        baseURL: API_URL,
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: 120000
    });

    // 构建请求体（支持多种图片参数格式）
    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: prompt,
        size: resolution,
        n: GROK_API_CONFIG.DEFAULT_PARAMS.n,
        image: imageUrl  // Grok API 支持 image 参数
    };
    
    if (args.seed !== undefined) {
        payload.seed = args.seed;
    }

    console.error(`[GrokGen Plugin] Sending image-to-image request: ${JSON.stringify(payload)}`);

    // 发送请求
    const response = await grokAxiosInstance.post(
        '/v1/images/generations',
        payload
    );

    // 处理响应（与文生图相同逻辑）
    console.error(`[GrokGen Plugin] Received response from Grok API`);
    console.error(`[GrokGen Plugin] Response type: ${Array.isArray(response.data) ? 'Array' : typeof response.data}`);
    
    let grokImageUrl = null;
    
    // Pattern 1: Array response
    if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].url) {
        grokImageUrl = response.data[0].url;
        console.error(`[GrokGen Plugin] Found URL in array response: ${grokImageUrl}`);
    }
    // Pattern 2: { data: [{ url: "..." }] }
    else if (response.data?.data?.[0]?.url) {
        grokImageUrl = response.data.data[0].url;
        console.error(`[GrokGen Plugin] Found URL in data array: ${grokImageUrl}`);
    }
    // Pattern 3: { images: [{ url: "..." }] }
    else if (response.data?.images?.[0]?.url) {
        grokImageUrl = response.data.images[0].url;
        console.error(`[GrokGen Plugin] Found URL in images array: ${grokImageUrl}`);
    }
    // Pattern 4: { output: { url: "..." } }
    else if (response.data?.output?.url) {
        grokImageUrl = response.data.output.url;
        console.error(`[GrokGen Plugin] Found URL in output: ${grokImageUrl}`);
    }
    // Pattern 5: Direct URL in response
    else if (typeof response.data === 'string' && response.data.startsWith('http')) {
        grokImageUrl = response.data;
        console.error(`[GrokGen Plugin] Found direct URL: ${grokImageUrl}`);
    }
    
    if (!grokImageUrl) {
        console.error(`[GrokGen Plugin] Full response (first 500 chars): ${JSON.stringify(response.data).substring(0, 500)}`);
        throw new Error(`GrokGen Plugin Error: Failed to extract image URL from Grok API response.`);
    }

    console.error(`[GrokGen Plugin] Image URL from API: ${grokImageUrl}`);

    // 下载并保存图片（与文生图相同逻辑）
    const imageResponse = await axios({
        method: 'get',
        url: grokImageUrl,
        responseType: 'arraybuffer',
        timeout: 120000
    });

    // Determine image extension
    let imageExtension = 'png';
    const contentType = imageResponse.headers['content-type'];
    if (contentType && contentType.startsWith('image/')) {
        imageExtension = contentType.split('/')[1];
    } else {
        const urlExtMatch = grokImageUrl.match(/\.([^.?]+)(?:[?#]|$)/);
        if (urlExtMatch && urlExtMatch[1]) {
            imageExtension = urlExtMatch[1];
        }
    }
    
    const generatedFileName = `grok_img2img_${Date.now()}_${uuidv4()}.${imageExtension}`;
    const grokGenImageDir = path.join(PROJECT_BASE_PATH, 'image', 'grokgen');
    const localImageServerPath = path.join(grokGenImageDir, generatedFileName);

    await fs.mkdir(grokGenImageDir, { recursive: true });
    await fs.writeFile(localImageServerPath, imageResponse.data);
    console.error(`[GrokGen Plugin] Image saved to: ${localImageServerPath}`);

    // Construct the URL accessible via our own ImageServer plugin
    const relativeServerPathForUrl = path.join('grokgen', generatedFileName).replace(/\\/g, '/');
    const accessibleImageUrl = `${VAR_HTTP_URL}:${SERVER_PORT}/pw=${IMAGESERVER_IMAGE_KEY}/images/${relativeServerPathForUrl}`;

    const altText = prompt ? prompt.substring(0, 80) + (prompt.length > 80 ? "..." : "") : (generatedFileName || "生成的图片");
    const imageHtml = `<img src="${accessibleImageUrl}" alt="${altText}" width="300">`;
    
    // 将图片转换为 Base64 格式，以便前端直接展示
    const imageBuffer = imageResponse.data;
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const imageMimeType = `image/${imageExtension}`;
    
    // 返回包含 Base64 图片的结构化数据，参考 FluxGen 的格式
    const result = {
        content: [
            {
                type: 'text',
                text: `图片已成功生成！\n- 提示词：${prompt}\n- 分辨率：${resolution}\n- 可访问 URL: ${accessibleImageUrl}`
            },
            {
                type: 'image_url',
                image_url: {
                    url: `data:${imageMimeType};base64,${base64Image}`
                }
            }
        ],
        details: {
            serverPath: `image/grokgen/${generatedFileName}`,
            fileName: generatedFileName,
            prompt: prompt,
            resolution: resolution,
            imageUrl: accessibleImageUrl
        }
    };
    
    return result;
}

// --- Main Entry Point ---
async function main() {
    let inputData = '';
    
    process.stdin.on('data', chunk => {
        inputData += chunk;
    });
    
    process.stdin.on('end', async () => {
        try {
            if (!inputData) {
                throw new Error("未从 stdin 接收到任何数据。");
            }
            
            const request = JSON.parse(inputData);
            let result;
            
            // 🟢 判断是文生图还是图生图
            if (request.image_url || (request.images && Array.isArray(request.images))) {
                // 图生图
                console.error('[GrokGen Plugin] Detected image-to-image request');
                result = await generateImageFromImage(request);
            } else {
                // 文生图
                console.error('[GrokGen Plugin] Detected text-to-image request');
                result = await generateImage(request);
            }
            
            // Send response to stdout
            console.log(JSON.stringify({ status: "success", result: result }));
            process.exit(0);
        } catch (e) {
            console.error(`[GrokGen Plugin] Error: ${e.message}`);
            console.log(JSON.stringify({
                status: "error",
                error: e.message.startsWith("GrokGen Plugin Error:") ? e.message : `GrokGen Plugin Error: ${e.message}`
            }));
            process.exit(1);
        }
    });
}

main();
