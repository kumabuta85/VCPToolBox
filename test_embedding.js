const https = require('https');
const path = require('path');
const fs = require('fs');

// 使用 dotenv 读取 config.env
const envPath = path.join(__dirname, 'config.env');
require('dotenv').config({ path: envPath });

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const HTTPS_PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:7897';
const MODEL = process.env.WhitelistEmbeddingModel || 'gemini-embedding-2-preview';

console.log('Testing gemini-embedding-2-preview...');
console.log('GOOGLE_API_KEY:', GOOGLE_API_KEY ? 'Present (' + GOOGLE_API_KEY.substring(0, 10) + '...)' : 'Missing');
console.log('Proxy:', HTTPS_PROXY);
console.log('Model:', MODEL);

// 动态导入 https-proxy-agent
import('https-proxy-agent').then(({ HttpsProxyAgent }) => {
  const data = JSON.stringify({
    model: `models/${MODEL}`,
    content: {
      parts: [{ text: "Hello" }]
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

  console.log('Request path:', options.path);

  const req = https.request(options, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Response:', body);
      try {
        const json = JSON.parse(body);
        if (json.embedding) {
          console.log('✓ gemini-embedding-2-preview 可用!');
          console.log('Embedding 维度:', json.embedding.values?.length);
        } else if (json.error) {
          console.log('✗ API 错误:', json.error.message);
        }
      } catch (e) {
        // 非 JSON 响应
      }
    });
  });

  req.on('error', e => {
    console.error('Request error:', e.message);
    console.error('Error code:', e.code);
  });
  req.write(data);
  req.end();
}).catch(err => {
  console.error('无法加载 https-proxy-agent:', err.message);
});
