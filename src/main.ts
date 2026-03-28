import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { EpubReaderView } from "./epub-reader-view";
import {
	DEFAULT_SETTINGS,
	type BookReaderPluginSettings,
	BookReaderSettingTab,
} from "./settings";

export const EPUB_VIEW_TYPE = "epub-reader-view";
export const EPUB_FILE_EXTENSION = "epub";

export default class BookReaderPlugin extends Plugin {
	settings: BookReaderPluginSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			EPUB_VIEW_TYPE,
			(leaf) => new EpubReaderView(leaf, this),
		);
		this.registerExtensions([EPUB_FILE_EXTENSION], EPUB_VIEW_TYPE);

		this.addSettingTab(new BookReaderSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace
			.getLeavesOfType(EPUB_VIEW_TYPE)
			.forEach((leaf) => leaf.detach());
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<BookReaderPluginSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			lastLocationByFile: {
				...DEFAULT_SETTINGS.lastLocationByFile,
				...(loaded?.lastLocationByFile ?? {}),
			},
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async saveReaderLocation(file: TFile, location: string | null): Promise<void> {
		if (!location) {
			return;
		}

		this.settings.lastLocationByFile[file.path] = location;
		await this.saveSettings();
	}

	getSavedLocation(file: TFile): string | null {
		return this.settings.lastLocationByFile[file.path] ?? null;
	}

	getEpubFiles(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((file) => file.extension === EPUB_FILE_EXTENSION)
			.sort((left, right) => left.path.localeCompare(right.path));
	}
}

export function isEpubFile(file: TAbstractFile | null): file is TFile {
	return file instanceof TFile && file.extension === EPUB_FILE_EXTENSION;
}

export function showMissingEpubNotice(): void {
	new Notice("No epub files were found in this vault.");
}
