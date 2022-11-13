import CONSTANTS from "./constants.js";
export const registerSettings = function () {
	game.settings.registerMenu(CONSTANTS.MODULE_NAME, "resetAllSettings", {
		name: `${CONSTANTS.MODULE_NAME}.setting.reset.name`,
		hint: `${CONSTANTS.MODULE_NAME}.setting.reset.hint`,
		icon: "fas fa-coins",
		type: ResetSettingsDialog,
		restricted: true,
	});
	// =====================================================================
	game.settings.register(CONSTANTS.MODULE_NAME, "disableDropHotbarRollTableBehavior", {
		name: `${CONSTANTS.MODULE_NAME}.setting.disableDropHotbarRollTableBehavior.name`,
		hint: `${CONSTANTS.MODULE_NAME}.setting.disableDropHotbarRollTableBehavior.hint`,
		scope: "client",
		config: true,
		default: false,
		type: Boolean,
	});
	// ========================================================================
	game.settings.register(CONSTANTS.MODULE_NAME, "debug", {
		name: `${CONSTANTS.MODULE_NAME}.setting.debug.name`,
		hint: `${CONSTANTS.MODULE_NAME}.setting.debug.hint`,
		scope: "client",
		config: true,
		default: false,
		type: Boolean,
	});
	const settings = defaultSettings();
	for (const [settingName, settingValue] of Object.entries(settings)) {
		game.settings.register(CONSTANTS.MODULE_NAME, settingName, settingValue);
	}
	// for (const [settingName, settingValue] of Object.entries(otherSettings)) {
	//     game.settings.register(CONSTANTS.MODULE_NAME, settingName, settingValue);
	// }
};
class ResetSettingsDialog extends FormApplication {
	constructor(...args) {
		//@ts-ignore
		super(...args);
		//@ts-ignore
		return new Dialog({
			title: game.i18n.localize(`${CONSTANTS.MODULE_NAME}.dialogs.resetsettings.title`),
			content:
				'<p style="margin-bottom:1rem;">' +
				game.i18n.localize(`${CONSTANTS.MODULE_NAME}.dialogs.resetsettings.content`) +
				"</p>",
			buttons: {
				confirm: {
					icon: '<i class="fas fa-check"></i>',
					label: game.i18n.localize(`${CONSTANTS.MODULE_NAME}.dialogs.resetsettings.confirm`),
					callback: async () => {
						await applyDefaultSettings();
						window.location.reload();
					},
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize(`${CONSTANTS.MODULE_NAME}.dialogs.resetsettings.cancel`),
				},
			},
			default: "cancel",
		});
	}
	async _updateObject(event, formData) {
		// do nothing
	}
}
async function applyDefaultSettings() {
	const settings = defaultSettings(true);
	// for (const [name, settingData] of Object.entries(settings)) {
	//   await game.settings.set(CONSTANTS.MODULE_NAME, name, settingData.default);
	// }
	const settings2 = otherSettings(true);
	for (const [name, settingData] of Object.entries(settings2)) {
		//@ts-ignore
		await game.settings.set(CONSTANTS.MODULE_NAME, name, settingData.default);
	}
}
function defaultSettings(apply = false) {
	return {
		//
	};
}
function otherSettings(apply = false) {
	return {
		disableDropHotbarRollTableBehavior: {
			name: `${CONSTANTS.MODULE_NAME}.setting.disableDropHotbarRollTableBehavior.name`,
			hint: `${CONSTANTS.MODULE_NAME}.setting.disableDropHotbarRollTableBehavior.hint`,
			scope: "client",
			config: true,
			default: false,
			type: Boolean,
		},
		debug: {
			name: `${CONSTANTS.MODULE_NAME}.setting.debug.name`,
			hint: `${CONSTANTS.MODULE_NAME}.setting.debug.hint`,
			scope: "client",
			config: true,
			default: false,
			type: Boolean,
		},
	};
}
