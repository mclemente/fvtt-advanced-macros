import { libWrapper } from "./module/shim.js";

class FurnaceMacros {
	constructor() {
		let helpers = {
			macro: (name, ...args) => {
				const macro = game.macros.contents.find((macro) => macro.name === name);
				if (!macro) return "";
				const result = macro.renderContent(...args);
				if (typeof result !== "string") return "";
				return result;
			},
		};
		Handlebars.registerHelper(helpers);

		this._GMElectionIds = [];
		this._requestResolvers = {};
		Hooks.on("init", this.init.bind(this));
		Hooks.once("ready", this.ready.bind(this));
		Hooks.on("renderMacroConfig", this.renderMacroConfig.bind(this));
		delete ChatLog.MESSAGE_PATTERNS["invalid"];
	}

	init() {
		game.furnaceMacros = this;
		game.macros = this;

		Hooks.on("preCreateChatMessage", this.preCreateChatMessage.bind(this));
		// Macro.prototype.renderContent = this.renderMacro;
		Macro.prototype.renderContent = this.renderMacro;
		Object.defineProperty(Macro.prototype, "canRunAsGM", { get: this.canRunAsGM });
		libWrapper.register(
			"advanced-macros",
			"Macro.prototype.canExecute",
			function () {
				if (!this.testUserPermission(game.user, "LIMITED")) return false;
				if (this.type === "script") {
					if (this.getFlag("advanced-macros", "runAsGM") && this.canRunAsGM && !game.user.isGM) return game.furnaceMacros.executeMacroAsGM(this, context);
					return game.user.can("MACRO_SCRIPT");
				}
				return true;
			},
			"OVERRIDE"
		);
		libWrapper.register(
			"advanced-macros",
			"Macro.prototype._executeScript",
			function (context) {
				// Add variables to the evaluation scope
				const speaker = ChatMessage.implementation.getSpeaker();
				const character = game.user.character;
				let actor = context.actor || game.actors.get(context.speaker.actor);
				let token = context.token || (canvas.ready ? canvas.tokens.get(context.speaker.token) : null);

				// Attempt script execution
				const asyncFunction = this.command.includes("await") ? "async" : "";
				const body = `return (${asyncFunction} () => {
					${this.command}
				})()`;
				// eslint-disable-next-line no-new-func
				const fn = Function("{speaker, actor, token, character, args, scene}={}", body);
				try {
					if (asyncFunction) fn.call(this, context);
					else return fn.call(this, context);
				} catch (err) {
					ui.notifications.error("There was an error in your macro syntax. See the console (F12) for details");
				}
			},
			"OVERRIDE"
		);
		libWrapper.register("advanced-macros", "Macro.prototype.execute", this.executeMacro, "OVERRIDE");
	}
	ready() {
		game.socket.on("module.advanced-macros", this._onSocketMessage.bind(this));
	}
	uniqueID() {
		return `${game.user.id}-${Date.now()}-${randomID()}`;
	}
	async _onSocketMessage(message) {
		// To run macros as GM, first we elect a GM executor.
		// this is to prevent running the macro more than once
		// if there are more than one logged in GM or a single GM
		// is logged in more than once.
		// The election is based on each GM sending a random ID, then the user
		// choosing one (the first it receives) and asking that specific GM session
		// to execute the macro
		if (message.action === "ElectGMExecutor") {
			if (!game.user.isGM) return;
			const electionId = this.uniqueID();
			this._GMElectionIds.push(electionId);
			game.socket.emit("module.advanced-macros", {
				action: "GMElectionID",
				requestId: message.requestId,
				electionId,
			});
			// Delete the election ID in case we were not chosen after 10s, to avoid a memleak
			setTimeout(() => {
				this._GMElectionIds = this._GMElectionIds.filter((id) => id !== electionId);
			}, 10000);
		} else if (message.action === "GMElectionID") {
			const resolve = this._requestResolvers[message.requestId];
			if (resolve) {
				delete this._requestResolvers[message.requestId];
				resolve(message.electionId);
			}
		} else if (message.action === "GMExecuteMacro") {
			if (!game.user.isGM) return;
			if (!this._GMElectionIds.includes(message.electionId)) return;
			this._GMElectionIds = this._GMElectionIds.filter((id) => id !== message.electionId);

			const macro = game.macros.get(message.macroId);
			const user = game.users.get(message.userId);
			const sendResponse = (error = null, result = null) =>
				game.socket.emit("module.advanced-macros", {
					action: "GMMacroResult",
					requestId: message.requestId,
					error,
				});
			if (!macro) return sendResponse(game.i18n.localize("FURNACE.MACROS.responses.NoMacro"));
			if (!user) return sendResponse(game.i18n.localize("FURNACE.MACROS.responses.NoUser"));
			if (macro.type !== "script") return sendResponse(game.i18n.localize("FURNACE.MACROS.responses.NotScript"));
			if (!user.can("MACRO_SCRIPT")) return sendResponse(game.i18n.localize("FURNACE.MACROS.responses.NoMacroPermission"));
			if (!macro.getFlag("advanced-macros", "runAsGM") || !macro.canRunAsGM) return sendResponse(game.i18n.localize("FURNACE.MACROS.responses.NoRunAsGM"));

			const context = FurnaceMacros.getTemplateContext(message.args, message.context);
			try {
				// const result = macro.callScriptFunction(context);
				const result = macro.execute(context);
				return sendResponse(null, result);
			} catch (err) {
				console.error(err);
				return sendResponse(game.i18n.format("FURNACE.MACROS.responses.ExternalMacroSyntaxError", { GM: game.user.name }));
			}
		} else if (message.action === "GMMacroResult") {
			const resolve = this._requestResolvers[message.requestId];
			if (resolve) {
				delete this._requestResolvers[message.requestId];
				resolve({ result: message.result, error: message.error });
			}
		}
	}

