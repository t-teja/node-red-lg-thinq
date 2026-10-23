# @tteja/node-red-lg-thinq

Node-RED nodes for **LG ThinQ Connect** appliances and **webOS / OLED TVs**.

Uses LG’s official ThinQ Connect API (Personal Access Token). No ThinQ username or password is stored. TVs use the local SSAP API because ThinQ Connect does not include TVs.

Palette category: **LG ThinQ**

| Node type | Palette label | Role |
|---|---|---|
| `lg-thinq-account` | Account | PAT, country, shared poll + MQTT |
| `lg-thinq-device` | Device | Any ThinQ appliance: status out, commands in |
| `lg-thinq-tv` | TV | webOS / OLED: power, volume, apps |

Node types are prefixed `lg-thinq-` so they do not clash with `node-red-contrib-lg`.

## Install

Until the package is on npm, install from GitHub in the Node-RED user directory:

```
npm install github:t-teja/node-red-lg-thinq
```

This house already bind-mounts the source at `/opt/node-red-lg-thinq` and depends on `file:/opt/node-red-lg-thinq`.

After npm publish:

```
npm install @tteja/node-red-lg-thinq
```

Or **Menu → Manage palette → Install**. Restart Node-RED. The nodes appear under **LG ThinQ**.

## Account

1. Open [https://connect-pat.lgthinq.com](https://connect-pat.lgthinq.com)
2. Sign in with the ThinQ app account
3. Create a token with view, status, control, event, and push scopes
4. Drop any Device node, add an **Account**, paste the PAT, pick country, click **Test connection**

The PAT is a Node-RED password credential. Client ID is generated once and reused.

## Device

Pick the appliance from the dropdown.

- **Output 1** — state (`msg.state` always; `msg.payload` is the object or a Dashboard field)
- **Output 2** — events such as `washing_is_complete`

**Dashboard field** (optional): `remainMinutes`, `currentTemperature`, `running`, … so Dashboard 2 `ui-gauge` / `ui-text` / `ui-switch` can use `msg.payload` directly. `ui-template` can bind `msg.payload.state` when the field is left empty.

Washer input: `"start"` / `"stop"` / `"off"` / `"status"`.  
AC input: `true` / `false` / `"cool"` / `{ "temperature": 24, "mode": "cool" }`.  
Any other object is sent as ThinQ Connect control JSON.

Washer remote start requires the cycle to be loaded on the machine with Remote Start enabled. The public API cannot choose the program.

## TV

Enter IP and MAC. First connect shows a pairing prompt on the TV. Enable Mobile TV On / Quick Start+ for Wake-on-LAN. Recent OLEDs that refuse port 3000 need **Secure websocket**.

## Requirements

- Node-RED 3+
- Node.js 18+
- ThinQ Connect PAT for appliances
- LAN access to the TV for `lg-thinq-tv`

## License

MIT. ThinQ Connect SDK is Apache-2.0, copyright LG Electronics.
