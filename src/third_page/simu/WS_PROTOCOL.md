# /simu WebSocket Protocol

This document is scoped to `src/third_page/simu`.

Default URL:
- `ws://127.0.0.1:9011/ws`

## Modes
- Local mode: no WS connection, purely browser-side simulation UI.
- WS sync mode: connect WS and optionally enable `Sync Drag to WS` to push joint targets.

## Request/Response Envelope
Request:
```json
{ "op": "<name>", "req_id": 1, "...": "payload" }
```
Response:
```json
{ "ok": true, "op": "<name>", "req_id": 1, "data": {} }
```
Error:
```json
{ "ok": false, "op": "<name>", "req_id": 1, "error": "..." }
```

## State Push
Server pushes periodic state:
```json
{
  "type": "state",
  "data": {
    "q": [],
    "joint_targets": {},
    "pose": {},
    "waypoints": {},
    "motion": { "running": false, "name": "idle" },
    "ts": 0.0
  }
}
```

## Operations
- `ping`
- `state`
- `sim_set_joint_targets`
  - payload: `{ "targets": {"joint1": 0.1, "joint2": -0.2, ...} }`
- `sim_move_l`
  - payload:
```json
{
  "target_pose": {"x":0.2,"y":0.0,"z":0.2,"roll":0.0,"pitch":0.0,"yaw":0.0},
  "duration_s": 2.0
}
```
- `bus_config`
  - payload: `{ "tx_buffer_size": 1024, "rx_buffer_size": 1024, "channels": {"websocket": true, "sim": true, "ros": false} }`
- `bus_snapshot`
  - payload: `{ "limit": 100 }`
- `waypoint_add`
  - payload:
```json
{
  "id": "P1",
  "pose": {"x":0.3,"y":0.0,"z":0.2,"roll":0.0,"pitch":0.0,"yaw":0.0}
}
```
- `waypoint_remove`
  - payload: `{ "id": "P1" }`
- `waypoint_update`
  - payload:
```json
{
  "id": "P1",
  "pose": {"x":0.31,"y":0.00,"z":0.22,"roll":0.0,"pitch":0.0,"yaw":0.0}
}
```
- `waypoint_clear`
- `waypoint_list`
- `sim_run_waypoints`
  - payload: `{ "from_id": "P1", "to_id": "P2", "duration_s": 2.0 }`
- `sim_stop`
  - immediate stop for currently running waypoint motion

## Event Push
- `{"type":"waypoint","data":{"event":"added|updated|removed|cleared", ...}}`
- `{"type":"task","data":{"event":"accepted|done|stopped|error","task":{...}}}`

## Extensibility
The backend bus is designed for multi-protocol bridging (`websocket`, `motorbridge_py`, `ros`, etc.).
You can later add protocol adapters and switch channels on/off via `bus_config`.
