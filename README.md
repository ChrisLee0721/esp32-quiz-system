# ESP32 Quiz System (multi-terminal)

- `Question/`:
  - `questions.csv` — 题目唯一数据源（题干、选项、正确答案、逐选项解释）
  - `Question.html` / `Question.js` / `Question.css` — 答题与讲评页面
- `quiz-system/`:
  - PC-side REST API service
  - Loads questions from `Question/questions.csv`
  - Talks to COM7 REST APIs
- `firmware/COM7_Gateway/`:
  - ESP32 AP + gateway REST service，支持最多 16 个答题终端节点
- `firmware/COM6_Terminal/`:
  - ESP32 button/LED answer terminal（每块终端板一个 NODE_ID）

## 1) Flash ESP32 firmware

### COM7 (gateway)
1. Open `firmware/COM7_Gateway/COM7_Gateway.ino` in Arduino IDE.
2. Install library: `ArduinoJson`.
3. Flash to ESP32 on COM7.
4. Open serial monitor at 115200 and confirm AP IP (default `192.168.4.1`).

### Terminal(s) (COM6, ...)
1. Open `firmware/COM6_Terminal/COM6_Terminal.ino`.
2. Install library: `ArduinoJson`.
3. Set `NODE_ID` per board (e.g. `"COM6"`, `"COM8"` ...), then flash.
4. Ensure SSID/PASS/IP match COM7 config.

多终端：按板子数量重复烧录终端固件，每块改一个不同的 `NODE_ID` 即可，网关会自动注册所有节点。

## 2) Wire terminal pins

- Correct LED: GPIO2
- Wrong LED: GPIO4
- Buttons A-D: GPIO14 / GPIO26 / GPIO33 / GPIO35
- Option LEDs A-D: GPIO12 / GPIO27 / GPIO25 / GPIO32

Notes:
- GPIO35 无内部上拉，须外接 10k 上拉到 3.3V。
- GPIO12 是启动配置脚，LED 电路勿在上电时把它拉高。

Button behavior:
- Press once: selected LED turns on.
- Press same button again: LED turns off.

## 3) Start PC service

In terminal:

```bash
cd quiz-system
npm install
npm start
```

Server starts at `http://localhost:3000`.

Optional env var:
- `COM7_BASE_URL` (default: `http://192.168.4.1`)

## 4) Run web page

Connect the PC to WiFi AP `QuizHub-ESP32` (password `12345678`), then open `Question/Question.html` in browser.

Usage flow:
1. Click **Next** → 随机出题并推送到所有终端（终端灯和已选清零）。
2. 按终端按钮作答 → LED 切换，选择实时上报并在页面显示各终端已选。
3. Click **Next** → 进入**讲评页**：逐选项解释（正确项为什么对、错误项为什么错）、本题对/错人数、各终端答题情况；同时给答对/答错的终端点亮对应 LED。
4. Click **下一题** → 出下一题并重置所有终端。

## 5) REST endpoints (PC service)

- `GET /api/v1/health`
- `GET /api/v1/stats` — 累计答对/答错人次
- `GET /api/v1/questions`
- `GET /api/v1/questions/next?nodeId=COM6`
- `POST /api/v1/questions/judge-all` — 判所有终端当前题，返回人数、逐终端结果和解释
- `GET /api/v1/answers` — 各终端已选
- `GET /api/v1/nodes`
- `GET /api/v1/nodes/COM6/answer`
- `POST /api/v1/nodes/COM6/judge` — 单终端判题（调试用）
- `GET /api/v1/gateway/status`

## 6) questions.csv 格式

```
question_id,stem_en,stem_zh,option_a,option_b,option_c,option_d,correct,explain_a,explain_b,explain_c,explain_d
```

- `correct` 为 A-D；`explain_x` 为该选项的解释（正确项解释为什么对，错误项解释为什么错），中英双语用 ` / ` 分隔。
- 所有字段用双引号包围，字段内引号写成 `""`。
- `question*.txt` 与 `answerKey.json` 已废弃，可删除（内容已合并进 CSV）。
