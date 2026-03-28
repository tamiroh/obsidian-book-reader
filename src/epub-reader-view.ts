import ePub, { Book, NavItem, Rendition } from "epubjs";
import {
	ItemView,
	Notice,
	setIcon,
	TFile,
	type ViewStateResult,
	type WorkspaceLeaf,
} from "obsidian";
import type BookReaderPlugin from "./main";
import { EPUB_VIEW_TYPE } from "./main";

interface TocOption {
	href: string;
	label: string;
}

interface EpubReaderViewState {
	file?: string;
	location?: string | null;
}

export class EpubReaderView extends ItemView {
	navigation = true;

	private readonly plugin: BookReaderPlugin;
	private book: Book | null = null;
	private rendition: Rendition | null = null;
	private file: TFile | null = null;
	private currentLocation: string | null = null;
	private toc: TocOption[] = [];
	private saveTimer: number | null = null;

	private headerEl!: HTMLElement;
	private titleEl!: HTMLElement;
	private locationEl!: HTMLElement;
	private chapterSelectEl!: HTMLSelectElement;
	private viewerEl!: HTMLElement;
	private emptyStateEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: BookReaderPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return EPUB_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Epub reader";
	}

	getIcon(): string {
		return "book-open";
	}

	getState(): Record<string, unknown> {
		return {
			file: this.file?.path,
			location: this.currentLocation,
		};
	}

	async setState(
		state: unknown,
		_result: ViewStateResult,
	): Promise<void> {
		const viewState = state as EpubReaderViewState;
		if (!viewState.file) {
			this.renderEmptyState("Select an EPUB file to begin reading.");
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(viewState.file);
		if (!(file instanceof TFile)) {
			this.renderEmptyState("This EPUB file could not be found.");
			return;
		}

		const nextLocation = viewState.location ?? this.plugin.getSavedLocation(file);
		if (this.file?.path === file.path && this.rendition) {
			if (nextLocation && nextLocation !== this.currentLocation) {
				this.currentLocation = nextLocation;
				await this.rendition.display(nextLocation);
			}
			return;
		}

		await this.openFile(file, nextLocation);
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("book-reader-view");

		this.headerEl = this.contentEl.createDiv({
			cls: "book-reader__header",
		});

		const titleGroupEl = this.headerEl.createDiv({
			cls: "book-reader__title-group",
		});
		this.titleEl = titleGroupEl.createEl("h2", {
			text: "Epub reader",
			cls: "book-reader__title",
		});
		this.locationEl = titleGroupEl.createDiv({
			text: "No book opened",
			cls: "book-reader__location",
		});

		const controlsEl = this.headerEl.createDiv({
			cls: "book-reader__controls",
		});

		this.createButton(controlsEl, "chevron-left", "Previous section", async () => {
			await this.rendition?.prev();
		});

		this.chapterSelectEl = controlsEl.createEl("select", {
			cls: "book-reader__chapter-select",
		});
		this.chapterSelectEl.addEventListener("change", () => {
			const href = this.chapterSelectEl.value;
			if (!href || !this.rendition) {
				return;
			}

			void this.rendition.display(href);
		});

		this.createButton(controlsEl, "chevron-right", "Next section", async () => {
			await this.rendition?.next();
		});

		this.viewerEl = this.contentEl.createDiv({
			cls: "book-reader__viewer",
		});

		this.emptyStateEl = this.viewerEl.createDiv({
			text: "Select an EPUB file to begin reading.",
			cls: "book-reader__empty",
		});
	}

	async onClose(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}

		await this.persistCurrentLocation();
		this.destroyReader();
	}

	private createButton(
		parent: HTMLElement,
		icon: string,
		ariaLabel: string,
		onClick: () => void | Promise<void>,
	): void {
		const button = parent.createEl("button", {
			cls: "book-reader__button",
		});
		button.type = "button";
		button.ariaLabel = ariaLabel;
		setIcon(button, icon);
		button.addEventListener("click", () => {
			void onClick();
		});
	}

	private async openFile(file: TFile, location: string | null): Promise<void> {
		this.destroyReader();
		this.file = file;
		this.currentLocation = location;
		this.titleEl.setText(file.basename);
		this.locationEl.setText("Loading epub...");
		this.viewerEl.empty();

		try {
			const binary = await this.app.vault.readBinary(file);
			const book = ePub(binary);
			await book.ready;

			this.book = book;
			this.rendition = book.renderTo(this.viewerEl, {
				width: "100%",
				height: "100%",
				flow: this.plugin.settings.readingFlow,
				manager: this.plugin.settings.readingFlow === "scrolled-doc" ? "continuous" : "default",
				spread: "none",
				allowScriptedContent: false,
			});

			this.rendition.themes.fontSize(`${this.plugin.settings.fontSizePercent}%`);
			this.rendition.on("relocated", (event: { start?: { cfi?: string; href?: string } }) => {
				this.handleRelocated(event);
			});

			const navigation = await book.loaded.navigation;
			this.toc = flattenToc(navigation.toc);
			this.renderChapterOptions();

			await this.rendition.display(location ?? undefined);
			this.titleEl.setText(book.packaging.metadata.title || file.basename);
			this.locationEl.setText(file.path);
		} catch (error) {
			console.error(error);
			this.renderEmptyState("Failed to open this EPUB file.");
			new Notice("Failed to open epub file.");
		}
	}

	private handleRelocated(event: { start?: { cfi?: string; href?: string } }): void {
		this.currentLocation = event.start?.cfi ?? this.currentLocation;

		if (event.start?.href) {
			this.chapterSelectEl.value = event.start.href;
			this.locationEl.setText(event.start.href);
		}

		if (this.file && this.currentLocation) {
			if (this.saveTimer !== null) {
				window.clearTimeout(this.saveTimer);
			}

			this.saveTimer = window.setTimeout(() => {
				void this.persistCurrentLocation();
			}, 400);
		}
	}

	private renderChapterOptions(): void {
		this.chapterSelectEl.empty();

		if (this.toc.length === 0) {
			const option = this.chapterSelectEl.createEl("option", {
				text: "Table of contents unavailable",
			});
			option.value = "";
			return;
		}

		for (const chapter of this.toc) {
			const option = this.chapterSelectEl.createEl("option", {
				text: chapter.label,
			});
			option.value = chapter.href;
		}
	}

	private renderEmptyState(message: string): void {
		this.destroyReader();
		this.viewerEl.empty();
		this.emptyStateEl = this.viewerEl.createDiv({
			text: message,
			cls: "book-reader__empty",
		});
		this.locationEl.setText(message);
	}

	private async persistCurrentLocation(): Promise<void> {
		if (!this.file || !this.currentLocation) {
			return;
		}

		await this.plugin.saveReaderLocation(this.file, this.currentLocation);
	}

	private destroyReader(): void {
		if (this.rendition) {
			this.rendition.destroy();
			this.rendition = null;
		}

		if (this.book) {
			this.book.destroy();
			this.book = null;
		}
	}
}

function flattenToc(items: NavItem[], depth = 0): TocOption[] {
	const flattened: TocOption[] = [];

	for (const item of items) {
		flattened.push({
			href: item.href,
			label: `${"  ".repeat(depth)}${item.label}`,
		});

		if (item.subitems?.length) {
			flattened.push(...flattenToc(item.subitems, depth + 1));
		}
	}

	return flattened;
}
