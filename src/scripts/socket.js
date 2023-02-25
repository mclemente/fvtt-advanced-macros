import { setSocket } from "../main.js";
import API from "./api.js";
import CONSTANTS from "./constants.js";
import { debug } from "./lib/lib.js";
export let advancedMacroSocket;
export function registerSocket() {
	if (advancedMacroSocket) {
		return advancedMacroSocket;
	}
	//@ts-ignore
	advancedMacroSocket = socketlib.registerModule(CONSTANTS.MODULE_NAME);
	advancedMacroSocket.register("executeMacro", (...args) => API.executeMacroArr(...args));
	// advancedMacroSocket.register("GMElectionID", (...args) => API.GMElectionIDArr(...args));
	// advancedMacroSocket.register("GMMacroResult", (...args) => API.GMMacroResultArr(...args));
	// advancedMacroSocket.register("ElectGMExecutor", (...args) => API.ElectGMExecutorArr(...args));
	// advancedMacroSocket.register("GMExecuteMacro", (...args) => API.GMExecuteMacroArr(...args));

	setSocket(advancedMacroSocket);
	return advancedMacroSocket;
}
