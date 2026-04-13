#!/usr/bin/env node

/**
 * Grok API 图生图功能测试脚本
 * 用于验证 grok-4-image 模型是否支持 image-to-image 功能
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 加载 config.env 文件
const envPath = path.join(__dirname, '../../config.env');
console.log(`尝试加载配置文件：${envPath}`);

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
    console.log('✅ 配置文件加载成功\n');
} catch (error) {
    console.log('❌ 无法读取配置文件:', error.message);
}

// 从 config.env 读取配置
const API_KEY = process.env.API_Key;
const API_URL = process.env.API_URL;

const GROK_API_CONFIG = {
    MODEL_ID: "grok-4-image",
    DEFAULT_PARAMS: {
        size: "1024x1024",
        n: 1
    }
};

// 测试图片（base64 编码的小图片）
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TEST_IMAGE_URL = "https://via.placeholder.com/512x512.png?text=Test+Image";

async function testTextToImage() {
    console.log("\n=== 测试 1: 文生图 (Text-to-Image) ===\n");
    
    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: "A beautiful sunset over the ocean",
        size: GROK_API_CONFIG.DEFAULT_PARAMS.size,
        n: 1
    };
    
    console.log("请求参数:", JSON.stringify(payload, null, 2));
    
    try {
        const response = await axios.post(
            `${API_URL}/v1/images/generations`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );
        
        console.log("✅ 文生图成功！");
        console.log("响应:", JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log("❌ 文生图失败！");
        console.log("错误:", error.response?.data || error.message);
        return false;
    }
}

async function testImageToImageWithBase64() {
    console.log("\n=== 测试 2: 图生图 (Image-to-Image) - Base64 格式 ===\n");
    
    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: "Make this image more colorful and vibrant",
        image: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
        size: GROK_API_CONFIG.DEFAULT_PARAMS.size,
        n: 1
    };
    
    console.log("请求参数:", JSON.stringify(payload, null, 2));
    
    try {
        const response = await axios.post(
            `${API_URL}/v1/images/generations`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );
        
        console.log("✅ 图生图（Base64）成功！");
        console.log("响应:", JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log("❌ 图生图（Base64）失败！");
        console.log("错误:", error.response?.data || error.message);
        return false;
    }
}

async function testImageToImageWithUrl() {
    console.log("\n=== 测试 3: 图生图 (Image-to-Image) - URL 格式 ===\n");
    
    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: "Transform this into a cyberpunk style city",
        image: TEST_IMAGE_URL,
        size: GROK_API_CONFIG.DEFAULT_PARAMS.size,
        n: 1
    };
    
    console.log("请求参数:", JSON.stringify(payload, null, 2));
    
    try {
        const response = await axios.post(
            `${API_URL}/v1/images/generations`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );
        
        console.log("✅ 图生图（URL）成功！");
        console.log("响应:", JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log("❌ 图生图（URL）失败！");
        console.log("错误:", error.response?.data || error.message);
        return false;
    }
}

async function testImageToImageWithImageUrlsField() {
    console.log("\n=== 测试 4: 图生图 - image_urls 字段格式 ===\n");
    
    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: "Edit this image to have a sunset background",
        image_urls: [TEST_IMAGE_URL],
        size: GROK_API_CONFIG.DEFAULT_PARAMS.size,
        n: 1
    };
    
    console.log("请求参数:", JSON.stringify(payload, null, 2));
    
    try {
        const response = await axios.post(
            `${API_URL}/v1/images/generations`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );
        
        console.log("✅ 图生图（image_urls）成功！");
        console.log("响应:", JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log("❌ 图生图（image_urls）失败！");
        console.log("错误:", error.response?.data || error.message);
        return false;
    }
}

async function testImageToImageWithReferenceImage() {
    console.log("\n=== 测试 5: 图生图 - reference_image 格式 ===\n");
    
    const payload = {
        model: GROK_API_CONFIG.MODEL_ID,
        prompt: "Create a similar image with different colors",
        reference_image: TEST_IMAGE_URL,
        size: GROK_API_CONFIG.DEFAULT_PARAMS.size,
        n: 1
    };
    
    console.log("请求参数:", JSON.stringify(payload, null, 2));
    
    try {
        const response = await axios.post(
            `${API_URL}/v1/images/generations`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );
        
        console.log("✅ 图生图（reference_image）成功！");
        console.log("响应:", JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log("❌ 图生图（reference_image）失败！");
        console.log("错误:", error.response?.data || error.message);
        return false;
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("Grok API 图生图功能测试");
    console.log("=".repeat(60));
    console.log(`API URL: ${API_URL}`);
    console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 20) + '...' : '未设置'}`);
    console.log("=".repeat(60));
    
    if (!API_KEY || !API_URL) {
        console.log("\n❌ 错误：请先配置 API_Key 和 API_URL 环境变量！");
        console.log("请在 F:\\VCP\\VCPToolBox-main\\config.env 中配置：");
        console.log("  API_Key=your_api_key");
        console.log("  API_URL=your_api_url");
        process.exit(1);
    }
    
    const results = {
        textToImage: await testTextToImage(),
        imageToImageBase64: await testImageToImageWithBase64(),
        imageToImageUrl: await testImageToImageWithUrl(),
        imageToImageUrlsField: await testImageToImageWithImageUrlsField(),
        imageToImageReference: await testImageToImageWithReferenceImage()
    };
    
    console.log("\n" + "=".repeat(60));
    console.log("测试结果汇总");
    console.log("=".repeat(60));
    console.log(`文生图 (Text-to-Image): ${results.textToImage ? '✅ 支持' : '❌ 不支持/失败'}`);
    console.log(`图生图 (Base64): ${results.imageToImageBase64 ? '✅ 支持' : '❌ 不支持/失败'}`);
    console.log(`图生图 (URL): ${results.imageToImageUrl ? '✅ 支持' : '❌ 不支持/失败'}`);
    console.log(`图生图 (image_urls): ${results.imageToImageUrlsField ? '✅ 支持' : '❌ 不支持/失败'}`);
    console.log(`图生图 (reference_image): ${results.imageToImageReference ? '✅ 支持' : '❌ 不支持/失败'}`);
    console.log("=".repeat(60));
    
    // 总结
    const supportedFeatures = Object.values(results).filter(r => r).length;
    console.log(`\n总结：Grok API 支持 ${supportedFeatures}/${Object.keys(results).length} 个测试项`);
    
    if (results.imageToImageBase64 || results.imageToImageUrl || results.imageToImageUrlsField || results.imageToImageReference) {
        console.log("✅ Grok API 支持图生图功能！");
    } else {
        console.log("❌ Grok API 不支持图生图功能，或需要其他参数格式。");
    }
    console.log("=".repeat(60));
}

main().catch(console.error);
