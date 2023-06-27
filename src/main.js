/**
 * Author: Matheus Clemente (https://github.com/mclemente) & 4535992 (https://github.com/p4535992)
 * Software License: MIT
 */

let socket;
Hooks.once("socketlib.ready", () => {
	//@ts-ignore
	socket = socketlib.registerModule("advanced-macros");
	socket.register("executeMacro", async (...inAttributes) => {
		if (!Array.isArray(inAttributes)) {
			throw new Error(`Advanced Macros | inAttributes must be of type Array, found type: ${typeof inAttributes}`);
		}
		let [macroId, args] = inAttributes;
		const macro = game.macros.get(macroId);
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
		"OVERRIDE"
	);
	libWrapper.register(
		"advanced-macros",
		"Macro.prototype.execute",
		async function (wrapped, scope = {}, callFromSocket = false) {
			if (!this.canExecute) {
				return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
			}
			switch (this.type) {
				case "chat":
					return wrapped();
				case "script":
					const runFor = this.getFlag("advanced-macros", "runForSpecificUser");
					if (callFromSocket || !runFor || runFor === "runAsWorldScript" || !canRunAsGM(this)) {
						return wrapped(scope);
					} else if (runFor == "GM") {
						if (game.users.activeGM?.isSelf) {
							return wrapped(scope);
						}
						return socket.executeAsGM("executeMacro", this.id, scope);
					} else if (runFor == "runForEveryone") {
						return socket.executeForEveryone("executeMacro", this.id, scope);
					} else if (runFor == "runForEveryoneElse") {
						return socket.executeForOthers("executeMacro", this.id, scope);
					} else if (runFor) {
						return socket.executeForUsers("executeMacro", [runFor], this.id, scope);
					}
			}
		},
		"MIXED"
	);
	libWrapper.register(
		"advanced-macros",
		"TextEditor._createContentLink",
		(match, { async = false, relativeTo } = {}) => {
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
			const scope = {};
			if (type === "UUID") {
				if (target.split(".")[0] == "Macro" && /\s/g.test(match[4])) {
					const macro = game.macros.get(target.split(".")[1]);
					let params = match[4].replace(`${macro.name} `, "").split(" ");
					for (const p of params) {
						const kv = p.split("=");
						if (kv.length === 2) {
							scope[kv[0]] = kv[1];
						}
					}
					data.name = macro.name;
				}
				data.dataset = { id: null, uuid: target, scope };
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
							dataset: { scope: Object.keys(data.dataset.scope), ...data.dataset.scope },
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
		},
		"OVERRIDE"
	);
	libWrapper.register(
		"advanced-macros",
		"TextEditor._onClickContentLink",
		async (event) => {
			event.preventDefault();
			const doc = await fromUuid(event.currentTarget.dataset.uuid);
			if (event.currentTarget.dataset.type !== "Macro") return doc?._onClickDocumentLink(event);
			else {
				const scope = {};
				if (event.currentTarget.dataset.scope) {
					const params = event.currentTarget.dataset.scope.split(",");
					for (const p of params) {
						scope[p] =
							event.currentTarget.dataset[p] === "true" ||
							(event.currentTarget.dataset[p] === "false" ? false : event.currentTarget.dataset[p]);
					}
				}
				// TODO set up logic check when to callFromSocket or not
				return doc?.execute(scope);
			}
		},
		"OVERRIDE"
	);
	Macro.metadata.preserveOnImport.push("author");
});

Hooks.on("chatMessage", (chatLog, message, chatData) => {
	// Ignore messages starting with "<" or matching a macro pattern.
	if (message.trim().startsWith("<") || message.match(chatLog.constructor.MESSAGE_PATTERNS["macro"])) return true;
	if (!game.settings.get("advanced-macros", "legacySlashCommand")) return;
	// If the message contains an invalid command and starts with a "/", try to process macros in it.
	let [command, match] = chatLog.constructor.parse(message);
	if (command === "invalid" && message.trim().startsWith("/")) {
		const messageArray = message.slice(1).split(" ");
		let macroName = messageArray[0];
		let macro = game.macros.getName(macroName);
		messageArray.slice(1).forEach((token) => {
			if (!macro) {
				macroName += ` ${token}`;
				macro = game.macros.getName(macroName);
			}
			if (macro) return;
		});
		if (macro) {
			[command, match] = chatLog.constructor.parse(`/macro ${message.slice(1)}`);
			chatLog._processMacroCommand(command, match);
			return false;
		}
	}
	return true;
});

Hooks.once("ready", () => {
	Hooks.on("renderMacroConfig", (obj, html, data) => {
		if (!game.user.isGM) return;
		const macro = obj.object;
		// A re-render will cause the html object to be the internal element, which is the form itself.
		const form = html.find("form").length === 0 ? html : html.find("form");
		const typeGroup = form.find("select[name=type]").parent(".form-group");
		const runForSpecificUser = macro.getFlag("advanced-macros", "runForSpecificUser");
		const options = [
			{ value: "", label: game.i18n.localize("advanced-macros.MACROS.none") },
			{
				value: "GM",
				label: game.i18n.localize("USER.RoleGamemaster"),
				selected: runForSpecificUser === "GM",
			},
			...["runForEveryone", "runForEveryoneElse", "runAsWorldScript"].map((run) => ({
				value: run,
				label: game.i18n.localize(`advanced-macros.MACROS.${run}`),
				selected: runForSpecificUser === run,
			})),
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
	});
	const worldScripts = game.macros.contents.filter(
		(macro) => getProperty(macro, `flags.advanced-macros.runForSpecificUser`) === "runAsWorldScript"
	);
	for (const macro of worldScripts) {
		try {
			macro.execute();
			console.debug(`Advanced Macros | Executed "${macro.name}" world script (ID: ${macro.id})`);
		} catch (err) {
			console.error(`Advanced Macros | Error executing "${macro.name}" world script (ID: ${macro.id})`, err);
		}
	}
});

/**
 * Defines whether a Macro can run as a GM.
 * For security reasons, only macros authored by the GM, and not editable by users
 * can be run as GM
 */
function canRunAsGM(macro) {
	const author = game.users.get(macro.author?.id);
	const permissions = deepClone(macro.ownership) || {};

	for (const user of game.users.contents) {
		if (user.isGM || user.id === author?.id) delete permissions[user.id];
	}
	const highestPermissionLevel = Math.max(...Object.values(permissions));
	return author?.isGM && highestPermissionLevel < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}
