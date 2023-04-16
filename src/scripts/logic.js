import { socket } from "../main.js";
import { error } from "./utils.js";

export async function executeMacro(wrapped, scope, callFromSocket) {
	if (!this.canExecute) {
		return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
	}
	switch (this.type) {
		case "chat":
			return wrapped();
		case "script":
			const runFor = this.getFlag("advanced-macros", "runForSpecificUser");
			if (callFromSocket || !runFor || !canRunAsGM(this)) return wrapped({ ...scope });

			if (runFor == "GM") return socket.executeAsGM("executeMacro", this, scope);
			else if (runFor == "runForEveryone") return socket.executeForEveryone("executeMacro", this, scope);
			else if (runFor == "runForEveryoneElse") return socket.executeForOthers("executeMacro", this, scope);
			else if (this.getFlag("advanced-macros", "runForSpecificUser")) {
				const users = [this.getFlag("advanced-macros", "runForSpecificUser")];
				return socket.executeForUsers("executeMacro", users, this, scope);
			}
	}
}

/**
 * Defines whether a Macro can run as a GM.
 * For security reasons, only macros authored by the GM, and not editable by users
 * can be run as GM
 */
export function canRunAsGM(macro) {
	const author = game.users.get(macro.author?.id);
	const permissions = deepClone(macro.permission) || {};

	for (const user of game.users.contents) {
		if (user.isGM || user.id === author?.id) delete permissions[user.id];
	}
	const highestPermissionLevel = Math.max(...Object.values(permissions));
	return author?.isGM && highestPermissionLevel < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

/**
 * Handles a new message in the chat log.
 * @param {ChatLog} chatLog
 * @param {string} message
 * @param {object} chatData
 * @returns {boolean}
 */
export function chatMessage(chatLog, message, chatData) {
	// Ignore messages starting with "<" or matching a macro pattern.
	if (message.trim().startsWith("<") || message.match(chatLog.constructor.MESSAGE_PATTERNS["macro"])) return true;
	// If the message contains an invalid command, try to process macros in it.
	if (message.match(chatLog.constructor.MESSAGE_PATTERNS["invalid"])) {
		let tokenizer = null;
		if (message.trim().startsWith("/")) {
			// Ensure tokenizer, but don't consider dash as a token delimiter
			if (!tokenizer) {
				tokenizer = new TokenizeThis({
					//prettier-ignore
					shouldTokenize: ["(", ")", ",", "*", "/", "%", "+", "=", "!=", "!", "<", ">", "<=", ">=", "^"],
				});
			}
			let command = null;
			let args = [];
			tokenizer.tokenize(message.substr(1), (token) => {
				if (!command) command = token;
				else args.push(token);
			});
			let macro = game.macros.contents.find((macro) => macro.name === command);
			if (macro) {
				macro.execute({ ...args });
				return false;
			} else {
				let newArgs = deepClone(args);
				for (const arg of args) {
					command += ` ${arg}`;
					macro = game.macros.contents.find((macro) => macro.name === command);
					newArgs.shift();
					if (!macro) continue;
					macro.execute({ ...newArgs });
					return false;
				}
			}
		}
	}
	return true;
}

export function renderMacroConfig(obj, html, data) {
	if (!game.user.isGM) return;
	const macro = obj.object;
	// A re-render will cause the html object to be the internal element, which is the form itself.
	const form = html.find("form").length === 0 ? html : html.find("form");
	const typeGroup = form.find("select[name=type]").parent(".form-group");
	const runForSpecificUser = macro.getFlag("advanced-macros", "runForSpecificUser");
	const options = [
		{ value: "", label: game.i18n.localize("advanced-macros.MACROS.none") },
		{ value: "GM", label: game.i18n.localize("advanced-macros.MACROS.runAsGM") },
		{ value: "runForEveryone", label: game.i18n.localize("advanced-macros.MACROS.runForEveryone") },
		{ value: "runForEveryoneElse", label: game.i18n.localize("advanced-macros.MACROS.runForEveryoneElse") },
		...game.users
			.filter((user) => !user.isGM)
			.map((user) => ({
				value: user.id,
				label: user.name,
				selected: runForSpecificUser === user.id,
			})),
	]; // filter out null values

	const optionElements = options
		.map((option) => {
			const selectedAttr = option.selected ? 'selected="selected"' : "";
			return `<option value="${option.value}" ${selectedAttr}>${option.label}</option>`;
		})
		.join("");

	const specificOneDiv = $(`
		<div class="form-group"
			${macro.type === "chat" ? 'style="display: none"' : ""}
			title="${game.i18n.localize("advanced-macros.MACROS.runForSpecificUserTooltip")}">
			<label>${game.i18n.localize("advanced-macros.MACROS.runForSpecificUser")}</label>
			<select name="flags.advanced-macros.runForSpecificUser" ${canRunAsGM(macro) ? "" : "disabled"}>
				${optionElements}
			</select>
		</div>
	`);

	specificOneDiv.insertAfter(typeGroup);

	const typeSelect = form.find("select[name=type]");
	typeSelect.on("change", (event) => {
		if (event.target.value === "chat") specificOneDiv.hide();
		else specificOneDiv.show();
	});
}

export function _createContentLink(match, { async = false, relativeTo } = {}) {
	let [type, target, hash, name] = match.slice(1, 5);

	// Prepare replacement data
	const data = {
		cls: ["content-link"],
		icon: null,
		dataset: {},
		name,
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
		if (async) doc = fromUuid(target, { relative: relativeTo });
		else {
			try {
				doc = fromUuidSync(target, { relative: relativeTo });
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
