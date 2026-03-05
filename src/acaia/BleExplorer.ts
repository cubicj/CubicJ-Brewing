import type { AcaiaService } from './AcaiaService';

interface StateSnapshot {
	weight: number;
	stable: boolean;
	battery: number;
	timerRunning: boolean;
	settingsRaw: string | null;
}

interface PacketRecord {
	ts: number;
	hex: string;
	cmd: number | null;
}

const KNOWN_MSG_TYPES = new Set([0, 4, 5, 6, 11, 12, 13, 25]);
const HEARTBEAT_RESPONSE_CMDS = new Set([8, 12]);
const BASELINE_MS = 500;
const OBSERVE_MS = 1500;
const WEIGHT_THRESHOLD = 0.1;

export class BleExplorer {
	private service: AcaiaService;
	private logLines: string[] = [];
	private logWriter: (content: string) => Promise<void>;
	private logReader: () => Promise<string | null>;
	private capturedPackets: PacketRecord[] = [];
	private capturing = false;
	private aborted = false;
	private packetListener: ((hex: string) => void) | null = null;

	constructor(
		service: AcaiaService,
		writer: (content: string) => Promise<void>,
		reader: () => Promise<string | null>,
	) {
		this.service = service;
		this.logWriter = writer;
		this.logReader = reader;
	}

	async scan(start = 0, end = 255): Promise<void> {
		if (this.service.state !== 'connected') return;
		this.aborted = false;

		this.startCapture();

		const ts = new Date().toISOString();
		const name = this.service.scaleName ?? 'unknown';
		this.log('========================================');
		this.log(`BLE EXPLORER SCAN — ${ts}`);
		this.log(`Scale: ${name}`);
		this.log(`Blacklist: [${[...KNOWN_MSG_TYPES].join(',')}]`);
		this.log(`Range: ${start}-${end}`);
		this.log('========================================');
		this.log('');

		try {
			for (let msgType = start; msgType <= end; msgType++) {
				if (this.aborted) {
					this.log(`>>> ABORTED at msgType=${msgType}`);
					break;
				}
				if (this.service.state !== 'connected') {
					this.log(`>>> DISCONNECTED at msgType=${msgType}`);
					break;
				}
				if (KNOWN_MSG_TYPES.has(msgType)) continue;

				await this.probe(msgType, [0]);
			}
		} finally {
			this.stopCapture();
			this.log('');
			this.log('========================================');
			this.log('SCAN COMPLETE');
			this.log('========================================');
			await this.flush();
		}
	}

	stop(): void {
		this.aborted = true;
	}

	private async probe(msgType: number, payload: number[]): Promise<void> {
		const before = this.service.getSnapshot();

		this.capturedPackets = [];
		await this.delay(BASELINE_MS);
		const baselinePackets = [...this.capturedPackets];
		const baselineCmds = this.summarizeCmds(baselinePackets);

		this.capturedPackets = [];
		await this.service.sendRaw(msgType, payload);
		await this.delay(OBSERVE_MS);
		const probePackets = [...this.capturedPackets];
		const probeCmds = this.summarizeCmds(probePackets);

		const after = this.service.getSnapshot();
		const diffs = this.computeDiff(before, after, baselinePackets, probePackets);

		this.log(`--- PROBE msgType=${msgType} payload=[${payload.join(',')}] ---`);
		this.log(`BEFORE: weight=${before.weight} stable=${before.stable} battery=${before.battery} timer=${before.timerRunning ? 'on' : 'off'}`);
		this.log(`PACKETS (baseline ${BASELINE_MS}ms): ${baselinePackets.length} [${baselineCmds}]`);
		this.log(`PACKETS (probe ${OBSERVE_MS}ms): ${probePackets.length} [${probeCmds}]`);
		this.log(`AFTER:  weight=${after.weight} stable=${after.stable} battery=${after.battery} timer=${after.timerRunning ? 'on' : 'off'}`);

		if (diffs.length === 0) {
			this.log('DIFF: none');
		} else {
			for (const d of diffs) this.log(`DIFF: ${d}`);
			this.log(`>>> HIT msgType=${msgType}`);
		}
		this.log('');

		if (this.logLines.length > 100) await this.flush();
	}

	private computeDiff(
		before: StateSnapshot,
		after: StateSnapshot,
		baselinePackets: PacketRecord[],
		probePackets: PacketRecord[],
	): string[] {
		const diffs: string[] = [];

		if (Math.abs(after.weight - before.weight) > WEIGHT_THRESHOLD) {
			diffs.push(`weight ${before.weight}→${after.weight}`);
		}
		if (after.stable !== before.stable) {
			diffs.push(`stable ${before.stable}→${after.stable}`);
		}
		if (after.battery !== before.battery) {
			diffs.push(`battery ${before.battery}→${after.battery}`);
		}
		if (after.timerRunning !== before.timerRunning) {
			diffs.push(`timer ${before.timerRunning ? 'on' : 'off'}→${after.timerRunning ? 'on' : 'off'}`);
		}
		if (before.settingsRaw && after.settingsRaw && before.settingsRaw !== after.settingsRaw) {
			diffs.push(`settingsRaw changed: ${before.settingsRaw} → ${after.settingsRaw}`);
		}

		const baselineCmdSet = new Set(baselinePackets.map(p => p.cmd).filter(c => c !== null));
		for (const p of probePackets) {
			if (p.cmd !== null && !baselineCmdSet.has(p.cmd) && !HEARTBEAT_RESPONSE_CMDS.has(p.cmd)) {
				diffs.push(`NEW_CMD cmd=${p.cmd} hex=${p.hex}`);
			}
		}

		if (this.service.state !== 'connected') {
			diffs.push('DISCONNECT detected');
		}

		return diffs;
	}

	private summarizeCmds(packets: PacketRecord[]): string {
		const counts = new Map<number, number>();
		for (const p of packets) {
			if (p.cmd !== null) counts.set(p.cmd, (counts.get(p.cmd) ?? 0) + 1);
		}
		return [...counts.entries()].map(([cmd, n]) => `cmd${cmd}×${n}`).join(', ');
	}

	private startCapture(): void {
		this.capturing = true;
		this.capturedPackets = [];
		this.packetListener = (hex: string) => {
			if (!this.capturing) return;
			let cmd: number | null = null;
			if (hex.length >= 6 && hex.startsWith('efdd')) {
				cmd = parseInt(hex.substring(4, 6), 16);
			}
			this.capturedPackets.push({ ts: performance.now(), hex, cmd });
		};
		this.service.on('rawPacket', this.packetListener);
	}

	private stopCapture(): void {
		this.capturing = false;
		if (this.packetListener) {
			this.service.removeListener('rawPacket', this.packetListener);
			this.packetListener = null;
		}
	}

	private log(line: string): void {
		const ts = new Date().toISOString().substring(11, 23);
		this.logLines.push(line.startsWith('===') ? line : `[${ts}] ${line}`);
	}

	private async flush(): Promise<void> {
		if (this.logLines.length === 0) return;
		const chunk = this.logLines.splice(0);
		try {
			const existing = await this.logReader() ?? '';
			await this.logWriter(existing + chunk.join('\n') + '\n');
		} catch (e) {
			console.error('[BleExplorer] flush failed:', e);
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(r => setTimeout(r, ms));
	}
}