	static getTemplateContext(args = null, remoteContext = null) {
		const context = {
			game: game,
			ui: ui,
			canvas: canvas,
			scene: canvas.scene,
			args,
			speaker: {},
			actor: null,
			token: null,
			character: null,
		};
		if (remoteContext) {
			// Set the context based on the remote context, and make sure data is valid and the remote
			// has a token/actor selected.
			context.speaker = remoteContext.speaker || {};
			if (remoteContext.actorId) context.actor = game.actors.get(remoteContext.actorId) || null;
			if (remoteContext.sceneId) context.scene = game.scenes.get(remoteContext.sceneId) || canvas.scene;
			if (remoteContext.tokenId) {
				if (canvas.scene.id === context.scene.id) {
					context.token = canvas.tokens.get(remoteContext.tokenId) || null;
				} else {
					const tokenData = context.scene.getEmbeddedEntity("Token", remoteContext.tokenId);
					if (tokenData) context.token = new Token(tokenData, context.scene);
				}
			}
			if (remoteContext.characterId) context.character = game.actors.get(remoteContext.characterId) || null;
		} else {
			context.speaker = ChatMessage.getSpeaker();
			if (args && Object.prototype.toString.call(args[0]) === "[object Object") {
				context.actor = args[0].data.root.actor;
				context.token = args[0].data.root.token;
			} else {
				context.actor = game.actors.get(context.speaker.actor);
				if (canvas.scene) context.token = canvas.tokens?.get(context.speaker.token);
			}
			context.character = game.user.character;
		}
		return context;
	}

