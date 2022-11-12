/**
 * This is your TypeScript entry file for Foundry VTT.
 * Register custom settings, sheets, and constants using the Foundry API.
 * Change this heading to be more descriptive to your module, or remove it.
 * Author: [your name]
 * Content License: [copyright and-or license] If using an existing system
 * 					you may want to put a (link to a) license or copyright
 * 					notice here (e.g. the OGL).
 * Software License: [your license] Put your desired license here, which
 * 					 determines how others may use and modify your module
 */
// Import JavaScript modules
// Import TypeScript modules
import { registerSettings } from "./scripts/settings.js";
import { initHooks, readyHooks, setupHooks } from "./scripts/module.js";
import { error } from "./scripts/lib/lib.js";
import CONSTANTS from "./scripts/constants.js";
/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once("init", async () => {
	// console.log(`${CONSTANTS.MODULE_NAME} | Initializing ${CONSTANTS.MODULE_NAME}`);
	// Register custom module settings
	registerSettings();
	initHooks();
	// Preload Handlebars templates
	//await preloadTemplates();
});
/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once("setup", function () {
	// Do anything after initialization but before ready
	setupHooks();
});
/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once("ready", async () => {
	// Do anything once the module is ready
	if (!game.modules.get("lib-wrapper")?.active && game.user?.isGM) {
		let word = "install and activate";
		if (game.modules.get("lib-wrapper")) word = "activate";
		throw error(`Requires the 'libWrapper' module. Please ${word} it.`);
	}
	if (!game.modules.get("socketlib")?.active && game.user?.isGM) {
		let word = "install and activate";
		if (game.modules.get("socketlib")) word = "activate";
		throw error(`Requires the 'socketlib' module. Please ${word} it.`);
	}
	readyHooks();
});
/* ------------------------------------ */
/* Other Hooks							*/
/* ------------------------------------ */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
	registerPackageDebugFlag(CONSTANTS.MODULE_NAME);
});

/**
 * Initialization helper, to set API.
 * @param api to set to game module.
 */
export function setApi(api) {
	const data = game.modules.get(CONSTANTS.MODULE_NAME);
	data.api = api;
}
/**
 * Returns the set API.
 * @returns Api from games module.
 */
export function getApi() {
	const data = game.modules.get(CONSTANTS.MODULE_NAME);
	return data.api;
}
/**
 * Initialization helper, to set Socket.
 * @param socket to set to game module.
 */
export function setSocket(socket) {
	const data = game.modules.get(CONSTANTS.MODULE_NAME);
	data.socket = socket;
}
/*
 * Returns the set socket.
 * @returns Socket from games module.
 */
export function getSocket() {
	const data = game.modules.get(CONSTANTS.MODULE_NAME);
	return data.socket;
}
