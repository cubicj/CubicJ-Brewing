import { Plugin, Notice } from "obsidian";

const NOBLE_PATH = "<NOBLE_PATH>";
const SCALE_PREFIXES = ["PEARL", "ACAIA", "PROCH", "PYXIS", "LUNAR"];
const WRITE_UUID = "49535343884143f4a8d4ecbe34729bb3";
const NOTIFY_UUID = "495353431e4d4bd9ba6123c647249616";

function loadNoble(): any {
  try {
    return require(NOBLE_PATH);
  } catch (err: any) {
    console.log("Noble load failed:", err.message);
    return null;
  }
}

function encodeAcaia(msgType: number, payload: number[]): Buffer {
  const buf = Buffer.alloc(5 + payload.length);
  buf[0] = 0xef;
  buf[1] = 0xdd;
  buf[2] = msgType;
  let ck1 = 0, ck2 = 0;
  for (let i = 0; i < payload.length; i++) {
    const v = payload[i] & 0xff;
    buf[3 + i] = v;
    if (i % 2 === 0) ck1 += v;
    else ck2 += v;
  }
  buf[3 + payload.length] = ck1 & 0xff;
  buf[4 + payload.length] = ck2 & 0xff;
  return buf;
}

function decodeWeight(payload: Buffer, offset: number): number {
  let value = ((payload[offset + 1] & 0xff) << 8) | (payload[offset] & 0xff);
  const unit = payload[offset + 4] & 0xff;
  value /= Math.pow(10, unit);
  if ((payload[offset + 5] & 0x02) === 0x02) value *= -1;
  return value;
}

async function waitForPoweredOn(noble: any, timeoutMs = 10000): Promise<boolean> {
  if (noble.state === "poweredOn") return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    noble.on("stateChange", (state: string) => {
      console.log("BLE state:", state);
      if (state === "poweredOn") {
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
}

export default class CubicJBrewingPlugin extends Plugin {
  async onload() {
    console.log("CubicJ Brewing loaded");
    console.log(`Electron: ${process.versions.electron}, Node: ${process.versions.node}, ABI: ${process.versions.modules}`);

    this.addCommand({
      id: "ble-noble-scan-test",
      name: "BLE PoC: Noble scan",
      callback: () => this.testNobleScan(),
    });

    this.addCommand({
      id: "ble-noble-connect-test",
      name: "BLE PoC: Connect and read weight",
      callback: () => this.testNobleConnect(),
    });
  }

  async testNobleScan() {
    console.log("=== Noble Scan Test ===");
    const noble = loadNoble();
    if (!noble) { new Notice("Noble: FAILED to load"); return; }

    new Notice("BLE: Waiting for adapter...");
    if (!(await waitForPoweredOn(noble))) {
      new Notice(`BLE: Adapter not ready (state=${noble.state})`);
      return;
    }

    new Notice("BLE: Scanning (10s)...");
    const found: string[] = [];

    const onDiscover = (p: any) => {
      const name = p.advertisement?.localName || "";
      if (SCALE_PREFIXES.includes(name.substring(0, 5).toUpperCase())) {
        if (!found.includes(name)) {
          found.push(name);
          console.log(`Found: ${name} (${p.address}) RSSI:${p.rssi}`);
          new Notice(`BLE: Found ${name}`);
        }
      }
    };

    noble.on("discover", onDiscover);
    await noble.startScanningAsync([], true);

    setTimeout(async () => {
      await noble.stopScanningAsync();
      noble.removeListener("discover", onDiscover);
      console.log(`Scan done. ${found.length} unique scale(s): ${found.join(", ")}`);
      new Notice(`BLE: ${found.length} scale(s) found`);
    }, 10000);
  }

  async testNobleConnect() {
    console.log("=== Noble Connect + Weight Test ===");
    const noble = loadNoble();
    if (!noble) { new Notice("Noble: FAILED to load"); return; }

    new Notice("BLE: Waiting for adapter...");
    if (!(await waitForPoweredOn(noble))) {
      new Notice(`BLE: Adapter not ready (state=${noble.state})`);
      return;
    }

    console.log("Scanning for Pearl S...");
    new Notice("BLE: Scanning for scale...");

    const peripheral: any = await new Promise((resolve) => {
      const onDiscover = (p: any) => {
        const name = p.advertisement?.localName || "";
        if (SCALE_PREFIXES.includes(name.substring(0, 5).toUpperCase())) {
          noble.stopScanning();
          noble.removeListener("discover", onDiscover);
          resolve(p);
        }
      };
      noble.on("discover", onDiscover);
      noble.startScanning([], false);
    });

    const scaleName = peripheral.advertisement.localName;
    console.log(`Connecting to ${scaleName} (${peripheral.address})...`);
    new Notice(`BLE: Connecting to ${scaleName}...`);
    await peripheral.connectAsync();
    console.log("Connected!");

    console.log("Discovering characteristics...");
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [],
      [WRITE_UUID, NOTIFY_UUID]
    );

    const writeChar = characteristics.find((c: any) => c.uuid === WRITE_UUID);
    const notifyChar = characteristics.find((c: any) => c.uuid === NOTIFY_UUID);

    if (!writeChar || !notifyChar) {
      console.log("Characteristics not found!", characteristics.map((c: any) => c.uuid));
      new Notice("BLE: Characteristics not found");
      await peripheral.disconnectAsync();
      return;
    }

    console.log("Subscribing to notifications...");
    await notifyChar.subscribeAsync();

    let weightCount = 0;
    notifyChar.on("data", (data: Buffer) => {
      const hex = [...data].map(b => b.toString(16).padStart(2, "0")).join(" ");
      console.log("RX:", hex);

      if (data[0] !== 0xef || data[1] !== 0xdd) return;

      const cmd = data[2];
      if (cmd === 12 && data.length > 6) {
        const innerType = data[4];
        if (innerType === 5 && data.length >= 11) {
          const weight = decodeWeight(data, 5);
          weightCount++;
          console.log(`Weight #${weightCount}: ${weight}g`);
          if (weightCount <= 5) {
            new Notice(`Weight: ${weight}g`);
          }
        }
        if (innerType === 7 && data.length >= 8) {
          const min = data[5] & 0xff;
          const sec = data[6] & 0xff;
          const ds = data[7] & 0xff;
          console.log(`Timer: ${min}:${sec.toString().padStart(2, "0")}.${ds}`);
        }
      }
    });

    console.log("Sending IDENTIFY...");
    const identifyPayload = [0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x30,0x31,0x32,0x33,0x34];
    await writeChar.writeAsync(encodeAcaia(11, identifyPayload), true);

    console.log("Sending NOTIFICATION_REQUEST...");
    const notifPayload = [9, 0,1, 1,2, 2,5, 3,4];
    await writeChar.writeAsync(encodeAcaia(12, notifPayload), true);

    console.log("Sending HEARTBEAT...");
    await writeChar.writeAsync(encodeAcaia(0, [2, 0]), true);

    new Notice("BLE: Waiting for weight data (15s)...");

    const heartbeatInterval = setInterval(async () => {
      try {
        await writeChar.writeAsync(encodeAcaia(0, [2, 0]), true);
      } catch {}
    }, 1000);

    setTimeout(async () => {
      clearInterval(heartbeatInterval);
      console.log(`Test complete. Received ${weightCount} weight reading(s).`);
      new Notice(`BLE: Done. ${weightCount} weight readings.`);
      try { await peripheral.disconnectAsync(); } catch {}
      console.log("Disconnected.");
    }, 15000);
  }

  onunload() {
    console.log("CubicJ Brewing unloaded");
  }
}
