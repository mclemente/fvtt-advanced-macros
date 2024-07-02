/**
 * Author: Matheus Clemente (https://github.com/mclemente) & 4535992 (https://github.com/p4535992)
 * Software License: MIT
 */

let socket;
Hooks.once("socketlib.ready", () => {
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
	class AdvancedMacro extends CONFIG.Macro.documentClass {
		static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
			preserveOnImport: ["_id", "sort", "ownership", "author"]
		}, {inplace: false}));

		canUserExecute(user) {
			if (!this.testUserPermission(user, "LIMITED")) return false;
			return this.type === "script" ? user.can("MACRO_SCRIPT") || (canRunAsGM(this) && !user.isGM) : true;
		}

		async execute(scope = {}, callFromSocket = false) {
			if (!this.canExecute) {
				return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
			}
			switch (this.type) {
				case "chat":
					return super.execute(scope);
				case "script": {
					const runFor = this.getFlag("advanced-macros", "runForSpecificUser");
					if (callFromSocket || !runFor || runFor === "runAsWorldScript" || !canRunAsGM(this)) {
						return super.execute(scope);
					} else if (runFor === "GM") {
						if (game.users.activeGM?.isSelf) return super.execute(scope);
						return socket.executeAsGM("executeMacro", this.id, scope);
					} else if (runFor === "runForEveryone") {
						return socket.executeForEveryone("executeMacro", this.id, scope);
					} else if (runFor === "runForEveryoneElse") {
						return socket.executeForOthers("executeMacro", this.id, scope);
					} else if (runFor) {
						return socket.executeForUsers("executeMacro", [runFor], this.id, scope);
					}
				}
			}
		}
	}

	class AdvancedTextEditor extends TextEditor {
		static async _createContentLink(match, { relativeTo } = {}) {
			const [type, target, hash, name] = match.slice(1, 5);

			// Prepare replacement data
			const data = {
				classes: ["content-link"],
				attrs: { draggable: "true" },
				dataset: { link: "" },
				name
			};

			let doc;
			let broken = false;
			const scope = {};
			if (type === "UUID") {
				if (target.split(".")[0] === "Macro" && /\s/g.test(match[4])) {
					const macro = game.macros.get(target.split(".")[1]);
					const params = match[4].replace(`${macro.name} `, "").split(" ");
					for (const p of params) {
						const kv = p.split("=");
						if (kv.length === 2) {
							scope[kv[0]] = kv[1];
						}
					}
					data.name = macro.name;
				}
				Object.assign(data.dataset, {link: "", uuid: target, scope});
				doc = await fromUuid(target, { relative: relativeTo });
			} else broken = TextEditor._createLegacyContentLink(type, target, name, data);

			if (doc) {
				if ( doc.documentName ) return doc.toAnchor({ name: data.name, dataset: {
					hash,
					scope: Object.keys(data.dataset.scope),
					...data.dataset.scope
				} });
				data.name = data.name || doc.name || target;
				const type = game.packs.get(doc.pack)?.documentName;
				Object.assign(data.dataset, {type, id: doc._id, pack: doc.pack});
				if (hash) data.dataset.hash = hash;
				data.icon = CONFIG[type].sidebarIcon;
			}

			// The UUID lookup failed so this is a broken link.
			else if (type === "UUID") broken = true;

			// Broken links
			if (broken) {
				delete data.dataset.link;
				delete data.attrs.draggable;
				data.icon = "fas fa-unlink";
				data.classes.push("broken");
			}
			return this.createAnchor(data);
		}

		static async _onClickContentLink(event) {
			event.preventDefault();
			const doc = await fromUuid(event.currentTarget.dataset.uuid);
			if (event.currentTarget.dataset.type !== "Macro") return doc?._onClickDocumentLink(event);

			const scope = {};
			if (event.currentTarget.dataset.scope) {
				const params = event.currentTarget.dataset.scope.split(",");
				for (const p of params) {
					scope[p] =
							event.currentTarget.dataset[p] === "true"
							|| (event.currentTarget.dataset[p] === "false" ? false : event.currentTarget.dataset[p]);
				}
			}
			// TODO set up logic check when to callFromSocket or not
			return doc?.execute(scope);
		}
	}

	CONFIG.Macro.documentClass = AdvancedMacro;
	TextEditor = AdvancedTextEditor;
	game.settings.register("advanced-macros", "legacySlashCommand", {
		name: "advanced-macros.setting.legacySlashCommand.name",
		hint: "advanced-macros.setting.legacySlashCommand.hint",
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});
});

Hooks.on("chatMessage", (chatLog, message, chatData) => {
	// Ignore messages starting with "<" or matching a macro pattern.
	if (message.trim().startsWith("<") || message.match(chatLog.constructor.MESSAGE_PATTERNS.macro)) return true;
	if (!game.settings.get("advanced-macros", "legacySlashCommand")) return;
	// If the message contains an invalid command and starts with a "/", try to process macros in it.
	let [command, match] = chatLog.constructor.parse(message);
	if (command === "invalid" && message.trim().startsWith("/")) {
		const messageArray = message.slice(1).split(" ");
		let macroName = messageArray[0];
		let macro = game.macros.getName(macroName);
		for (const token of messageArray.slice(1)) {
			if (!macro) {
				macroName += ` ${token}`;
				macro = game.macros.getName(macroName);
			}
			if (macro) break;
		}
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
				data-tooltip="${game.i18n.localize("advanced-macros.MACROS.runForSpecificUserTooltip")}"
				data-tooltip-direction="UP">
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
		(macro) => macro.getFlag("advanced-macros", "runForSpecificUser") === "runAsWorldScript"
	);
	for (const macro of worldScripts) {
		try {
			macro.execute();
			console.debug(`Advanced Macros | Executed "${macro.name}" world script (ID: ${macro.id})`);
		} catch(err) {
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
	const permissions = foundry.utils.deepClone(macro.ownership) || {};

	for (const user of game.users.contents) {
		if (user.isGM || user.id === author?.id) delete permissions[user.id];
	}
	const highestPermissionLevel = Math.max(...Object.values(permissions));
	return author?.isGM && highestPermissionLevel < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}
