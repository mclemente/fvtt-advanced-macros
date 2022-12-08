import CONSTANTS from "../constants.js";
import { advancedMacroSocket } from "../socket.js";
import TokenizeThis from "./TokenizeThis.js";

// ================================
// Logger utility
// ================================
// export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export function debug(msg, args = "") {
	if (game.settings.get(CONSTANTS.MODULE_NAME, "debug")) {
		console.log(`DEBUG | ${CONSTANTS.MODULE_NAME} | ${msg}`, args);
	}
	return msg;
}
export function log(message) {
	message = `${CONSTANTS.MODULE_NAME} | ${message}`;
	console.log(message.replace("<br>", "\n"));
	return message;
}
export function notify(message) {
	message = `${CONSTANTS.MODULE_NAME} | ${message}`;
	ui.notifications?.notify(message);
	console.log(message.replace("<br>", "\n"));
	return message;
}
export function info(info, notify = false) {
	info = `${CONSTANTS.MODULE_NAME} | ${info}`;
	if (notify) ui.notifications?.info(info);
	console.log(info.replace("<br>", "\n"));
	return info;
}
export function warn(warning, notify = false) {
	warning = `${CONSTANTS.MODULE_NAME} | ${warning}`;
	if (notify) ui.notifications?.warn(warning);
	console.warn(warning.replace("<br>", "\n"));
	return warning;
}
export function error(error, notify = true) {
	error = `${CONSTANTS.MODULE_NAME} | ${error}`;
	if (notify) ui.notifications?.error(error);
	return new Error(error.replace("<br>", "\n"));
}
export function timelog(message) {
	warn(Date.now(), message);
}
export const i18n = (key) => {
	return game.i18n.localize(key)?.trim();
};
export const i18nFormat = (key, data = {}) => {
	return game.i18n.format(key, data)?.trim();
};
// export const setDebugLevel = (debugText: string): void => {
//   debugEnabled = { none: 0, warn: 1, debug: 2, all: 3 }[debugText] || 0;
//   // 0 = none, warnings = 1, debug = 2, all = 3
//   if (debugEnabled >= 3) CONFIG.debug.hooks = true;
// };
export function dialogWarning(message, icon = "fas fa-exclamation-triangle") {
	return `<p class="${CONSTANTS.MODULE_NAME}-dialog">
        <i style="font-size:3rem;" class="${icon}"></i><br><br>
        <strong style="font-size:1.2rem;">${CONSTANTS.MODULE_NAME}</strong>
        <br><br>${message}
    </p>`;
}
// =========================================================================================

export async function executeMacro(...args) {
	const macro = this;
	const user = game.user;

	// DO NOTHING THIS CHECK AVOID SOCKET LOOP , but socketlib should manage ?
	// if (
	// (
	// 	macro.getFlag("advanced-macros", "runForSpecificUser")) &&
	// 	!callFromSocket
	// ) {
	await _executeMacroInternal(macro, user, args, macro, false);
	// }
}

