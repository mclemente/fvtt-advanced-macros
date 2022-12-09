import CONSTANTS from "./constants.js";
export const registerSettings = function () {
	game.settings.register(CONSTANTS.MODULE_NAME, "disableDropHotbarRollTableBehavior", {
		name: `${CONSTANTS.MODULE_NAME}.setting.disableDropHotbarRollTableBehavior.name`,
		hint: `${CONSTANTS.MODULE_NAME}.setting.disableDropHotbarRollTableBehavior.hint`,
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});
	// game.settings.register(CONSTANTS.MODULE_NAME, "debug", {
	// 	name: `${CONSTANTS.MODULE_NAME}.setting.debug.name`,
	// 	hint: `${CONSTANTS.MODULE_NAME}.setting.debug.hint`,
	// 	scope: "client",
	// 	config: true,
	// 	default: false,
	// 	type: Boolean,
	// });
};
