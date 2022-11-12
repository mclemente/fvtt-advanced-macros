# Advanced Macros

![Latest Release Download Count](https://img.shields.io/github/downloads/League-of-Foundry-Developers/fvtt-advanced-macros/latest/module.zip?color=2b82fc&label=DOWNLOADS&style=for-the-badge) 

[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fadvanced-macros&colorB=006400&style=for-the-badge)](https://forge-vtt.com/bazaar#package=advanced-macros) 

![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FLeague-of-Foundry-Developers%2Ffvtt-advanced-macros%2Fmaster%2Fsrc%2Fmodule.json&label=Foundry%20Version&query=$.compatibility.verified&colorB=orange&style=for-the-badge)

![Latest Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FLeague-of-Foundry-Developers%2Ffvtt-advanced-macros%2Fmaster%2Fsrc%2Fmodule.json&label=Latest%20Release&prefix=v&query=$.version&colorB=red&style=for-the-badge)

[![Foundry Hub Endorsements](https://img.shields.io/endpoint?logoColor=white&url=https%3A%2F%2Fwww.foundryvtt-hub.com%2Fwp-json%2Fhubapi%2Fv1%2Fpackage%2Fadvanced-macros%2Fshield%2Fendorsements&style=for-the-badge)](https://www.foundryvtt-hub.com/package/advanced-macros/)

![GitHub all releases](https://img.shields.io/github/downloads/League-of-Foundry-Developers/fvtt-advanced-macros/total?style=for-the-badge)

[![Translation status](https://weblate.foundryvtt-hub.com/widgets/advanced-macros/-/287x66-black.png)](https://weblate.foundryvtt-hub.com/engage/advanced-macros/)

With Advanced Macros, a "Run Macro" button will appear in macro configuration windows to allow you to quickly test your macro and see its results. Do note that if you use an asynchronous macro which never resolves, you may end up with a macro in an invalid state if you end up cancelling the changes.

Check out the Macros compendium for some useful macros that showcase the advanced macros system as well as provide additional features.

In the case of chat macros, you can now use [handlebars](https://handlebarsjs.com/) templating to render your chat text using common helpers, or use it along with the `macro` helper to call other macros, like for example `{{macro "name of my macro" actor 3 "a text argument"}}` 

In the case of script macros, you can now use a `return` statement for the early return paradigm, but also to retun a string which can then be used in chat macros. You will also be able to receive arguments via an array named `args`, and you can use the `await` keyword to make your script asynchronous. Do note however that if you create an async macro, it cannot be used to return text in a chat macro when using the `{{macro}}` helper. It will still be executed if used, but will be considered to have returned an empty string. If you want to use an async macro that prints its results to chat, read further for the use of recursive async chat commands.

Besides those two enhancements to macros, you can now also create a temporary chat macro with handlebars templating directly from the chat entry, by entering text in the chat that includes the handlebars mustache characters `{{ }}`. You will also be able to call your macro directly from chat with the `/` prefix. As an example, you can send in the chat `/amacro my-macro-name argument1 argument2 argument3`.
If your macro name has spaces in it, you can call it with `/amacro "My macro name" "argument one" 100` for example. You can also call multiple macros by writing them one per line.

In addition, you can now recursively call macros, so you could call a script or chat macro which returns a `/amacro macro-name` text for it to call the macros recursively.

Here is an example of use :
- **Macro name**: `Move token`
- **Type**: script
- **Content**: 
```js
if (!token) return;
await token.update({x: args[0], y: args[1]})
return `Token moved to (${args[0]}, ${args[1]})`
```

- **Macro name**: `pan`
- **Type**: script
- **Content**:
```js
canvas.pan({x: args[0], y: args[1], scale: args[2]})
```

- **Macro name**: `current-time`
- **Type**: script
- **Content**:
```js
const now = new Date();
return `${now.getHours()}:${now.getMinutes()}`;
```

- **Macro name**: `Return to corner`
- **Type**: chat
- **Content**:
```
/"Move token" 0 0
/pan 1000 1000 0.5
It's currently {{macro "current-time"}}
```

- **Macro name**: `run`
- **Type**: chat
- **Content**:
```
/"Return to corner"
```

You can then type `/run` in the chat to execute the 'run' macro which executes 'Return to corner' which will move the token to position (0, 0), then pan the canvas to position (1000, 1000) with a zoom of 50%, then output to the chat `Token moved to (0,0)\n\nIt's currently 21:45`

**Note**: HTML content will not be parsed for /command macros, though you will still be able to use the `{{macro}}` helper in that case. 
**Note 2**: You can only use one space to separate each argument. If you use more than one space, FVTT will replace the second with `&nbsp;` as it transforms the chat input into html, which would break your argument list.

## Installation

It's always easiest to install modules from the in game add-on browser.

To install this module manually:
1.  Inside the Foundry "Configuration and Setup" screen, click "Add-on Modules"
2.  Click "Install Module"
3.  In the "Manifest URL" field, paste the following url:
`https://raw.githubusercontent.com/League-of-Foundry-Developers/fvtt-advanced-macros/master/module.json`
4.  Click 'Install' and wait for installation to complete
5.  Don't forget to enable the module in game using the "Manage Module" button

### libWrapper

This module uses the [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper) library for wrapping core methods. It is a hard dependency and it is recommended for the best experience and compatibility with other modules.

### socketLib

This module uses the [socketLib](https://github.com/manuelVo/foundryvtt-socketlib) library like a dependency. It is a hard dependency and it is recommended for the best experience and compatibility with other modules.

# Build

## Install all packages

```bash
npm install
```
## npm build scripts

### build

will build the code and copy all necessary assets into the dist folder and make a symlink to install the result into your foundry data; create a
`foundryconfig.json` file with your Foundry Data path.

```json
{
  "dataPath": "~/.local/share/FoundryVTT/"
}
```

`build` will build and set up a symlink between `dist` and your `dataPath`.

```bash
npm run-script build
```

### NOTE:

You don't need to build the `foundryconfig.json` file you can just copy the content of the `dist` folder on the module folder under `modules` of Foundry

### build:watch

`build:watch` will build and watch for changes, rebuilding automatically.

```bash
npm run-script build:watch
```

### clean

`clean` will remove all contents in the dist folder (but keeps the link from build:install).

```bash
npm run-script clean
```

### prettier-format

`prettier-format` launch the prettier plugin based on the configuration [here](./.prettierrc)

```bash
npm run-script prettier-format
```

### package

`package` generates a zip file containing the contents of the dist folder generated previously with the `build` command. Useful for those who want to manually load the module or want to create their own release

```bash
npm run-script package
```

## [Changelog](./changelog.md)

## Issues

Any issues, bugs, or feature requests are always welcome to be reported directly to the [Issue Tracker](https://github.com/League-of-Foundry-Developers/advanced-macros/issues ), or using the [Bug Reporter Module](https://foundryvtt.com/packages/bug-reporter/).

# License

This Foundry VTT module, writen by KaKaRoTo, is licensed under a [Creative Commons Attribution 4.0 International License](http://creativecommons.org/licenses/by/4.0/).

This work is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development v 0.1.6](http://foundryvtt.com/pages/license.html).
