#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

const char* WIFI_SSID = "QuizHub-ESP32";
const char* WIFI_PASS = "12345678";
const char* GATEWAY_BASE = "http://192.168.4.1";

// Human-friendly prefix. The firmware appends "-XXXX" (last 2 bytes of the
// station MAC) so two boards flashed with the same prefix still register as
// distinct nodes instead of silently overwriting each other on the gateway.
const char* NODE_PREFIX = "COM6";

char NODE_ID[24];

const int PIN_LED_CORRECT = 13;
const int PIN_LED_WRONG = 34;
const int PIN_BTN_A = 14;
const int PIN_BTN_B = 26;
const int PIN_BTN_C = 33;
const int PIN_BTN_D = 35;
const int PIN_LED_A = 12;
const int PIN_LED_B = 27;
const int PIN_LED_C = 25;
const int PIN_LED_D = 32;

WebServer server(80);

unsigned long lastHeartbeatMs = 0;
const unsigned long HEARTBEAT_INTERVAL = 3000;
bool wifiWasConnected = false;

unsigned long lastDebounceMs[4] = {0, 0, 0, 0};
int lastStableBtnState[4] = {HIGH, HIGH, HIGH, HIGH};
int lastRawBtnState[4] = {HIGH, HIGH, HIGH, HIGH};

String selectedOption = "";

struct OutboundMsg {
  char path[48];
  char body[256];
};

QueueHandle_t outboundQueue;

int buttonPinByIndex(int i) {
  if (i == 0) return PIN_BTN_A;
  if (i == 1) return PIN_BTN_B;
  if (i == 2) return PIN_BTN_C;
  return PIN_BTN_D;
}

int ledPinByIndex(int i) {
  if (i == 0) return PIN_LED_A;
  if (i == 1) return PIN_LED_B;
  if (i == 2) return PIN_LED_C;
  return PIN_LED_D;
}

String optionByIndex(int i) {
  if (i == 0) return "A";
  if (i == 1) return "B";
  if (i == 2) return "C";
  return "D";
}

void clearChoiceLeds() {
  digitalWrite(PIN_LED_A, LOW);
  digitalWrite(PIN_LED_B, LOW);
  digitalWrite(PIN_LED_C, LOW);
  digitalWrite(PIN_LED_D, LOW);
}

void renderChoiceLeds() {
  clearChoiceLeds();
  if (selectedOption == "A") digitalWrite(PIN_LED_A, HIGH);
  if (selectedOption == "B") digitalWrite(PIN_LED_B, HIGH);
  if (selectedOption == "C") digitalWrite(PIN_LED_C, HIGH);
  if (selectedOption == "D") digitalWrite(PIN_LED_D, HIGH);
}

void applyJudgement(bool isCorrect) {
  digitalWrite(PIN_LED_CORRECT, isCorrect ? HIGH : LOW);
  digitalWrite(PIN_LED_WRONG, isCorrect ? LOW : HIGH);
}

void clearJudgement() {
  digitalWrite(PIN_LED_CORRECT, LOW);
  digitalWrite(PIN_LED_WRONG, LOW);
}

