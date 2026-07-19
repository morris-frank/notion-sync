import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type NotionSyncPlugin from "./main";

export class NotionSyncSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: NotionSyncPlugin
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Notion Sync" });
    containerEl.createEl("p", {
      text: "Notes only enter sync when their opt-in frontmatter property is true. The integration needs read, insert, and update content access to the target database."
    });

    new Setting(containerEl)
      .setName("Notion integration token")
      .setDesc("Stored in this vault's plugin data. Keep the vault private.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("ntn_…")
          .setValue(this.plugin.settings.notionToken)
          .onChange(async (value) => {
            this.plugin.settings.notionToken = value.trim();
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName("Data source ID")
      .setDesc("The fixed Notion data source that receives every opted-in note.")
      .addText((text) =>
        text.setValue(this.plugin.settings.dataSourceId).onChange(async (value) => {
          this.plugin.settings.dataSourceId = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Opt-in property")
      .setDesc("Boolean frontmatter property. It must be exactly true.")
      .addText((text) =>
        text.setValue(this.plugin.settings.optInProperty).onChange(async (value) => {
          this.plugin.settings.optInProperty = value.trim() || "notion_sync";
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Notion title property")
      .setDesc("Name of the title column in the data source.")
      .addText((text) =>
        text.setValue(this.plugin.settings.titleProperty).onChange(async (value) => {
          this.plugin.settings.titleProperty = value.trim() || "Name";
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Allowed frontmatter keys")
      .setDesc("Comma-separated global allowlist. Sync metadata is always excluded.")
      .addTextArea((text) => {
        text.inputEl.addClass("notion-sync-setting");
        text.setValue(this.plugin.settings.frontmatterKeys.join(", ")).onChange(async (value) => {
          this.plugin.settings.frontmatterKeys = value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl)
      .setName("Property name map")
      .setDesc('JSON from frontmatter keys to Notion property names, for example {"tags":"Tags"}.')
      .addTextArea((text) => {
        text.inputEl.addClass("notion-sync-setting");
        text.setValue(JSON.stringify(this.plugin.settings.propertyMap, null, 2)).onChange(async (value) => {
          try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              this.plugin.settings.propertyMap = parsed as Record<string, string>;
              text.inputEl.removeClass("notion-sync-status-error");
              await this.plugin.saveSettings();
            }
          } catch {
            text.inputEl.addClass("notion-sync-status-error");
          }
        });
      });
    new Setting(containerEl)
      .setName("Poll interval")
      .setDesc("Minutes between remote checks. Set to 0 to disable polling.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.pollIntervalMinutes)).onChange(async (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed >= 0) {
            this.plugin.settings.pollIntervalMinutes = parsed;
            await this.plugin.saveSettings();
          }
        })
      );
    new Setting(containerEl)
      .setName("Sync after save")
      .setDesc("Debounce local edits, then run the same two-way change decision.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.pushOnSave).onChange(async (value) => {
          this.plugin.settings.pushOnSave = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl).setName("Test connection").addButton((button) =>
      button.setButtonText("Test").onClick(async () => {
        button.setDisabled(true).setButtonText("Testing…");
        try {
          await this.plugin.testConnection();
          button.setButtonText("Connected");
        } catch {
          button.setButtonText("Failed");
        } finally {
          window.setTimeout(() => button.setDisabled(false).setButtonText("Test"), 2000);
        }
      })
    );
  }
}
