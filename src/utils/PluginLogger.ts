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
	private categories: Set<string>;

	constructor(adapter: Adapter, filePath: string, categories: string[] = []) {
		this.fileLogger = new FileLogger(adapter, filePath, 2000, 2000);
		this.categories = new Set(categories);
	}

	start(): void {
		this.fileLogger.start();
		this.logRaw(`=== session ${new Date().toISOString()} ===`);
	}

	log(category: string, message: string): void {
		if (this.categories.size > 0 && !this.categories.has(category)) return;
		const line = `[${wallClock()}] [${category}] ${message}`;
		this.fileLogger.logRaw(line);
	}

	logRaw(message: string): void {
		this.fileLogger.logRaw(message);
	}

	async stop(): Promise<void> {
		await this.fileLogger.stop();
	}
}
