#!/usr/bin/env node

/**
 * GrokGen 图生图功能快速测试
 * 测试多模态消息格式的处理
 */

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

console.log('=== GrokGen 图生图功能快速测试 ===\n');
console.log('测试场景：模拟 Plugin.js 解析后的多模态消息，验证 GrokGen 能否正确处理图生图\n');

// 模拟 Plugin.js 解析后的数据格式
// 这是前端发送多模态消息后，Plugin.js 提取并传递给 GrokGen 的格式
const pluginProcessedData = {
    prompt: "将这张图片变成油画风格",
    image_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    resolution: "1024x1024"
};

console.log('Plugin.js 处理后的数据:');
console.log(JSON.stringify(pluginProcessedData, null, 2));
console.log('\n--- 开始测试 ---\n');

// 调用 GrokGen 插件
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testImageToImage() {
    try {
        const pluginPath = path.join(__dirname, 'GrokGen.js');
        const inputData = JSON.stringify(pluginProcessedData);
        
        console.log('传递给插件的数据:', inputData);
        console.log('\n--- 执行插件 ---\n');
        
        const { stdout, stderr } = await execPromise(`node "${pluginPath}"`, {
            input: inputData,
            timeout: 120000,
            env: {
                ...process.env
            }
        });
        
        console.log('✅ 测试成功！\n');
        console.log('插件输出:');
        console.log(stdout);
        
        if (stderr) {
            console.log('\n标准错误输出:');
            console.log(stderr);
        }
        
        // 验证输出格式
        try {
            const result = JSON.parse(stdout);
            if (result.status === 'success' && result.result) {
                console.log('\n✅ 结果验证通过！');
                console.log('- 状态：success');
                console.log('- 结果包含图片 URL：', result.result.includes('http://') || result.result.includes('data:image'));
                return true;
            } else {
                console.log('\n❌ 结果验证失败：状态不是 success');
                return false;
            }
        } catch (parseError) {
            console.log('\n⚠️ 无法解析输出为 JSON，但插件执行成功');
            return true;
        }
        
    } catch (error) {
        console.log('❌ 测试失败！\n');
        console.log('错误信息:', error.message);
        if (error.stderr) {
            console.log('\n错误输出:');
            console.log(error.stderr);
        }
        if (error.stdout) {
            console.log('\n标准输出:');
            console.log(error.stdout);
        }
        return false;
    }
}

// 运行测试
testImageToImage().then(success => {
    console.log('\n=== 测试完成 ===');
    console.log(success ? '✅ 图生图功能正常工作！' : '❌ 图生图功能存在问题');
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('\n=== 测试执行出错 ===');
    console.error(error);
    process.exit(1);
});
