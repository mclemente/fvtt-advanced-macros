Hooks.once("init", () => {
	class AdvancedMacro extends CONFIG.Macro.documentClass {
		/**
		 * Defines whether a Macro can run as a GM.
		 * For security reasons, only macros authored by the GM, and not editable by users
		 * can be run as GM
		 */
		get canRunAsGM() {
			const { author } = this._source;
			const { OWNER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
			for (const [user, ownership] of Object.entries(this.ownership)) {
				if (!game.users.get(user)?.isGM && ownership >= OWNER) return false;
			}
			return game.users.get(author)?.isGM;
		}

		async execute(scope = {}, { promptApproval = false, callFromSocket = false } = {}) {
			if (!this.canExecute) {
				if ((this.type === "script") && !this.isApproved) {
					ui.notifications.warn("MACRO.APPROVAL.Required", { format: { name: this.name } });
					if (promptApproval && game.user.isGM) this.sheet.render({ force: true });
				} else ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
				return;
			}
			switch (this.type) {
				case "chat":
					return super.execute(scope, { promptApproval });
				case "script": {
					const queryData = { macro: this.id, scope, promptApproval };
					const runFor = this.getFlag("advanced-macros", "runForSpecificUser");
					const runQuery = (user) => user.query("advanced-macros.executeMacro", queryData, { timeout: 30000 });
					if (callFromSocket || !runFor || runFor === "runAsWorldScript" || runFor === "runAsWorldScriptSetup") {
						return super.execute(scope, { promptApproval });
					} else if (runFor === "GM") {
						if (game.users.activeGM?.isSelf) return super.execute(scope, { promptApproval });
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
		onChange: (value) => {
			if (value) Hooks.on("chatMessage", chatMessageHook);
			else Hooks.off("chatMessage", chatMessageHook);
		}
	});
	if (game.settings.get("advanced-macros", "legacySlashCommand")) {
		Hooks.on("chatMessage", chatMessageHook);
	}
	CONFIG.queries["advanced-macros.executeMacro"] = (queryData) => {
		const { macro, scope, promptApproval } = queryData;
		return game.macros.get(macro)?.execute(scope, { promptApproval, callFromSocket: true });
	};
});

function chatMessageHook(chatLog, message, chatData) {
	let [command, match, handler] = chatLog.constructor.parse(message);
	if (command === "invalid" && match[0].startsWith("/")) {
		[command, match, handler] = chatLog.constructor.parse(`/macro ${match[0].slice(1)}`);
	}
	if (command === "macro") return handler.call(chatLog, command, match, chatData);
	return true;
}

function runWorldScripts(key) {
	const worldScripts = game.macros.contents.filter(
		(macro) => macro.getFlag("advanced-macros", "runForSpecificUser") === key
	);
	for (const macro of worldScripts) {
		try {
			macro.execute();
			console.debug(`Advanced Macros | Executed "${macro.name}" world script(ID: ${macro.id})`);
		} catch (err) {
			console.error(`Advanced Macros | Error executing "${macro.name}" world script(ID: ${macro.id})`, err);
		}
	}
}

Hooks.once("setup", () => runWorldScripts("runAsWorldScriptSetup"));

Hooks.once("ready", () => {
	Hooks.on("renderMacroConfig", (obj, html, data) => {
		const macro = obj.document;
		if (!game.user.isGM || !macro.isApproved) return;
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

		const specificOneDiv = document.createElement("div");
		specificOneDiv.classList.add("form-group");
		if (macro.type === "chat") specificOneDiv.style.display = "none";
		specificOneDiv.innerHTML = `
		<div class="form-fields">
			<label>${game.i18n.localize("advanced-macros.MACROS.runForSpecificUser")}</label>
			<div class="form-fields">${select.outerHTML}</div>
		</div>
		`;

		typeGroup.after(specificOneDiv);

		typeSelect.addEventListener("change", (event) => {
			specificOneDiv.style.display = event.target.value === "chat" ? "none" : "";
		});
	});
	runWorldScripts("runAsWorldScript");
});