export async function _executeMacroInternal(macro, user, args, context, callFromSocket) {
	//const macro = this;
	// let a = await Macro.implementation.fromDropData({ type: "Macro", uuid: `Macro.${macroId}` });
	// const macro = game.macros.get(macroId) ?? context;
	// const macro = await Macro.implementation.fromDropData({ type: "Macro", uuid: `Macro.${macroId}` });
	// const user = game.users.get(userId);

	if (!(macro instanceof Macro)) macro = new Macro(macro);
	if (!(user instanceof User)) user = new User(user);

	if (callFromSocket) {
		context = getTemplateContext(args, context);
	}

	if (!macro) {
		throw error(game.i18n.localize("advanced-macros.MACROS.responses.NoMacro"), true);
	}
	if (!user) {
		throw error(game.i18n.localize("advanced-macros.MACROS.responses.NoUser"), true);
	}
	// if (macro.type !== "script") {
	// 	throw error(game.i18n.localize("advanced-macros.MACROS.responses.NotScript"), true);
	// }
	// if (!macro.getFlag("advanced-macros", "runAsGM") || !canRunAsGM(macro)) {
	// 	throw error(game.i18n.localize("advanced-macros.MACROS.responses.NoRunAsGM"), true);
	// }
	if (macro.getFlag(CONSTANTS.MODULE_NAME, "runAsGM") && !(game.user.isGM || canRunAsGM(macro))) {
		throw error(game.i18n.localize("advanced-macros.MACROS.responses.NoRunAsGM"), true);
	}

	// Chat macros
	if (macro.type === "chat") {
		try {
			// args.push(callFromSocket);
			const content = macro.renderContent(args, callFromSocket);
			ui.chat.processMessage(content).catch((err) => {
				ui.notifications.error(game.i18n.localize("advanced-macros.MACROS.responses.SyntaxError"), {
					console: false,
				});
				error(err);
			});
		} catch (err) {
			ui.notifications.error(game.i18n.localize("advanced-macros.MACROS.responses.MacroSyntaxError"), {
				console: false,
			});
			error(err);
		}
	}

	// Script macros
	else if (macro.type === "script") {
		if (!user.can("MACRO_SCRIPT")) {
			throw error(game.i18n.localize("advanced-macros.MACROS.responses.NoMacroPermission"), true);
		}
		try {
			// args.push(callFromSocket);
			return macro.renderContent(args, callFromSocket);
		} catch (err) {
			ui.notifications.error(game.i18n.localize("advanced-macros.MACROS.responses.MacroSyntaxError"), {
				console: false,
			});
			error(err);
		}
	}

	// const contextFinal = getTemplateContext(args, context);
	// try {
	// 	// const result = macro.callScriptFunction(context);
	// 	const result = macro._executeScript(contextFinal);
	// 	return result;
	// } catch (err) {
	// 	error(err);
	// 	throw error(
	// 		game.i18n.format("advanced-macros.MACROS.responses.ExternalMacroSyntaxError", { GM: game.user.name }),
	// 		true
	// 	);
	// }
}

export function executeScript(wrapped, ...args) {
	const context = wrapped;
	const macro = this;
	// Add variables to the evaluation scope
	const speaker = ChatMessage.implementation.getSpeaker();
	const character = game.user.character;
	let actor = context.actor || game.actors.get(context.speaker.actor);
	let token = context.token || (canvas.ready ? canvas.tokens.get(context.speaker.token) : null);

	// Attempt script execution
	const asyncFunction = macro.command.includes("await") ? "async" : "";
	const body = `return (${asyncFunction} () => {
	${macro.command}
})()`;
	// eslint-disable-next-line no-new-func
	const fn = Function("{speaker, actor, token, character, args, scene}={}", body);
	// const fn = new Function('speaker', 'actor', 'token', 'character', 'args', 'scene', body);
	try {
		//return fn.call(this, context);
		return fn.call(macro, context);
	} catch (err) {
		// ui.notifications.error("There was an error in your macro syntax. See the console (F12) for details", {
		//     console: false,
		// });
		// console.error("Advanced Macros |", err);
		error("There was an error in your macro syntax. See the console (F12) for details : " + err, true);
	}
	return wrapped(...args);
}

