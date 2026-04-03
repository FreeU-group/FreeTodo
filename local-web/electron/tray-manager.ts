/**
 * System Tray / Menu Bar Manager
 * Manages the application tray icon and context menu
 * Provides extensible menu structure for future features
 */

import path from "node:path";
import { app, Menu, type MenuItemConstructorOptions, nativeImage, Tray } from "electron";
import type { IslandWindowManager } from "./island-window-manager";
import { logger } from "./logger";

/**
 * TrayManager class
 * Manages system tray icon and menu for cross-platform support
 */
export class TrayManager {
	/** Tray instance */
	private tray: Tray | null = null;
	/** Island window manager reference */
	private islandWindowManager: IslandWindowManager;
	/** Context menu instance */
	private contextMenu: Menu | null = null;

	/**
	 * Constructor
	 * @param islandWindowManager Island window manager instance
	 */
	constructor(islandWindowManager: IslandWindowManager) {
		this.islandWindowManager = islandWindowManager;

		// Set up visibility change callback to update tray icon
		this.islandWindowManager.setVisibilityChangeCallback((visible) => {
			this.onIslandVisibilityChange(visible);
		});
	}

	/**
	 * Create and initialize the tray icon
	 */
	create(): void {
		if (this.tray) {
			logger.warn("Tray already exists");
			return;
		}

		const iconPath = this.getTrayIconPath();
		if (!iconPath) {
			logger.error("Failed to get tray icon path");
			return;
		}

		try {
			// Create tray icon
			const icon = nativeImage.createFromPath(iconPath);

			// Resize for proper display (16x16 on macOS, 16x16 on Windows)
			const resizedIcon = icon.resize({ width: 16, height: 16 });

			this.tray = new Tray(resizedIcon);

			// Set tooltip
			this.tray.setToolTip("Free Todo - Dynamic Island");

			// Build context menu
			this.buildContextMenu();

			// Set up event handlers
			this.setupEventHandlers();

			logger.info("Tray icon created successfully");
		} catch (error) {
			logger.error(`Failed to create tray icon: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Get the appropriate tray icon path based on platform
	 */
	private getTrayIconPath(): string | null {
		try {
			// Use the notification avatar as tray icon
			if (app.isPackaged) {
				// Production: use packaged public folder
				const resourcesPath = process.resourcesPath;
				return path.join(resourcesPath, "standalone", "public", "hi_dog2.png");
			}

			// Development: use public folder icons
			return path.join(__dirname, "..", "public", "hi_dog2.png");
		} catch (error) {
			logger.error(`Error getting tray icon path: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	/**
	 * Build the context menu
	 */
	private buildContextMenu(): void {
		const menuTemplate: MenuItemConstructorOptions[] = [
			{
				label: "Show/Hide Island",
				accelerator: "CommandOrControl+Shift+I",
				click: () => this.toggleIsland(),
			},
			{ type: "separator" },
			{
				label: "Recording",
				submenu: [
					{
						label: "Start Recording",
						enabled: false, // Future feature
						click: () => this.startRecording(),
					},
					{
						label: "Stop Recording",
						enabled: false, // Future feature
						click: () => this.stopRecording(),
					},
				],
			},
			{
				label: "Screenshots",
				submenu: [
					{
						label: "Take Screenshot",
						enabled: false, // Future feature
						click: () => this.takeScreenshot(),
					},
					{
						label: "View Recent...",
						enabled: false, // Future feature
						click: () => this.viewScreenshots(),
					},
				],
			},
			{ type: "separator" },
			{
				label: "Preferences...",
				click: () => this.openPreferences(),
			},
			{ type: "separator" },
			{
				label: "Quit Free Todo",
				role: "quit",
			},
		];

		this.contextMenu = Menu.buildFromTemplate(menuTemplate);
		this.tray?.setContextMenu(this.contextMenu);
	}

	/**
	 * Setup tray event handlers
	 */
	private setupEventHandlers(): void {
		if (!this.tray) return;

		// Left-click: toggle island visibility
		this.tray.on("click", () => {
			this.toggleIsland();
		});

		// Right-click: show context menu (handled automatically on Windows)
		// On macOS, we need to handle it explicitly
		if (process.platform === "darwin") {
			this.tray.on("right-click", () => {
				if (this.contextMenu && this.tray) {
					this.tray.popUpContextMenu(this.contextMenu);
				}
			});
		}
	}

	/**
	 * Toggle island window visibility
	 */
	private toggleIsland(): void {
		try {
			this.islandWindowManager.toggle();
			this.updateTrayIcon();
		} catch (error) {
			logger.error(`Failed to toggle island: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Update tray icon appearance based on island visibility
	 * Future: could show different icon states
	 */
	private updateTrayIcon(): void {
		if (!this.tray) return;

		const isVisible = this.islandWindowManager.isVisible();

		// Update tooltip to reflect current state
		this.tray.setToolTip(
			isVisible
				? "Free Todo - Dynamic Island (Visible)"
				: "Free Todo - Dynamic Island (Hidden)"
		);

		// Future: could change icon appearance here
		// For example, use a dimmed icon when hidden
	}

	/**
	 * Handle island visibility change events
	 * @param visible Current visibility state
	 */
	private onIslandVisibilityChange(visible: boolean): void {
		this.updateTrayIcon();
		logger.info(`Tray updated: Island is now ${visible ? "visible" : "hidden"}`);
	}

	/**
	 * Show the island window
	 */
	show(): void {
		this.islandWindowManager.show();
		this.updateTrayIcon();
	}

	/**
	 * Hide the island window
	 */
	hide(): void {
		this.islandWindowManager.hide();
		this.updateTrayIcon();
	}

	/**
	 * Update the context menu
	 * Call this when menu state needs to change
	 */
	updateMenu(): void {
		this.buildContextMenu();
	}

	/**
	 * Destroy the tray icon
	 */
	destroy(): void {
		if (this.tray) {
			this.tray.destroy();
			this.tray = null;
			logger.info("Tray icon destroyed");
		}
	}

	/**
	 * Get tray instance
	 */
	getTray(): Tray | null {
		return this.tray;
	}

	// ========== Future Feature Placeholders ==========

	/**
	 * Start recording (future feature)
	 */
	private startRecording(): void {
		logger.info("Start recording - feature not yet implemented");
		// TODO: Implement recording functionality
	}

	/**
	 * Stop recording (future feature)
	 */
	private stopRecording(): void {
		logger.info("Stop recording - feature not yet implemented");
		// TODO: Implement recording functionality
	}

	/**
	 * Take screenshot (future feature)
	 */
	private takeScreenshot(): void {
		logger.info("Take screenshot - feature not yet implemented");
		// TODO: Implement screenshot functionality
	}

	/**
	 * View screenshots (future feature)
	 */
	private viewScreenshots(): void {
		logger.info("View screenshots - feature not yet implemented");
		// TODO: Implement screenshot viewer
	}

	/**
	 * Open preferences window (future feature)
	 */
	private openPreferences(): void {
		logger.info("Open preferences - feature not yet implemented");
		// TODO: Implement preferences window
		// For now, just show the island
		this.show();
	}
}
