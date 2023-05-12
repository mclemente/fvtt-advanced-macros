/**
 * Author: Matheus Clemente (https://github.com/mclemente) & 4535992 (https://github.com/p4535992)
 * Software License: MIT
 */
import {
	_createContentLink,
	_onClickContentLink,
	canRunAsGM,
	chatMessage,
	executeMacro,
	renderMacroConfig,
} from "./scripts/logic.js";
import { error } from "./scripts/utils.js";

export let socket;
Hooks.once("socketlib.ready", () => {
	//@ts-ignore
	socket = socketlib.registerModule("advanced-macros");
	socket.register("executeMacro", async (...inAttributes) => {
		if (!Array.isArray(inAttributes)) throw error("executeMacroArr | inAttributes must be of type array");
		let [macro, args] = inAttributes;
		macro = game.macros.getName(macro.name);
		return macro?.execute(args, true);
	});
});

Hooks.once("init", () => {
	game.settings.register("advanced-macros", "legacySlashCommand", {
		name: `advanced-macros.setting.legacySlashCommand.name`,
		hint: `advanced-macros.setting.legacySlashCommand.hint`,
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});

	libWrapper.register(
		"advanced-macros",
		"Macro.prototype.canExecute",
		function () {
			if (!this.testUserPermission(game.user, "LIMITED")) return false;
			return this.type === "script"
				? game.user.can("MACRO_SCRIPT") || (canRunAsGM(this) && !game.user.isGM)
				: true;
		},
		"OVERRIDE",
	);

	libWrapper.register("advanced-macros", "Macro.prototype.execute", executeMacro, "MIXED");

	libWrapper.register(
		"advanced-macros",
		"ChatLog.prototype._processMacroCommand",
		function (command, match) {
			let [macroName, ...params] = match[2].split(" ");
			let expandName = true;
			const scope = {};

			// Get the target macro by number or by name
			let macro;
			if (Number.isNumeric(macroName)) {
				const macroID = game.user.hotbar[macroName];
				macro = game.macros.get(macroID);
			}
			if (!macro) macro = game.macros.getName(macroName);

			for (const p of params) {
				const kv = p.split("=");
				if (kv.length === 2) {
					scope[kv[0]] = kv[1];
					expandName = false;
				} else if (macro) {
					scope[kv[0]] = true;
					expandName = false;
				} else if (expandName) {
					macroName += ` ${p}`; // Macro names may contain spaces
					macro = game.macros.getName(macroName);
				}
			}
			if (!macro) {
				macroName = macroName.trimEnd(); // Eliminate trailing spaces
				macro = game.macros.getName(macroName);
			}

			if (!macro)
				throw new Error(`Requested Macro "${macroName}" was not found as a named macro or hotbar position`);

			// Execute the Macro with provided scope
			return macro.execute(scope);
		},
		"OVERRIDE",
	);
	libWrapper.register("advanced-macros", "TextEditor._createContentLink", _createContentLink, "OVERRIDE");
	libWrapper.register("advanced-macros", "TextEditor._onClickContentLink", _onClickContentLink, "OVERRIDE");
});

Hooks.on("chatMessage", chatMessage);

Hooks.once("ready", () => {
	if (!game.modules.get("lib-wrapper")?.active && game.user?.isGM) {
		let word = "install and activate";
		if (game.modules.get("lib-wrapper")) word = "activate";
		throw error(`Requires the 'libWrapper' module. Please ${word} it.`);
	}
	Hooks.on("renderMacroConfig", (obj, html, data) => {
		renderMacroConfig(obj, html, data);
	});
});