export function getTemplateContext(args = null, remoteContext = null) {
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
		if (remoteContext.characterId) {
			context.character = game.actors.get(remoteContext.characterId) || null;
		}
	} else {
		context.speaker = ChatMessage.getSpeaker();
		if (args && Object.prototype.toString.call(args[0]) === "[object Object") {
			context.actor = args[0].data.root.actor;
			context.token = args[0].data.root.token;
		} else {
			context.actor = game.actors.get(context.speaker.actor);
			if (canvas.scene) {
				context.token = canvas.tokens?.get(context.speaker.token);
			}
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
export function canRunAsGM(macro) {
	const author = game.users.get(macro.author?.id);
	const permissions = duplicate(macro.permission) || {};
	game.users.contents.forEach((user) => {
		if (user.id === macro.author?.id || user.isGM) {
			delete permissions[user.id];
		}
	});
	return author && author.isGM && Object.values(permissions).every((p) => p < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

export function renderMacro(args, callFromSocket = false) {
	const macro = this;
	const context = getTemplateContext(args);
	if (macro.type === "chat") {
		if (macro.command.includes("{{")) {
			const compiled = Handlebars.compile(macro.command);
			return compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
		} else {
			return macro.command;
		}
	}

	const contextForSocket = {
		speaker: context.speaker,
		characterId: context.character?.id,
		actorId: context.actor?.id,
		tokenId: context.token?.id,
	};
	if (macro.type === "script") {
		const runFor = macro.getFlag("advanced-macros", "runForSpecificUser");
		const runAsGM =macro.getFlag("advanced-macros", "runAsGM");
		const canRunAsGM = canRunAsGM(macro);
		if (!game.user.can("MACRO_SCRIPT")) {
			ui.notifications.warn(game.i18n.localize("advanced-macros.MACROS.responses.NoMacroPermission"));
		} else if (runFor == "" &&  runAsGM && canRunAsGM && !callFromSocket) {
			advancedMacroSocket.executeAsGM("executeMacro", macro, game.user, args, contextForSocket, true);
		} else if (runFor == "runForEveryone" && canRunAsGM && !callFromSocket) {
			advancedMacroSocket.executeForEveryone("executeMacro", macro, game.user, args, contextForSocket, true);
		} else if (runFor == "runForEveryoneElse" && canRunAsGM && !callFromSocket) {
			advancedMacroSocket.executeForOthers("executeMacro", macro, game.user, args, contextForSocket, true);
		} else if (macro.getFlag("advanced-macros", "runForSpecificUser") && canRunAsGM && !callFromSocket) {
			advancedMacroSocket.executeForUsers(
				"executeMacro",
				[macro.getFlag("advanced-macros", "runForSpecificUser")],
				macro,
				game.user,
				args,
				contextForSocket,
				true,
			);
		} else {
			// return macro.callScriptFunction(context);
			macro._executeScript(context);
		}
	}
}

// Commented now we use socketLib mich more simple to read and manage ...

// // request execution of macro as a GM
// async executeMacroAsGM(macro, context) {
// 	const activeGMs = game.users.contents.filter((u) => u.isGM && u.active);
// 	if (activeGMs.length === 0) {
// 		ui.notifications.error(game.i18n.format("advanced-macros.MACROS.responses.NoConnectedGM", { macro: macro.name }));
// 		return "";
// 	}
// 	// Elect a GM to run the Macro
// 	const electionResponse = await new Promise((resolve, reject) => {
// 		const requestId = this.uniqueID();
// 		this._requestResolvers[requestId] = resolve;
// 		game.socket.emit("module.advanced-macros", {
// 			action: "ElectGMExecutor",
// 			requestId,
// 		});
// 		setTimeout(() => {
// 			delete this._requestResolvers[requestId];
// 			reject(new Error(game.i18n.localize("advanced-macros.MACROS.responses.TimeoutGM")));
// 		}, 5000);
// 	});
// 	// Execute the macro in the first elected GM's
// 	const executeResponse = await new Promise((resolve, reject) => {
// 		const requestId = this.uniqueID();
// 		this._requestResolvers[requestId] = resolve;
// 		game.socket.emit("module.advanced-macros", {
// 			action: "GMExecuteMacro",
// 			requestId,
// 			electionId: electionResponse,
// 			userId: game.user.id,
// 			macroId: macro.id,
// 			args: context.args,
// 			context: {
// 				speaker: context.speaker,
// 				actorId: context.actor ? context.actor.id : null,
// 				sceneId: context.scene ? context.scene.id : null,
// 				tokenId: context.token ? context.token.id : null,
// 				characterId: context.character ? context.character.id : null,
// 			},
// 		});
// 		setTimeout(() => {
// 			delete this._requestResolvers[requestId];
// 			reject(new Error(game.i18n.localize("advanced-macros.MACROS.responses.TimeoutWaitGM")));
// 		}, 5000);
// 	});
// 	if (executeResponse.error) throw new Error(executeResponse.error);
// 	else return executeResponse.result;
// }

/**
 * Called when a message is created in the Chat Log.
 * Calls ChatMessage.create().
 * @param {*} chatLog
 * @param {*} message
 * @param {*} chatData
 * @returns
 */
export function chatMessage(chatLog, message, chatData) {
	let tokenizer = null;
	let hasMacros = false;
	if (message.includes("{{")) {
		const context = getTemplateContext();
		const compiled = Handlebars.compile(message);
		message = compiled(context, {
			allowProtoMethodsByDefault: true,
			allowProtoPropertiesByDefault: true,
		});
		if (message.trim().length === 0) {
			return false;
		}
		message = message;
	}
	if (message.trim().startsWith("<") || message.match(chatLog.constructor.MESSAGE_PATTERNS["macro"])) {
		return true;
	}
	if (message.match(chatLog.constructor.MESSAGE_PATTERNS["invalid"])) {
		message = message.replace(/\n/gm, "<br>");
		let tokenizer = null;
		message = message.split("<br>").map((lineBase) => {
			if (lineBase.startsWith("/amacro")) {
				// TODO FIND A BETTER WAY
				let line = lineBase.replace("/amacro", "/");
				// Ensure tokenizer, but don't consider dash as a token delimiter
				if (!tokenizer) {
					tokenizer = new TokenizeThis({
						//prettier-ignore
						shouldTokenize: ["(", ")", ",", "*", "/", "%", "+", "=", "!=", "!", "<", ">", "<=", ">=", "^"],
					});
				}
				let command = null;
				let args = [];
				tokenizer.tokenize(line.substr(1), (token) => {
					if (!command) {
						command = token;
					} else {
						args.push(token);
					}
				});
				const macro = game.macros.contents.find((macro) => macro.name === command);
				if (macro) {
					hasMacros = true;
					// TODO set up logic check when to callFromSocket or not
					const result = macro.renderContent(args);
					if (typeof result !== "string") {
						return "";
					}
					return result.trim();
				}
			}
			return lineBase.trim();
		});

		message = message.join("\n").trim().replace(/\n/gm, "<br>");
		if (hasMacros) {
			// If non-async, then still, recreate it so we can do recursive macro calls
			if (message !== undefined && message.length > 0) {
				message = message.trim();

				let [command, match] = ChatLog.parse(message);
				// Process message data based on the identified command type
				const createOptions = {};
				const data = {
					content: message,
					...chatData,
				};
				switch (command) {
					case "whisper":
					case "reply":
					case "gm":
					case "players":
						ChatLog.prototype._processWhisperCommand(command, match, data, createOptions);
						break;
					case "none":
						command = chatData.speaker?.token ? "ic" : "ooc";
					case "ic":
					case "emote":
					case "ooc":
						ChatLog.prototype._processChatCommand(command, match, data, createOptions);
						break;
					case "invalid":
						throw new Error(game.i18n.format("CHAT.InvalidCommand", { command: match[1] }));
				}
				ChatMessage.create(data, createOptions);
			}
			return false;
		}
	}
	return true;
}

/**
 * Called when ChatMessage.create() is called.
 * @param {*} chatMessage
 * @param {*} data
 * @param {*} options
 * @param {*} userId
 * @returns
 */
export function preCreateChatMessage(chatMessage, data, options, userId) {
	if (data.content === undefined || data.content.length == 0) {
		return;
	}
	let content = data.content || "";
	let hasMacros = false;
	if (!chatMessage.isRoll) {
		if (content.includes("{{")) {
			const context = getTemplateContext();
			const compiled = Handlebars.compile(content);
			content = compiled(context, {
				allowProtoMethodsByDefault: true,
				allowProtoPropertiesByDefault: true,
			});
			chatMessage.updateSource({ content: content });
			if (content.trim().length === 0) {
				return false;
			}
		}
		if (content.trim().startsWith("<")) {
			return true;
		}
		content = content.replace(/\n/gm, "<br>");
		let tokenizer = null;
		content = content.split("<br>").map((lineBase) => {
			if (lineBase.startsWith("/amacro")) {
				// TODO FIND A BETTER WAY
				let line = lineBase.replace("/amacro", "/");
				// Ensure tokenizer, but don't consider dash as a token delimiter
				if (!tokenizer) {
					tokenizer = new TokenizeThis({
						//prettier-ignore
						shouldTokenize: ["(", ")", ",", "*", "/", "%", "+", "=", "!=", "!", "<", ">", "<=", ">=", "^"],
					});
				}
				let command = null;
				let args = [];
				tokenizer.tokenize(line.substr(1), (token) => {
					if (!command) {
						command = token;
					} else {
						args.push(token);
					}
				});
				const macro = game.macros.contents.find((macro) => macro.name === command);
				if (macro) {
					hasMacros = true;
					const result = macro.renderContent(args);
					// TODO set up logic check when to callFromSocket or not
					if (typeof result !== "string") {
						return "";
					}
					return result.trim();
				}
			}
			return lineBase.trim();
		});

		if (hasMacros) {
			mergeObject(data, { "flags.advanced-macros.macros.template": data.content });
			// If non-async, then still, recreate it so we can do recursive macro calls
			data.content = content.join("\n").trim().replace(/\n/gm, "<br>");
			if (data.content !== undefined && data.content.length > 0) {
				data.content = data.content.trim();

				let [command, match] = ChatLog.parse(data.content);
				// Special handlers for no command
				if (command === "invalid") {
					throw error(game.i18n.format("CHAT.InvalidCommand", { command: match[1] }));
				} else if (command === "none") {
					command = data.speaker?.token ? "ic" : "ooc";
				}

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

export function renderMacroConfig(obj, html, data) {
	const macro = obj.object;
	let form = html.find("form");
	// A re-render will cause the html object to be the internal element, which is the form itself.
	if (form.length === 0) {
		form = html;
	}
	// Add runAsGM checkbox
	if (game.user.isGM) {
		const runAsGM = macro.getFlag("advanced-macros", "runAsGM");
		const canRunAsGMB = canRunAsGM(macro);
		const typeGroup = form.find("select[name=type]").parent(".form-group");
		const gmDiv = $(`
			<div class="form-group" title="${game.i18n.localize("advanced-macros.MACROS.runAsGMTooltip")}">
				<label class="form-group">
					<span>${game.i18n.localize("advanced-macros.MACROS.runAsGM")}</span>
					<input type="checkbox"
						name="flags.advanced-macros.runAsGM"
						data-dtype="Boolean"
						${runAsGM ? "checked" : ""}
						${!canRunAsGMB ? "disabled" : ""}/>
				</label>
			</div>
		`);
		gmDiv.insertAfter(typeGroup);
		/*
		// Execute for all other clients (ty to socketlib)

		const runForEveryone = macro.getFlag("advanced-macros", "runForEveryone");
		const everyoneDiv = $(`
		<div class="form-group" title="${game.i18n.localize("advanced-macros.MACROS.runForEveryoneTooltip")}">
			<label class="form-group">
				<span>${game.i18n.localize("advanced-macros.MACROS.runForEveryone")}</span>
				<input type="checkbox"
					name="flags.advanced-macros.runForEveryone"
					data-dtype="Boolean"
					${runForEveryone ? "checked" : ""}
					${!canRunAsGMB ? "disabled" : ""}/>
			</label>
		</div>
		`);

		everyoneDiv.insertAfter(gmDiv);
		*/

		// Exceute only for specific one
		const runForSpecificUser = macro.getFlag("advanced-macros", "runForSpecificUser");
		const options = [];
		options.push(`<option value="">${i18n("advanced-macros.MACROS.none")}</option>`);

		if (runForSpecificUser == "runForEveryone") {
			options.push(`<option selected="selected" value="runForEveryone">${game.i18n.localize("advanced-macros.MACROS.runForEveryone")}</option>`);
		} else {
			options.push(`<option value="runForEveryone">${game.i18n.localize("advanced-macros.MACROS.runForEveryone")}</option>`);
		}
		if (runForSpecificUser == "runForEveryoneElse") {
			options.push(`<option selected="selected" value="runForEveryoneElse">${game.i18n.localize("advanced-macros.MACROS.runForEveryoneElse")}</option>`);
		} else {
			options.push(`<option value="runForEveryoneElse">${game.i18n.localize("advanced-macros.MACROS.runForEveryoneElse")}</option>`);
		}
			
		for (const user of game.users) {
			if (runForSpecificUser == user.id) {
				options.push(`<option selected="selected" value="${user.id}">${user.name}</option>`);
			} else {
				options.push(`<option value="${user.id}">${user.name}</option>`);
			}
		}

		const specificOneDiv = $(`
			<div class="form-group" title="${game.i18n.localize("advanced-macros.MACROS.runForSpecificUserTooltip")}">
				<label>${game.i18n.localize("advanced-macros.MACROS.runForSpecificUser")}</label>
				<select name="flags.advanced-macros.runForSpecificUser">
					${options.join("")}
				</select>
			</div>
		`);

		specificOneDiv.insertAfter(gmDiv);
	}
}

export function _createContentLink(match, { async = false, relativeTo } = {}) {
	let [type, target, hash, name] = match.slice(1, 5);

	// Prepare replacement data
	const data = {
		cls: ["content-link"],
		icon: null,
		dataset: {},
		name: name,
	};

	let doc;
	let broken = false;
	let args = [];
	if (type === "UUID") {
		if (target.split(".")[0] == "Macro" && /\s/g.test(target)) {
			args = target.split(" ");
			target = args.shift();
		}
		data.dataset = { id: null, uuid: target, args };
		if (async) doc = fromUuid(target, relativeTo);
		else {
			try {
				doc = fromUuidSync(target, relativeTo);
			} catch (err) {
				[type, ...target] = target.split(".");
				broken = TextEditor._createLegacyContentLink(type, target.join("."), name, data);
			}
		}
	} else broken = TextEditor._createLegacyContentLink(type, target, name, data);

	// Flag a link as broken
	if (broken) {
		data.icon = "fas fa-unlink";
		data.cls.push("broken");
	}

	const constructAnchor = (doc) => {
		if (doc) {
			if (doc.documentName) {
				const attrs = { draggable: true };
				if (hash) attrs["data-hash"] = hash;
				return doc.toAnchor({
					attrs,
					dataset: { args: data.dataset.args },
					classes: data.cls,
					name: data.name,
				});
			}
			data.name = data.name || doc.name || target;
			const type = game.packs.get(doc.pack)?.documentName;
			data.dataset.type = type;
			data.dataset.id = doc._id;
			data.dataset.pack = doc.pack;
			if (hash) data.dataset.hash = hash;
			data.icon = CONFIG[type].sidebarIcon;
		} else if (type === "UUID") {
			// The UUID lookup failed so this is a broken link.
			data.icon = "fas fa-unlink";
			data.cls.push("broken");
		}

		const a = document.createElement("a");
		a.classList.add(...data.cls);
		a.draggable = true;
		for (let [k, v] of Object.entries(data.dataset)) {
			a.dataset[k] = v;
		}
		a.innerHTML = `<i class="${data.icon}"></i>${data.name}`;
		return a;
	};

	if (doc instanceof Promise) return doc.then(constructAnchor);
	return constructAnchor(doc);
}

export async function _onClickContentLink(event) {
	event.preventDefault();
	const doc = await fromUuid(event.currentTarget.dataset.uuid);
	if (event.currentTarget.dataset.type !== "Macro") return doc?._onClickDocumentLink(event);
	else {
		if (event.currentTarget.dataset.args === "") var args = [];
		else if (event.currentTarget.dataset.args) args = event.currentTarget.dataset.args.split(",");
		else {
			console.warn("Advanced Macros | Content Link has no args. Can't ensure macro will run correctly.");
			args = [];
		}
		// TODO set up logic check when to callFromSocket or not
		return doc?.execute(args);
	}
}
