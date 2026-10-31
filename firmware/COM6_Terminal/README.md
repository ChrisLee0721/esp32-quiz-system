# COM6 Terminal (ESP32)

This firmware runs on the ESP32 connected as COM6.

## Features
- Connects to COM7 AP over WiFi
- Registers and sends heartbeat to COM7
- Reads 4 buttons with debounce
- Controls 4 option LEDs with toggle behavior:
  - Press once -> LED on (selected)
  - Press again -> LED off (unselected)
- Sends selected option to COM7

## Required libraries
- `ArduinoJson`

## Pin map
- Correct LED: GPIO2
- Wrong LED: GPIO4
- Buttons A-D: GPIO12/13/14/15
- Option LEDs A-D: GPIO16/17/18/19

## Notes
- Uses single-select behavior by default.
- If a different option is pressed, previous option is cleared.
- Update SSID/password/IP constants to match your COM7 config.
