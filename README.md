![GitHub release](https://img.shields.io/github/release-date/mclemente/fvtt-advanced-macros)
![all versions](https://img.shields.io/github/downloads/mclemente/fvtt-advanced-macros/total)
![the latest version](https://img.shields.io/github/downloads/mclemente/fvtt-advanced-macros/latest/total)
![Forge installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fadvanced-macros)

[![ko-fi](https://img.shields.io/badge/ko--fi-Support%20Me-red?style=flat-square&logo=ko-fi)](https://ko-fi.com/mclemente)

# Advanced Macros

With Advanced Macros, a "Run Macro", "Run for Everyone" and "Run for specific user" button will appear in macro configuration windows to allow you to quickly test your macro and see its results. Do note that if you use an asynchronous macro which never resolves, you may end up with a macro in an invalid state if you end up cancelling the changes.

![img](/wiki/advanced_macro_img.png)

**IMPORTANT NOTE:** The check boxes are in order of "priority" , (maybe it would be better to use radios instead of checkboxes, in the future maybe find a more intuitive way to manage this...), so:

-   If you check the "Run as GM" button wins over "Run for everyone" and "Run for specific user" even if they are checked.
-   If you do not check the "Run as GM" button, but check "Run for everyone" wins on "Run for specific user" even if it is checked.
-   Finally if ne "Run as GM" and "Run for everyone" are checked and "Run for specific user" is checked the latter wins.
-   If none of the three options are checked the default macro behavior on foundry applies.

Check out the Macros compendium for some useful macros that showcase the advanced macros system as well as provide additional features.

In the case of chat macros, you can now use [handlebars](https://handlebarsjs.com/) templating to render your chat text using common helpers, or use it along with the `macro` helper to call other macros, like for example `{{macro "name of my macro" actor 3 "a text argument"}}`

In the case of script macros, you can now use a `return` statement for the early return paradigm, but also to retun a string which can then be used in chat macros. You will also be able to receive arguments via an array named `args`, and you can use the `await` keyword to make your script asynchronous. Do note however that if you create an async macro, it cannot be used to return text in a chat macro when using the `{{macro}}` helper. It will still be executed if used, but will be considered to have returned an empty string. If you want to use an async macro that prints its results to chat, read further for the use of recursive async chat commands.

Besides those two enhancements to macros, you can now also create a temporary chat macro with handlebars templating directly from the chat entry, by entering text in the chat that includes the handlebars mustache characters `{{ }}`. You will also be able to call your macro directly from chat with the `/` prefix. As an example, you can send in the chat `/amacro my-macro-name argument1 argument2 argument3`.
If your macro name has spaces in it, you can call it with `/amacro "My macro name" "argument one" 100` for example. You can also call multiple macros by writing them one per line.

In addition, you can now recursively call macros, so you could call a script or chat macro which returns a `/amacro macro-name` text for it to call the macros recursively.

Here is an example of use :

-   **Macro name**: `Move token`
-   **Type**: script
-   **Content**:

```js
if (!token) return;
await token.update({ x: args[0], y: args[1] });
return `Token moved to (${args[0]}, ${args[1]})`;
```

-   **Macro name**: `pan`
-   **Type**: script
-   **Content**:

```js
canvas.pan({ x: args[0], y: args[1], scale: args[2] });
```

-   **Macro name**: `current-time`
-   **Type**: script
-   **Content**:

```js
const now = new Date();
return `${now.getHours()}:${now.getMinutes()}`;
```

-   **Macro name**: `Return to corner`
-   **Type**: chat
-   **Content**:

```
/amacro "Move token" 0 0
/pan 1000 1000 0.5
It's currently {{macro "current-time"}}
```

-   **Macro name**: `run`
-   **Type**: chat
-   **Content**:

```
/amacro "Return to corner"
```

You can then type `/run` in the chat to execute the 'run' macro which executes 'Return to corner' which will move the token to position (0, 0), then pan the canvas to position (1000, 1000) with a zoom of 50%, then output to the chat `Token moved to (0,0)\n\nIt's currently 21:45`

**Note**: HTML content will not be parsed for /command macros, though you will still be able to use the `{{macro}}` helper in that case.
**Note 2**: You can only use one space to separate each argument. If you use more than one space, FVTT will replace the second with `&nbsp;` as it transforms the chat input into html, which would break your argument list.

# Build

See the [Build](./wiki/Build) instructions.

## [Changelog](./changelog.md)

## Development and Contributing

Advanced Macros is a free and open source project. You can contribute to the project by making a merge request or by creating a [Github issue](https://github.com/mclemente/fvtt-advanced-macros/issues).
Translations are done on the Foundry Hub Weblate directly. Check the [Weblate](https://weblate.foundryvtt-hub.com/engage/advanced-macros/) page for contributing.

<a href="https://weblate.foundryvtt-hub.com/engage/advanced-macros/">
<img src="https://weblate.foundryvtt-hub.com/widgets/advanced-macros/-/main/multi-auto.svg" alt="Translation status" />
</a>

# Attribution

This work is licensed under the MIT license.

This work contains code originally from [The Furnace](https://github.com/League-of-Foundry-Developers/fvtt-module-furnace) module, writen by KaKaRoTo.

This work is licensed under Foundry Virtual Tabletop [Limited License Agreement for Module Development](https://foundryvtt.com/article/license/).
