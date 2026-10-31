#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

struct NodeState {
  bool used;
  String id;
  IPAddress ip;
  unsigned long lastSeenMs;
  String selected;
};

const char* AP_SSID = "QuizHub-ESP32";
const char* AP_PASS = "12345678";

WebServer server(80);

const int MAX_NODES = 16;
NodeState nodes[MAX_NODES];
StaticJsonDocument<1024> lastQuestion;

const unsigned long NODE_ONLINE_WINDOW_MS = 10000;

void sendJson(int code, JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  server.send(code, "application/json", out);
}

NodeState* findNode(const String& nodeId) {
  for (int i = 0; i < MAX_NODES; i++) {
    if (nodes[i].used && nodes[i].id == nodeId) return &nodes[i];
  }
  return nullptr;
}

NodeState* findOrCreateNode(const String& nodeId) {
  NodeState* n = findNode(nodeId);
  if (n) return n;
  for (int i = 0; i < MAX_NODES; i++) {
    if (!nodes[i].used) {
      nodes[i].used = true;
      nodes[i].id = nodeId;
      nodes[i].selected = "";
      return &nodes[i];
    }
  }
  return nullptr;
}

bool isNodeOnline(NodeState* n) {
  return n && n->used && millis() - n->lastSeenMs < NODE_ONLINE_WINDOW_MS;
}

void touchNode(NodeState* n) {
  n->lastSeenMs = millis();
  n->ip = server.client().remoteIP();
}

void postToNode(NodeState* n, const char* path, const String& body) {
  if (!n || !n->used || n->ip == IPAddress(0, 0, 0, 0)) return;

  HTTPClient http;
  http.begin("http://" + n->ip.toString() + path);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(1000);
  http.POST(body);
  http.end();
}

void handleGatewayStatus() {
  StaticJsonDocument<256> doc;
  doc["ok"] = true;
  doc["ssid"] = AP_SSID;
  doc["ip"] = WiFi.softAPIP().toString();
  doc["uptimeMs"] = millis();
  int onlineCount = 0;
  for (int i = 0; i < MAX_NODES; i++) {
    if (isNodeOnline(&nodes[i])) onlineCount++;
  }
  doc["onlineNodes"] = onlineCount;
  sendJson(200, doc);
}

void handleNodes() {
  StaticJsonDocument<3072> doc;
  JsonArray arr = doc.createNestedArray("nodes");
  for (int i = 0; i < MAX_NODES; i++) {
    if (!nodes[i].used) continue;
    JsonObject n = arr.createNestedObject();
    n["nodeId"] = nodes[i].id;
    n["online"] = isNodeOnline(&nodes[i]);
    n["ip"] = nodes[i].ip.toString();
    n["lastSeenMs"] = nodes[i].lastSeenMs;
    JsonArray sel = n.createNestedArray("selected");
    if (nodes[i].selected.length() > 0) sel.add(nodes[i].selected);
  }
  sendJson(200, doc);
}

void handlePublishQuestion() {
  StaticJsonDocument<1024> in;
  DeserializationError err = deserializeJson(in, server.arg("plain"));
  if (err) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  lastQuestion.clear();
  lastQuestion.set(in);

  for (int i = 0; i < MAX_NODES; i++) {
    if (!nodes[i].used) continue;
    nodes[i].selected = "";
    postToNode(&nodes[i], "/internal/v1/reset", "{}");
  }

  StaticJsonDocument<256> out;
  out["ok"] = true;
  out["questionId"] = in["questionId"] | 0;
  sendJson(200, out);
}

void handleNodeAnswer(NodeState* n, const String& nodeId) {
  StaticJsonDocument<256> doc;
  doc["nodeId"] = nodeId;
  JsonArray arr = doc.createNestedArray("selected");
  if (n->selected.length() > 0) arr.add(n->selected);
  sendJson(200, doc);
}

void handleNodeJudgement(NodeState* n) {
  StaticJsonDocument<256> in;
  if (deserializeJson(in, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  bool isCorrect = in["isCorrect"] | false;

  StaticJsonDocument<128> payload;
  payload["isCorrect"] = isCorrect;
  String body;
  serializeJson(payload, body);
  postToNode(n, "/internal/v1/judgement", body);

  StaticJsonDocument<128> out;
  out["ok"] = true;
  out["isCorrect"] = isCorrect;
  sendJson(200, out);
}

void handleInternalRegister() {
  StaticJsonDocument<256> in;
  if (deserializeJson(in, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  String nodeId = in["nodeId"] | "";
  NodeState* n = nodeId.length() > 0 ? findOrCreateNode(nodeId) : nullptr;
  if (n) touchNode(n);

  StaticJsonDocument<128> out;
  out["ok"] = n != nullptr;
  sendJson(200, out);
}

void handleInternalHeartbeat() {
  handleInternalRegister();
}

void handleInternalAnswerEvent() {
  StaticJsonDocument<256> in;
  if (deserializeJson(in, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  String nodeId = in["nodeId"] | "";
  NodeState* n = nodeId.length() > 0 ? findOrCreateNode(nodeId) : nullptr;
  if (n) {
    JsonArray arr = in["selected"].as<JsonArray>();
    if (!arr.isNull() && arr.size() > 0) {
      n->selected = String((const char*)arr[0]);
    } else {
      n->selected = "";
    }
    touchNode(n);
  }

  StaticJsonDocument<128> out;
  out["ok"] = n != nullptr;
  sendJson(200, out);
}

void handleNotFound() {
  String uri = server.uri();

  if (uri.startsWith("/api/v1/nodes/")) {
    String rest = uri.substring(14);
    int slash = rest.indexOf('/');
    if (slash > 0) {
      String nodeId = rest.substring(0, slash);
      String action = rest.substring(slash + 1);
      NodeState* n = findNode(nodeId);
      if (!n) {
        server.send(404, "application/json", "{\"error\":\"unknown node\"}");
        return;
      }
      if (action == "answer" && server.method() == HTTP_GET) {
        handleNodeAnswer(n, nodeId);
        return;
      }
      if (action == "judgement" && server.method() == HTTP_POST) {
        handleNodeJudgement(n);
        return;
      }
    }
  }

  server.send(404, "application/json", "{\"error\":\"not found\"}");
}

void setupRoutes() {
  server.on("/api/v1/gateway/status", HTTP_GET, handleGatewayStatus);
  server.on("/api/v1/nodes", HTTP_GET, handleNodes);
  server.on("/api/v1/questions/publish", HTTP_POST, handlePublishQuestion);

  server.on("/internal/v1/register", HTTP_POST, handleInternalRegister);
  server.on("/internal/v1/heartbeat", HTTP_POST, handleInternalHeartbeat);
  server.on("/internal/v1/events/answer", HTTP_POST, handleInternalAnswerEvent);

  server.onNotFound(handleNotFound);
}

void setup() {
  Serial.begin(115200);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);

  setupRoutes();
  server.begin();

  Serial.print("COM7 AP started at: ");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();
}
