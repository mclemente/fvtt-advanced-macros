import { setApi } from "../main.js";
import API from "./api.js";
import CONSTANTS from "./constants.js";
import {
	canRunAsGM,
	chatMessage,
	executeMacro,
	executeScript,
	preCreateChatMessage,
	renderMacro,
	renderMacroConfig,
	_createContentLink,
	_onClickContentLink,
	error,
	renderMacroExplicit,
	info,
} from "./lib/lib.js";
import { advancedMacroSocket, registerSocket } from "./socket.js";

export const initHooks = async () => {
	let helpers = {
		macro: (name, ...args) => {
			const macro = game.macros.contents.find((macro) => macro.name === name);
			if (!macro) {
				return "";
			}
			// TODO set up logic check when to callFromSocket or not
			const result = macro.renderContent(args);
			if (typeof result !== "string") {
				return "";
			}
			return result;
		},
	};
	Handlebars.registerHelper(helpers);

	// new HandlebarHelpers().registerHelpers();
	Hooks.once("socketlib.ready", registerSocket);
	registerSocket();

	Hooks.on("chatMessage", chatMessage);
	Hooks.on("preCreateChatMessage", preCreateChatMessage);
	// TODO We really need this ?
	Macro.prototype.renderContent = renderMacro;
	// Object.defineProperty(Macro.prototype, "canRunAsGM", { get: this.canRunAsGM });

	libWrapper.register(
		"advanced-macros",
		"Macro.prototype.canExecute",
		function (wrapped, ...args) {
			if (!this.testUserPermission(game.user, "LIMITED")) {
				return false;
			}
			if (this.type === "script") {
				return (
					(this.getFlag("advanced-macros", "runAsGM") && canRunAsGM(this) && !game.user.isGM) ||
					game.user.can("MACRO_SCRIPT")
				);
			}
			return true;
		},
		"OVERRIDE",
	);

	libWrapper.register("advanced-macros", "Macro.prototype._executeScript", executeScript, "OVERRIDE");

	libWrapper.register("advanced-macros", "Macro.prototype.execute", executeMacro, "OVERRIDE");

	if (game.system.id === "pf2e") {
		libWrapper.register(
			"advanced-macros",
			"CONFIG.Macro.documentClass.prototype._executeScript",
			executeScript,
			"OVERRIDE",
		);
	}

	libWrapper.register("advanced-macros", "TextEditor._createContentLink", _createContentLink, "OVERRIDE");
	libWrapper.register("advanced-macros", "TextEditor._onClickContentLink", _onClickContentLink, "OVERRIDE");
};
export const setupHooks = () => {
	setApi(API);
};
export const readyHooks = async () => {
	Hooks.on("renderMacroConfig", (obj, html, data) => {
		renderMacroConfig(obj, html, data);
	});

	if (!game.settings.get("advanced-macros", "disableDropHotbarRollTableBehavior")) {
		Hooks.on("hotbarDrop", (hotbar, data, slot) => {
			if (data.type !== "RollTable") {
				return true;
			}
			const table = game.tables.get(data.uuid.split(".")[1]);
			if (!table) {
				return true;
			}
			// Make a new macro for the RollTable
			Macro.create({
				name: game.i18n.format("advanced-macros.ROLLTABLE.macroName", {
					document: game.i18n.localize(`DOCUMENT.${data.type}`),
					name: table.name,
				}),
				type: "script",
				scope: "global",
				command: `game.tables.get("${table.id}").draw();`,
				img: "icons/svg/d20-grey.svg",
			}).then((macro) => {
				game.user.assignHotbarMacro(macro, slot);
			});
			return false;
		});
	}

	if(game.user.isGM){
		const macrosToRunAsWorldScript = game.macros.contents.filter((macro) => getProperty(macro, `flags.advanced-macros.runAsWorldScript`) === true); 
		for(const macroWorldScript of macrosToRunAsWorldScript) {
			try{
				info(`Excecute world script : ` + macroWorldScript.name);
				renderMacroExplicit(macroWorldScript);
			}catch(err){
				error(`Error on world script : ` + macroWorldScript.name);
				error(err);
			}
		}
	}
};
// ==========================================
