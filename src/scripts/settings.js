import CONSTANTS from "./constants.js";
export const registerSettings = function () {
	game.settings.register(CONSTANTS.MODULE_ID, "disableDropHotbarRollTableBehavior", {
		name: `${CONSTANTS.MODULE_ID}.setting.disableDropHotbarRollTableBehavior.name`,
		hint: `${CONSTANTS.MODULE_ID}.setting.disableDropHotbarRollTableBehavior.hint`,
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});
	// game.settings.register(CONSTANTS.MODULE_ID, "debug", {
	// 	name: `${CONSTANTS.MODULE_ID}.setting.debug.name`,
	// 	hint: `${CONSTANTS.MODULE_ID}.setting.debug.hint`,
	// 	scope: "client",
	// 	config: true,
	// 	default: false,
	// 	type: Boolean,
	// });
};
