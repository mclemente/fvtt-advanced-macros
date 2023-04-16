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
			let macro;
			const macroName = match[2];
			if (Number.isNumeric(macroName)) {
				const macroID = game.user.hotbar[macroName];
				macro = game.macros.get(macroID);
			}
			let args = [];
			if (!macro) {
				const macroArray = match[2].split(" ");
				let macroName = "";
				for (const namePart of macroArray) {
					macroName += namePart;
					macro = game.macros.getName(macroName);
					if (macro) {
						args = macroArray.slice(macroArray.indexOf(namePart) + 1);
						break;
					} else macroName += " ";
				}
			}
			macro?.execute({ ...args });
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
