const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// 模拟插件调用
const testRequest = {
    prompt: "一只可爱的卡通猫咪，坐在彩虹上，蓝天白云，明亮的色彩，儿童插画风格",
    resolution: "1024x1024"
};

console.log('=== GrokGen 插件测试 ===\n');
console.log('测试请求:', JSON.stringify(testRequest, null, 2));
console.log('\n开始调用 GrokGen 插件...\n');

const pluginPath = path.join(__dirname, 'GrokGen.js');

// 读取主程序 config.env
const mainConfigPath = path.join(__dirname, '../../config.env');
if (fs.existsSync(mainConfigPath)) {
    dotenv.config({ path: mainConfigPath });
    console.log('✅ 已加载主程序 config.env\n');
} else {
    console.log('⚠️  未找到主程序 config.env，使用当前环境变量\n');
}

// 设置环境变量（从主程序 config.env 继承）
const env = {
    ...process.env,
    API_Key: process.env.API_Key,
    API_URL: process.env.API_URL,
    PROJECT_BASE_PATH: process.env.PROJECT_BASE_PATH || path.join(__dirname, '../..'),
    PORT: process.env.PORT || '6005',
    Image_Key: process.env.Image_Key || 'aBcDeFgHiJk',
    VarHttpUrl: process.env.VarHttpUrl || 'http://127.0.0.1'
};

// 检查必要的环境变量
if (!env.API_Key) {
    console.error('❌ 错误：API_Key 未设置！请确保主程序 config.env 中配置了 API_Key');
    process.exit(1);
}

if (!env.API_URL) {
    console.error('❌ 错误：API_URL 未设置！请确保主程序 config.env 中配置了 API_URL');
    process.exit(1);
}

console.log('使用的环境变量:');
console.log(`  API_URL: ${env.API_URL}`);
console.log(`  API_Key: ${env.API_Key ? '已设置' : '未设置'}`);
console.log(`  PROJECT_BASE_PATH: ${env.PROJECT_BASE_PATH}`);
console.log(`  PORT: ${env.PORT}`);
console.log(`  Image_Key: ${env.Image_Key}`);
console.log('');

const child = spawn('node', [pluginPath], {
    env: env,
    stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

// 发送请求到 stdin
child.stdin.write(JSON.stringify(testRequest));
child.stdin.end();

// 监听 stdout
child.stdout.on('data', (data) => {
    output += data.toString();
    console.log('✅ 插件输出:', data.toString());
});

// 监听 stderr
child.stderr.on('data', (data) => {
    errorOutput += data.toString();
    console.log('📝 调试信息:', data.toString().trim());
});

// 监听错误
child.on('error', (err) => {
    console.error('❌ 进程错误:', err.message);
    process.exit(1);
});

// 监听退出
child.on('exit', (code) => {
    console.log(`\n=== 测试完成 ===`);
    console.log(`退出码：${code}`);
    
    if (code === 0) {
        console.log('✅ 测试成功！');
        try {
            const result = JSON.parse(output);
            if (result.status === 'success') {
                console.log('\n📊 生成结果:');
                console.log(`  文件：${result.details.fileName}`);
                console.log(`  路径：${result.details.serverPath}`);
                console.log(`  URL: ${result.details.imageUrl}`);
                console.log(`\n🖼️  AI 指令:\n${result.aiInstructions}`);
            } else {
                console.log('⚠️  插件返回了错误状态');
            }
        } catch (e) {
            console.log('⚠️  无法解析输出为 JSON');
        }
    } else {
        console.log('❌ 测试失败，请查看上方的错误信息');
    }
});
