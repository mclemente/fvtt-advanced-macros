Hooks.once("init", () => {
	class AdvancedMacro extends CONFIG.Macro.documentClass {
		static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
			preserveOnImport: ["_id", "sort", "ownership", "author"]
		}, {inplace: false}));

		canUserExecute(user) {
			if (!this.testUserPermission(user, "LIMITED")) return false;
			return this.type === "script" ? user.can("MACRO_SCRIPT") || (this.canRunAsGM && !user.isGM) : true;
		}

		/**
		 * Defines whether a Macro can run as a GM.
		 * For security reasons, only macros authored by the GM, and not editable by users
		 * can be run as GM
		 */
		get canRunAsGM() {
			const author = game.users.get(this.author?.id);
			const permissions = foundry.utils.deepClone(this.ownership) || {};

			for (const user of game.users.contents) {
				if (user.isGM || user.id === author?.id) delete permissions[user.id];
			}
			const highestPermissionLevel = Math.max(...Object.values(permissions));
			return author?.isGM && highestPermissionLevel < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
		}

		async execute(scope = {}, callFromSocket = false) {
			if (!this.canExecute) {
				return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
			}
			switch (this.type) {
				case "chat":
					return super.execute(scope);
				case "script": {
					const queryData = { macro: this.id, scope };
					const runFor = this.getFlag("advanced-macros", "runForSpecificUser");
					const runQuery = (user) => user.query("advanced-macros.executeMacro", queryData, { timeout: 30000 });
					if (callFromSocket || !runFor || runFor === "runAsWorldScript" || runFor === "runAsWorldScriptSetup" || !this.canRunAsGM) {
						return super.execute(scope);
					} else if (runFor === "GM") {
						if (game.users.activeGM?.isSelf) return super.execute(scope);
						return runQuery(game.users.activeGM);
					} else if (runFor === "runForEveryone") {
						return game.users.filter((u) => u.active).forEach(runQuery);
					} else if (runFor === "runForEveryoneElse") {
						return game.users.filter((u) => u.active && u.id !== game.user.id).forEach(runQuery);
					} else if (runFor) {
						return runQuery(game.users.find((u) => u.id === runFor));
					}
				}
			}
		}
	}

	CONFIG.Macro.documentClass = AdvancedMacro;
	game.settings.register("advanced-macros", "legacySlashCommand", {
		name: "advanced-macros.setting.legacySlashCommand.name",
		hint: "advanced-macros.setting.legacySlashCommand.hint",
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});
	CONFIG.queries["advanced-macros.executeMacro"] = (queryData) => {
		const { macro, scope } = queryData;
		return game.macros.get(macro)?.execute(scope, true);
	};
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

function runWorldScripts(key) {
	const worldScripts = game.macros.contents.filter(
		(macro) => macro.getFlag("advanced-macros", "runForSpecificUser") === key
	);
	for (const macro of worldScripts) {
		try {
			macro.execute();
			console.debug(`Advanced Macros | Executed "${macro.name}" world script (ID: ${macro.id})`);
		} catch(err) {
			console.error(`Advanced Macros | Error executing "${macro.name}" world script (ID: ${macro.id})`, err);
		}
	}
}

Hooks.once("setup", () => runWorldScripts("runAsWorldScriptSetup"));

Hooks.once("ready", () => {
	Hooks.on("renderMacroConfig", (obj, html, data) => {
		if (!game.user.isGM) return;
		const macro = obj.document;
		// A re-render will cause the html object to be the internal element, which is the form itself.
		const typeSelect = html.querySelector("select[name=type]");
		const typeGroup = typeSelect.closest(".form-group");
		const options = [
			{
				value: "GM",
				label: game.i18n.localize("USER.RoleGamemaster")
			},
			...["runForEveryone", "runForEveryoneElse"].map((run) => ({
				value: run,
				label: game.i18n.localize(`advanced-macros.MACROS.${run}`),
				group: "DOCUMENT.Users"
			})),
			...["runAsWorldScriptSetup", "runAsWorldScript"].map((run) => ({
				value: run,
				label: game.i18n.localize(`advanced-macros.MACROS.${run}`),
				group: "advanced-macros.MACROS.WorldScript"
			})),
			...game.users.players
				.map((user) => ({
					value: user.id,
					label: user.name,
					group: "PLAYERS.Title",
				})),
		];

		const select = foundry.applications.fields.createSelectInput({
			name: "flags.advanced-macros.runForSpecificUser",
			options,
			value: macro.getFlag("advanced-macros", "runForSpecificUser"),
			blank: "",
			labelAttr: "label",
			localize: true,
			disabled: !macro.canRunAsGM
		});

		const specificOneDiv = $(`
			<div class="form-group" ${macro.type === "chat" ? 'style="display: none"' : ""}>
				<label>${game.i18n.localize("advanced-macros.MACROS.runForSpecificUser")}</label>
				<div class="form-fields">${select.outerHTML}</div>
			</div>
		`);

		specificOneDiv.insertAfter(typeGroup);

		typeSelect.addEventListener("change", (event) => {
			if (event.target.value === "chat") specificOneDiv.hide();
			else specificOneDiv.show();
		});
	});
	runWorldScripts("runAsWorldScript");
});
