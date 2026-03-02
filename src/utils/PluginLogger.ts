import { FileLogger } from './FileLogger';

type Adapter = {
	read: (path: string) => Promise<string>;
	write: (path: string, content: string) => Promise<void>;
};

function wallClock(): string {
	const d = new Date();
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	const ss = String(d.getSeconds()).padStart(2, '0');
	const ms = String(d.getMilliseconds()).padStart(3, '0');
	return `${hh}:${mm}:${ss}.${ms}`;
}

export class PluginLogger {
	private fileLogger: FileLogger;

	constructor(adapter: Adapter, filePath: string) {
		this.fileLogger = new FileLogger(adapter, filePath, 2000, 2000);
	}

	start(): void {
		this.fileLogger.start();
		this.log('PLUGIN', `=== session ${new Date().toISOString()} ===`);
	}

	log(category: string, message: string): void {
		const line = `[${wallClock()}] [${category}] ${message}`;
		this.fileLogger.logRaw(line);
		console.log(`[CubicJ] ${line}`);
	}

	async stop(): Promise<void> {
		await this.fileLogger.stop();
	}
}
