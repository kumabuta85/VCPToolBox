# GrokGen 插件

## 功能

`GrokGen` 是一个同步插件，使用 Grok API (`grok-4-image` 模型) 根据文本提示生成图片。

## 配置

本插件**无需额外配置**，直接使用主程序 `config.env` 中的全局配置：

- `API_Key`: Grok API 密钥
- `API_URL`: 聚合 API 地址
- `PORT`: VCP 服务端口
- `Image_Key`: 图片服务访问密钥
- `VarHttpUrl`: 图片服务器 HTTP 地址（可选，默认 `http://127.0.0.1`）

## 使用方法

### 调用格式

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GrokGen「末」,
prompt:「始」(必需) 用于图片生成的详细提示词，支持中文或英文。「末」,
resolution:「始」(可选) 图片分辨率，可选值：「1024x1024」、「1536x1536」、「1024x1536」、「1536x1024」。默认：1024x1024「末」
<<<[END_TOOL_REQUEST]>>>
```

### 示例

**示例 1：生成卡通猫咪**
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GrokGen「末」,
prompt:「始」一只可爱的卡通猫咪，坐在彩虹上，蓝天白云，明亮的色彩，儿童插画风格「末」,
resolution:「始」1024x1024「末」
<<<[END_TOOL_REQUEST]>>>
```

**示例 2：生成风景画**
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GrokGen「末」,
prompt:「始」日落时分的海滩，金色的阳光洒在海面上，远处有帆船，宁静祥和「末」,
resolution:「始」1536x1024「末」
<<<[END_TOOL_REQUEST]>>>
```

## 输出

插件执行成功后返回：

1. **图片 URL**: 可通过浏览器访问的图片地址
2. **服务器路径**: `image/grokgen/文件名.jpeg`
3. **Base64 图片数据**: 直接嵌入到响应中
4. **AI 指令**: 包含 HTML `<img>` 标签的使用说明

### 示例输出

```json
{
  "status": "success",
  "content": [
    {
      "type": "text",
      "text": "图片已成功生成！\n- 提示词：...\n- 分辨率：1024x1024\n- 可访问 URL: ..."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/jpeg;base64,..."
      }
    }
  ],
  "details": {
    "serverPath": "image/grokgen/xxx.jpeg",
    "fileName": "xxx.jpeg",
    "imageUrl": "http://localhost:6005/pw=xxx/images/grokgen/xxx.jpeg"
  }
}
```

## 图片存储位置

生成的图片保存在：
```
F:\VCP\VCPToolBox-main\image\grokgen\文件名.jpeg
```

## 支持的分辨率

- `1024x1024` (默认) - 正方形
- `1536x1536` - 大正方形
- `1024x1536` - 纵向
- `1536x1024` - 横向

## 注意事项

1. **API 兼容性**: 本插件依赖于聚合 API 支持 `grok-4-image` 模型
2. **图片展示**: AI 收到结果后，应使用返回的 HTML `<img>` 标签展示图片
3. **超时设置**: 图片生成可能需要较长时间，超时设置为 120 秒
4. **随机种子**: 如果不指定 `seed` 参数，每次生成结果都不同

## 调试

启用调试模式可查看详细的 API 请求和响应信息：

```env
DebugMode=true
```

调试日志将输出到标准错误流（stderr）。

## 依赖

- `axios`: HTTP 请求库
- `uuid`: 生成唯一文件名

## 测试

运行测试脚本：

```bash
node test-grokgen.js
```

测试脚本会使用预设的提示词调用插件，并显示生成结果。
