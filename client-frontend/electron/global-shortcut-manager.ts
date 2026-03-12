/**
 * Global Keyboard Shortcuts Manager
 * Centralized management for all global keyboard shortcuts
 * Supports user-customizable shortcuts (future enhancement)
 */

import { app, globalShortcut } from "electron";
import type { IslandWindowManager } from "./island-window-manager";
import { logger } from "./logger";

/**
 * Shortcut configuration interface
 */
interface ShortcutConfig {
	/** Keyboard accelerator string (e.g., "CommandOrControl+Shift+I") */
	accelerator: string;
	/** Human-readable description */
	description: string;
	/** Handler function */
	handler: () => void;
}

/**
 * GlobalShortcutManager class
 * Manages all global keyboard shortcuts for the application
 */
export class GlobalShortcutManager {
	/** Island window manager reference */
	private islandWindowManager: IslandWindowManager;
	/** Map of registered shortcuts: name -> config */
	private shortcuts: Map<string, ShortcutConfig> = new Map();
	/** Track which shortcuts are successfully registered */
	private registeredAccelerators: Set<string> = new Set();

	/**
	 * Default shortcut configurations
	 * Can be overridden by user preferences in the future
	 */
	private readonly defaultShortcuts = {
		toggleIsland: {
			accelerator: "CommandOrControl+Shift+I",
			description: "Toggle Island window visibility",
		},
		// Future shortcuts can be added here:
		// startRecording: {
		//   accelerator: "CommandOrControl+Shift+R",
		//   description: "Start/stop recording",
		// },
		// takeScreenshot: {
		//   accelerator: "CommandOrControl+Shift+S",
		//   description: "Take screenshot",
		// },
	};

	/**
	 * Constructor
	 * @param islandWindowManager Island window manager instance
	 */
	constructor(islandWindowManager: IslandWindowManager) {
		this.islandWindowManager = islandWindowManager;
		this.setupCleanup();
	}

	/**
	 * Register all default shortcuts
	 */
	registerDefaults(): void {
		logger.info("Registering default global shortcuts...");

		// Register toggle island shortcut
		this.register(
			"toggleIsland",
			this.defaultShortcuts.toggleIsland.accelerator,
			this.defaultShortcuts.toggleIsland.description,
			() => {
				this.islandWindowManager.toggle();
				logger.info("Island toggled via global shortcut");
			},
		);

		// Future: register additional shortcuts here

		// Log registration summary
		logger.info(
			`Global shortcuts registered: ${this.registeredAccelerators.size}/${this.shortcuts.size}`,
		);
	}

	/**
	 * Register a global shortcut
	 * @param name Unique name for the shortcut
	 * @param accelerator Keyboard accelerator (e.g., "Ctrl+Shift+X")
	 * @param description Human-readable description
	 * @param handler Function to execute when shortcut is triggered
	 * @returns true if registered successfully, false otherwise
	 */
	register(
		name: string,
		accelerator: string,
		description: string,
		handler: () => void,
	): boolean {
		// Store the shortcut configuration
		const config: ShortcutConfig = {
			accelerator,
			description,
			handler,
		};
		this.shortcuts.set(name, config);

		// Attempt to register with Electron
		try {
			const registered = globalShortcut.register(accelerator, () => {
				logger.info(`Global shortcut triggered: ${name} (${accelerator})`);
				handler();
			});

			if (registered) {
				this.registeredAccelerators.add(accelerator);
				logger.info(`Global shortcut registered: ${name} (${accelerator}) - ${description}`);
				return true;
			}

			logger.warn(
				`Failed to register global shortcut: ${name} (${accelerator}) - may be in use by another application`,
			);
			return false;
		} catch (error) {
			logger.error(
				`Error registering global shortcut ${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return false;
		}
	}

	/**
	 * Unregister a specific shortcut
	 * @param name Name of the shortcut to unregister
	 */
	unregister(name: string): void {
		const config = this.shortcuts.get(name);
		if (!config) {
			logger.warn(`Shortcut not found: ${name}`);
			return;
		}

		try {
			globalShortcut.unregister(config.accelerator);
			this.registeredAccelerators.delete(config.accelerator);
			this.shortcuts.delete(name);
			logger.info(`Global shortcut unregistered: ${name} (${config.accelerator})`);
		} catch (error) {
			logger.error(
				`Error unregistering global shortcut ${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Unregister all shortcuts
	 */
	unregisterAll(): void {
		try {
			globalShortcut.unregisterAll();
			this.registeredAccelerators.clear();
			this.shortcuts.clear();
			logger.info("All global shortcuts unregistered");
		} catch (error) {
			logger.error(
				`Error unregistering all shortcuts: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if a specific accelerator is registered
	 * @param accelerator Keyboard accelerator to check
	 * @returns true if registered, false otherwise
	 */
	isRegistered(accelerator: string): boolean {
		return globalShortcut.isRegistered(accelerator);
	}

	/**
	 * Get all registered shortcuts
	 * @returns Map of shortcut name to configuration
	 */
	getShortcuts(): Map<string, ShortcutConfig> {
		return new Map(this.shortcuts);
	}

	/**
	 * Update a shortcut's accelerator (future feature)
	 * Useful for user-customizable shortcuts
	 * @param name Name of the shortcut
	 * @param newAccelerator New keyboard accelerator
	 * @returns true if updated successfully, false otherwise
	 */
	updateShortcut(name: string, newAccelerator: string): boolean {
		const config = this.shortcuts.get(name);
		if (!config) {
			logger.warn(`Shortcut not found: ${name}`);
			return false;
		}

		// Unregister old shortcut
		try {
			globalShortcut.unregister(config.accelerator);
			this.registeredAccelerators.delete(config.accelerator);
		} catch (error) {
			logger.error(
				`Error unregistering old shortcut: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Register with new accelerator
		const registered = this.register(
			name,
			newAccelerator,
			config.description,
			config.handler,
		);

		if (registered) {
			logger.info(`Shortcut ${name} updated to ${newAccelerator}`);
		} else {
			// Rollback: re-register with old accelerator
			logger.warn(`Failed to update shortcut ${name}, rolling back to ${config.accelerator}`);
			this.register(name, config.accelerator, config.description, config.handler);
		}

		return registered;
	}

	/**
	 * Setup cleanup handlers to unregister shortcuts on app quit
	 */
	private setupCleanup(): void {
		// Unregister all shortcuts before app quits
		app.on("will-quit", () => {
			logger.info("App quitting, cleaning up global shortcuts...");
			this.unregisterAll();
		});

		// Also clean up on process termination signals
		const cleanup = () => {
			this.unregisterAll();
		};

		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);
	}

	/**
	 * Future: Load custom shortcuts from user preferences
	 * This would read from a config file or electron-store
	 */
	// loadCustomShortcuts(): void {
	//   // TODO: Implement loading from persistent storage
	//   logger.info("Loading custom shortcuts from preferences...");
	// }

	/**
	 * Future: Save custom shortcuts to user preferences
	 * This would write to a config file or electron-store
	 */
	// saveCustomShortcuts(): void {
	//   // TODO: Implement saving to persistent storage
	//   logger.info("Saving custom shortcuts to preferences...");
	// }
}
