export interface FileAdapter {
	read(path: string): Promise<string | null>;
	write(path: string, content: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	remove(path: string): Promise<void>;
	list(path: string): Promise<string[]>;
}
