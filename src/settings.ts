import { App, PluginSettingTab, Setting } from "obsidian";
import type BookReaderPlugin from "./main";

export interface BookReaderPluginSettings {
	readingFlow: "paginated" | "scrolled-doc";
	fontSizePercent: number;
	lastLocationByFile: Record<string, string>;
}

export const DEFAULT_SETTINGS: BookReaderPluginSettings = {
	readingFlow: "paginated",
	fontSizePercent: 100,
	lastLocationByFile: {},
};

export class BookReaderSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: BookReaderPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Reader").setHeading();

		new Setting(containerEl)
			.setName("Reading flow")
			.setDesc("Choose paginated or scrolling mode for epub rendering.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("paginated", "Paginated")
					.addOption("scrolled-doc", "Scrolling")
					.setValue(this.plugin.settings.readingFlow)
					.onChange(async (value: "paginated" | "scrolled-doc") => {
						this.plugin.settings.readingFlow = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Font size")
			.setDesc("Adjust the default font size inside the epub reader.")
			.addSlider((slider) =>
				slider
					.setLimits(80, 160, 10)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.fontSizePercent)
					.onChange(async (value) => {
						this.plugin.settings.fontSizePercent = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
