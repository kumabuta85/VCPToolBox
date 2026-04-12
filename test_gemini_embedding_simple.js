// 简单的 Gemini Embedding 测试脚本
const https = require('https');
const dotenv = require('dotenv');
const path = require('path');

// 使用 dotenv 读取 config.env
const envPath = path.join(__dirname, 'config.env');
dotenv.config({ path: envPath });

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const HTTPS_PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:7897';
const MODEL = process.env.WhitelistEmbeddingModel || 'gemini-embedding-2-preview';

console.log('=== Gemini Embedding 测试 ===');
console.log('模型:', MODEL);
console.log('GOOGLE_API_KEY:', GOOGLE_API_KEY ? '✓ 已配置 (' + GOOGLE_API_KEY.substring(0, 10) + '...)' : '✗ 未配置');
console.log('HTTPS_PROXY:', HTTPS_PROXY);
console.log('');

// 动态导入 https-proxy-agent
import('https-proxy-agent').then(({ HttpsProxyAgent }) => {
  const data = JSON.stringify({
    model: `models/${MODEL}`,
    content: {
      parts: [{ text: "Hello world" }]
    }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/${MODEL}:embedContent?key=${GOOGLE_API_KEY}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    agent: new HttpsProxyAgent(HTTPS_PROXY)
  };

  console.log('请求 URL:', `https://${options.hostname}${options.path}`);
  console.log('');

  const req = https.request(options, (res) => {
    console.log('响应状态:', res.statusCode);
    console.log('响应头:', JSON.stringify(res.headers, null, 2));
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('');
      console.log('响应内容:');
      console.log(body);
      console.log('');
      try {
        const json = JSON.parse(body);
        if (json.embedding) {
          console.log('✅ 测试成功！');
          console.log('Embedding 维度:', json.embedding.values?.length);
          console.log('前 10 个值:', json.embedding.values?.slice(0, 10));
        } else if (json.error) {
          console.log('❌ API 错误:', json.error.message);
        } else {
          console.log('⚠️ 未知响应格式');
        }
      } catch (e) {
        console.log('⚠️ 非 JSON 响应或解析失败:', e.message);
      }
    });
  });

  req.on('error', e => {
    console.error('❌ 请求错误:', e.message);
    console.error('错误代码:', e.code);
  });
  
  req.write(data);
  req.end();
  
  console.log('请求已发送，等待响应...');
  console.log('');
}).catch(err => {
  console.error('❌ 无法加载 https-proxy-agent:', err.message);
  console.error('请运行：npm install https-proxy-agent');
});