	/**
	 * Defines whether a Macro can run as a GM.
	 * For security reasons, only macros authored by the GM, and not editable by users
	 * can be run as GM
	 */
	canRunAsGM() {
		const author = game.users.get(this.author?.id);
		const permissions = duplicate(this.permission) || {};
		game.users.contents.forEach((user) => {
			if (user.id === this.author?.id || user.isGM) delete permissions[user.id];
		});
		return author && author.isGM && Object.values(permissions).every((p) => p < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
	}

	renderMacro(...args) {
		const context = FurnaceMacros.getTemplateContext(args);
		if (this.type === "chat") {
			if (this.command.includes("{{")) {
				const compiled = Handlebars.compile(this.command);
				return compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
			} else {
				return this.command;
			}
		}
		if (this.type === "script") {
			if (!game.user.can("MACRO_SCRIPT")) return ui.notifications.warn(game.i18n.localize("FURNACE.MACROS.responses.NoMacroPermission"));
			if (this.getFlag("advanced-macros", "runAsGM") && this.canRunAsGM && !game.user.isGM) return game.furnaceMacros.executeMacroAsGM(this, context);
			// return this.callScriptFunction(context);
			return this._executeScript(context);
		}
	}
	async executeMacro(...args) {
		// Chat macros
		if (this.type === "chat") {
			try {
				const content = this.renderContent(...args);
				ui.chat.processMessage(content).catch((err) => {
					ui.notifications.error(game.i18n.localize("FURNACE.MACROS.responses.SyntaxError"));
					console.error(err);
				});
			} catch (err) {
				ui.notifications.error(game.i18n.localize("FURNACE.MACROS.responses.MacroSyntaxError"));
				console.error(err);
			}
		}

		// Script macros
		else if (this.type === "script") {
			try {
				return await this.renderContent(...args);
			} catch (err) {
				ui.notifications.error(game.i18n.localize("FURNACE.MACROS.responses.MacroSyntaxError"));
				console.error(err);
			}
		}
	}

	// request execution of macro as a GM
	async executeMacroAsGM(macro, context) {
		const activeGMs = game.users.contents.filter((u) => u.isGM && u.active);
		if (activeGMs.length === 0) {
			ui.notifications.error(game.i18n.format("FURNACE.MACROS.responses.NoConnectedGM", { macro: macro.name }));
			return "";
		}
		// Elect a GM to run the Macro
		const electionResponse = await new Promise((resolve, reject) => {
			const requestId = this.uniqueID();
			this._requestResolvers[requestId] = resolve;
			game.socket.emit("module.advanced-macros", {
				action: "ElectGMExecutor",
				requestId,
			});
			setTimeout(() => {
				delete this._requestResolvers[requestId];
				reject(new Error(game.i18n.localize("FURNACE.MACROS.responses.TimeoutGM")));
			}, 5000);
		});
		// Execute the macro in the first elected GM's
		const executeResponse = await new Promise((resolve, reject) => {
			const requestId = this.uniqueID();
			this._requestResolvers[requestId] = resolve;
			game.socket.emit("module.advanced-macros", {
				action: "GMExecuteMacro",
				requestId,
				electionId: electionResponse,
				userId: game.user.id,
				macroId: macro.id,
				args: context.args,
				context: {
					speaker: context.speaker,
					actorId: context.actor ? context.actor.id : null,
					sceneId: context.scene ? context.scene.id : null,
					tokenId: context.token ? context.token.id : null,
					characterId: context.character ? context.character.id : null,
				},
			});
			setTimeout(() => {
				delete this._requestResolvers[requestId];
				reject(new Error(game.i18n.localize("FURNACE.MACROS.responses.TimeoutWaitGM")));
			}, 5000);
		});
		if (executeResponse.error) throw new Error(executeResponse.error);
		else return executeResponse.result;
	}

	preCreateChatMessage(chatMessage, data, options, userId) {
		if (data.content === undefined || data.content.length == 0) return;

		let content = data.content || "";
		let tokenizer = null;
		let hasMacros = false;
		if (!chatMessage.isRoll) {
			if (content.includes("{{")) {
				const context = FurnaceMacros.getTemplateContext();
				const compiled = Handlebars.compile(content);
				content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
				chatMessage.updateSource({ content: content });
				if (content.trim().length === 0) return false;
			}
			if (content.trim().startsWith("<")) return true;
			content = content.replace(/\n/gm, "<br>");
			content = content.split("<br>").map((line) => {
				if (line.startsWith("/")) {
					// Ensure tokenizer, but don't consider dash as a token delimiter
					if (!tokenizer)
						tokenizer = new TokenizeThis({
							shouldTokenize: ["(", ")", ",", "*", "/", "%", "+", "=", "!=", "!", "<", ">", "<=", ">=", "^"],
						});
					let command = null;
					let args = [];
					tokenizer.tokenize(line.substr(1), (token) => {
						if (!command) command = token;
						else args.push(token);
					});
					const macro = game.macros.contents.find((macro) => macro.name === command);
					if (macro) {
						hasMacros = true;
						const result = macro.renderContent(...args);
						if (typeof result !== "string") return "";
						return result.trim();
					}
				}
				return line.trim();
			});

			if (hasMacros) {
				mergeObject(data, { "flags.advanced-macros.macros.template": data.content });
				// If non-async, then still, recreate it so we can do recursive macro calls
				data.content = content.join("\n").trim().replace(/\n/gm, "<br>");
				if (data.content !== undefined && data.content.length > 0) {
					data.content = data.content.trim();

					let [command, match] = ChatLog.parse(data.content);
					// Special handlers for no command
					if (command === "invalid") throw new Error(game.i18n.format("CHAT.InvalidCommand", { command: match[1] }));
					else if (command === "none") command = data.speaker?.token ? "ic" : "ooc";

					// Process message data based on the identified command type
					const createOptions = {};
					switch (command) {
						case "whisper":
						case "reply":
						case "gm":
						case "players":
							ChatLog.prototype._processWhisperCommand(command, match, data, createOptions);
							break;
						case "ic":
						case "emote":
						case "ooc":
							ChatLog.prototype._processChatCommand(command, match, data, createOptions);
							break;
					}
					ChatMessage.create(data, createOptions);
				}
				return false;
			}
			data.content = content.join("\n").trim().replace(/\n/gm, "<br>");
		}
		return true;
	}

	renderMacroConfig(obj, html, data) {
		let form = html.find("form");
		// A re-render will cause the html object to be the internal element, which is the form itself.
		if (form.length === 0) form = html;
		// Add runAsGM checkbox
		if (game.user.isGM) {
			const runAsGM = obj.object.getFlag("advanced-macros", "runAsGM");
			const canRunAsGM = obj.object.canRunAsGM;
			const typeGroup = form.find("select[name=type]").parent(".form-group");
			const gmDiv = $(`
				<div class="form-group" title="${game.i18n.localize("FURNACE.MACROS.runAsGMTooltip")}"> 
					<label class="form-group">
						<span>${game.i18n.localize("FURNACE.MACROS.runAsGM")}</span>
						<input type="checkbox" name="flags.advanced-macros.runAsGM" data-dtype="Boolean" ${runAsGM ? "checked" : ""} ${!canRunAsGM ? "disabled" : ""}/>
					</label>
				</div>
			`);
			gmDiv.insertAfter(typeGroup);
		}
	}
}

new FurnaceMacros();

Hooks.on("hotbarDrop", (hotbar, data, slot) => {
	if (data.type !== "RollTable") return true;
	const table = game.tables.get(data.uuid.split(".")[1]);
	if (!table) return true;
	// Make a new macro for the RollTable
	Macro.create({
		name: game.i18n.format("FURNACE.ROLLTABLE.macroName", { document: game.i18n.localize(`DOCUMENT.${data.type}`), name: table.name }),
		type: "script",
		scope: "global",
		command: `game.tables.get("${table.id}").draw();`,
		img: "icons/svg/d20-grey.svg",
	}).then((macro) => {
		game.user.assignHotbarMacro(macro, slot);
	});
	return false;
});
