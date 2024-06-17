/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-var-requires */

import fs from "fs-extra";
import gulp from "gulp";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

/********************/
/*  CONFIGURATION   */
/********************/

const packageId = "advanced-macros";
const sourceDirectory = "./src";
const distDirectory = "./dist";
const sourceFileExtension = "js";
const staticFiles = ["languages", "packs", "module.json"];

/********************/
/*		BUILD		*/
/********************/

function buildCode() {
	return (
		gulp
			.src(`${sourceDirectory}/**/*.${sourceFileExtension}`)
			.pipe(gulp.dest(`dist`))
	);
}

/**
 * Copy static files
 */
async function copyFiles() {
	for (const file of staticFiles) {
		if (fs.existsSync(`${sourceDirectory}/${file}`)) {
			await fs.copy(`${sourceDirectory}/${file}`, `${distDirectory}/${file}`);
		}
	}
}
/**
 * Watch for changes for each build step
 */
export function watch() {
	gulp.watch(`${sourceDirectory}/**/*.${sourceFileExtension}`, { ignoreInitial: false }, buildCode);
	gulp.watch(
		staticFiles.map((file) => `${sourceDirectory}/${file}`),
		{ ignoreInitial: false },
		copyFiles
	);
}

export const build = gulp.series(clean, gulp.parallel(buildCode, copyFiles));

/********************/
/*      CLEAN       */
/********************/

/**
 * Remove built files from `dist` folder while ignoring source files
 */
export async function clean() {
	const files = [...staticFiles, "main.js"];

	console.log(" ", "Files to clean:");
	console.log("   ", files.join("\n    "));

	for (const filePath of files) {
		await fs.remove(`${distDirectory}/${filePath}`);
	}
}

/********************/
/*       LINK       */
/********************/

/**
 * Get the data paths of Foundry VTT based on what is configured in `foundryconfig.json`
 */
function getDataPaths() {
	const config = fs.readJSONSync("foundryconfig.json");
	const dataPath = config?.dataPath;

	if (dataPath) {
		const dataPaths = Array.isArray(dataPath) ? dataPath : [dataPath];

		return dataPaths.map((dataPath) => {
			if (typeof dataPath !== "string") {
				throw new Error(
					`Property dataPath in foundryconfig.json is expected to be a string or an array of strings, but found ${dataPath}`
				);
			}
			if (!fs.existsSync(path.resolve(dataPath))) {
				throw new Error(`The dataPath ${dataPath} does not exist on the file system`);
			}
			return path.resolve(dataPath);
		});
	} else {
		throw new Error("No dataPath defined in foundryconfig.json");
	}
}

/**
 * Link build to User Data folder
 */
export async function link() {
	let destinationDirectory;
	if (fs.existsSync(path.resolve(sourceDirectory, "module.json"))) {
		destinationDirectory = "modules";
	} else {
		throw new Error("Could not find module.json");
	}

	const linkDirectories = getDataPaths().map((dataPath) =>
		path.resolve(dataPath, "Data", destinationDirectory, packageId)
	);

	const argv = yargs(hideBin(process.argv)).option("clean", {
		alias: "c",
		type: "boolean",
		default: false,
	}).argv;
	const clean = argv.c;

	for (const linkDirectory of linkDirectories) {
		if (clean) {
			console.log(`Removing build in ${linkDirectory}.`);

			await fs.remove(linkDirectory);
		} else if (!fs.existsSync(linkDirectory)) {
			console.log(`Linking dist to ${linkDirectory}.`);
			await fs.ensureDir(path.resolve(linkDirectory, ".."));
			await fs.symlink(path.resolve(distDirectory), linkDirectory);
		} else {
			console.log(`Skipped linking to ${linkDirectory}, as it already exists.`);
		}
	}
}
