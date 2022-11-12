import { error, executeMacro, _executeMacroInternal } from "./lib/lib.js";
import { advancedMacroSocket } from "./socket.js";

const API = {
	// async GMElectionIDArr(...inAttributes) {
	//     if (!Array.isArray(inAttributes)) {
	//       throw error('GMElectionIDArr | inAttributes must be of type array');
	//     }
	//     await this.GMElectionID(inAttributes);
	// },

	// async GMMacroResultArr(...inAttributes) {
	//     if (!Array.isArray(inAttributes)) {
	//       throw error('GMMacroResultArr | inAttributes must be of type array');
	//     }
	//     await this.GMMacroResult(inAttributes);
	// },

	// async ElectGMExecutorArr(...inAttributes) {
	//     if (!Array.isArray(inAttributes)) {
	//       throw error('ElectGMExecutorArr | inAttributes must be of type array');
	//     }
	//     return await this.ElectGMExecutor(inAttributes);
	// },

	// async GMExecuteMacroArr(...inAttributes) {
	//     if (!Array.isArray(inAttributes)) {
	//       throw error('GMExecuteMacro | inAttributes must be of type array');
	//     }
	//     return await this.GMExecuteMacro(inAttributes);
	// },

	async executeMacroArr(...inAttributes) {
		if (!Array.isArray(inAttributes)) {
			throw error("executeMacroArr | inAttributes must be of type array");
		}
		const [macroId, userId, args, context, callFromSocket] = inAttributes;
		return await _executeMacroInternal(macroId, userId, args, context, callFromSocket);
	},
};
export default API;
