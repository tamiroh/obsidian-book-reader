import { App, FuzzySuggestModal, TFile } from "obsidian";
import type BookReaderPlugin from "./main";
import { EPUB_VIEW_TYPE, showMissingEpubNotice } from "./main";

export async function openEpubInReader(app: App, file: TFile): Promise<void> {
	const leaf = app.workspace.getLeaf(true);
	await leaf.setViewState({
		type: EPUB_VIEW_TYPE,
		active: true,
		state: {
			file: file.path,
		},
	});
	await app.workspace.revealLeaf(leaf);
}

export async function openEpubFilePicker(plugin: BookReaderPlugin): Promise<void> {
	const files = plugin.getEpubFiles();
	if (files.length === 0) {
		showMissingEpubNotice();
		return;
	}

	new EpubFileSuggestModal(plugin.app, files).open();
}

class EpubFileSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly files: TFile[],
	) {
		super(app);
		this.setPlaceholder("Select an epub file");
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		void openEpubInReader(this.app, file);
	}
}
