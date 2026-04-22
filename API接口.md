# 小程序前端对接 API 文档（婚礼请帖版）

本文档用于婚礼请帖小程序前端对接，覆盖：模板获取、文本/图片替换保存、导出。

---

## 1. 基础信息

- **Base URL（示例）**：`https://fnjgconxtpsc.sealosbja.site`
- **Content-Type**：`application/json`
- **鉴权**：当前版本无鉴权（无需 token）

---

## 2. 小程序可用接口总览

1. 获取模板列表：`GET /templates`
2. 获取编辑模板详情：`GET /templates/:id`
3. 上传替换图片：`POST /upload/image`（用户换图必需）
4. 保存模板：`POST /templates/save`（文本/图片修改后保存）
5. 提交导出任务：`POST /render`
6. 查询导出状态：`GET /render/:jobId`

> 已移除：PSD 上传、删除模板相关接口（客户端暂不需要）。

---

## 3. 接口详情

### 3.1 获取模板列表

- **URL**：`GET /templates`
- **用途**：模板库列表展示（缩略图、分类、尺寸）

**响应示例**
```json
{
  "data": [
    {
      "id": "tpl_001",
      "name": "婚礼海报",
      "width": 675,
      "height": 1200,
      "createdAt": "2026-04-20T12:00:00.000Z",
      "thumbnail": "https://.../uploads/thumb-xxx.png",
      "category": "海报"
    }
  ]
}
```

---

### 3.2 获取编辑模板详情

- **URL**：`GET /templates/:id`
- **用途**：进入编辑页时拉取完整模板（含图层）

**路径参数**
- `id`：模板 ID

**响应示例**
```json
{
  "data": {
    "id": "tpl_001",
    "name": "婚礼海报",
    "width": 675,
    "height": 1200,
    "category": "海报",
    "thumbnail": "https://.../uploads/thumb-xxx.png",
    "layers": [
      {
        "id": "layer_1",
        "type": "image",
        "name": "背景",
        "x": 0,
        "y": 0,
        "width": 675,
        "height": 1200,
        "url": "https://.../uploads/xxx.png",
        "editable": true
      }
    ]
  }
}
```

> 若模板不存在：`data` 返回 `null`。

---

### 3.3 上传替换图片（用户换图）

- **URL**：`POST /upload/image`
- **Content-Type**：`multipart/form-data`
- **字段**：`file`
- **用途**：用户从手机相册选择新图片后，先上传拿到 URL，再写回对应图片图层的 `url`

**响应示例**
```json
{
  "url": "https://.../uploads/abc123.png"
}
```

**前端使用方式（关键）**
1. 用户选择本地图片
2. 调 `upload/image` 获取新 `url`
3. 把目标图层 `layer.url` 替换成新 `url`
4. 最后调用 `POST /templates/save` 保存

---

### 3.4 保存模板（文本/图片修改后）

- **URL**：`POST /templates/save`
- **用途**：保存当前编辑结果（新建/覆盖）

**请求体（JSON）**
```json
{
  "id": "tpl_001",
  "name": "婚礼海报-修改版",
  "width": 675,
  "height": 1200,
  "layers": [],
  "thumbnail": "data:image/png;base64,...",
  "category": "海报"
}
```

**字段说明（婚礼请帖重点）**
- `id`：可选；传入可覆盖同 ID 模板
- `name`：必填
- `width`、`height`：必填，数字
- `layers`：必填，数组
- `thumbnail`：可选（URL 或 base64）
- `category`：可选，默认 `未分类`

**文本替换规则（建议）**
- 在 `layers` 中找到 `type: "text"` 的图层
- 更新该图层的 `text` 字段后再调用保存接口

**图片替换规则（建议）**
- 在 `layers` 中找到 `type: "image"` 的图层
- 先上传图片拿到 `url`
- 更新该图层的 `url` 字段后再调用保存接口

**响应示例**
```json
{
  "data": {
    "id": "tpl_001",
    "name": "婚礼海报-修改版",
    "width": 675,
    "height": 1200,
    "layers": [],
    "thumbnail": "https://.../uploads/thumb-xxx.png",
    "category": "海报"
  }
}
```

---

### 3.5 导出接口（异步任务）

#### 3.5.1 提交导出任务

- **URL**：`POST /render`
- **用途**：提交渲染任务，返回 `jobId`

**请求体**
```json
{
  "template": {
    "width": 675,
    "height": 1200,
    "layers": []
  }
}
```

**响应示例**
```json
{
  "jobId": "12345"
}
```

**常见错误**
- `503` + `渲染队列暂时不可用，请稍后重试`
- `503` + `渲染任务提交失败，请稍后重试`

#### 3.5.2 查询导出状态

- **URL**：`GET /render/:jobId`
- **用途**：轮询任务状态

**响应示例（进行中）**
```json
{
  "status": "active"
}
```

**响应示例（成功）**
```json
{
  "status": "completed",
  "result": "data:image/png;base64,...."
}
```

**响应示例（失败）**
```json
{
  "status": "failed",
  "result": null,
  "failedReason": "具体失败原因"
}
```

**响应示例（任务不存在）**
```json
{
  "status": "not_found"
}
```

---

## 4. 小程序推荐对接流程

1. 模板列表页：`GET /templates`
2. 进入编辑页：`GET /templates/:id`
3. 用户改文字：更新 `text` 图层后 `POST /templates/save`
4. 用户换图片：`POST /upload/image` -> 回填图层 `url` -> `POST /templates/save`
5. 点击导出：
   - `POST /render` 获取 `jobId`
   - 每 2 秒轮询 `GET /render/:jobId`
   - `status=completed` 后处理 `result`（base64 转本地文件并存相册）

---

## 5. 错误码与排查建议（客户端相关）

- `400`：请求参数不合法（检查请求体字段）
- `500`：服务端内部错误（查看 server 日志）
- `503`：渲染队列/Redis 暂不可用（稍后重试）

建议同时查看：
- `moban-server` 日志（是否成功 add job）
- `moban-worker` 日志（是否 picked up/completed）
