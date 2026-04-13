#!/usr/bin/env node

/**
 * GrokGen 图生图功能端到端测试脚本
 * 
 * 测试场景：
 * 1. 文生图（基础功能验证）
 * 2. 图生图 - Base64 格式
 * 3. 图生图 - 多模态消息格式
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 加载 config.env 文件
const envPath = path.join(__dirname, '../../config.env');
console.log(`尝试加载配置文件：${envPath}\n`);

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
    process.exit(1);
}

// 配置
const API_KEY = process.env.API_Key;
const API_URL = process.env.API_URL;
const VCPToolBox_URL = process.env.VCPToolBox_URL || 'http://127.0.0.1:3000';
const TEST_IMAGE_URL = 'https://picsum.photos/seed/test123/512/512.jpg';

// 测试图片 Base64（1x1 红色像素）
const TEST_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

console.log('=== GrokGen 图生图功能测试 ===\n');
console.log('配置信息:');
console.log(`- API_URL: ${API_URL}`);
console.log(`- VCPToolBox_URL: ${VCPToolBox_URL}`);
console.log(`- API_KEY: ${API_KEY ? '已设置' : '未设置'}\n`);

// 测试 1: 文生图（基础功能验证）
async function testTextToImage() {
    console.log('\n=== 测试 1: 文生图 (Text-to-Image) ===\n');
    
    const payload = {
        model: "grok-4-image",
        prompt: "一只可爱的卡通猫咪，坐在彩虹上，蓝天白云",
        size: "1024x1024",
        n: 1
    };
    
    console.log('请求参数:', JSON.stringify(payload, null, 2));
    
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
        
        console.log('✅ 文生图成功！');
        console.log('响应:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log('❌ 文生图失败！');
        console.log('错误:', error.response?.data || error.message);
        return false;
    }
}

// 测试 2: 图生图 - Base64 格式
async function testImageToImageWithBase64() {
    console.log('\n=== 测试 2: 图生图 (Image-to-Image) - Base64 格式 ===\n');
    
    const payload = {
        model: "grok-4-image",
        prompt: "将这张图片变成油画风格，保留原图的构图",
        image: TEST_IMAGE_BASE64,
        size: "1024x1024",
        n: 1
    };
    
    console.log('请求参数:', JSON.stringify(payload, null, 2));
    
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
        
        console.log('✅ 图生图（Base64）成功！');
        console.log('响应:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log('❌ 图生图（Base64）失败！');
        console.log('错误:', error.response?.data || error.message);
        return false;
    }
}

// 测试 3: 图生图 - URL 格式
async function testImageToImageWithUrl() {
    console.log('\n=== 测试 3: 图生图 (Image-to-Image) - URL 格式 ===\n');
    
    const payload = {
        model: "grok-4-image",
        prompt: "将这张图片变成赛博朋克风格",
        image: TEST_IMAGE_URL,
        size: "1024x1024",
        n: 1
    };
    
    console.log('请求参数:', JSON.stringify(payload, null, 2));
    
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
        
        console.log('✅ 图生图（URL）成功！');
        console.log('响应:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log('❌ 图生图（URL）失败！');
        console.log('错误:', error.response?.data || error.message);
        return false;
    }
}

// 测试 4: 多模态消息格式（模拟前端发送）
async function testMultimodalMessageFormat() {
    console.log('\n=== 测试 4: 多模态消息格式 (Multimodal Message) ===\n');
    
    // 模拟前端发送的多模态消息
    const multimodalMessage = {
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "将这张图片变成油画风格"
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: TEST_IMAGE_BASE64
                        }
                    }
                ]
            }
        ]
    };
    
    console.log('多模态消息:', JSON.stringify(multimodalMessage, null, 2));
    
    try {
        // 直接调用 GrokGen 插件
        const pluginPath = path.join(__dirname, 'GrokGen.js');
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        const inputData = JSON.stringify(multimodalMessage);
        console.log('\n传递给插件的数据:', inputData);
        
        const { stdout, stderr } = await execPromise(`node "${pluginPath}"`, {
            input: inputData,
            env: {
                ...process.env,
                API_Key: API_KEY,
                API_URL: API_URL,
                PROJECT_BASE_PATH: path.join(__dirname, '../../..'),
                PORT: '3000',
                Image_Key: 'test_key'
            }
        });
        
        console.log('✅ 多模态消息处理成功！');
        console.log('stdout:', stdout);
        if (stderr) console.log('stderr:', stderr);
        return true;
    } catch (error) {
        console.log('❌ 多模态消息处理失败！');
        console.log('错误:', error.stderr || error.stdout || error.message);
        return false;
    }
}

// 主测试流程
async function runTests() {
    const results = {
        textToImage: false,
        imageToImageBase64: false,
        imageToImageUrl: false,
        multimodalMessage: false
    };
    
    // 测试 1: 文生图
    results.textToImage = await testTextToImage();
    
    // 测试 2: 图生图 - Base64
    results.imageToImageBase64 = await testImageToImageWithBase64();
    
    // 测试 3: 图生图 - URL
    results.imageToImageUrl = await testImageToImageWithUrl();
    
    // 测试 4: 多模态消息
    results.multimodalMessage = await testMultimodalMessageFormat();
    
    // 总结
    console.log('\n\n=== 测试结果总结 ===\n');
    console.log(`1. 文生图：${results.textToImage ? '✅ 通过' : '❌ 失败'}`);
    console.log(`2. 图生图 (Base64): ${results.imageToImageBase64 ? '✅ 通过' : '❌ 失败'}`);
    console.log(`3. 图生图 (URL): ${results.imageToImageUrl ? '✅ 通过' : '❌ 失败'}`);
    console.log(`4. 多模态消息：${results.multimodalMessage ? '✅ 通过' : '❌ 失败'}`);
    
    const allPassed = Object.values(results).every(r => r === true);
    console.log(`\n总体结果：${allPassed ? '✅ 所有测试通过！' : '⚠️ 部分测试失败'}`);
    
    process.exit(allPassed ? 0 : 1);
}

// 运行测试
runTests().catch(error => {
    console.error('\n=== 测试执行出错 ===');
    console.error(error);
    process.exit(1);
});
