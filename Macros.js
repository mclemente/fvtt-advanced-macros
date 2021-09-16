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
		// On 0.6.5, unknown commands throw an error which breaks posting macros from chat box
		const parse = FurnacePatching.patchFunction(ChatLog.parse, 24, `"invalid": /^(\\/[^\\s]+)/, // Any other message starting with a slash command is invalid`, "");
		if (parse) ChatLog.parse = parse;
	}

	init() {
		game.furnaceMacros = this;
		game.macros = this;

		game.settings.register("advanced-macros", "highlight", {
			name: game.i18n.localize("FURNACE.MACROS.highlight.name"),
			hint: game.i18n.localize("FURNACE.MACROS.highlight.hint"),
			scope: "client",
			config: true,
			type: Boolean,
			default: true,
		});

		Hooks.on("preCreateChatMessage", this.preCreateChatMessage.bind(this));
		FurnacePatching.replaceMethod(Macro, "execute", this.executeMacro);
		Macro.prototype.renderContent = this.renderMacro;
		Macro.prototype.callScriptFunction = this.callScriptMacroFunction;
		Object.defineProperty(Macro.prototype, "canRunAsGM", { get: this.canRunAsGM });
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
			if (!macro) return sendResponse("Cannot find macro");
			if (!user) return sendResponse("Invalid user");
			if (macro.data.type !== "script") return sendResponse("Invalid macro type");
			if (!user.can("MACRO_SCRIPT")) return sendResponse(`You are not allowed to use JavaScript macros.`);
			if (!macro.getFlag("advanced-macros", "runAsGM") || !macro.canRunAsGM) return sendResponse(`You are not authorized to run this macro as the GM.`);

			const context = FurnaceMacros.getTemplateContext(message.args, message.context);
			try {
				const result = macro.callScriptFunction(context);
				return sendResponse(null, result);
			} catch (err) {
				console.error(err);
				return sendResponse(`There was an error in your macro syntax. See the console (F12) of the GM '${game.user.name}' for details`);
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
			context.actor = args && typeof args[0] === "object" ? args[0].actor : game.actors.get(context.speaker.actor);
			context.token = args && typeof args[0] === "object" ? args[0].token : canvas.tokens?.get(context.speaker.token);
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
		const author = game.users.get(this.data.author);
		const permissions = duplicate(this.data.permission) || {};
		game.users.contents.forEach((user) => {
			if (user.id === this.data.author || user.isGM) delete permissions[user.id];
		});
		return author && author.isGM && Object.values(permissions).every((p) => p < CONST.ENTITY_PERMISSIONS.OWNER);
	}

	callScriptMacroFunction(context) {
		const asyncFunction = this.data.command.includes("await") ? "async" : "";
		return new Function(`"use strict";
			return (${asyncFunction} function ({speaker, actor, token, character, args, scene}={}) {
				${this.data.command}
				});`)().call(this, context);
	}

	renderMacro(...args) {
		const context = FurnaceMacros.getTemplateContext(args);
		if (this.data.type === "chat") {
			if (this.data.command.includes("{{")) {
				const compiled = Handlebars.compile(this.data.command);
				return compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
			} else {
				return this.data.command;
			}
		}
		if (this.data.type === "script") {
			if (!game.user.can("MACRO_SCRIPT")) return ui.notifications.warn(`You are not allowed to use JavaScript macros.`);
			if (this.getFlag("advanced-macros", "runAsGM") && this.canRunAsGM && !game.user.isGM) return game.furnaceMacros.executeMacroAsGM(this, context);
			return this.callScriptFunction(context);
		}
	}
	async executeMacro(...args) {
		// Chat macros
		if (this.data.type === "chat") {
			try {
				const content = this.renderContent(...args);
				ui.chat.processMessage(content).catch((err) => {
					ui.notifications.error("There was an error in your chat message syntax.");
					console.error(err);
				});
			} catch (err) {
				ui.notifications.error(`There was an error in your macro syntax. See the console (F12) for details`);
				console.error(err);
			}
		}

		// Script macros
		else if (this.data.type === "script") {
			try {
				return await this.renderContent(...args);
			} catch (err) {
				ui.notifications.error(`There was an error in your macro syntax. See the console (F12) for details`);
				console.error(err);
			}
		}
	}

	// request execution of macro as a GM
	async executeMacroAsGM(macro, context) {
		const activeGMs = game.users.contents.filter((u) => u.isGM && u.active);
		if (activeGMs.length === 0) {
			ui.notifications.error(`There are no connected GMs to run the macro ${macro.name} in the GM context.`);
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
				reject(new Error("Timed out waiting to elect a GM to execute the macro"));
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
				reject(new Error("Timed out waiting for the GM to execute the macro"));
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
				chatMessage.data.update({ content: content });
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
					else if (command === "none") command = data.speaker.token ? "ic" : "ooc";

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

	_highlightMacroCode(form, textarea, code) {
		const type = form.find("select[name=type]").val();
		let content = textarea.val();
		// Add an empty space if the last character is a newline because otherwise it won't let scrollTop reach
		// so we get a one line diff between the text area and <pre> when the last line is empty.
		if (content.substr(-1) === "\n") content += " ";
		code.removeClass("javascript handlebars hljs").addClass(type === "script" ? "javascript" : "handlebars");
		code.text(content);
		hljs.highlightBlock(code[0]);
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
				<div class="furnace-macro-run-as-gm form-group"> 
					<label class="form-group">
						<span>${game.i18n.localize("FURNACE.MACROS.runAsGM")}</span>
						<input type="checkbox" name="flags.advanced-macros.runAsGM" data-dtype="Boolean" ${runAsGM ? "checked" : ""} ${!canRunAsGM ? "disabled" : ""}/>
					</label>
				</div>
			`);
			gmDiv.insertAfter(typeGroup);
			const tooltip = $(`
			<span class="tooltip">${game.i18n.localize("FURNACE.MACROS.runAsGMTooltip")}</span>`);
			gmDiv.hover((event) => {
				if (event.type === "mouseenter") gmDiv.append(tooltip);
				else tooltip.remove();
			});
		}

		if (!!game.settings.get("advanced-macros", "highlight")) {
			// Add syntax highlighting
			const textarea = form.find("textarea");
			const div = $(`
			<div class="furnace-macro-command form-group">
				<pre><code class="furnace-macro-syntax-highlight"></code></pre>
				<div class="furnace-macro-expand"><i class="fas fa-expand-alt"></i></div>
			</div>
			`);
			const code = div.find("code");
			div.insertBefore(textarea);
			div.prepend(textarea);
			const refreshHighlight = this._highlightMacroCode.bind(this, form, textarea, code);
			textarea.on("input", refreshHighlight);
			textarea.on("scroll", (ev) => code.parent().scrollTop(textarea.scrollTop()));
			form.find("select[name=type]").on("change", refreshHighlight);
			div.find(".furnace-macro-expand").on("click", (ev) => div.toggleClass("fullscreen"));
			refreshHighlight();
		}
	}
}

new FurnaceMacros();

Hooks.on("hotbarDrop", (hotbar, data, slot) => {
	if (data.type !== "RollTable") return true;
	const table = game.tables.get(data.id);
	if (!table) return true;
	// Make a new macro for the RollTable
	Macro.create({
		name: game.i18n.format("FURNACE.ROLLTABLE.macroName", { tableName: table.name }),
		type: "script",
		scope: "global",
		command: `game.tables.get("${table.id}").draw();`,
		img: "icons/svg/d20-grey.svg",
	}).then((macro) => {
		game.user.assignHotbarMacro(macro, slot);
	});
	return false;
});
