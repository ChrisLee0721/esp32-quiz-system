# COM7 Gateway (ESP32)

This firmware runs on the ESP32 connected as COM7.

## Features
- Starts WiFi AP: `QuizHub-ESP32` / `12345678`
- Exposes REST endpoints for PC
- Receives COM6 register/heartbeat/answer events
- Stores latest COM6 selected option
- Drives LED outputs for demo and validation

## Required libraries
- `ArduinoJson`

## REST endpoints
- `GET /api/v1/gateway/status`
- `GET /api/v1/nodes`
- `POST /api/v1/questions/publish`
- `GET /api/v1/nodes/COM6/answer`
- `POST /api/v1/nodes/COM6/judgement`

Internal:
- `POST /internal/v1/register`
- `POST /internal/v1/heartbeat`
- `POST /internal/v1/events/answer`

## Pin map used in this demo
- Correct LED: GPIO2
- Wrong LED: GPIO4
- Option LEDs: GPIO16/17/18/19

Adjust pins to your board wiring before flashing.