bool httpPostRaw(const char* path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(String(GATEWAY_BASE) + path);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(600);

  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

// Blocking HTTP lives here so loop() keeps scanning buttons and answering
// the gateway's /internal routes even while a POST is in flight.
void outboundTask(void*) {
  OutboundMsg msg;
  for (;;) {
    if (xQueueReceive(outboundQueue, &msg, portMAX_DELAY) == pdTRUE) {
      httpPostRaw(msg.path, String(msg.body));
    }
  }
}

void enqueuePost(const char* path, JsonDocument& payload) {
  if (WiFi.status() != WL_CONNECTED) return;

  OutboundMsg msg;
  String body;
  serializeJson(payload, body);
  if (body.length() >= sizeof(msg.body)) return;

  strlcpy(msg.path, path, sizeof(msg.path));
  strlcpy(msg.body, body.c_str(), sizeof(msg.body));
  xQueueSend(outboundQueue, &msg, 0);
}

void sendRegister() {
  StaticJsonDocument<256> payload;
  payload["nodeId"] = NODE_ID;
  payload["role"] = "answer-pad";
  payload["ip"] = WiFi.localIP().toString();
  JsonArray caps = payload.createNestedArray("capabilities");
  caps.add("buttons4");
  caps.add("led4");
  caps.add("judge2");
  enqueuePost("/internal/v1/register", payload);
}

void sendHeartbeat() {
  StaticJsonDocument<128> payload;
  payload["nodeId"] = NODE_ID;
  payload["uptimeMs"] = millis();
  enqueuePost("/internal/v1/heartbeat", payload);
}

void sendAnswerEvent() {
  StaticJsonDocument<256> payload;
  payload["nodeId"] = NODE_ID;
  payload["questionId"] = 0;
  payload["eventType"] = "toggle";
  payload["timestamp"] = millis();

  JsonArray arr = payload.createNestedArray("selected");
  if (selectedOption.length() > 0) {
    arr.add(selectedOption);
  }

  enqueuePost("/internal/v1/events/answer", payload);
}

void setupPins() {
  pinMode(PIN_LED_CORRECT, OUTPUT);
  pinMode(PIN_LED_WRONG, OUTPUT);
  pinMode(PIN_LED_A, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  pinMode(PIN_LED_C, OUTPUT);
  pinMode(PIN_LED_D, OUTPUT);

  pinMode(PIN_BTN_A, INPUT_PULLUP);
  pinMode(PIN_BTN_B, INPUT_PULLUP);
  pinMode(PIN_BTN_C, INPUT_PULLUP);
  // GPIO35 is input-only: no internal pullup, needs external 10k to 3.3V
  pinMode(PIN_BTN_D, INPUT);

  clearChoiceLeds();
  clearJudgement();
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void buildNodeId() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String suffix = mac.substring(mac.length() - 4);
  snprintf(NODE_ID, sizeof(NODE_ID), "%s-%s", NODE_PREFIX, suffix.c_str());
}

void handleJudgement() {
  StaticJsonDocument<128> in;
  if (deserializeJson(in, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  applyJudgement(in["isCorrect"] | false);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleReset() {
  selectedOption = "";
  renderChoiceLeds();
  clearJudgement();
  server.send(200, "application/json", "{\"ok\":true}");
}

void processButton(int index) {
  int pin = buttonPinByIndex(index);
  int reading = digitalRead(pin);

  if (reading != lastRawBtnState[index]) {
    lastRawBtnState[index] = reading;
    lastDebounceMs[index] = millis();
    return;
  }

  if (reading == lastStableBtnState[index]) return;
  if (millis() - lastDebounceMs[index] < 40) return;

  lastStableBtnState[index] = reading;

  if (reading == LOW) {
    String option = optionByIndex(index);

    if (selectedOption == option) {
      selectedOption = "";
    } else {
      selectedOption = option;
    }

    renderChoiceLeds();
    clearJudgement();
    sendAnswerEvent();
  }
}

void setup() {
  Serial.begin(115200);
  setupPins();
  connectWiFi();
  buildNodeId();
  Serial.print("NODE_ID: ");
  Serial.println(NODE_ID);

  outboundQueue = xQueueCreate(8, sizeof(OutboundMsg));
  xTaskCreatePinnedToCore(outboundTask, "outbound", 8192, nullptr, 1, nullptr, 1);

  server.on("/internal/v1/judgement", HTTP_POST, handleJudgement);
  server.on("/internal/v1/reset", HTTP_POST, handleReset);
  server.onNotFound([]() {
    server.send(404, "application/json", "{\"error\":\"not found\"}");
  });
  server.begin();
}

void loop() {
  server.handleClient();

  processButton(0);
  processButton(1);
  processButton(2);
  processButton(3);

  bool connected = (WiFi.status() == WL_CONNECTED);
  if (connected && !wifiWasConnected) {
    sendRegister();
    sendHeartbeat();
    lastHeartbeatMs = millis();
  }
  wifiWasConnected = connected;

  if (!connected) return;

  if (millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL) {
    lastHeartbeatMs = millis();
    sendHeartbeat();
  }
}
